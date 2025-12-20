// lib/together-client.ts
import Together from "together-ai";

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

export type Message =
  | { role: "user" | "assistant" | "system"; content: string; name?: string }
  | { role: "tool"; tool_call_id: string; content: string; name?: string };

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

/**
 * Convert input messages (which might contain null/undefined content)
 * into a safe shape where content is ALWAYS a string.
 */
function sanitizeMessages(messages: Array<{
  role: "user" | "assistant" | "system" | "tool";
  content?: unknown;
  tool_call_id?: string;
  name?: string;
}>): Message[] {
  return messages.map((m) => {
    const content = normalizeContent(m.content);

    if (m.role === "tool") {
      // tool_call_id is required for tool messages; if missing, use a placeholder to avoid crashing builds
      // (but ideally you always pass tool_call_id from route.ts)
      return {
        role: "tool",
        tool_call_id: m.tool_call_id ?? "missing_tool_call_id",
        content,
        name: m.name,
      };
    }

    return {
      role: m.role,
      content,
      name: m.name,
    };
  });
}

export async function chatWithApriel(messages: Array<{
  role: "user" | "assistant" | "system" | "tool";
  content?: unknown;
  tool_call_id?: string;
  name?: string;
}>) {
  const safeMessages = sanitizeMessages(messages);

  // Build Together/OpenAI-compatible payload.
  // We keep it runtime-correct and then cast at the boundary to avoid SDK typing inconsistencies.
  const payloadMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...safeMessages.map((m) =>
      m.role === "tool"
        ? { role: "tool", tool_call_id: m.tool_call_id, content: m.content }
        : { role: m.role, content: m.content }
    ),
  ];

  const response = await together.chat.completions.create({
    model: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
    messages: payloadMessages as any, // boundary cast ONLY after sanitizing content/tool_call_id
    max_tokens: 1024,
    temperature: 0.7,
    response_format: { type: "json_object" },
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
  } as any);

  return response;
}
