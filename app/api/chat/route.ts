// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TOGETHER_MODEL = "meta-llama/Llama-3.2-3B-Instruct-Turbo";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Step 1: Extract filter intent from user query
const FILTER_EXTRACTION_PROMPT = `
You are a filter extraction assistant for a halal restaurant finder in Japan.
Extract search filters from the user's query.

CRITICAL OUTPUT RULES:
- Respond with ONLY valid JSON (no markdown, no commentary).
- Your JSON MUST include:
  - "filter": an object with ONLY these allowed keys:
      cuisine_subtype, cuisine_category, price_level, tag, keyword, favorites
    Each value must be a string or null, except favorites which must be boolean or null.

FILTER GUIDANCE:
- Use cuisine_subtype for specific foods (ramen, sushi, yakiniku, kebab, curry, udon, donburi, etc.)
- Use cuisine_category for broad types (Japanese, Indian, Thai, Indonesian, Turkish, Cafe, etc.)
- Use keyword for locations (Shinjuku, Shibuya, Asakusa, Tokyo, Akihabara, Ueno, etc.)
- Use price_level: "cheap" or "budget" for affordable, "mid" for moderate, "expensive" for upscale.
- Use tag for attributes like "spicy", "vegan", "family-friendly".
- Set favorites to true if user asks about their saved/favorite places.

Return JSON ONLY. Example: {"filter":{"cuisine_subtype":"ramen","keyword":"Shinjuku"}}
`;

// Step 2: Generate friendly response based on ACTUAL database results
const RESPONSE_GENERATION_PROMPT = `
You are a friendly local guide helping Muslims find halal food in Japan.

CRITICAL RULES:
1. You can ONLY mention restaurants from the PROVIDED LIST below - these are verified halal restaurants.
2. DO NOT make up, invent, or suggest ANY restaurant names not in this list.
3. Respond with ONLY valid JSON (no markdown).

Your JSON MUST include:
- "message": a friendly response about the restaurants found (or explain if none found)
- "places": an array of restaurants from the provided list: [{ "name": string, "cuisine": string }]

If the list is empty, set places to [] and explain no halal places matched the criteria.
`;

function safeJsonParse(text: string | null | undefined) {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Query database for halal restaurants matching filter
async function queryHalalRestaurants(filter: Record<string, any>) {
  let query = supabase
    .from("halal_places")
    .select("id, name, cuisine_subtype, cuisine_category, address, price_level, tags")
    .limit(10);

  if (filter.cuisine_subtype) {
    query = query.ilike("cuisine_subtype", `%${filter.cuisine_subtype}%`);
  }
  if (filter.cuisine_category) {
    query = query.ilike("cuisine_category", `%${filter.cuisine_category}%`);
  }
  if (filter.keyword) {
    // Search in name, address, or area
    query = query.or(
      `name.ilike.%${filter.keyword}%,address.ilike.%${filter.keyword}%`
    );
  }
  if (filter.price_level) {
    query = query.ilike("price_level", `%${filter.price_level}%`);
  }

  const { data, error } = await query;
  
  if (error) {
    console.error("Supabase query error:", error);
    return [];
  }
  
  return data || [];
}

// Call Together API
async function callTogetherAI(messages: any[], togetherKey: string) {
  const resp = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${togetherKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TOGETHER_MODEL,
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const raw = await resp.text();
  
  if (!resp.ok) {
    const errJson = safeJsonParse(raw);
    throw new Error(errJson?.error?.message || `Together API error (${resp.status})`);
  }

  const json = safeJsonParse(raw);
  return json?.choices?.[0]?.message?.content;
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
    const latestUserMessage = userMessages[userMessages.length - 1].content;
    const context = body.context || {};
    const lastFilter = context.lastFilter || {};

    // ========== STEP 1: Extract filter from user query ==========
    const filterMessages = [
      { role: "system", content: FILTER_EXTRACTION_PROMPT },
      ...(Object.keys(lastFilter).length > 0 
        ? [{ role: "system", content: `Previous filter context: ${JSON.stringify(lastFilter)}` }] 
        : []),
      { role: "user", content: latestUserMessage },
    ];

    const filterResponse = await callTogetherAI(filterMessages, togetherKey);
    const filterParsed = safeJsonParse(filterResponse);
    
    const filter = filterParsed?.filter || {};
    const normalizedFilter: Record<string, any> = {
      cuisine_subtype: filter.cuisine_subtype ?? null,
      cuisine_category: filter.cuisine_category ?? null,
      price_level: filter.price_level ?? null,
      tag: filter.tag ?? null,
      keyword: filter.keyword ?? null,
      favorites: typeof filter.favorites === "boolean" ? filter.favorites : null,
    };

    // ========== STEP 2: Query database for actual halal restaurants ==========
    const halalPlaces = await queryHalalRestaurants(normalizedFilter);
    
    // Format places for LLM context
    const placesContext = halalPlaces.length > 0
      ? halalPlaces.map(p => `- ${p.name} (${p.cuisine_subtype || p.cuisine_category || "Halal"})`).join("\n")
      : "No halal restaurants found matching this criteria.";

    // ========== STEP 3: Generate user-friendly response ==========
    const responseMessages = [
      { role: "system", content: RESPONSE_GENERATION_PROMPT },
      { 
        role: "system", 
        content: `VERIFIED HALAL RESTAURANTS FROM DATABASE:\n${placesContext}\n\nUser asked: "${latestUserMessage}"` 
      },
      { role: "user", content: "Generate a friendly response based ONLY on the provided restaurant list." },
    ];

    const responseContent = await callTogetherAI(responseMessages, togetherKey);
    const responseParsed = safeJsonParse(responseContent);

    // Build final response
    let message = responseParsed?.message || "Here's what I found!";
    let places = responseParsed?.places || [];

    // Validate places - only include ones actually in our database results
    const validPlaceNames = new Set(halalPlaces.map(p => p.name.toLowerCase()));
    places = places.filter((p: any) => 
      validPlaceNames.has(p.name?.toLowerCase()) || 
      halalPlaces.some(hp => hp.name.toLowerCase().includes(p.name?.toLowerCase()) || p.name?.toLowerCase().includes(hp.name.toLowerCase()))
    );

    // If AI returned invalid places, use database results directly
    if (places.length === 0 && halalPlaces.length > 0) {
      places = halalPlaces.map(p => ({
        name: p.name,
        cuisine: p.cuisine_subtype || p.cuisine_category || "Halal",
      }));
      message = `Here are some halal ${normalizedFilter.cuisine_subtype || normalizedFilter.cuisine_category || ""} places${normalizedFilter.keyword ? ` near ${normalizedFilter.keyword}` : ""}!`.replace(/\s+/g, " ").trim();
    }

    if (halalPlaces.length === 0) {
      message = "I couldn't find any halal restaurants matching that criteria. Try a different cuisine type or area!";
      places = [];
    }

    return NextResponse.json({
      filter: normalizedFilter,
      message,
      places,
    });

  } catch (e: any) {
    console.error("Chat API error:", e);
    return NextResponse.json(
      { error: e?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
