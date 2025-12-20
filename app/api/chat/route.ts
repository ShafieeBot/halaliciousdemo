// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chatWithApriel } from "@/lib/together-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

type FilterShape = {
  cuisine_subtype: string | null;
  cuisine_category: string | null;
  price_level: string | null;
  tag: string | null;
  keyword: string | null;
  favorites: boolean | null;
};

function emptyFilter(): FilterShape {
  return {
    cuisine_subtype: null,
    cuisine_category: null,
    price_level: null,
    tag: null,
    keyword: null,
    favorites: null,
  };
}

/**
 * Ensures the returned content is ALWAYS a JSON string matching:
 * { filter: {...}, message: string, ...optional }
 */
function ensureJsonContent(raw: string): string {
  const trimmed = (raw ?? "").trim();

  // If empty, return safe default
  if (!trimmed) {
    return JSON.stringify({
      filter: emptyFilter(),
      message: "Sorry — I didn’t receive a response. Please try again.",
    });
  }

  // Try parse as JSON
  try {
    const parsed = JSON.parse(trimmed);

    // If it’s already correct-ish, normalize required fields
    const filter = typeof parsed.filter === "object" && parsed.filter !== null ? parsed.filter : {};
    const normalized = {
      ...parsed,
      filter: {
        ...emptyFilter(),
        ...filter,
      },
      message: typeof parsed.message === "string" ? parsed.message : normalizeContent(parsed.message),
    };

    return JSON.stringify(normalized);
  } catch {
    // Not JSON: wrap it
    return JSON.stringify({
      filter: emptyFilter(),
      message: trimmed,
    });
  }
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { role: "assistant", content: ensureJsonContent("") },
        { status: 400 }
      );
    }

    const typedMessages = messages.map((msg: any) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: normalizeContent(msg.content),
    }));

    // First call
    const completion = await chatWithApriel(typedMessages);
    const choice = completion.choices?.[0];

    if (!choice?.message) {
      return NextResponse.json(
        { role: "assistant", content: ensureJsonContent("") },
        { status: 500 }
      );
    }

    const message = choice.message;

    // Tool call?
    if (message.tool_calls?.length) {
      const toolCall = message.tool_calls[0];

      if (toolCall.function?.name === "queryDatabase") {
        const args = JSON.parse(toolCall.function.arguments ?? "{}");

        let query = supabase.from("places").select("name, cuisine_subtype, city, address");

        if (args.cuisine) {
          query = query.ilike("cuisine_subtype", `%${args.cuisine}%`);
        }
        if (args.keyword) {
          query = query.or(
            `name.ilike.%${args.keyword}%,address.ilike.%${args.keyword}%,city.ilike.%${args.keyword}%`
          );
        }

        const { data, error } = await query;

        let toolResult = "";
        if (error) toolResult = `Error querying database: ${error.message}`;
        else if (!data?.length) toolResult = "No results found matching that criteria.";
        else if (args.queryType === "count") toolResult = `Found ${data.length} places.`;
        else {
          const top5 = data
            .slice(0, 5)
            .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype})`)
            .join("\n");
          toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
        }

        // Second call (tool result)
        const secondCallMessages = [
          ...typedMessages,
          { role: "assistant" as const, content: normalizeContent(message.content) },
          { role: "tool" as const, tool_call_id: toolCall.id, content: toolResult },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages);
        const finalChoice = finalCompletion.choices?.[0];

        if (!finalChoice?.message) {
          return NextResponse.json(
            { role: "assistant", content: ensureJsonContent("") },
            { status: 500 }
          );
        }

        let finalContent = ensureJsonContent(finalChoice.message.content ?? "");

        // Inject places into JSON (safe)
        try {
          const parsed = JSON.parse(finalContent);
          if (args.queryType === "list" && data) {
            parsed.places = data.slice(0, 10).map((p: any) => ({
              name: p.name,
              cuisine: p.cuisine_subtype,
            }));
          }
          finalContent = JSON.stringify(parsed);
        } catch {
          // If something went wrong, ensureJsonContent already made it safe
        }

        return NextResponse.json({ role: "assistant", content: finalContent });
      }
    }

    // No tool call — STILL enforce JSON
    const safe = ensureJsonContent(message.content ?? "");
    return NextResponse.json({ role: "assistant", content: safe });
  } catch (error: any) {
    console.error("Apriel API Error:", error);
    // IMPORTANT: return JSON-shaped content even on error
    return NextResponse.json(
      {
        role: "assistant",
        content: JSON.stringify({
          filter: emptyFilter(),
          message: "AI processing failed. Please try again.",
        }),
      },
      { status: 500 }
    );
  }
}
