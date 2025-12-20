import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * OpenAI client
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Supabase client
 * Using anon is fine for public reads (as you had). Service role is optional.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * DB-aligned filter schema (matches your columns + safe helpers)
 */
type DBFilter = {
  query_text: string | null; // search against name/address/city/cuisine fields
  city: string | null;       // only if it exactly matches values in DB (rare with your current data)
  country: string | null;    // e.g. "JP"
  halal_status_in: string[];
  cuisine_category_in: string[];
  cuisine_subtype_in: string[];
  price_level_in: string[];  // "$", "$$", "$$$"
  tags_any: string[];        // overlaps tags[]
  has_place_id: boolean | null;
};

/**
 * Inference-first system prompt:
 * - model can infer freely
 * - but output must be executable against DB schema
 * - for best UX, it is ALLOWED (and encouraged) to call queryDatabase to fetch real places
 */
const SYSTEM_PROMPT = `
You are a halal food map assistant for Japan.

Goal:
- Interpret user queries naturally (users can ask in many ways).
- Convert the interpretation into database-aligned filters AND (when needed) fetch real places using the tool.
- Avoid hallucinating restaurant names.

Database columns:
name, address, city, country, halal_status, cuisine_category, cuisine_subtype, price_level, tags (array), place_id, lat, lng.

You DO NOT have ratings. If user asks "best", interpret as "recommended/popular options" and provide some matches from DB.

IMPORTANT:
- You may receive CURRENT_FILTER_JSON=... which represents existing filters.
- For follow-ups, refine/merge with existing filters rather than resetting.

You should choose between:
1) Calling queryDatabase when the user expects actual places (recommendations, lists, "show me", "best", etc.)
2) Returning a JSON response directly if a simple filter update is enough.

FINAL RESPONSE FORMAT (always JSON object):
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
  "message": string,
  "places"?: [{ "name": string, "cuisine": string }]
}

Rules:
- Never invent restaurant names.
- Use queryDatabase to fetch places if you need to mention places.
- Location like "Shinjuku/Shibuya/Asakusa" is usually in ADDRESS, not city. Prefer putting such terms into query_text.
- If cuisine fields are unknown in the DB, use query_text as fallback (e.g. include "ramen").
`;

/**
 * Tool spec: we let the model request a DB query using a DBFilter
 */
const tools = [
  {
    type: "function" as const,
    function: {
      name: "queryDatabase",
      description:
        "Query the places table to find matching restaurants. Use this for lists, recommendations, 'best', 'show me', etc.",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "object",
            description: "DB-aligned filter object",
            properties: {
              query_text: { type: ["string", "null"] },
              city: { type: ["string", "null"] },
              country: { type: ["string", "null"] },
              halal_status_in: { type: "array", items: { type: "string" } },
              cuisine_category_in: { type: "array", items: { type: "string" } },
              cuisine_subtype_in: { type: "array", items: { type: "string" } },
              price_level_in: { type: "array", items: { type: "string" } },
              tags_any: { type: "array", items: { type: "string" } },
              has_place_id: { type: ["boolean", "null"] },
            },
            required: [
              "query_text",
              "city",
              "country",
              "halal_status_in",
              "cuisine_category_in",
              "cuisine_subtype_in",
              "price_level_in",
              "tags_any",
              "has_place_id",
            ],
          },
          limit: {
            type: "integer",
            description: "Max results to return (suggest 10)",
            default: 10,
          },
        },
        required: ["filter"],
      },
    },
  },
];

/**
 * Helpers: build robust Supabase query.
 *
 * Key idea:
 * - query_text is searched across name/address/city/cuisine fields (OR)
 * - city is only applied if present (but your data defaults to Tokyo so treat carefully)
 * - tags_any is hard to do with overlap using supabase-js filters;
 *   we approximate with ilike in query_text for now.
 *   (If you want true overlap, we can add an RPC later.)
 */
async function runDBQuery(filter: DBFilter, limit: number) {
  let q = supabase
    .from("places")
    .select("name, cuisine_category, cuisine_subtype, address, city, country, halal_status, price_level, place_id")
    .limit(Math.min(Math.max(limit || 10, 1), 25));

  // country
  if (filter.country) q = q.eq("country", filter.country);

  // halal status
  if (filter.halal_status_in?.length) q = q.in("halal_status", filter.halal_status_in);

  // cuisine fields
  if (filter.cuisine_category_in?.length) q = q.in("cuisine_category", filter.cuisine_category_in);
  if (filter.cuisine_subtype_in?.length) q = q.in("cuisine_subtype", filter.cuisine_subtype_in);

  // price
  if (filter.price_level_in?.length) q = q.in("price_level", filter.price_level_in);

  // has_place_id
  if (filter.has_place_id === true) {
    // place_id not null/empty/N/A
    q = q.not("place_id", "is", null).neq("place_id", "").neq("place_id", "N/A");
  } else if (filter.has_place_id === false) {
    // allow null/empty/N/A
    // (Supabase doesn't have easy OR for these; we skip unless you really need this)
  }

  // city (apply only if you really want it)
  if (filter.city) {
    // In your dataset, city is often defaulted; still allow if explicitly set.
    q = q.ilike("city", `%${filter.city
