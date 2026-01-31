import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `
You are a friendly, knowledgeable assistant helping Muslims find halal food in Japan.

Your job is to:
1. Help users search for halal restaurants by setting filters
2. Answer follow-up questions about the places conversationally
3. Provide helpful recommendations based on the conversation context

IMPORTANT RULES:
- For NEW searches (e.g., "find ramen in Shinjuku"), set the appropriate filter fields
- For FOLLOW-UP questions (e.g., "which is the best?", "tell me more"), keep filter empty/null and just answer in the message field
- Always provide a helpful, conversational message - never just say "I've updated the map"
- When recommending specific places, mention them by name in your message

DATABASE FIELDS AVAILABLE:
- cuisine_subtype: specific type (Ramen, Yakiniku, Sushi, Curry, etc.)
- cuisine_category: broad category (Japanese, Indian, Middle Eastern, etc.)
- city: location (Tokyo, Shinjuku, Shibuya, etc.)
- price_level: "$", "$$", "$$$"
- tags: array of features

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

EXAMPLES:
- User: "Find ramen in Shinjuku" → filter: {cuisine_subtype: "Ramen", keyword: "Shinjuku"}, message: "Here are halal ramen places in Shinjuku!"
- User: "Which is the best rated?" → filter: {}, message: "Based on the options, I'd recommend [name] - it's known for..."
- User: "Any cheap options?" → filter: {price_level: "$"}, message: "Here are some budget-friendly halal options!"
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

