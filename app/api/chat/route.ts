import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY;
const TOGETHER_MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type ChatMsg = { role: "user" | "assistant"; content: string };

type ExtractedVars = {
  // Core
  city?: string | null;
  cuisine_subtype?: string | null;    // e.g. Ramen, Sushi, Yakiniku
  cuisine_category?: string | null;   // e.g. Japanese, Indian, Cafe
  keyword?: string | null;            // e.g. Shinjuku, Shibuya, Asakusa
  halal_status_in?: string[] | null;  // e.g. ["Certified","Muslim Friendly"]
  price_level?: string | null;        // "$", "$$", "$$$", "Budget", "Mid-range", etc.

  // Extras
  tag?: string | null;                // e.g. spicy, vegan, etc (matches tags[])
  open_now?: boolean | null;          // attempt a best-effort filter using opening_hours strings
  wants_list?: boolean | null;        // user wants places listed
  wants_recommendation?: boolean | null; // user asks "best", "recommend", etc

  // Special
  favorites?: boolean | null;
};

type PlaceRow = {
  id: string;
  name: string;
  cuisine_category: string | null;
  cuisine_subtype: string | null;
  halal_status: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  place_id: string | null;
  lat: number | null;
  lng: number | null;
  price_level: string | null;
  opening_hours: string[] | null;
  tags: string[] | null;
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function normalizePriceLevel(p?: string | null): string | null {
  if (!p) return null;
  const s = p.trim();
  if (!s) return null;
  return s;
}

function includesCI(hay?: string | null, needle?: string | null) {
  if (!hay || !needle) return false;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Best-effort: determine if place is open "now" based on stored opening_hours strings.
 * Your DB stores Google-style strings like:
 * "Monday: 11:30 AM – 3:00 PM, 6:00 – 10:00 PM"
 *
 * We’ll do a simple check:
 * - find today line
 * - if contains "Closed" => false
 * - if contains times => attempt parse ranges (very forgiving)
 * If parsing fails, we return true (don’t over-filter).
 */
function isOpenNow(openingHours: string[] | null | undefined, now = new Date()): boolean {
  if (!openingHours || openingHours.length === 0) return true; // unknown -> don’t exclude

  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const today = days[now.getDay()];
  const line = openingHours.find(l => l.startsWith(today + ":"));
  if (!line) return true;

  const lower = line.toLowerCase();
  if (lower.includes("closed")) return false;

  // Extract everything after "Day:"
  const after = line.split(":").slice(1).join(":").trim();
  if (!after) return true;

  // Handle "Open 24 hours"
  if (after.toLowerCase().includes("24")) return true;

  // Very forgiving time parsing:
  // - split on commas => multiple ranges
  // - parse "h:mm AM/PM" or "h AM/PM"
  const ranges = after.split(",").map(s => s.trim()).filter(Boolean);

  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const parseTime = (t: string): number | null => {
    // normalize spaces and weird dashes
    const s = t.replace(/\u202F/g, " ").replace(/\s+/g, " ").trim();

    // Examples:
    // "11:30 AM"
    // "6:00 PM"
    // "6 PM"
    const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!m) return null;

    let hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3].toUpperCase();

    if (ap === "AM") {
      if (hh === 12) hh = 0;
    } else {
      if (hh !== 12) hh += 12;
    }
    return hh * 60 + mm;
  };

  for (const r of ranges) {
    // split by dash variants
    const parts = r.split(/–|-|—/).map(s => s.trim()).filter(Boolean);
    if (parts.length !== 2) continue;

    const start = parseTime(parts[0]);
    const end = parseTime(parts[1]);
    if (start == null || end == null) continue;

    // handle overnight range (e.g. 10 PM – 2 AM)
    if (end < start) {
      if (minutesNow >= start || minutesNow <= end) return true;
    } else {
      if (minutesNow >= start && minutesNow <= end) return true;
    }
  }

  // If we couldn’t parse, don’t exclude
  return true;
}

