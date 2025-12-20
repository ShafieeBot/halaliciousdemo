import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Together from "together-ai";

// Together client
const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

// Supabase client (same as your original)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * IMPORTANT: This is the ORIGINAL filter contract your frontend expects.
 * Do not change the keys.
 */
type LegacyFilter = {
  cuisine_subtype: string | null;
  cuisine_category: string | null;
  price_level: string | null;
  tag: string | null;
  keyword: string | null;
  favorites: boolean | null;
};

const EMPTY_FILTER: LegacyFilter = {
  cuisine_subtype: null,
  cuisine_category: null,
  price_level: null,
  tag: null,
  keyword: null,
  favorites: null,
};

const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.

You have access to a database of halal restaurants via a virtual tool called "queryDatabase".
If the user asks a question that requires knowing specific restaurant data (e.g. "How many ramen places?", "Recommend a place", "best ramen", "show me"), YOU MUST USE queryDatabase.
Do not guess or hallucinate specific restaurant names.

You do NOT have access to live ratings (stars). If asked for "highest rated", say you don't have ratings but can recommend popular matches from the database.

CRITICAL OUTPUT RULES:
You must respond with EXACTLY ONE of the following JSON objects (no extra text):

A) TOOL REQUEST (when you need database results):
{
  "tool": "queryDatabase",
  "arguments": {
    "queryType": "count" | "list",
    "cuisine": string | null,
    "keyword": string | null
  }
}

B) FINAL ANSWER (for frontend):
{
  "filter": {
    "cuisine_subtype": string | null,
    "cuisine_category": string | null,
    "price_level": string | null,
    "tag": string | null,
    "keyword": string | null,
    "favorites": boolean | null
  },
  "message": string
}

IMPORTANT SEMANTICS (match frontend behavior):
- If user mentions a LOCATION (Shinjuku/Shibuya/Asakusa/etc), put it in filter.keyword (NOT city).
- If user asks "show/find" places, you MUST set filter values so the map updates.
- If recommending a specific place name, set filter.keyword to that place name so the map isolates it.
`;

// Helper: call Together and force JSON object output
async function togetherJSON(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const resp = await together.chat.completions.create({
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  return resp.choices?.[0]?.message?.content ?? "{}";
}

function safeMsgContent(v: any) {
  return typeof v === "string" ? v : "";
}

export async function POST(req: Request) {
  try {
    if (!process.env.TOGETHER_API_KEY) {
      return NextResponse.json(
        { error: "Missing TOGETHER_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    // 1) First model call: decide tool vs final JSON
    const firstMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: safeMsgContent(m.content),
      })),
    ];

    const firstRaw = await togetherJSON(firstMessages);

    let firstParsed: any;
    try {
      firstParsed = JSON.parse(firstRaw);
    } catch (e) {
      // Return original-format error response so chat.tsx doesn't break
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: { ...EMPTY_FILTER },
          message: "I couldn't understand that. Try asking differently.",
        }),
      });
    }

    // 2) If model asks for DB query, run it (replicates your old "tool calling" behavior)
    if (firstParsed?.tool === "queryDatabase") {
      const args = firstParsed.arguments || {};
      const queryType: "count" | "list" = args.queryType === "count" ? "count" : "list";
      const cuisine: string | null = typeof args.cuisine === "string" ? args.cuisine : null;
      const keyword: string | null = typeof args.keyword === "string" ? args.keyword : null;

      // Same query style as your original code:
      // - cuisine -> ilike cuisine_subtype
      // - keyword -> OR search in name/address/city
      let query = supabase.from("places").select("name, cuisine_subtype, cuisine_category, address, city");

      if (cuisine) {
        query = query.ilike("cuisine_subtype", `%${cuisine}%`);
      }
      if (keyword) {
        query = query.or(
          `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
        );
      }

      const { data, error } = await query;

      // Build tool result string (fed back into model)
      let toolResult = "";
      if (error) {
        toolResult = `Error querying database: ${error.message}`;
      } else if (!data || data.length === 0) {
        toolResult = "No results found matching that criteria.";
      } else {
        if (queryType === "count") {
          toolResult = `Found ${data.length} places.`;
        } else {
          const top5 = data
            .slice(0, 5)
            .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype || p.cuisine_category || "Unknown"})`)
            .join("\n");
          toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
        }
      }

      // 3) Second model call: force FINAL ANSWER JSON
      const secondMessages = [
        ...firstMessages,
        { role: "assistant" as const, content: JSON.stringify(firstParsed) },
        {
          role: "assistant" as const,
          content:
            `TOOL_RESULT (queryDatabase):\n${toolResult}\n\nNow produce FINAL ANSWER JSON (format B).`,
        },
      ];

      const finalRaw = await togetherJSON(secondMessages);

      let finalParsed: any;
      try {
        finalParsed = JSON.parse(finalRaw);
      } catch {
        finalParsed = {
          filter: {
            cuisine_subtype: cuisine,
            cuisine_category: null,
            price_level: null,
            tag: null,
            keyword: keyword,
            favorites: null,
          } satisfies LegacyFilter,
          message: "I found results, but had trouble formatting the response.",
        };
      }

      // Inject places list (your chat.tsx supports parsed.places)
      if (queryType === "list" && data && Array.isArray(data)) {
        finalParsed.places = data.slice(0, 10).map((p: any) => ({
          name: p.name,
          cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
        }));
      }

      // Ensure the filter keys are EXACTLY as frontend expects
      finalParsed.filter = {
        ...EMPTY_FILTER,
        ...(finalParsed.filter || {}),
      } as LegacyFilter;

      // IMPORTANT: return content as a STRING (exactly like before)
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify(finalParsed),
      });
    }

    // 4) No tool request: assume it already returned FINAL ANSWER JSON (format B)
    // Normalize keys and return as string
    const direct = {
      filter: { ...EMPTY_FILTER, ...(firstParsed.filter || {}) } as LegacyFilter,
      message: typeof firstParsed.message === "string" ? firstParsed.message : "Okay, I've updated the map.",
      places: firstParsed.places, // if present
    };

    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(direct),
    });
  } catch (error: any) {
    console.error("Chat route error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred during AI processing." },
      { status: 500 }
    );
  }
}
