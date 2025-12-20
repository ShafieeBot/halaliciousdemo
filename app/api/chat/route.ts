// app/api/chat/route.ts
import { NextResponse } from 'next/server';

type Role = 'system' | 'user' | 'assistant';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function safeJsonParse<T = any>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Extract the first JSON object from a string.
 * Works even if the model adds extra text accidentally.
 */
function extractJsonObject(text: string): any | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return safeJsonParse(text.slice(start, end + 1));
}

const SYSTEM_PROMPT = `
You are a JSON-only filter generator for a halal restaurant map.

You MUST output a single JSON object ONLY, with EXACTLY this shape:

{
  "filter": {
    "cuisine_subtype": string | null,
    "cuisine_category": string | null,
    "price_level": string | null,
    "tag": string | null,
    "keyword": string | null,
    "favorites": boolean | null,
    "halal_status": string | null,
    "open_now": boolean | null
  },
  "message": string
}

Rules:
- Use ONLY these keys. Do not invent other keys.
- If the user asks a follow-up like "which is the best reviewed?" you MUST reuse the previous filter from context.lastFilter.
- NEVER return an empty filter. If unsure, set keyword to a useful fallback:
  - keyword = the user's location term if present (e.g. "Shinjuku", "Shibuya", "Asakusa")
  - otherwise keyword = the user's entire query.
- "cuisine_subtype" examples: "Ramen", "Yakiniku", "Sushi", "Kebab", "Curry"
- "cuisine_category" examples: "Japanese", "Indian", "Thai", "Cafe", "Restaurant"
- "price_level" must be one of: "$", "$$", "$$$", "$$$$" (or null)
- "tag" is for tags array matching (e.g. "spicy", "family", "vegan") (or null)
- "halal_status" should be one of (when possible): "Certified", "Muslim Friendly", "No", "Unknown" (or null)
- "open_now": true only if the user asks "open now", "open late", "currently open", etc.

IMPORTANT:
- Output JSON ONLY. No markdown, no extra text.
`;

export async function POST(req: Request) {
  try {
    const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
    if (!TOGETHER_API_KEY) {
      return NextResponse.json({ error: 'Missing TOGETHER_API_KEY' }, { status: 500 });
    }

    const body = await req.json();
    const messages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
    const context = body?.context || {};
    const lastFilter = context?.lastFilter || {};

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Invalid messages format.' }, { status: 400 });
    }

    // Provide lastFilter as a compact context instruction
    const contextMsg =
      lastFilter && Object.keys(lastFilter).length > 0
        ? `context.lastFilter = ${JSON.stringify(lastFilter)}`
        : `context.lastFilter = {}`;

    const payloadMessages: { role: Role; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: contextMsg },
      ...messages.map((m) => ({ role: m.role as Role, content: m.content })),
    ];

    // Together chat completions (OpenAI compatible)
    const resp = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
        messages: payloadMessages,
        temperature: 0.2,
      }),
    });

    const raw = await resp.text();
    const data = safeJsonParse<any>(raw);

    if (!resp.ok) {
      return NextResponse.json(
        { error: data?.error?.message || data?.message || `LLM error (${resp.status})`, raw },
        { status: 500 }
      );
    }

    const content: string = data?.choices?.[0]?.message?.content ?? '';
    const parsed = extractJsonObject(content);

    // Fallback if model fails formatting
    const userText = messages[messages.length - 1]?.content || '';
    const fallback = {
      filter: {
        cuisine_subtype: null,
        cuisine_category: null,
        price_level: null,
        tag: null,
        keyword: userText || 'Tokyo',
        favorites: null,
        halal_status: null,
        open_now: null,
      },
      message: "Okay — I've updated the map.",
    };

    const out = parsed && typeof parsed === 'object' ? parsed : fallback;

    // HARD GUARANTEE: never return an empty filter (your UI resets if empty)
    out.filter = out.filter || {};
    const hasAny =
      Object.values(out.filter).some((v: any) => v !== null && v !== undefined && String(v).trim() !== '');

    if (!hasAny) {
      out.filter.keyword = userText || 'Tokyo';
    }

    // Return in the SAME format your original chat.tsx expects: { content: "json-string" }
    return NextResponse.json({
      role: 'assistant',
      content: JSON.stringify(out),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected server error' }, { status: 500 });
  }
}
