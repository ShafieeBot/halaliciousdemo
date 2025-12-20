// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Together from "together-ai";

// -----------------------------
// CONFIG
// -----------------------------
const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

/**
 * IMPORTANT: This prompt enforces the ORIGINAL frontend contract.
 * Your chat.tsx expects `content` to be a JSON STRING with:
 * { filter: LegacyFilter, message: string, places?: [...] }
 */
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

IMPORTANT SEMANTICS (must match frontend map filter):
- If user mentions a LOCATION (Shinjuku/Shibuya/Asakusa/etc), put it in filter.keyword (NOT city).
- If user asks "show/find" places, you MUST set filter values so the map updates.
- If recommending a specific place name, set filter.keyword to that place name so the map isolates it.
- For general requests like "spicy food" or "cheap lunch", set keyword to "Tokyo" unless the user specifies another area.

Output valid JSON only. No Markdown.
`;

// -----------------------------
// HELPERS
// -----------------------------
function safeMsgContent(v: any) {
  return typeof v === "string" ? v : "";
}

/**
 * This is the key “restore old behavior” safeguard.
 * Together/Llama sometimes forgets to set keyword; your map relies on it.
 * We enforce keyword based on the user’s text, without touching frontend code.
 */
function enforceLegacyFilter(filter: any, userText: string): LegacyFilter {
  const base: LegacyFilter = { ...EMPTY_FILTER, ...(filter || {}) };

  if (base.keyword && String(base.keyword).trim() !== "") return base;

  const text = (userText || "").toLowerCase();

  // Add locations you care about (expand anytime)
  const knownLocations = [
    "shinjuku",
    "shibuya",
    "asakusa",
    "ginza",
    "ueno",
    "akihabara",
    "yotsuya",
    "ikebukuro",
    "harajuku",
    "roppongi",
    "tokyo",
  ];

  for (const loc of knownLocations) {
    if (text.includes(loc)) {
      base.keyword = loc; // keep original “keyword drives filtering” behavior
      return base;
    }
  }

  // If it's a generic “category” query, anchor to Tokyo (matches your old UX intent)
  const looksLikeTokyoWide =
    text.includes("spicy") ||
    text.includes("cheap") ||
    text.includes("lunch") ||
    text.includes("ramen") ||
    text.includes("yakiniku") ||
    text.includes("sushi") ||
    text.includes("curry") ||
    text.includes("near me");

  if (looksLikeTokyoWide) {
    base.keyword = "Tokyo";
  }

  return base;
}

async function togetherJSON(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const resp = await together.chat.completions.create({
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  return resp.choices?.[0]?.message?.content ?? "{}";
}

function toolResultToMessage(toolResult: string) {
  return `TOOL_RESULT (queryDatabase):
${toolResult}

Now produce FINAL ANSWER JSON (format B).`;
}

// -----------------------------
// ROUTE
// -----------------------------
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

    const lastUserText = safeMsgContent(messages[messages.length - 1]?.content);

    // 1) First call: tool request OR final response
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
    } catch {
      // Keep frontend contract safe
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: enforceLegacyFilter(EMPTY_FILTER, lastUserText),
          message: "I couldn't understand that. Try asking differently.",
        }),
      });
    }

    // 2) Tool flow
    if (firstParsed?.tool === "queryDatabase") {
      const args = firstParsed.arguments || {};
      const queryType: "count" | "list" = args.queryType === "count" ? "count" : "list";
      const cuisine: string | null = typeof args.cuisine === "string" ? args.cuisine : null;
      const keyword: string | null = typeof args.keyword === "string" ? args.keyword : null;

      // Execute DB query (same style as your original)
      let query = supabase
        .from("places")
        .select("id, name, cuisine_subtype, cuisine_category, address, city, tags, price_level");

      if (cuisine) {
        query = query.ilike("cuisine_subtype", `%${cuisine}%`);
      }
      if (keyword) {
        query = query.or(
          `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
        );
      }

      const { data, error } = await query;

      let toolResult = "";
      if (error) {
        toolResult = `Error querying database: ${error.message}`;
      } else if (!data || data.length === 0) {
        toolResult = "No results found matching that criteria.";
      } else if (queryType === "count") {
        toolResult = `Found ${data.length} places.`;
      } else {
        const top5 = data
          .slice(0, 5)
          .map(
            (p: any) =>
              `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype || p.cuisine_category || "Unknown"})`
          )
          .join("\n");
        toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
      }

      // 3) Second call: final JSON (format B)
      const secondMessages = [
        ...firstMessages,
        { role: "assistant" as const, content: JSON.stringify(firstParsed) },
        { role: "assistant" as const, content: toolResultToMessage(toolResult) },
      ];

      const finalRaw = await togetherJSON(secondMessages);

      let finalParsed: any;
      try {
        finalParsed = JSON.parse(finalRaw);
      } catch {
        finalParsed = {
          filter: {
            ...EMPTY_FILTER,
            cuisine_subtype: cuisine,
            keyword: keyword,
          },
          message: "I found results, but had trouble formatting the response.",
        };
      }

      // Inject places list for chat.tsx (clickable list)
      if (queryType === "list" && data && Array.isArray(data)) {
        finalParsed.places = data.slice(0, 10).map((p: any) => ({
          name: p.name,
          cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
        }));
      }

      // Enforce original filter semantics (keyword)
      finalParsed.filter = enforceLegacyFilter(finalParsed.filter, lastUserText);

      // IMPORTANT: return `content` as STRING for chat.tsx
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify(finalParsed),
      });
    }

    // 4) Direct final answer (format B)
    const direct = {
      filter: enforceLegacyFilter(firstParsed.filter, lastUserText),
      message:
        typeof firstParsed.message === "string"
          ? firstParsed.message
          : "Okay, I've updated the map.",
      places: firstParsed.places,
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
