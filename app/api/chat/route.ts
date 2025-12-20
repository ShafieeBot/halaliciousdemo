// app/api/chat/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Together from 'together-ai';

const together = new Together({
  apiKey: process.env.TOGETHER_API_KEY,
});

// Supabase (unchanged)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

CRITICAL RULES (DO NOT BREAK):
- If the user mentions ANY LOCATION (Shinjuku, Shibuya, Tokyo, etc),
  YOU MUST put it into filter.keyword
- If the user asks to "show", "find", "recommend", or browse places,
  YOU MUST set filter.keyword (Tokyo if no specific area)
- If you recommend a SPECIFIC place,
  YOU MUST set filter.keyword to the place name
- If no location is given, default keyword = "Tokyo"

The map depends on filter.keyword to work.
`;

function enforceLegacyKeyword(filter: any, userText: string) {
  if (filter?.keyword) return filter;

  const text = userText.toLowerCase();

  const locations = [
    'shinjuku',
    'shibuya',
    'asakusa',
    'ginza',
    'ueno',
    'tokyo',
    'yotsuya',
    'ikebukuro',
    'harajuku',
    'roppongi',
  ];

  for (const loc of locations) {
    if (text.includes(loc)) {
      return { ...filter, keyword: loc };
    }
  }

  // Default behaviour (THIS IS WHAT YOU LOST)
  return { ...filter, keyword: 'Tokyo' };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const userText = messages[messages.length - 1]?.content || '';

    // ---- LLM CALL (ONLY CHANGE) ----
    const completion = await together.chat.completions.create({
      model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages,
      ],
    });

    let parsed;
    try {
      parsed = JSON.parse(completion.choices[0].message.content);
    } catch {
      parsed = {
        filter: {},
        message: "I couldn't understand that. Try asking differently.",
      };
    }

    // 🔑 THIS LINE RESTORES EVERYTHING
    parsed.filter = enforceLegacyKeyword(parsed.filter || {}, userText);

    // ---- Optional: inject places list (unchanged behaviour) ----
    let places;
    if (
      userText.toLowerCase().includes('show') ||
      userText.toLowerCase().includes('find') ||
      userText.toLowerCase().includes('recommend')
    ) {
      let q = supabase
        .from('places')
        .select('name, cuisine_subtype, cuisine_category')
        .limit(10);

      if (parsed.filter.cuisine_subtype) {
        q = q.ilike('cuisine_subtype', `%${parsed.filter.cuisine_subtype}%`);
      }
      if (parsed.filter.keyword) {
        q = q.or(
          `name.ilike.%${parsed.filter.keyword}%,address.ilike.%${parsed.filter.keyword}%,city.ilike.%${parsed.filter.keyword}%`
        );
      }

      const { data } = await q;
      places = data?.map(p => ({
        name: p.name,
        cuisine: p.cuisine_subtype || p.cuisine_category || 'Halal',
      }));
    }

    if (places) parsed.places = places;

    return NextResponse.json({
      role: 'assistant',
      content: JSON.stringify(parsed),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || 'AI error' },
      { status: 500 }
    );
  }
}
