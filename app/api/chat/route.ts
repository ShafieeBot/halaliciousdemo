// app/api/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TOGETHER_MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo";

// Single prompt: Extract filter and generate a friendly message
const SYSTEM_PROMPT = `
You are a friendly assistant helping Muslims find halal food in Japan.

Your job is to:
1. Extract search filters from the user's query
2. Generate a short, friendly message

CRITICAL OUTPUT RULES:
- Respond with ONLY valid JSON (no markdown, no commentary)
- Your JSON MUST include:
  - "filter": object with search parameters
  - "message": a short friendly response

FILTER KEYS (use null if not mentioned):
- cuisine_subtype: specific dish (ramen, sushi, kebab, curry, udon, biryani, etc.)
- cuisine_category: broad cuisine type - ALWAYS set this when food is mentioned:
  * ramen, sushi, udon, soba, tempura, donburi, yakiniku, yakitori → "Japanese"
  * biryani, tandoori, naan, curry (Indian style) → "Indian"  
  * kebab, doner, shawarma → "Turkish"
  * nasi goreng, satay, rendang → "Indonesian"
  * tom yum, pad thai → "Thai"
  * burger, pizza, pasta → "Western"
- keyword: location (Shinjuku, Shibuya, Asakusa, Tokyo, Akihabara, Ueno, etc.)
- price_level: "cheap", "moderate", or "expensive"
- tag: attributes like "spicy", "vegan", "family-friendly"
- favorites: true only if user asks about their saved/favorite places

MESSAGE GUIDELINES:
- Keep it short and friendly
- Don't list specific restaurant names (the map will show them)
- Example: "Here are some Japanese halal options in Shinjuku!"

EXAMPLES:
User: "ramen in Shinjuku"
{"filter":{"cuisine_subtype":"ramen","cuisine_category":"Japanese","keyword":"Shinjuku","price_level":null,"tag":null,"favorites":null},"message":"Looking for halal ramen in Shinjuku! Here's what I found:"}

User: "cheap Indian food"  
{"filter":{"cuisine_subtype":null,"cuisine_category":"Indian","keyword":null,"price_level":"cheap","tag":null,"favorites":null},"message":"Here are some affordable halal Indian restaurants!"}

User: "show my favorites"
{"filter":{"cuisine_subtype":null,"cuisine_category":null,"keyword":null,"price_level":null,"tag":null,"favorites":true},"message":"Here are your saved favorites!"}

Return JSON ONLY.
`;

function safeJsonParse(text: string | null | undefined) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const togetherKey = process.env.TOGETHER_API_KEY;
    if (!togetherKey) {
      return NextResponse.json(
        { error: "Missing TOGETHER_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    const userMessages = body.messages as { role: "user" | "assistant"; content: string }[];
    const context = body.context || {};
    const lastFilter = context.lastFilter || {};

    // Build messages for LLM
    const messagesForLLM = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(Object.keys(lastFilter).length > 0 
        ? [{ role: "system", content: `Previous filter context: ${JSON.stringify(lastFilter)}` }] 
        : []),
      ...userMessages,
    ];

    // Call Together API
    const resp = await fetch("https://api.together.xyz/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${togetherKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TOGETHER_MODEL,
        messages: messagesForLLM,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      const errJson = safeJsonParse(raw);
      const msg = errJson?.error?.message || `Together API error (${resp.status})`;
      return NextResponse.json({ error: msg }, { status: resp.status });
    }

    const json = safeJsonParse(raw);
    const content = json?.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(content);

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({
        filter: {},
        message: "I didn't understand that. Could you try again?",
      });
    }

    // Normalize filter
    const filter = parsed.filter || {};
    const normalizedFilter = {
      cuisine_subtype: filter.cuisine_subtype ?? null,
      cuisine_category: filter.cuisine_category ?? null,
      price_level: filter.price_level ?? null,
      tag: filter.tag ?? null,
      keyword: filter.keyword ?? null,
      favorites: typeof filter.favorites === "boolean" ? filter.favorites : null,
    };

    const message = typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message
      : "Here's what I found!";

    // Return filter and message - NO places array
    // The map-wrapper will query /api/places/search with this filter
    // and the chat component will display the places from the map's state
    return NextResponse.json({
      filter: normalizedFilter,
      message,
    });

  } catch (e: any) {
    console.error("Chat API error:", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
