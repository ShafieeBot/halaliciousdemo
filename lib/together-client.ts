// lib/together-client.ts
import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

/**
 * Using Meta Llama 3.2 3B Instruct Turbo
 * - $0.06 per million tokens (very cheap!)
 * - Fast responses
 * - Good at following JSON instructions
 * - No "thinking" leakage
 */
const SYSTEM_PROMPT = `You are a halal restaurant guide for Japan. Help users find halal food.

You have a "queryDatabase" tool to search restaurants. USE IT when users ask about food/restaurants.

RESPOND ONLY WITH A JSON OBJECT. No other text.

JSON FORMAT:
{
  "filter": {
    "cuisine_subtype": "Ramen" | "Sushi" | "Indian" | null,
    "cuisine_category": "Japanese" | "Asian" | null,
    "price_level": "Budget" | "Mid-range" | "Fine Dining" | null,
    "keyword": "location" | null,
    "favorites": null
  },
  "message": "Your friendly response to the user"
}

FILTER RULES:
- User says "sushi" → set cuisine_subtype: "Sushi"
- User says "ramen" → set cuisine_subtype: "Ramen"
- User says "Shinjuku" or location → set keyword: "Shinjuku"
- User says "cheap/budget" → set price_level: "Budget"
- Always set relevant filter fields!

EXAMPLES:
User: "sushi"
{"filter":{"cuisine_subtype":"Sushi","cuisine_category":null,"price_level":null,"keyword":null,"favorites":null},"message":"Here are halal sushi restaurants! 🍣"}

User: "ramen in Shinjuku"
{"filter":{"cuisine_subtype":"Ramen","cuisine_category":null,"price_level":null,"keyword":"Shinjuku","favorites":null},"message":"Found halal ramen in Shinjuku! 🍜"}

User: "cheap lunch"
{"filter":{"cuisine_subtype":null,"cuisine_category":null,"price_level":"Budget","keyword":null,"favorites":null},"message":"Here are budget-friendly halal spots! 💰"}`;

export type Message =
  | { role: "user" | "assistant" | "system"; content?: unknown; name?: string }
  | { role: "tool"; tool_call_id: string; content?: unknown; name?: string };

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function sanitizeMessages(messages: Message[]) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool" as const,
        tool_call_id: m.tool_call_id,
        content: normalizeContent(m.content),
      };
    }

    return {
      role: m.role,
      content: normalizeContent(m.content),
    };
  });
}

export async function chatWithApriel(messages: Message[]) {
  const safeMessages = sanitizeMessages(messages);

  const payloadMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...safeMessages,
  ];

  const response = await together.chat.completions.create({
    model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
    messages: payloadMessages as any,
    max_tokens: 512,
    temperature: 0.3, // Low for consistent JSON output

    // JSON Mode
    response_format: { type: "json_object" },

    // Tool calling
    tools: [
      {
        type: "function",
        function: {
          name: "queryDatabase",
          description: "Search the halal restaurant database.",
          parameters: {
            type: "object",
            properties: {
              queryType: {
                type: "string",
                enum: ["count", "list"],
                description: "Use 'list' to get names, 'count' for totals.",
              },
              cuisine: {
                type: "string",
                description: "Cuisine type: Ramen, Sushi, Indian, Turkish, etc.",
              },
              keyword: {
                type: "string",
                description: "Location: Shinjuku, Shibuya, Tokyo, Osaka, etc.",
              },
            },
            required: ["queryType"],
          },
        },
      },
    ],
  } as any);

  return response;
}
