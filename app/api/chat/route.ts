// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chatWithApriel } from "@/lib/together-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
};

function emptyFilter(): FilterShape {
  return {
    cuisine_subtype: null,
    cuisine_category: null,
    price_level: null,
    tag: null,
    keyword: null,
    favorites: null,
  };
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

  // Find JSON objects
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
 * Infer filter from user's message
 */
function inferFilterFromMessage(userMessage: string): Partial<FilterShape> {
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
    ["spicy", "Spicy"], // Added spicy
  ];

  for (const [key, value] of cuisineMap) {
    if (msg.includes(key)) {
      filter.cuisine_subtype = value;
      break;
    }
  }

  // Locations
  const locations = [
    "shinjuku", "shibuya", "tokyo", "osaka", "kyoto", "asakusa",
    "ginza", "akihabara", "harajuku", "ikebukuro", "ueno", "roppongi",
    "shinagawa", "ebisu", "meguro", "nakano", "kichijoji", "yokohama",
    "kobe", "nara", "hiroshima", "fukuoka", "sapporo", "nagoya",
  ];

  for (const loc of locations) {
    if (msg.includes(loc)) {
      filter.keyword = loc.charAt(0).toUpperCase() + loc.slice(1);
      break;
    }
  }

  // Price level
  if (msg.includes("cheap") || msg.includes("budget") || msg.includes("affordable")) {
    filter.price_level = "Budget";
  }

  return filter;
}

/**
 * Extract context from conversation history (for follow-up questions)
 */
function getConversationContext(messages: Array<{ role: string; content: string }>): Partial<FilterShape> {
  const context: Partial<FilterShape> = {};

  // Look through previous messages to find context
  for (const msg of messages) {
    if (msg.role === "user") {
      const inferred = inferFilterFromMessage(msg.content);
      // Keep accumulating context
      if (inferred.cuisine_subtype) context.cuisine_subtype = inferred.cuisine_subtype;
      if (inferred.keyword) context.keyword = inferred.keyword;
      if (inferred.price_level) context.price_level = inferred.price_level;
    }
  }

  return context;
}

/**
 * Check if this is a follow-up question
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
    if (filter.keyword) parts.push(`in ${filter.keyword}`);
    
    if (parts.length > 0) {
      return `No halal ${parts.join(" ")} found. Please try different filters.`;
    }
    return "No restaurants found. Please try different filters.";
  }

  const parts: string[] = [];
  if (filter.cuisine_subtype) parts.push(filter.cuisine_subtype.toLowerCase());
  if (filter.keyword) parts.push(`in ${filter.keyword}`);

  const countText = placesCount !== undefined ? `Found ${placesCount}` : "Here are";

  if (parts.length > 0) {
    return `${countText} halal ${parts.join(" ")} restaurants! 🍽️`;
  }

  return placesCount !== undefined
    ? `Found ${placesCount} halal restaurants! 🍽️`
    : "Here are halal restaurants for you! 🍽️";
}

/**
 * Build response combining model output with inferred/context filters
 */
