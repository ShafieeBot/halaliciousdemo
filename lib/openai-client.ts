import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `
You are an AI assistant that helps filter a database of halal-friendly places.

You must infer user intent freely from natural language,
but you MUST express that intent ONLY using the database-aligned JSON schema below.

Do NOT invent fields.
Do NOT invent values that cannot exist in the database.
Do NOT output anything except valid JSON.

DATABASE FIELDS AVAILABLE:
- name (text)
- address (text)
- city (text)
- country (text)
- halal_status (text)
- cuisine_category (text)
- cuisine_subtype (text)
- price_level (text, e.g. "$", "$$", "$$$", or empty)
- tags (text array)
- place_id (text)
- lat, lng (numbers)

OUTPUT JSON SCHEMA:
{
  "filter": {
    "cuisine_subtype": string | null,
    "cuisine_category": string | null,
    "price_level": string | null,
    "tag": string | null,
    "keyword": string | null,
    "favorites": boolean | null
  },
  "message": string
}
`;

export async function chatWithAssistant(messages: Array<{ role: string; content: string }>) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...messages,
    ] as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: 1024,
    temperature: 0.7,

    // Enable JSON Mode for structured outputs
    response_format: { type: "json_object" },

    // Tool/Function calling
    tools: [
      {
        type: "function",
        function: {
          name: "queryDatabase",
          description: "Query the halal restaurant database to count or find specific places.",
          parameters: {
            type: "object",
            properties: {
              queryType: {
                type: "string",
                enum: ["count", "list"],
                description: "Whether to count matches or list specific restaurant names.",
              },
              cuisine: {
                type: "string",
                description: "Cuisine to filter by (e.g. Ramen, Sushi, Indian)",
              },
              keyword: {
                type: "string",
                description: "General keyword to search in name or tags (e.g. Shibuya, Spicy)",
              },
            },
            required: ["queryType"],
          },
        },
      },
    ],
  });

  return response;
}