async function togetherChatJSON(messages: { role: string; content: string }[]): Promise<string> {
  if (!TOGETHER_API_KEY) {
    throw new Error("Missing TOGETHER_API_KEY environment variable.");
  }

  const res = await fetch("https://api.together.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOGETHER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages,
      temperature: 0.2,
      // Together supports JSON mode for many models; if it’s not supported,
      // the prompt still strongly enforces JSON-only output.
      response_format: { type: "json_object" },
    }),
  });

  const text = await res.text();
  const data = safeJsonParse<any>(text);

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || text;
    throw new Error(msg);
  }

  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty content.");
  }
  return content;
}

/**
 * Build Supabase query using extracted vars.
 * This is your FIXED QUERY logic — just with variables filled in.
 */
async function queryPlaces(vars: ExtractedVars): Promise<PlaceRow[]> {
  let q = supabase
    .from("places")
    .select(
      "id,name,cuisine_category,cuisine_subtype,halal_status,address,city,country,place_id,lat,lng,price_level,opening_hours,tags"
    );

  // City / location
  if (vars.city) {
    q = q.ilike("city", `%${vars.city}%`);
  }

  // Cuisine subtype/category
  if (vars.cuisine_subtype) {
    q = q.ilike("cuisine_subtype", `%${vars.cuisine_subtype}%`);
  }
  if (vars.cuisine_category) {
    q = q.ilike("cuisine_category", `%${vars.cuisine_category}%`);
  }

  // Halal status filter
  if (vars.halal_status_in && vars.halal_status_in.length > 0) {
    q = q.in("halal_status", vars.halal_status_in);
  }

  // Price level (simple includes / match)
  if (vars.price_level) {
    q = q.ilike("price_level", `%${vars.price_level}%`);
  }

  // Keyword search across name/address/city
  if (vars.keyword) {
    const k = vars.keyword.replace(/,/g, " ");
    q = q.or(
      `name.ilike.%${k}%,address.ilike.%${k}%,city.ilike.%${k}%`
    );
  }

  // Note: tags[] filtering is harder with anon+PostgREST without a custom RPC.
  // We’ll do best-effort tag filter after fetching, server-side.
  const { data, error } = await q.limit(200);
  if (error) throw new Error(error.message);

  let rows = (data || []) as PlaceRow[];

  // Tag filter (server-side)
  if (vars.tag) {
    const t = vars.tag.toLowerCase();
    rows = rows.filter((p) => (p.tags || []).some((x) => x.toLowerCase().includes(t)));
  }

  // Open now filter (server-side)
  if (vars.open_now) {
    rows = rows.filter((p) => isOpenNow(p.opening_hours));
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: ChatMsg[] = body?.messages || [];
    const context = body?.context || {};

    if (!messages.length) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser?.content || "";

    // ---------- 1) Extract variables with LLM (NO PLACE NAMES) ----------
    const extractPrompt = `
You are an intent parser for a halal restaurant map app.
Return ONLY valid JSON (no markdown).
Extract structured variables from the user's message.
Rules:
- Do NOT invent restaurant names.
- favorites=true ONLY if the user explicitly asks for favorites/saved places.
- cuisine_subtype examples: Ramen, Sushi, Yakiniku, Curry, Kebab, Cafe.
- cuisine_category examples: Japanese, Indian, Middle Eastern, Cafe, Restaurant.
- city: e.g. Shinjuku, Shibuya, Asakusa, Tokyo.
- keyword: neighborhood/landmark/free text like "near Shibuya", "in Shinjuku" -> use "Shibuya"/"Shinjuku".
- halal_status_in: choose from ["Certified","Muslim Friendly","Unknown","No"] ONLY when user explicitly filters halal status.
- price_level: "$", "$$", "$$$", "$$$$" or "Budget", "Mid-range", "Fine Dining" when user asks cheap/expensive.
- open_now=true if user asks "open now", "open late", "currently open". Otherwise null.
- wants_list=true if user asks to show/find/list/recommend places.
- wants_recommendation=true if user asks best/top/recommend.
Return JSON with keys:
{
  "city": string|null,
  "cuisine_subtype": string|null,
  "cuisine_category": string|null,
  "keyword": string|null,
  "halal_status_in": string[]|null,
  "price_level": string|null,
  "tag": string|null,
  "open_now": boolean|null,
  "favorites": boolean|null,
  "wants_list": boolean|null,
  "wants_recommendation": boolean|null
}
`;

    const extractContent = await togetherChatJSON([
      { role: "system", content: extractPrompt },
      // Give minimal context for follow-ups:
      ...(context?.lastFilter
        ? [{ role: "assistant", content: `Context lastFilter JSON: ${JSON.stringify(context.lastFilter)}` }]
        : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]);

    let vars = safeJsonParse<ExtractedVars>(extractContent) || {};

    // Normalize vars
    vars.city = vars.city ?? null;
    vars.cuisine_subtype = vars.cuisine_subtype ?? null;
    vars.cuisine_category = vars.cuisine_category ?? null;
    vars.keyword = vars.keyword ?? null;
    vars.tag = vars.tag ?? null;
    vars.open_now = vars.open_now ?? null;
    vars.wants_list = vars.wants_list ?? null;
    vars.wants_recommendation = vars.wants_recommendation ?? null;
    vars.price_level = normalizePriceLevel(vars.price_level);

    // Hard-guard: do NOT allow favorites unless explicitly requested
    const userAskedFavorites = /favorite|favourites|saved/i.test(userText);
    if (!userAskedFavorites) vars.favorites = null;

    // ---------- 2) Retrieve places from Supabase (DB is source of truth) ----------
    // Favorites mode is handled client-side in your chat.tsx (as before),
    // but we still return a filter value that’s only ever true when explicitly asked.
    let places: PlaceRow[] = [];
    if (!vars.favorites) {
      places = await queryPlaces(vars);
    }

    // ---------- 3) Create final response (message derived from DB results) ----------
    // The FILTER keys must match your frontend expectations EXACTLY.
    const filter = {
      cuisine_subtype: vars.cuisine_subtype,
      cuisine_category: vars.cuisine_category,
      price_level: vars.price_level,
      tag: vars.tag,
      keyword: vars.keyword || vars.city, // helps map search by location
      favorites: vars.favorites ?? null,
    };

    // Build a *DB-backed* list for chat sidebar (no hallucinations)
    const placeList = (places || []).slice(0, 10).map((p) => ({
      name: p.name,
      cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
    }));

    // If user asked “best reviewed”, we can’t do it from DB reliably unless you store ratings.
    // For now we’re honest and still show DB matches.
    const askedBestReviewed = /best\s+review|highest\s+rated|top\s+rated/i.test(userText);

    let message: string;
    if (vars.favorites) {
      // Client-side will override list; keep message minimal
      message = "Showing your favorites.";
    } else if (!places || places.length === 0) {
      message = "I couldn’t find any matching halal places in the database for that query.";
    } else if (askedBestReviewed) {
      message =
        `I don’t have ratings in the database yet, but here are ${Math.min(
          places.length,
          10
        )} matching halal places I found.`;
    } else if (vars.open_now) {
      message = `Here are ${Math.min(places.length, 10)} places that look open right now (based on stored hours).`;
    } else if (vars.wants_recommendation || vars.wants_list) {
      message = `Here are ${Math.min(places.length, 10)} halal options I found that match your request.`;
    } else {
      message = `I found ${places.length} matching halal places.`;
    }

    // IMPORTANT: keep response compatible with your existing chat.tsx parser
    // (it supports either {content:"...json..."} OR direct object).
    return NextResponse.json({
      filter,
      message,
      places: placeList,
      // Optional: include raw rows if you later want server-driven map without client filtering
      results: places,
      vars,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