function buildResponse(
  parsed: Record<string, unknown> | null,
  currentFilter: Partial<FilterShape>,
  places?: Array<Record<string, unknown>>
): { filter: FilterShape; message: string; places?: Array<{ name: string; cuisine: string }> } {
  let filter = emptyFilter();
  let message = "";

  if (parsed && typeof parsed === "object") {
    if (parsed.filter && typeof parsed.filter === "object") {
      const pf = parsed.filter as Record<string, unknown>;
      filter = {
        cuisine_subtype: (typeof pf.cuisine_subtype === "string" ? pf.cuisine_subtype : null) || currentFilter.cuisine_subtype || null,
        cuisine_category: (typeof pf.cuisine_category === "string" ? pf.cuisine_category : null) || currentFilter.cuisine_category || null,
        price_level: (typeof pf.price_level === "string" ? pf.price_level : null) || currentFilter.price_level || null,
        tag: (typeof pf.tag === "string" ? pf.tag : null) || null,
        keyword: (typeof pf.keyword === "string" ? pf.keyword : null) || currentFilter.keyword || null,
        favorites: typeof pf.favorites === "boolean" ? pf.favorites : null,
      };
    } else {
      filter = { ...emptyFilter(), ...currentFilter };
    }

    if (typeof parsed.message === "string" && parsed.message.length > 0 && !isThinkingText(parsed.message)) {
      message = parsed.message;
    }
  } else {
    filter = { ...emptyFilter(), ...currentFilter };
  }

  // Generate message if needed
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
 * Query database with filters
 */
async function queryPlaces(cuisine?: string | null, keyword?: string | null, tag?: string | null) {
  let query = supabase
    .from("places")
    .select("id, name, cuisine_subtype, cuisine_category, city, address, price_level, rating");

  if (cuisine) {
    // Search in both cuisine_subtype and tags
    query = query.or(`cuisine_subtype.ilike.%${cuisine}%,tags.cs.{${cuisine.toLowerCase()}}`);
  }
  if (keyword) {
    query = query.or(
      `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
    );
  }
  if (tag) {
    query = query.contains("tags", [tag.toLowerCase()]);
  }

  const { data, error } = await query.order("rating", { ascending: false, nullsFirst: false }).limit(20);

  if (error) {
    console.error("DB Error:", error);
    return [];
  }

  return data || [];
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: emptyFilter(),
          message: "Assalamualaikum! 👋 Ask me about halal food in Japan!",
          places: [],
        }),
      });
    }

    // Normalize messages
    const typedMessages = messages.map((msg: Record<string, unknown>) => ({
      role: String(msg.role || "user"),
      content: normalizeContent(msg.content),
    }));

    // Get last user message
    const lastUserMessage = [...typedMessages].reverse().find((m) => m.role === "user");
    const userMessageText = lastUserMessage?.content || "";

    // Get current filter from user message
    const currentInferred = inferFilterFromMessage(userMessageText);

    // If follow-up question, also get context from conversation history
    let currentFilter = { ...currentInferred };
    if (isFollowUpQuestion(userMessageText)) {
      const contextFilter = getConversationContext(typedMessages);
      // Merge: current message takes priority, but fill gaps from context
      currentFilter = {
        cuisine_subtype: currentInferred.cuisine_subtype || contextFilter.cuisine_subtype,
        cuisine_category: currentInferred.cuisine_category || contextFilter.cuisine_category,
        price_level: currentInferred.price_level || contextFilter.price_level,
        keyword: currentInferred.keyword || contextFilter.keyword,
      };
    }

    // 1) Call AI
    const completion = await chatWithApriel(typedMessages as any);
    const choice = completion.choices?.[0];

    if (!choice?.message) {
      // No AI response - query DB with inferred filter
      const places = await queryPlaces(currentFilter.cuisine_subtype, currentFilter.keyword);
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

        // Combine tool args with inferred filter
        const cuisine = args.cuisine || currentFilter.cuisine_subtype;
        const keyword = args.keyword || currentFilter.keyword;

        const places = await queryPlaces(cuisine, keyword);

        // Build tool result
        let toolResult = "";
        if (places.length === 0) {
          toolResult = "No restaurants found matching the criteria.";
        } else {
          const names = places.slice(0, 5).map((p) => p.name).join(", ");
          toolResult = `Found ${places.length} restaurants: ${names}`;
        }

        // Second call with tool result
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
        
        // Update filter with what we actually queried
        const finalFilter = {
          ...currentFilter,
          cuisine_subtype: cuisine || currentFilter.cuisine_subtype,
          keyword: keyword || currentFilter.keyword,
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

    // Get filter from parsed or inferred
    const parsedFilter = (parsed?.filter as Record<string, unknown>) || {};
    const cuisine = (typeof parsedFilter.cuisine_subtype === "string" ? parsedFilter.cuisine_subtype : null) || currentFilter.cuisine_subtype;
    const keyword = (typeof parsedFilter.keyword === "string" ? parsedFilter.keyword : null) || currentFilter.keyword;

    // Query database
    const places = await queryPlaces(cuisine, keyword);

    const finalFilter = {
      ...currentFilter,
      cuisine_subtype: cuisine,
      keyword: keyword,
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
