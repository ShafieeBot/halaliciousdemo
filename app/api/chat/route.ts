// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import Together from 'together-ai';

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

/**
 * In production:
 * - Store this in Redis / DB keyed by session/user
 * For now:
 * - In-memory per server instance (OK for MVP)
 */
const conversationState = new Map<string, any>();

const SYSTEM_PROMPT = `
You extract structured search variables for a halal restaurant search app.

You MUST return ONLY valid JSON.

Schema:
{
  "variables": {
    "location": string | null,
    "cuisine_subtype": string | null,
    "halal_status": string | null,
    "price_level": string | null,
    "open_now": boolean | null,
    "sort_by": "rating" | null,
    "use_previous": boolean
  },
  "message": string
}

Rules:
- Use use_previous=true if the user asks a follow-up (e.g. "which one is best reviewed?")
- NEVER hallucinate restaurant names
- If no location is given and use_previous=false, location = "Tokyo"
- "best reviewed" → sort_by="rating"
`;

export async function POST(req: Request) {
  const { messages, sessionId = 'default' } = await req.json();
  const userText = messages[messages.length - 1]?.content || '';

  const prevState = conversationState.get(sessionId) || {};

  const completion = await together.chat.completions.create({
    model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          user_message: userText,
          previous_state: prevState,
        }),
      },
    ],
  });

  const raw = completion.choices?.[0]?.message?.content ?? '{}';
  let parsed: any;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { variables: {}, message: "Sorry, I didn't understand." };
  }

  const vars = parsed.variables || {};

  const effectiveVars = vars.use_previous
    ? { ...prevState, ...vars }
    : vars;

  if (!effectiveVars.location) effectiveVars.location = 'Tokyo';

  conversationState.set(sessionId, effectiveVars);

  return NextResponse.json({
    message: parsed.message,
    variables: effectiveVars,
  });
}
