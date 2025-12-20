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
 * Extract the LAST valid JSON object containing "filter" and "message" from a string.
 * The Thinker model outputs reasoning first, then the final JSON answer.
 * We want the final answer, which is typically the last JSON object.
 */
function extractFinalJsonObject(text: string): Record<string, unknown> | null {
  const s = (text ?? "").trim();
  if (!s) return null;

  // If whole string is valid JSON, use it
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
  } catch {
    // continue to extraction
  }

  // Find ALL JSON objects and return the last one that has "filter" or "message"
  const jsonObjects: Record<string, unknown>[] = [];
  let start = 0;

  while (start < s.length) {
    const openBrace = s.indexOf("{", start);
    if (openBrace === -1) break;

    let depth = 0;
    for (let i = openBrace; i < s.length; i++) {
      const ch = s[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;

      if (depth === 0) {
        const candidate = s.slice(openBrace, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (typeof parsed === "object" && parsed !== null) {
            jsonObjects.push(parsed);
          }
        } catch {
          // Not valid JSON, skip
        }
        start = i + 1;
        break;
      }
    }

    // If we never found a closing brace, move on
    if (depth !== 0) {
      start = openBrace + 1;
    }
  }

  // Return the last JSON object that has "filter" or "message" key
  // (this is most likely the final answer, not intermediate thinking)
  for (let i = jsonObjects.length - 1; i >= 0; i--) {
    const obj = jsonObjects[i];
    if ("filter" in obj || "message" in obj) {
      return obj;
    }
  }

  // If none have filter/message, return the last one anyway
  if (jsonObjects.length > 0) {
    return jsonObjects[jsonObjects.length - 1];
  }

  return null;
}

/**
 * Check if text looks like model "thinking" rather than a user-facing response
 */
function looksLikeThinking(text: string): boolean {
  const thinkingPatterns = [
    /^The user says:/i,
    /^The user wants/i,
    /^They want/i,
    /^We need to/i,
    /^Let me /i,
    /^I need to/i,
    /^I should/i,
    /^Since we cannot/i,
    /^The tool/i,
    /^So we can/i,
    /queryType/i,
    /filter by cuisine/i,
  ];

  return thinkingPatterns.some((pattern) => pattern.test(text.trim()));
}

/**
 * Force the AI output into your strict schema:
 * { filter: {...}, message: string, places?: [...] }
 */
function coerceToAppJson(raw: string): {
  filter: FilterShape;
  message: string;
  places?: Array<{ name: string; cuisine: string }>;
} {
  const parsed = extractFinalJsonObject(raw);

  // Default base structure
  const base = {
    filter: emptyFilter(),
    message: "I'd be happy to help you find halal restaurants in Tokyo! What type of cuisine are you looking for?",
  };

  if (!parsed || typeof parsed !== "object") {
    const safeText = (raw ?? "").trim();
    // Only use raw text if it doesn't look like thinking
    if (safeText && !looksLikeThinking(safeText) && safeText.length < 300) {
      base.message = safeText;
    }
    return base;
  }

  const filter =
    parsed.filter && typeof parsed.filter === "object"
      ? (parsed.filter as Record<string, unknown>)
      : {};

  let msg = "";
  if (typeof parsed.message === "string") {
    msg = parsed.message;
  } else if (parsed.message != null) {
    msg = normalizeContent(parsed.message);
  }

  // If the message still looks like thinking, replace it
  if (!msg || looksLikeThinking(msg)) {
    msg = base.message;
  }

  return {
    filter: { ...emptyFilter(), ...(filter as Partial<FilterShape>) },
    message: msg,
  };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: emptyFilter(),
          message: "Ask me about halal food in Tokyo!",
        }),
      });
    }

    const typedMessages = messages.map((msg: Record<string, unknown>) => ({
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
          content: JSON.stringify({
            filter: emptyFilter(),
            message: "No response from AI.",
          }),
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
          .select(
            "id, name, cuisine_subtype, cuisine_category, city, address, price_level"
          );

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
        else if (!data?.length)
          toolResult = "No results found matching that criteria.";
        else if (args.queryType === "count")
          toolResult = `Found ${data.length} places.`;
        else {
          const top5 = data
            .slice(0, 5)
            .map(
              (p: Record<string, unknown>) =>
                `"${p.name}" - ${p.cuisine_subtype ?? p.cuisine_category ?? "Halal"}${p.price_level ? ` (${p.price_level})` : ""}`
            )
            .join(", ");
          toolResult = `Found ${data.length} places. Top results: ${top5}`;
        }

        // 3) Second call with tool output
        const secondCallMessages = [
          ...typedMessages,
          {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: toolResult,
          },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages);
        const finalChoice = finalCompletion.choices?.[0];

        if (!finalChoice?.message) {
          return NextResponse.json(
            {
              role: "assistant",
              content: JSON.stringify({
                filter: emptyFilter(),
                message: "No response from AI.",
              }),
            },
            { status: 500 }
          );
        }

        // 4) Coerce AI output to strict schema (strips thoughts)
        const coerced = coerceToAppJson(finalChoice.message.content ?? "");

        // 5) Inject places for UI convenience (always from DB, not hallucinated)
        if (data?.length) {
          coerced.places = data.slice(0, 10).map((p: Record<string, unknown>) => ({
            name: String(p.name),
            cuisine: String(p.cuisine_subtype || p.cuisine_category || "Halal"),
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
  } catch (error: unknown) {
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
