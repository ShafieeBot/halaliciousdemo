import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Together from "together-ai";

// Initialize Together
const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * EXACT legacy response format your frontend expects (unchanged)
 */
const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.

You have access to a database of halal restaurants via a virtual tool called "queryDatabase".
If the user asks a question that requires knowing specific restaurant data (e.g. "How many ramen places?", "Recommend a place", "best ramen", "show me"), YOU MUST USE queryDatabase.
Do not guess or hallucinate specific restaurant names.

You do NOT have access to live ratings (stars). If asked for "highest rated", say you don't have ratings but can recommend popular matches from the database.

CRITICAL OUTPUT RULES:
You must respond with EXACTLY ONE of the following JSON objects:

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
- If user asks for a LOCATION (Shinjuku/Shibuya/Asakusa/etc), put it in filter.keyword (NOT in city).
- If user asks "show/find" places, you MUST set filter values so the map updates.
- If recommending a specific place name, set filter.keyword to that place name so the map isolates it.

Be consistent and output valid JSON only. No extra text.
`;

/**
 * We also include a TOOL_RESULT message after querying Supabase,
 * to let the model craft the final response without hallucination.
 */
function toolResultToMessage(toolResult: string) {
  return `TOOL_RESULT (queryDatabase):
${toolResult}

Now produce FINAL ANSWER JSON (format B).`;
}

async function togetherChatJSON(messages: { role: "system" | "user" | "assistant"; content: string }[]) {
  const resp = await together.chat.completions.create({
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const content = resp.choices?.[0]?.message?.content ?? "{}";
  return content;
}

export async function POST(req: Request) {
  try {
    // Validate env
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

    // First pass: ask model whether to "tool" or "final answer"
    const firstMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string" ? m.content : "",
      })),
    ];

    const firstRaw = await togetherChatJSON(firstMessages);

    let firstParsed: any;
    try {
      firstParsed = JSON.parse(firstRaw);
    } catch (e) {
      // If model returned invalid JSON, fail gracefully
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: {
            cuisine_subtype: null,
            cuisine_category: null,
            price_level: null,
            tag: null,
            keyword: null,
            favorites: null,
          },
          message: "I couldn't understand that. Try asking differently.",
        }),
      });
    }

    // If model wants to query DB
    if (firstParsed?.tool === "queryDatabase") {
      const args = firstParsed.arguments || {};
      const queryType = args.queryType === "count" ? "count" : "list";
      const cuisine = typeof args.cuisine === "string" ? args.cuisine : null;
      const keyword = typeof args.keyword === "string" ? args.keyword : null;

      // Execute DB Query (same logic as your old code)
      let query = supabase.from("places").select("name, cuisine_subtype, cuisine_category, address, city");

      if (cuisine) {
        query = query.ilike("cuisine_subtype", `%${cuisine}%`);
      }
      if (keyword) {
        // IMPORTANT: keep keyword behavior same as before (name/address/city OR)
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
      } else {
        if (queryType === "count") {
          toolResult = `Found ${data.length} places.`;
        } else {
          // list: show top 5 in tool result
          const top5 = data
            .slice(0, 5)
            .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype || p.cuisine_category || "Unknown"})`)
            .join("\n");
          toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
        }
      }

      // Second pass: ask model for FINAL ANSWER JSON (format B)
      const secondMessages = [
        ...firstMessages,
        {
          role: "assistant" as const,
          content: JSON.stringify(firstParsed), // include the tool request
        },
        {
          role: "assistant" as const,
          content: toolResultToMessage(toolResult),
        },
      ];

      const finalRaw = await togetherChatJSON(secondMessages);

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
          },
          message: "I found results, but had trouble formatting the response.",
        };
      }

      // Inject places list into the JSON string (same behavior as old route.ts)
      // Your chat.tsx already supports parsed.places for clickable list.
      if (queryType === "list" && data && Array.isArray(data)) {
        finalParsed.places = data.slice(0, 10).map((p: any) => ({
          name: p.name,
          cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
        }));
      }

      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify(finalParsed),
      });
    }

    // Otherwise: return the model’s final JSON directly (format B)
    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(firstParsed),
    });
  } catch (error: any) {
    console.error("Together API Error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred during AI processing." },
      { status: 500 }
    );
  }
}
