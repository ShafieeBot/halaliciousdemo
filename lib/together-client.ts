// lib/together-client.ts
import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

const SYSTEM_PROMPT = `You are a halal restaurant guide for Japan.

RESPOND ONLY WITH A JSON OBJECT. No other text before or after.

JSON FORMAT:
{
  "filter": {
    "cuisine_subtype": "Ramen" or "Sushi" or "Indian" or null,
    "cuisine_category": "Japanese" or "Asian" or null,
    "price_level": "Budget" or "Mid-range" or null,
    "keyword": "location name" or null,
    "favorites": null
  },
  "message": "Your friendly response to the user"
}

RULES:
- "sushi" → cuisine_subtype: "Sushi"
- "ramen" → cuisine_subtype: "Ramen"
- "Shinjuku" → keyword: "Shinjuku"
- "cheap" → price_level: "Budget"
- Always write a friendly message!

EXAMPLE:
User: "Best ramen in Shinjuku"
{"filter":{"cuisine_subtype":"Ramen","cuisine_category":null,"price_level":null,"keyword":"Shinjuku","favorites":null},"message":"Here are the best halal ramen spots in Shinjuku! 🍜"}`;

interface SimpleMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function chatWithApriel(messages: Array<{ role: string; content: string }>) {
  // Convert to simple messages
  const simpleMessages: SimpleMessage[] = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content || "",
    }));

  const response = await together.chat.completions.create({
    model: "meta-llama/Llama-3.2-3B-Instruct-Turbo",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...simpleMessages,
    ],
    max_tokens: 512,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  console.log("🤖 Together AI raw response:", JSON.stringify(response, null, 2));

  return response;
}
