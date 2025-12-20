// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chatWithApriel } from "@/lib/together-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;

// Default search radius in km
const DEFAULT_RADIUS_KM = 5;

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

type FilterShape = {
  cuisine_subtype: string | null;
  cuisine_category: string | null;
  price_level: string | null;
  tag: string | null;
  keyword: string | null;
  favorites: boolean | null;
  location?: { lat: number; lng: number; radius: number; name: string } | null;
};

function emptyFilter(): FilterShape {
  return {
    cuisine_subtype: null,
    cuisine_category: null,
    price_level: null,
    tag: null,
    keyword: null,
    favorites: null,
    location: null,
  };
}

/**
 * Geocode a location name using Google Geocoding API
 * Returns coordinates or null if not found
 */
async function geocodeLocation(locationName: string): Promise<{ lat: number; lng: number; formattedName: string } | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationName)}&key=${GOOGLE_MAPS_API_KEY}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedName: result.formatted_address,
      };
    }

    console.log(`Geocoding failed for "${locationName}":`, data.status);
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

/**
 * Calculate distance between two points using Haversine formula
 */
function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Extract JSON from response
 */
function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  const s = (text ?? "").trim();
  if (!s) return null;

  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // continue
  }

  const jsonObjects: Record<string, unknown>[] = [];
  let i = 0;

  while (i < s.length) {
    if (s[i] === "{") {
      let depth = 0;
      const start = i;

      for (let j = i; j < s.length; j++) {
        if (s[j] === "{") depth++;
        else if (s[j] === "}") depth--;

        if (depth === 0) {
          const candidate = s.slice(start, j + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === "object" && parsed !== null) {
              jsonObjects.push(parsed);
            }
          } catch {
            // skip
          }
          i = j + 1;
          break;
        }
      }
      if (depth !== 0) i++;
    } else {
      i++;
    }
  }

  for (let idx = jsonObjects.length - 1; idx >= 0; idx--) {
    const obj = jsonObjects[idx];
    if ("filter" in obj || "message" in obj) {
      return obj;
    }
  }

  return jsonObjects.length > 0 ? jsonObjects[jsonObjects.length - 1] : null;
}

/**
 * Extract location keywords from user message
 * Looks for patterns like "in X", "near X", "around X", "at X"
 */
function extractLocationFromMessage(message: string): string | null {
  const msg = message.toLowerCase();
  
  // Patterns to find location
  const patterns = [
    /(?:in|near|around|at|close to|nearby)\s+([a-zA-Z\s]+?)(?:\s*[,.\?!]|$)/i,
    /([a-zA-Z\s]+?)\s+(?:area|district|station|city|town)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const location = match[1].trim();
      // Filter out common non-location words
      const nonLocations = ["the", "a", "an", "some", "any", "good", "best", "great", "nice", "cheap", "expensive"];
      if (location.length > 2 && !nonLocations.includes(location.toLowerCase())) {
        return location;
      }
    }
  }

  return null;
}

/**
 * Infer filter from user's message
 */
function inferFilterFromMessage(userMessage: string): { filter: Partial<FilterShape>; locationKeyword: string | null } {
  const msg = userMessage.toLowerCase();
  const filter: Partial<FilterShape> = {};

  // Cuisine types
  const cuisineMap: [string, string][] = [
    ["yakiniku", "Yakiniku"],
    ["gyudon", "Gyudon"],
    ["tempura", "Tempura"],
    ["udon", "Udon"],
    ["soba", "Soba"],
    ["ramen", "Ramen"],
    ["sushi", "Sushi"],
    ["indian", "Indian"],
    ["pakistani", "Pakistani"],
    ["turkish", "Turkish"],
    ["kebab", "Kebab"],
    ["curry", "Curry"],
    ["chinese", "Chinese"],
    ["korean", "Korean"],
    ["thai", "Thai"],
    ["vietnamese", "Vietnamese"],
    ["indonesian", "Indonesian"],
    ["malaysian", "Malaysian"],
    ["middle eastern", "Middle Eastern"],
    ["mediterranean", "Mediterranean"],
    ["burger", "Burger"],
    ["pizza", "Pizza"],
    ["chicken", "Chicken"],
    ["seafood", "Seafood"],
    ["halal", "Halal"],
  ];

  for (const [key, value] of cuisineMap) {
    if (msg.includes(key)) {
      filter.cuisine_subtype = value;
      break;
    }
  }

  // Price level
  if (msg.includes("cheap") || msg.includes("budget") || msg.includes("affordable")) {
    filter.price_level = "Budget";
  }

  // Extract location keyword (to be geocoded)
  const locationKeyword = extractLocationFromMessage(userMessage);

  return { filter, locationKeyword };
}

/**
 * Check if follow-up question
 */
