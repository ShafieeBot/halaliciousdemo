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
 * Extract the first valid JSON object found in a string.
 * This removes "thinking" leakage by ignoring anything outside JSON.
 */
function extractFirstJsonObject(text: string): any | null {
  const s = (text ?? "").trim();
  if (!s) return null;

  // If whole string is JSON
  try {
    return JSON.parse(s);
  } catch {
    // continue
  }

  // Find first '{' and brace-match
  let start = s.indexOf("{");
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;

      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          break;
        }
      }
    }
    start = s.indexOf("{", start + 1);
  }

  return null;
}

/**
 * Force the AI output into your strict schema:
 * { filter: {...}, message: string, places?: [...] }
 */
function coerceToAppJson(raw: string): any {
  const parsed = extractFirstJsonObject(raw);

  // Default base structure
  const base: any = {
    filter: emptyFilter(),
    message: "Okay — I've updated the map.",
  };

  if (!parsed || typeof parsed !== "object") {
    const safeText = (raw ?? "").trim();
    if (safeText && !safeText.toLowerCase().includes("respond with json")) {
      base.message = safeText;
    }
    return base;
  }

  const filter = parsed.filter && typeof parsed.filter === "object" ? parsed.filter : {};
  const msg =
    typeof parsed.message === "string"
      ? parsed.message
      : normalizeContent(parsed.message);

  return {
    ...parsed,
    filter: { ...emptyFilter(), ...filter },
    message: msg || base.message,
  };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({ filter: emptyFilter(), message: "Ask me about halal food in Tokyo!" }),
      });
    }

    const typedMessages = messages.map((msg: any) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: normalizeContent(msg.content),
    }));

    // 1) First call
    const completion = await chatWithApriel(typedMessages);
    const choice = completion.choices?.[0];

    if (!choice?.message) {
      return NextResponse.json(
        {
          role: "assistant",
          content: JSON.stringify({ filter: emptyFilter(), message: "No response from AI." }),
        },
        { status: 500 }
      );
    }

    const message = choice.message;

    // 2) Tool call?
    if (message.tool_calls?.length) {
      const toolCall = message.tool_calls[0];

      if (toolCall.function?.name === "queryDatabase") {
        const args = JSON.parse(toolCall.function.arguments ?? "{}");

        let query = supabase
          .from("places")
          .select("id, name, cuisine_subtype, cuisine_category, city, address");

        if (args.cuisine) {
          query = query.ilike("cuisine_subtype", `%${args.cuisine}%`);
        }
        if (args.keyword) {
          query = query.or(
            `name.ilike.%${args.keyword}%,address.ilike.%${args.keyword}%,city.ilike.%${args.keyword}%`
          );
        }

        const { data, error } = await query;

        // Tool result text (for the model)
        let toolResult = "";
        if (error) toolResult = `Error querying database: ${error.message}`;
        else if (!data?.length) toolResult = "No results found matching that criteria.";
        else if (args.queryType === "count") toolResult = `Found ${data.length} places.`;
        else {
          const top5 = data
            .slice(0, 5)
            .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype ?? p.cuisine_category ?? "Halal"})`)
            .join("\n");
          toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
        }

        // 3) Second call with tool output
        const secondCallMessages = [
          ...typedMessages,
          { role: "assistant" as const, content: normalizeContent(message.content) },
          { role: "tool" as const, tool_call_id: toolCall.id, content: toolResult },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages);
        const finalChoice = finalCompletion.choices?.[0];

        if (!finalChoice?.message) {
          return NextResponse.json(
            {
              role: "assistant",
              content: JSON.stringify({ filter: emptyFilter(), message: "No response from AI." }),
            },
            { status: 500 }
          );
        }

        // 4) Coerce AI output to strict schema (strips thoughts)
        const coerced = coerceToAppJson(finalChoice.message.content ?? "");

        // 5) Inject places for UI convenience (always from DB, not hallucinated)
        if (data?.length) {
          coerced.places = data.slice(0, 10).map((p: any) => ({
            name: p.name,
            cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
          }));
        } else {
          coerced.places = [];
        }

        return NextResponse.json({
          role: "assistant",
          content: JSON.stringify(coerced),
        });
      }
    }

    // No tool call: still coerce to strict JSON (strip thoughts)
    const coerced = coerceToAppJson(message.content ?? "");

    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(coerced),
    });
  } catch (error: any) {
    console.error("Apriel API Error:", error);
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
