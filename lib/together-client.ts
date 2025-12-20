// lib/together-client.ts
import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

/**
 * OPTION 1 (Thinking model) strategy:
 * - Use the thinker model for best reasoning/tool use
 * - BUT: never trust its raw text output for the UI
 * - API route will extract JSON / wrap as needed
 *
 * Still: we add strong instructions to reduce chain-of-thought leakage.
 */
const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.

You have access to a database of halal restaurants via the 'queryDatabase' tool.

TOOL USE RULE:
- If the user asks a question that requires knowing specific restaurant data (e.g. "How many ramen places?", "Recommend a place", "Any others?", "Show me..."), YOU MUST USE THE TOOL.
- Do not guess or hallucinate specific restaurant names.
- If the user follows up (e.g. "any others?"), infer context from the conversation and use the tool accordingly.

CRITICAL OUTPUT RULE (MUST FOLLOW):
- Do NOT include reasoning, analysis, planning, or meta-commentary.
- Do NOT explain what you are doing.
- Output ONLY the final JSON object. No extra text before or after.
- Any text outside JSON will be discarded.

CRITICAL: After using the 'queryDatabase' tool, your final response MUST still be a JSON object with 'filter' and 'message'.
- If the user asked to "show" or "find" places, YOU MUST update the 'filter' object so the map updates.
- Example: if ramen places => set "filter": { "cuisine_subtype": "Ramen" }.
- If recommending a SPECIFIC place => set "filter": { "keyword": "Fortune Tree" }.
- If user specifies a LOCATION (e.g. "Ramen in Asakusa") => set "filter": { "cuisine_subtype": "Ramen", "keyword": "Asakusa" }.

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
    model: "ServiceNow-AI/Apriel-1.6-15b-Thinker",
    messages: payloadMessages as any,
    max_tokens: 900,
    temperature: 0.4,

    // JSON Mode (not fully reliable for thinker models, but helps)
    response_format: { type: "json_object" },

    // Tool calling
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
                  "General keyword to search in name, address, or city (e.g. Shibuya, Shinjuku, Spicy)",
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
