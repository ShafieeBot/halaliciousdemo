import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chatWithAssistant } from '@/lib/openai-client';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY environment variable." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    const { messages } = body;

    // First call to OpenAI
    const completion = await chatWithAssistant(messages);
    const message = completion.choices[0].message;

    // Check if model wants to use tool
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0] as any;

      if (toolCall.function?.name === 'queryDatabase') {
        const args = JSON.parse(toolCall.function.arguments);
        console.log('Using queryDatabase tool:', args);

        // Execute Supabase query
        let query = supabase
          .from('places')
          .select('name, cuisine_subtype, city, address');

        if (args.cuisine) {
          query = query.ilike('cuisine_subtype', `%${args.cuisine}%`);
        }
        if (args.keyword) {
          query = query.or(
            `name.ilike.%${args.keyword}%,address.ilike.%${args.keyword}%,city.ilike.%${args.keyword}%`
          );
        }

        const { data, error } = await query;

        // Build tool result
        let toolResult = "";
        if (error) {
          toolResult = `Error querying database: ${error.message}`;
        } else if (!data || data.length === 0) {
          toolResult = "No results found matching that criteria.";
        } else {
          if (args.queryType === 'count') {
            toolResult = `Found ${data.length} places.`;
          } else {
            // List top 5
            const top5 = data
              .slice(0, 5)
              .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype})`)
              .join('\n');
            toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
          }
        }

        // Second call with tool result
        const finalCompletion = await chatWithAssistant([
          ...messages,
          message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          },
        ]);

        let finalContent = finalCompletion.choices[0].message.content || "{}";

        // Inject actual place data into response
        try {
          const parsed = JSON.parse(finalContent);

          if (args.queryType === 'list' && data) {
            parsed.places = data.slice(0, 10).map((p: any) => ({
              name: p.name,
              cuisine: p.cuisine_subtype,
            }));
          }

          finalContent = JSON.stringify(parsed);
        } catch (e) {
          console.error("Error injecting places into response", e);
        }

        return NextResponse.json({
          role: 'assistant',
          content: finalContent,
        });
      }
    }

    // No tool call - return direct response
    const content = message.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { message: content, filter: {} };
    }

    return NextResponse.json({
      role: 'assistant',
      content: JSON.stringify(parsed),
    });

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
