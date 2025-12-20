// lib/together-client.ts
import Together from "together-ai";

const together = new Together();

const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.
You have access to a database of halal restaurants via the 'queryDatabase' tool.
If the user asks a question that requires knowing specific restaurant data (e.g. "How many ramen places?", "Recommend a place"), YOU MUST USE THE TOOL.
Do not guess or hallucinate specific restaurant names.

CRITICAL: After using the 'queryDatabase' tool, your final response MUST still be a JSON object with 'filter' and 'message'.
- If the user asked to "show" or "find" places, YOU MUST update the 'filter' object so the map updates!
- For example, if you found 3 ramen places, set "filter": { "cuisine_subtype": "Ramen" }.
- If recommending a SPECIFIC place (like "Fortune Tree"), set "filter": { "keyword": "Fortune Tree" }.
- If the user specifies a LOCATION (e.g. "Ramen in Asakusa"), set "filter": { "cuisine_subtype": "Ramen", "keyword": "Asakusa" }.

Response Format:
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

interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export async function chatWithApriel(messages: Message[]) {
  const response = await together.chat.completions.create({
    model: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ],
    max_tokens: 1024,
    temperature: 0.7,

    // Enable JSON Mode for structured outputs
    response_format: { type: "json_object" },

    // Tool/Function calling
    tools: [
      {
        type: "function" as const,
        function: {
          name: "queryDatabase",
          description:
            "Query the halal restaurant database to count or find specific places.",
          parameters: {
            type: "object",
            properties: {
              queryType: {
                type: "string",
                enum: ["count", "list"],
                description:
                  "Whether to count matches or list specific restaurant names.",
              },
              cuisine: {
                type: "string",
                description: "Cuisine to filter by (e.g. Ramen, Sushi, Indian)",
              },
              keyword: {
                type: "string",
                description:
                  "General keyword to search in name or tags (e.g. Shibuya, Spicy)",
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
