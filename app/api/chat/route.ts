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
 * Extract JSON from Apriel's response.
 * The Thinker model outputs reasoning THEN JSON, so we find the LAST valid JSON object.
 */
function extractJsonFromResponse(text: string): Record<string, unknown> | null {
  const s = (text ?? "").trim();
  if (!s) return null;

  // Try parsing whole string first (best case)
  try {
    const parsed = JSON.parse(s);
    if (typeof parsed === "object" && parsed !== null) return parsed;
  } catch {
    // continue
  }

  // Find all JSON objects in the string
  const jsonObjects: Record<string, unknown>[] = [];
  let i = 0;

  while (i < s.length) {
    if (s[i] === "{") {
      let depth = 0;
      let start = i;

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
            // Not valid JSON
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

  // Return the LAST JSON object with "filter" or "message" (the final answer)
  for (let idx = jsonObjects.length - 1; idx >= 0; idx--) {
    const obj = jsonObjects[idx];
    if ("filter" in obj || "message" in obj) {
      return obj;
    }
  }

  // Return last JSON object if any
  return jsonObjects.length > 0 ? jsonObjects[jsonObjects.length - 1] : null;
}

/**
 * Infer filter from user's message as a RELIABLE BACKUP.
 * This ensures the map filters correctly even if the model fails.
 */
function inferFilterFromMessage(userMessage: string): Partial<FilterShape> {
  const msg = userMessage.toLowerCase();
  const filter: Partial<FilterShape> = {};

  // Cuisine types - order matters (more specific first)
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
    ["vegetarian", "Vegetarian"],
    ["vegan", "Vegan"],
  ];

  for (const [key, value] of cuisineMap) {
    if (msg.includes(key)) {
      filter.cuisine_subtype = value;
      break;
    }
  }

  // Locations in Japan
  const locations = [
    "shinjuku", "shibuya", "tokyo", "osaka", "kyoto", "asakusa",
    "ginza", "akihabara", "harajuku", "ikebukuro", "ueno", "roppongi",
    "shinagawa", "ebisu", "meguro", "nakano", "kichijoji", "yokohama",
    "kobe", "nara", "hiroshima", "fukuoka", "sapporo", "nagoya",
    "sendai", "kanazawa", "okinawa",
  ];

  for (const loc of locations) {
    if (msg.includes(loc)) {
      filter.keyword = loc.charAt(0).toUpperCase() + loc.slice(1);
      break;
    }
  }

  // Price level
  if (msg.includes("cheap") || msg.includes("budget") || msg.includes("affordable") || msg.includes("inexpensive")) {
    filter.price_level = "Budget";
  } else if (msg.includes("expensive") || msg.includes("fancy") || msg.includes("fine dining") || msg.includes("upscale")) {
    filter.price_level = "Fine Dining";
  } else if (msg.includes("mid-range") || msg.includes("moderate")) {
    filter.price_level = "Mid-range";
  }

  return filter;
}

/**
 * Check if text looks like model thinking/reasoning (not a user-facing message)
 */
function isThinkingText(text: string): boolean {
  if (!text || text.length < 10) return false;
  
  const t = text.trim().toLowerCase();
  
  const thinkingIndicators = [
    "the user says",
    "the user wants",
    "the user is asking",
    "they want",
    "we need to",
    "i need to",
    "i should",
    "let me",
    "let's",
    "since we",
    "since the",
    "the tool",
    "querytype",
    "querydatabase",
    "filter by",
    "we can query",
    "we could",
    "we might",
    "the query",
    "so we",
    "but we",
    "however",
    "therefore",
    "this means",
    "in order to",
    "to find",
    "to get",
    "to search",
    "hallucinate",
    "must not",
    "cannot filter",
  ];

  return thinkingIndicators.some((indicator) => t.includes(indicator));
}

/**
 * Generate a friendly message based on the filter
 */
function generateMessage(filter: FilterShape, placesCount?: number): string {
  const parts: string[] = [];

  if (filter.cuisine_subtype) {
    parts.push(filter.cuisine_subtype.toLowerCase());
  }

  if (filter.keyword) {
    parts.push(`in ${filter.keyword}`);
  }

  if (filter.price_level === "Budget") {
    parts.push("(budget-friendly)");
  } else if (filter.price_level === "Fine Dining") {
    parts.push("(fine dining)");
  }

  const countText = placesCount !== undefined ? `Found ${placesCount} halal` : "Here are halal";

  if (parts.length > 0) {
    const description = parts.join(" ");
    return `${countText} ${description} restaurants for you! 🍽️`;
  }

  return placesCount !== undefined
    ? `Found ${placesCount} halal restaurants! 🍽️`
    : "Here are some halal restaurants for you! 🍽️";
}

/**
 * Build the final response, combining model output with inferred filter
 */
function buildResponse(
  parsed: Record<string, unknown> | null,
  userMessage: string,
  places?: Array<Record<string, unknown>>
): { filter: FilterShape; message: string; places?: Array<{ name: string; cuisine: string }> } {
  const inferredFilter = inferFilterFromMessage(userMessage);

  // Start with empty filter
  let filter = emptyFilter();
  let message = "";

  if (parsed && typeof parsed === "object") {
    // Try to extract filter from model response
    if (parsed.filter && typeof parsed.filter === "object") {
      const pf = parsed.filter as Record<string, unknown>;

      // Use model's filter values, but fall back to inferred
      filter = {
        cuisine_subtype: (typeof pf.cuisine_subtype === "string" ? pf.cuisine_subtype : null) || inferredFilter.cuisine_subtype || null,
        cuisine_category: (typeof pf.cuisine_category === "string" ? pf.cuisine_category : null) || inferredFilter.cuisine_category || null,
        price_level: (typeof pf.price_level === "string" ? pf.price_level : null) || inferredFilter.price_level || null,
        tag: (typeof pf.tag === "string" ? pf.tag : null) || null,
        keyword: (typeof pf.keyword === "string" ? pf.keyword : null) || inferredFilter.keyword || null,
        favorites: typeof pf.favorites === "boolean" ? pf.favorites : null,
      };
    } else {
      // No filter from model, use inferred
      filter = { ...emptyFilter(), ...inferredFilter };
    }

    // Try to extract message
    if (typeof parsed.message === "string" && parsed.message.length > 0 && !isThinkingText(parsed.message)) {
      message = parsed.message;
    }
  } else {
    // No valid JSON from model, use inferred filter
    filter = { ...emptyFilter(), ...inferredFilter };
  }

  // Generate message if empty or is thinking text
  if (!message || isThinkingText(message)) {
    message = generateMessage(filter, places?.length);
  }

  // Build result
  const result: { filter: FilterShape; message: string; places?: Array<{ name: string; cuisine: string }> } = {
    filter,
    message,
  };

  // Add places if available
  if (places && places.length > 0) {
    result.places = places.slice(0, 10).map((p) => ({
      name: String(p.name || "Unknown"),
      cuisine: String(p.cuisine_subtype || p.cuisine_category || "Halal"),
    }));
  }

  return result;
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
        }),
      });
    }

    // Get the last user message for filter inference
    const lastUserMessage = [...messages].reverse().find((m: Record<string, unknown>) => m.role === "user");
    const userMessageText = lastUserMessage ? normalizeContent(lastUserMessage.content) : "";

    const typedMessages = messages.map((msg: Record<string, unknown>) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: normalizeContent(msg.content),
    }));

    // 1) First call to Apriel
    const completion = await chatWithApriel(typedMessages);
    const choice = completion.choices?.[0];

    if (!choice?.message) {
      // No response - use inferred filter to query DB
      const inferredFilter = inferFilterFromMessage(userMessageText);
      let places: Array<Record<string, unknown>> | undefined;

      if (inferredFilter.cuisine_subtype || inferredFilter.keyword) {
        let query = supabase
          .from("places")
          .select("id, name, cuisine_subtype, cuisine_category, city, address, price_level");

        if (inferredFilter.cuisine_subtype) {
          query = query.ilike("cuisine_subtype", `%${inferredFilter.cuisine_subtype}%`);
        }
        if (inferredFilter.keyword) {
          query = query.or(
            `name.ilike.%${inferredFilter.keyword}%,address.ilike.%${inferredFilter.keyword}%,city.ilike.%${inferredFilter.keyword}%`
          );
        }

        const { data } = await query.limit(20);
        places = data || undefined;
      }

      const response = buildResponse(null, userMessageText, places);
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

        // Combine tool args with inferred filter for better coverage
        const inferredFilter = inferFilterFromMessage(userMessageText);
        const cuisine = args.cuisine || inferredFilter.cuisine_subtype;
        const keyword = args.keyword || inferredFilter.keyword;

        let query = supabase
          .from("places")
          .select("id, name, cuisine_subtype, cuisine_category, city, address, price_level");

        if (cuisine) {
          query = query.ilike("cuisine_subtype", `%${cuisine}%`);
        }
        if (keyword) {
          query = query.or(
            `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
          );
        }

        const { data, error } = await query.limit(20);

        // Build tool result for the model
        let toolResult = "";
        if (error) {
          toolResult = `Error: ${error.message}`;
        } else if (!data?.length) {
          toolResult = "No restaurants found.";
        } else {
          const names = data.slice(0, 5).map((p) => p.name).join(", ");
          toolResult = `Found ${data.length} restaurants: ${names}`;
        }

        // 3) Second call with tool result
        const secondCallMessages = [
          ...typedMessages,
          {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: toolResult,
          },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages);
        const finalChoice = finalCompletion.choices?.[0];

        // Extract JSON and build response
        const parsed = extractJsonFromResponse(finalChoice?.message?.content ?? "");
        const response = buildResponse(parsed, userMessageText, data || undefined);

        return NextResponse.json({
          role: "assistant",
          content: JSON.stringify(response),
        });
      }
    }

    // 3) No tool call - direct response
    const parsed = extractJsonFromResponse(message.content ?? "");

    // Query database based on inferred/parsed filter
    const inferredFilter = inferFilterFromMessage(userMessageText);
    const parsedFilter = (parsed?.filter as Record<string, unknown>) || {};
    
    const cuisine = (typeof parsedFilter.cuisine_subtype === "string" ? parsedFilter.cuisine_subtype : null) || inferredFilter.cuisine_subtype;
    const keyword = (typeof parsedFilter.keyword === "string" ? parsedFilter.keyword : null) || inferredFilter.keyword;

    let places: Array<Record<string, unknown>> | undefined;

    if (cuisine || keyword) {
      let query = supabase
        .from("places")
        .select("id, name, cuisine_subtype, cuisine_category, city, address, price_level");

      if (cuisine) {
        query = query.ilike("cuisine_subtype", `%${cuisine}%`);
      }
      if (keyword) {
        query = query.or(
          `name.ilike.%${keyword}%,address.ilike.%${keyword}%,city.ilike.%${keyword}%`
        );
      }

      const { data } = await query.limit(20);
      places = data || undefined;
    }

    const response = buildResponse(parsed, userMessageText, places);

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
      }),
    });
  }
}