function isFollowUpQuestion(userMessage: string): boolean {
  const msg = userMessage.toLowerCase();
  const followUpPatterns = [
    "which", "what about", "how about", "any other", "best", "top",
    "recommend", "suggestion", "favorite", "popular", "rated",
    "more", "another", "else", "different", "other",
  ];
  return followUpPatterns.some((p) => msg.includes(p));
}

/**
 * Get context from conversation history
 */
function getConversationContext(messages: Array<{ role: string; content: string }>): { filter: Partial<FilterShape>; locationKeyword: string | null } {
  const context: Partial<FilterShape> = {};
  let locationKeyword: string | null = null;

  for (const msg of messages) {
    if (msg.role === "user") {
      const { filter: inferred, locationKeyword: loc } = inferFilterFromMessage(msg.content);
      if (inferred.cuisine_subtype) context.cuisine_subtype = inferred.cuisine_subtype;
      if (inferred.price_level) context.price_level = inferred.price_level;
      if (loc) locationKeyword = loc;
    }
  }

  return { filter: context, locationKeyword };
}

/**
 * Check if text is model thinking
 */
function isThinkingText(text: string): boolean {
  if (!text || text.length < 10) return false;
  const t = text.trim().toLowerCase();
  const indicators = [
    "the user", "we need", "i need", "let me", "since", "the tool",
    "querytype", "querydatabase", "filter by", "we can", "we could",
  ];
  return indicators.some((ind) => t.includes(ind));
}

/**
 * Generate friendly message
 */
function generateMessage(filter: FilterShape, placesCount?: number, isNoResults?: boolean): string {
  if (isNoResults) {
    const parts: string[] = [];
    if (filter.cuisine_subtype) parts.push(filter.cuisine_subtype.toLowerCase());
    if (filter.location?.name) parts.push(`near ${filter.location.name}`);
    
    if (parts.length > 0) {
      return `No halal ${parts.join(" ")} found. Try a different search or larger area!`;
    }
    return "No restaurants found. Try a different search!";
  }

  const parts: string[] = [];
  if (filter.cuisine_subtype) parts.push(filter.cuisine_subtype.toLowerCase());
  if (filter.location?.name) parts.push(`near ${filter.location.name}`);

  const countText = placesCount !== undefined ? `Found ${placesCount}` : "Here are";

  if (parts.length > 0) {
    return `${countText} halal ${parts.join(" ")} restaurants! 🍽️`;
  }

  return placesCount !== undefined
    ? `Found ${placesCount} halal restaurants! 🍽️`
    : "Here are halal restaurants for you! 🍽️";
}

/**
 * Build response
 */
function buildResponse(
  parsed: Record<string, unknown> | null,
  currentFilter: Partial<FilterShape>,
  places?: Array<Record<string, unknown>>
): { filter: FilterShape; message: string; places?: Array<{ name: string; cuisine: string }> } {
  let filter: FilterShape = {
    cuisine_subtype: currentFilter.cuisine_subtype || null,
    cuisine_category: currentFilter.cuisine_category || null,
    price_level: currentFilter.price_level || null,
    tag: null,
    keyword: currentFilter.location?.name || currentFilter.keyword || null,
    favorites: null,
    location: currentFilter.location || null,
  };

  let message = "";

  if (parsed && typeof parsed === "object") {
    if (typeof parsed.message === "string" && parsed.message.length > 0 && !isThinkingText(parsed.message)) {
      message = parsed.message;
    }
  }

  if (!message || isThinkingText(message)) {
    message = generateMessage(filter, places?.length, places?.length === 0);
  }

  const result: { filter: FilterShape; message: string; places?: Array<{ name: string; cuisine: string }> } = {
    filter,
    message,
  };

  if (places && places.length > 0) {
    result.places = places.slice(0, 10).map((p) => ({
      name: String(p.name || "Unknown"),
      cuisine: String(p.cuisine_subtype || p.cuisine_category || "Halal"),
    }));
  } else {
    result.places = [];
  }

  return result;
}

/**
 * Query database with GEOSPATIAL filtering using dynamic geocoding
 */
