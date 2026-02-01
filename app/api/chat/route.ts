import { NextResponse } from 'next/server';
import { chatWithAssistant } from '@/lib/openai-client';
import { ChatAPIResponse } from '@/lib/types';
import { safeJsonParse } from '@/lib/utils';

export async function POST(req: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable." } as ChatAPIResponse,
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages format." } as ChatAPIResponse,
        { status: 400 }
      );
    }

    const { messages, context } = body;

    // Build context message if we have current places
    let contextMessage = '';
    if (context?.currentPlaces && Array.isArray(context.currentPlaces) && context.currentPlaces.length > 0) {
      const placesList = context.currentPlaces
        .map((p: { name: string; cuisine?: string; city?: string; rating?: number; price_level?: string }, i: number) =>
          `${i + 1}. ${p.name} (${p.cuisine || 'Halal'}${p.city ? `, ${p.city}` : ''}${p.rating ? `, Rating: ${p.rating}` : ''}${p.price_level ? `, Price: ${p.price_level}` : ''})`
        )
        .join('\n');
      contextMessage = `\n\nCURRENT SEARCH RESULTS (use these for follow-up questions):\n${placesList}`;
    }

    // Call OpenAI - it returns JSON with filter and message
    const completion = await chatWithAssistant(messages, contextMessage);
    const content = completion.choices[0].message.content || "{}";

    // Parse the JSON response
    const parsed = safeJsonParse<Record<string, unknown>>(content, { message: content, filter: {} });

    // Return the parsed response directly (filter + message)
    return NextResponse.json(parsed as ChatAPIResponse);

  } catch (e: unknown) {
    const error = e as Error;
    console.error('OpenAI API Error:', error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." } as ChatAPIResponse,
      { status: 500 }
    );
  }
}
