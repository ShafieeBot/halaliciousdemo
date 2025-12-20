import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY!,
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * DB-aligned filter schema (matches your columns + safe helpers)
 */
type DBFilter = {
  query_text: string | null; // searched across name/address/city/cuisine fields
  city: string | null;       // only if it matches a true city value in your DB
  country: string | null;    // e.g. "JP"
  halal_status_in: string[];
  cuisine_category_in: string[];
  cuisine_subtype_in: string[];
  price_level_in: string[];  // "$", "$$", "$$$"
  tags_any: string[];        // best effort (true overlap needs RPC)
  has_place_id: boolean | null;
};

function defaultFilter(): DBFilter {
  return {
    query_text: null,
    city: null,
    country: "JP",
    halal_status_in: [],
    cuisine_category_in: [],
    cuisine_subtype_in: [],
    price_level_in: [],
    tags_any: [],
    has_place_id: null,
  };
}

function safeString(v: any) {
  return typeof v === "string" ? v : "";
}

/**
 * IMPORTANT: Your DB currently has city often defaulted to "Tokyo".
 * This means wards/neighbourhoods ("Shinjuku") should not be hard-filtered as city.
 *
 * To keep this inference-first (not prescriptive), we do a data-driven normalization:
 * - If filter.city isn't one of the known DB city values, move it into query_text.
 */
function normalizeFilterAgainstData(filter: DBFilter, knownCities: Set<string>): DBFilter {
  const out: DBFilter = { ...defaultFilter(), ...filter };

  if (out.city) {
    const c = out.city.toLowerCase();
    if (!knownCities.has(c)) {
      out.query_text = out.query_text ? `${out.query_text} ${out.city}` : out.city;
      out.city = null;
    }
  }

  // If user asked for ramen/spicy/etc and subtype/category are empty, keep query_text as fallback.
  return out;
}

async function getKnownCities(): Promise<Set<string>> {
  // lightweight query: grab distinct city values (up to 2000) and normalize
  const { data } = await supabase.from("places").select("city").limit(2000);
  const set = new Set<string>();
  (data || [])
    .map((r: any) => (r.city || "").toString().trim().toLowerCase())
    .filter(Boolean)
    .forEach((c: string) => set.add(c));
  return set;
}

async function runDBQuery(filter: DBFilter, limit = 10) {
  let q = supabase
    .from("places")
    .select("name,cuisine_category,cuisine_subtype,address,city,country,halal_status,price_level,place_id")
    .limit(Math.min(Math.max(limit, 1), 25));

  if (filter.country) q = q.eq("country", filter.country);

  if (filter.halal_status_in?.length) q = q.in("halal_status", filter.halal_status_in);
  if (filter.cuisine_category_in?.length) q = q.in("cuisine_category", filter.cuisine_category_in);
  if (filter.cuisine_subtype_in?.length) q = q.in("cuisine_subtype", filter.cuisine_subtype_in);
  if (filter.price_level_in?.length) q = q.in("price_level", filter.price_level_in);

  if (filter.has_place_id === true) {
    q = q.not("place_id", "is", null).neq("place_id", "").neq("place_id", "N/A");
  }

  if (filter.city) {
    q = q.ilike("city", `%${filter.city}%`);
  }

  // query_text OR search across common fields
  if (filter.query_text && filter.query_text.trim()) {
    const t = filter.query_text.trim().replace(/%/g, "");
    q = q.or(
      [
        `name.ilike.%${t}%`,
        `address.ilike.%${t}%`,
        `city.ilike.%${t}%`,
        `cuisine_category.ilike.%${t}%`,
        `cuisine_subtype.ilike.%${t}%`,
        `halal_status.ilike.%${t}%`,
      ].join(",")
    );
  }

  // tags_any: best effort without RPC (true overlap needs SQL operator &&)
  // We approximate by folding the first tag into text search; this keeps UX good.
  if (filter.tags_any?.length) {
    const tag = filter.tags_any[0].replace(/%/g, "");
    q = q.or(`name.ilike.%${tag}%,address.ilike.%${tag}%,cuisine_subtype.ilike.%${tag}%`);
  }

  const { data, error } = await q;
  return { data: data || [], error };
}

/**
 * Together prompt: inference-first, but output MUST be DBFilter JSON.
 */
function buildSystemPrompt() {
  return `
You are a halal food map assistant. You must output ONLY valid JSON.

You can interpret user requests in many ways (users ask creatively).
But you MUST express your interpretation using this DB filter schema only.

DB columns you can filter:
name, address, city, country, halal_status, cuisine_category, cuisine_subtype, price_level, tags (array), place_id.

OUTPUT JSON:
{
  "filter": {
    "query_text": string|null,
    "city": string|null,
    "country": string|null,
    "halal_status_in": string[],
    "cuisine_category_in": string[],
    "cuisine_subtype_in": string[],
    "price_level_in": string[],
    "tags_any": string[],
    "has_place_id": boolean|null
  },
  "message": string
}

Conversation:
- You may receive CURRENT_FILTER_JSON=... in a system message.
- For follow-ups, refine/merge existing filters instead of resetting unless user clearly says "reset".

Guidance:
- Prefer recall over brittle filters that could return 0 results.
- Use query_text as a flexible fallback when structured fields may be unknown in the DB.
- Keep message short (1 sentence).
`;
}

export async function POST(req: Request) {
  try {
    if (!process.env.TOGETHER_API_KEY) {
      return NextResponse.json({ error: "Missing TOGETHER_API_KEY environment variable." }, { status: 500 });
    }

    const body = await req.json();
    const messages = body?.messages;
    const lastFilter = body?.context?.lastFilter ?? null;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    const sys = buildSystemPrompt();

    const togetherMessages = [
      { role: "system", content: sys },
      ...(lastFilter ? [{ role: "system", content: `CURRENT_FILTER_JSON=${JSON.stringify(lastFilter)}` }] : []),
      ...messages.map((m: any) => ({ role: m.role, content: safeString(m.content) })),
    ];

    const resp = await together.chat.completions.create({
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
      messages: togetherMessages as any,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const aiFilter: DBFilter = { ...defaultFilter(), ...(parsed.filter || {}) };
    const aiMessage = typeof parsed.message === "string" && parsed.message.trim()
      ? parsed.message
      : "Okay — updating the map.";

    // Data-driven normalization so "Shinjuku" doesn't break filtering
    const knownCities = await getKnownCities();
    const normalizedFilter = normalizeFilterAgainstData(aiFilter, knownCities);

    // Always query DB so the UX feels “real” (like your old tool version)
    const { data, error } = await runDBQuery(normalizedFilter, 10);

    const places = (data || []).slice(0, 10).map((p: any) => ({
      name: p.name,
      cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
    }));

    const finalPayload = {
      filter: normalizedFilter,
      message: error ? "I had trouble querying the database — please try again." : aiMessage,
      places,
    };

    // IMPORTANT: match your old client contract: { content: "<json string>" }
    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(finalPayload),
    });
  } catch (err: any) {
    console.error("Together route error:", err);
    return NextResponse.json({ error: err.message || "Unexpected error." }, { status: 500 });
  }
}