async function queryPlaces(
  cuisine?: string | null,
  location?: { lat: number; lng: number; radius: number } | null
) {
  let query = supabase
    .from("places")
    .select("id, name, cuisine_subtype, cuisine_category, city, address, price_level, rating, lat, lng");

  // Filter by cuisine in database
  if (cuisine) {
    query = query.or(`cuisine_subtype.ilike.%${cuisine}%,cuisine_category.ilike.%${cuisine}%`);
  }

  const { data, error } = await query
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(500); // Get more for geospatial filtering

  if (error) {
    console.error("DB Error:", error);
    return [];
  }

  let results = data || [];

  // GEOSPATIAL FILTER: Filter by distance from location
  if (location && results.length > 0) {
    const { lat, lng, radius } = location;

    results = results.filter((place) => {
      if (!place.lat || !place.lng) return false;
      const distance = getDistanceKm(lat, lng, place.lat, place.lng);
      return distance <= radius;
    });

    // Sort by distance (nearest first)
    results.sort((a, b) => {
      const distA = getDistanceKm(lat, lng, a.lat!, a.lng!);
      const distB = getDistanceKm(lat, lng, b.lat!, b.lng!);
      return distA - distB;
    });
  }

  return results.slice(0, 20);
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: emptyFilter(),
          message: "Assalamualaikum! 👋 Ask me about halal food anywhere in the world!",
          places: [],
        }),
      });
    }

    const typedMessages = messages.map((msg: Record<string, unknown>) => ({
      role: String(msg.role || "user"),
      content: normalizeContent(msg.content),
    }));

    const lastUserMessage = [...typedMessages].reverse().find((m) => m.role === "user");
    const userMessageText = lastUserMessage?.content || "";

    // Infer filter and extract location keyword
    const { filter: currentInferred, locationKeyword } = inferFilterFromMessage(userMessageText);

    let currentFilter: Partial<FilterShape> = { ...currentInferred };
    let currentLocationKeyword = locationKeyword;

    // Handle follow-up questions
    if (isFollowUpQuestion(userMessageText)) {
      const { filter: contextFilter, locationKeyword: contextLoc } = getConversationContext(typedMessages);
      currentFilter = {
        cuisine_subtype: currentInferred.cuisine_subtype || contextFilter.cuisine_subtype,
        cuisine_category: currentInferred.cuisine_category || contextFilter.cuisine_category,
        price_level: currentInferred.price_level || contextFilter.price_level,
      };
      currentLocationKeyword = locationKeyword || contextLoc;
    }

    // GEOCODE the location if we have a keyword
    if (currentLocationKeyword) {
      const geocoded = await geocodeLocation(currentLocationKeyword);
      if (geocoded) {
        currentFilter.location = {
          lat: geocoded.lat,
          lng: geocoded.lng,
          radius: DEFAULT_RADIUS_KM,
          name: currentLocationKeyword,
        };
        currentFilter.keyword = currentLocationKeyword;
        console.log(`Geocoded "${currentLocationKeyword}" → ${geocoded.lat}, ${geocoded.lng}`);
      } else {
        console.log(`Could not geocode "${currentLocationKeyword}"`);
      }
    }

    // 1) Call AI
    const completion = await chatWithApriel(typedMessages as any);
    const choice = completion.choices?.[0];

    if (!choice?.message) {
      const places = await queryPlaces(currentFilter.cuisine_subtype, currentFilter.location);
      const response = buildResponse(null, currentFilter, places);
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify(response),
      });
    }

    const message = choice.message;

    // 2) Handle tool calls
    if (message.tool_calls?.length) {
      const toolCall = message.tool_calls[0];

      if (toolCall.function?.name === "queryDatabase") {
        const args = JSON.parse(toolCall.function.arguments ?? "{}");

        const cuisine = args.cuisine || currentFilter.cuisine_subtype;

        // If AI provided a location keyword, geocode it
        let location = currentFilter.location;
        if (args.keyword && !location) {
          const geocoded = await geocodeLocation(args.keyword);
          if (geocoded) {
            location = {
              lat: geocoded.lat,
              lng: geocoded.lng,
              radius: DEFAULT_RADIUS_KM,
              name: args.keyword,
            };
          }
        }

        const places = await queryPlaces(cuisine, location);

        let toolResult = "";
        if (places.length === 0) {
          toolResult = "No restaurants found matching the criteria.";
        } else {
          const names = places.slice(0, 5).map((p) => p.name).join(", ");
          toolResult = `Found ${places.length} restaurants: ${names}`;
        }

        const secondCallMessages = [
          ...typedMessages,
          {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: toolResult,
          },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages as any);
        const finalChoice = finalCompletion.choices?.[0];

        const parsed = extractJsonFromResponse(finalChoice?.message?.content ?? "");

        const finalFilter = {
          ...currentFilter,
          cuisine_subtype: cuisine || currentFilter.cuisine_subtype,
          location: location,
        };

        const response = buildResponse(parsed, finalFilter, places);
        return NextResponse.json({
          role: "assistant",
          content: JSON.stringify(response),
        });
      }
    }

    // 3) No tool call - direct response
    const parsed = extractJsonFromResponse(message.content ?? "");

    const parsedFilter = (parsed?.filter as Record<string, unknown>) || {};
    const cuisine = (typeof parsedFilter.cuisine_subtype === "string" ? parsedFilter.cuisine_subtype : null) || currentFilter.cuisine_subtype;

    const places = await queryPlaces(cuisine, currentFilter.location);

    const finalFilter = {
      ...currentFilter,
      cuisine_subtype: cuisine,
    };

    const response = buildResponse(parsed, finalFilter, places);
    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(response),
    });

  } catch (error: unknown) {
    console.error("API Error:", error);
    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify({
        filter: emptyFilter(),
        message: "Sorry, something went wrong. Please try again! 🙏",
        places: [],
      }),
    });
  }
}
