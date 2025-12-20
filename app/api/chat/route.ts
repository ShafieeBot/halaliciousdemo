// app/api/chat/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TOGETHER_MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo";

const SYSTEM_PROMPT = `
You are a friendly assistant helping Muslims find halal food in Japan.

Your job is to:
1. Understand what the user is looking for
2. Generate search terms that will find matching restaurants
3. Write a short friendly message

OUTPUT FORMAT (JSON only, no markdown):
{
  "message": "Short friendly message",
  "search_terms": ["term1", "term2", "term3"],
  "price_level": null or "$" or "$$" or "$$$"
}

SEARCH TERMS RULES:
- Include the specific food type: "ramen", "sushi", "kebab", "curry", "biryani", "wagyu", etc.
- Include location if mentioned: "shinjuku", "shibuya", "asakusa", "ginza", "tokyo"
- Include related terms that might appear in restaurant names or addresses
- Be generous - include variations and related words
- Terms are searched across: name, address, city, cuisine_category, cuisine_subtype

EXAMPLES:

User: "ramen in Shinjuku"
{"message":"Here are halal ramen spots in Shinjuku!","search_terms":["ramen","shinjuku"],"price_level":null}

User: "cheap Indian food"
{"message":"Here are budget-friendly Indian options!","search_terms":["indian","curry","biryani","tandoori"],"price_level":"$"}

User: "best yakiniku"
{"message":"Here are great halal yakiniku places!","search_terms":["yakiniku","wagyu","beef","bbq","japanese"],"price_level":null}

User: "halal sushi near Tokyo Station"
{"message":"Halal sushi near Tokyo Station!","search_terms":["sushi","tokyo station","japanese"],"price_level":null}

User: "something spicy"
{"message":"Here are some spicy options!","search_terms":["spicy","indian","thai","curry","hot"],"price_level":null}

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

    // Build messages for LLM
    const messagesForLLM = [
      { role: "system", content: SYSTEM_PROMPT },
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 500,
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
        message: "Here's what I found!",
        search_terms: [],
        price_level: null,
      });
    }

    return NextResponse.json({
      message: parsed.message || "Here's what I found!",
      search_terms: Array.isArray(parsed.search_terms) ? parsed.search_terms : [],
      price_level: parsed.price_level || null,
    });

  } catch (e: any) {
    console.error("Chat API error:", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
