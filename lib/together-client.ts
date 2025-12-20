// lib/together-client.ts

import Together from "together-ai";

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY!,
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
    "query_text": string | null,
    "city": string | null,
    "country": string | null,
    "halal_status_in": string[],
    "cuisine_category_in": string[],
    "cuisine_subtype_in": string[],
    "price_level_in": string[],
    "tags_any": string[],
    "has_place_id": boolean | null
  },
  "message": string
}

INTERPRETATION GUIDANCE (NOT RULES):
- Users may describe preferences indirectly or creatively.
- Infer meaning using general culinary understanding.
- When unsure, layer multiple filters rather than choosing one.
- Prefer filters that increase recall over filters that risk empty results.
- If structured fields are unreliable or unknown, use query_text as fallback.

CONVERSATION:
- You may receive a system message CURRENT_FILTER_JSON=...
- For follow-ups, refine or merge with the existing filter.
- Never reset filters unless the user clearly asks to start over.

Keep the message concise (1 sentence).
`;

export async function chatWithTogether(messages: ChatMessage[]) {
  const finalMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  const response = await together.chat.completions.create({
    model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    messages: finalMessages,
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  return response.choices[0].message?.content;
}
