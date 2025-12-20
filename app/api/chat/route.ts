// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs"; // important for Netlify/Next runtime consistency

// ✅ Together model you showed
const TOGETHER_MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// IMPORTANT: This prompt is written to preserve your original “map filter keys/semantics” contract.
// It forces JSON-only output that your chat.tsx can parse and your map-wrapper can apply.
const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Japan.

CRITICAL OUTPUT RULES:
- You MUST respond with ONLY valid JSON (no markdown, no commentary).
- Your JSON MUST include:
  - "filter": an object with ONLY these allowed keys:
      cuisine_subtype, cuisine_category, price_level, tag, keyword, favorites
    Each value must be a string or null, except favorites which must be boolean or null.
  - "message": a short user-facing string.
- You MAY optionally include:
  - "places": an array of { "name": string, "cuisine": string } for the chat list.

BEHAVIOR:
- If the user asks to SHOW/FIND places, you MUST set filter fields so the map updates.
- If the user asks something like "best reviewed", you do NOT have ratings unless provided; say you can't see ratings.
- For follow-ups, you will be given context.lastFilter. Use it to stay consistent:
  - Example: user: "Cheap lunch places" -> set a filter
    follow-up: "best reviewed?" -> keep same filter context, but explain rating limitation.

FILTER GUIDANCE:
- Use cuisine_subtype for specific foods (ramen, sushi, yakiniku, kebab, etc.)
- Use cuisine_category for broad types (Japanese, Indian, Thai, Cafe, Restaurant, etc.)
- Use keyword for locations and general constraints (Shinjuku, Shibuya, Asakusa, "Tokyo", etc.)
- Use price_level if user says cheap/budget/mid/fine dining.
- Use tag if user says something like "spicy" or "vegan" and tags exist. Otherwise use keyword="spicy".

Return JSON ONLY.
`;

// Helper: strict JSON parse with fallback
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

    // Add a small, explicit context reminder for follow-ups
    const contextHint =
      lastFilter && Object.keys(lastFilter).length > 0
        ? `Context: lastFilter=${JSON.stringify(lastFilter)}`
        : "";

    const messagesForLLM = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(contextHint ? [{ role: "system", content: contextHint }] : []),
      ...userMessages,
    ];

    // Call Together Chat Completions API directly (works on Netlify/Next)
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
        // Together supports JSON Mode on some models; include it to strongly bias JSON-only output.
        // If the model ignores it, our parsing still handles it.
        response_format: { type: "json_object" },
      }),
    });

    const raw = await resp.text();

    if (!resp.ok) {
      // Attempt to extract Together error message
      const errJson = safeJsonParse(raw);
      const msg =
        errJson?.error?.message ||
        errJson?.message ||
        raw ||
        `Together API error (${resp.status})`;
      return NextResponse.json({ error: msg }, { status: resp.status });
    }

    const json = safeJsonParse(raw);
    const content: string | undefined =
      json?.choices?.[0]?.message?.content ?? undefined;

    // ✅ Fix for Netlify build: content can be undefined
    const parsed = safeJsonParse(content);

    // If LLM returned bad/empty JSON, return a safe object that won't break frontend
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({
        filter: {},
        message: "I didn’t get a usable response. Please try again.",
      });
    }

    // Normalize / enforce allowed keys + types
    const filter = parsed.filter && typeof parsed.filter === "object" ? parsed.filter : {};
    const normalizedFilter: Record<string, any> = {
      cuisine_subtype: filter.cuisine_subtype ?? null,
      cuisine_category: filter.cuisine_category ?? null,
      price_level: filter.price_level ?? null,
      tag: filter.tag ?? null,
      keyword: filter.keyword ?? null,
      favorites: typeof filter.favorites === "boolean" ? filter.favorites : null,
    };

    const message =
      typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message
        : "Okay, I've updated the map.";

    // Optional places list
    const places =
      Array.isArray(parsed.places) ? parsed.places : undefined;

    return NextResponse.json({
      filter: normalizedFilter,
      message,
      ...(places ? { places } : {}),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
