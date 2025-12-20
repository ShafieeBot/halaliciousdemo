import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Together from 'together-ai';

// -------------------------
// LLM CLIENT (ONLY CHANGE)
// -------------------------
const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

// -------------------------
// SUPABASE (UNCHANGED)
// -------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// -------------------------
// SYSTEM PROMPT (UNCHANGED CONTRACT)
// -------------------------
const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.

You MUST respond with a SINGLE JSON object and nothing else.

Response format:
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

CRITICAL RULES:
- If the user mentions ANY LOCATION (Shinjuku, Shibuya, Tokyo, etc),
  YOU MUST put it into filter.keyword
- If the user asks to show, find, or browse places,
  YOU MUST set filter.keyword (Tokyo if no specific area)
- If recommending a SPECIFIC place,
  YOU MUST set filter.keyword to the place name
- If no location is given, default keyword = "Tokyo"

The map depends on filter.keyword to work.
`;

// -------------------------
// LEGACY KEYWORD ENFORCEMENT
// (THIS IS WHAT GEMINI USED TO DO IMPLICITLY)
// -------------------------
function enforceLegacyKeyword(filter: any, userText: string) {
  if (filter?.keyword && filter.keyword.trim() !== '') return filter;

  const text = userText.toLowerCase();

  const locations = [
    'shinjuku',
    'shibuya',
    'asakusa',
    'ginza',
    'ueno',
    'yotsuya',
    'ikebukuro',
    'harajuku',
    'roppongi',
    'tokyo',
  ];

  for (const loc of locations) {
    if (text.includes(loc)) {
      return { ...filter, keyword: loc };
    }
  }

  // DEFAULT BEHAVIOUR (critical)
  return { ...filter, keyword: 'Tokyo' };
}

// -------------------------
// ROUTE HANDLER
// -------------------------
export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid messages format.' },
        { status: 400 }
      );
    }

    const userText = messages[messages.length - 1]?.content || '';

    // -------------------------
    // LLM CALL (TOGETHER)
    // -------------------------
    const completion = await together.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    });

    // -------------------------
    // TYPESCRIPT-SAFE CONTENT READ
    // -------------------------
    const rawContent =
      completion.choices?.[0]?.message?.content ?? '';

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      parsed = {
        filter: {},
        message: "I couldn't understand that. Try asking differently.",
      };
    }

    // -------------------------
    // RESTORE ORIGINAL BEHAVIOUR
    // -------------------------
    parsed.filter = enforceLegacyKeyword(parsed.filter || {}, userText);

    // -------------------------
    // OPTIONAL: PLACE LIST (UNCHANGED UX)
    // -------------------------
    const wantsList =
      userText.toLowerCase().includes('show') ||
      userText.toLowerCase().includes('find') ||
      userText.toLowerCase().includes('recommend') ||
      userText.toLowerCase().includes('best');

    if (wantsList) {
      let query = supabase
        .from('places')
        .select('name, cuisine_subtype, cuisine_category')
        .limit(10);

      if (parsed.filter.cuisine_subtype) {
        query = query.ilike(
          'cuisine_subtype',
          `%${parsed.filter.cuisine_subtype}%`
        );
      }

      if (parsed.filter.keyword) {
        query = query.or(
          `name.ilike.%${parsed.filter.keyword}%,address.ilike.%${parsed.filter.keyword}%,city.ilike.%${parsed.filter.keyword}%`
        );
      }

      const { data } = await query;

      if (data) {
        parsed.places = data.map((p: any) => ({
          name: p.name,
          cuisine:
            p.cuisine_subtype ||
            p.cuisine_category ||
            'Halal',
        }));
      }
    }

    // -------------------------
    // FINAL RESPONSE (UNCHANGED SHAPE)
    // -------------------------
    return NextResponse.json({
      role: 'assistant',
      content: JSON.stringify(parsed),
    });

  } catch (err: any) {
    console.error('Chat route error:', err);
    return NextResponse.json(
      { error: err.message || 'Unexpected error' },
      { status: 500 }
    );
  }
}
