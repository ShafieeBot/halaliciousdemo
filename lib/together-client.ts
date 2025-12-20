// lib/together-client.ts
import Together from "together-ai";
import type { CompletionCreateParams } from "together-ai/resources/chat/completions";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

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

/**
 * App-level message type
 * - tool messages MUST have tool_call_id
 * - content can be null/undefined upstream; we normalize to string before sending
 */
export type Message =
  | { role: "user" | "assistant" | "system"; content?: string | null; name?: string }
  | { role: "tool"; tool_call_id: string; content?: string | null; name?: string };

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function toTogetherMessage(m: Message): CompletionCreateParams.Message {
  const content = normalizeContent(m.content);

  if (m.role === "tool") {
    // IMPORTANT: Together's create() overload expects tool message content as string (not optional)
    const toolMsg: CompletionCreateParams.ChatCompletionToolMessageParam = {
      role: "tool",
      tool_call_id: m.tool_call_id,
      content,
    };
    return toolMsg;
  }

  if (m.role === "system") {
    const sys: CompletionCreateParams.ChatCompletionSystemMessageParam = {
      role: "system",
      content,
    };
    return sys;
  }

  if (m.role === "user") {
    const user: CompletionCreateParams.ChatCompletionUserMessageParam = {
      role: "user",
      content,
    };
    return user;
  }

  // assistant
  const assistant: CompletionCreateParams.ChatCompletionAssistantMessageParam = {
    role: "assistant",
    content,
  };
  return assistant;
}

export async function chatWithApriel(messages: Message[]) {
  const togetherMessages: CompletionCreateParams.Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map(toTogetherMessage),
  ];

  // Extra safeguard: ensure any message with "content" has a real string (never undefined)
  const sanitized: CompletionCreateParams.Message[] = togetherMessages.map((m) => {
    if ("content" in m) {
      return { ...m, content: (m as any).content ?? "" };
    }
    return m;
  });

  const response = await together.chat.completions.create({
    model: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
    messages: sanitized,
    max_tokens: 1024,
    temperature: 0.7,

    // JSON Mode for structured outputs
    response_format: { type: "json_object" },

    // Tool/Function calling
    tools: [
      {
        type: "function",
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
