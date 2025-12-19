
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase Admin Client
// We use the Service Role Key if available for bypass RLS, or Anon key if standard access is enough.
// Since we are reading public data, Anon key is fine, but cleaner to use env vars.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SYSTEM_PROMPT = `
You are a friendly, knowledgeable local guide helping Muslims find halal food in Tokyo.
You have access to a database of halal restaurants via the 'queryDatabase' tool.
If the user asks a question that requires knowing specific restaurant data (e.g. "How many ramen places?", "Recommend a place"), YOU MUST USE THE TOOL.
Do not guess or hallucinate specific restaurant names.
You do NOT have access to live ratings (stars). If asked for "highest rated", say you don't have ratings but can recommend a popular one.

If the user just wants to filter the map (e.g. "show me ramen"), you can output the standard JSON response.

CRITICAL: After using the 'queryDatabase' tool, your final response MUST still be the JSON object with 'filter' and 'message'.
- If the user asked to "show" or "find" places, YOU MUST update the 'filter' object so the map updates!
- For example, if you found 3 ramen places, set "filter": { "cuisine_subtype": "Ramen" } or { "keyword": "..." }.
- If recommending a **SPECIFIC** place (like "Fortune Tree"), you **MUST** set "filter": { "keyword": "Fortune Tree" } so the map isolates it.
- If the user specifies a **LOCATION** (e.g. "Ramen in Asakusa"), you **MUST** set "filter": { "cuisine_subtype": "Ramen", "keyword": "Asakusa" }. 
  - The map relies on YOU to set the 'keyword' so it can hide restaurants in other cities!

Your response can be EITHER:
1. A tool call (to query DB).
2. A final JSON response for the frontend (with 'filter' and 'message').

Response Format for Final Answer (same as before):
{
  "filter": {
    "cuisine_subtype": string | null, 
    "cuisine_category": string | null, 
    "price_level": string | null, 
    "tag": string | null, 
    "keyword": string | null,
    "favorites": boolean | null
  },
  "message": string // Conversational response
}
`;

// Define Tools
const tools = [
    {
        type: "function" as const,
        function: {
            name: "queryDatabase",
            description: "Query the halal restaurant database to count or find specific places.",
            parameters: {
                type: "object",
                properties: {
                    queryType: {
                        type: "string",
                        enum: ["count", "list"],
                        description: "Whether to count matches or list specific restaurant names."
                    },
                    cuisine: {
                        type: "string",
                        description: "Cuisine to filter by (e.g. Ramen, Sushi, Indian)"
                    },
                    keyword: {
                        type: "string",
                        description: "General keyword to search in name or tags (e.g. Shibuya, Spicy)"
                    }
                },
                required: ["queryType"]
            }
        }
    }
];

export async function POST(req: Request) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Missing OPENAI_API_KEY environment variable.' }, { status: 500 });
        }

        const { messages } = await req.json();
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'Invalid messages format.' }, { status: 400 });
        }

        // Prepare OpenAI Messages
        let currentMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        // First Call: See if model wants to call a function
        const completion = await openai.chat.completions.create({
            messages: currentMessages as any,
            model: 'gpt-4o-mini',
            tools: tools,
            tool_choice: "auto",
            response_format: { type: "json_object" }, // We prefer JSON, but tool calls override this check usually.
        });

        const choice = completion.choices[0];
        const message = choice.message;

        // Check if tool call
        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall: any = message.tool_calls[0]; // Cast toolCall to any
            if (toolCall.function && toolCall.function.name === 'queryDatabase') {
                const args = JSON.parse(toolCall.function.arguments);
                console.log('Using Tool queryDatabase:', args);

                // Execute DB Query
                let query = supabase.from('places').select('name, cuisine_subtype, city');

                if (args.cuisine) {
                    query = query.ilike('cuisine_subtype', `%${args.cuisine}%`);
                }
                if (args.keyword) {
                    query = query.or(`name.ilike.%${args.keyword}%,address.ilike.%${args.keyword}%,city.ilike.%${args.keyword}%`);
                }

                const { data, error } = await query;

                let toolResult = "";
                if (error) {
                    toolResult = `Error querying database: ${error.message}`;
                } else if (!data || data.length === 0) {
                    toolResult = "No results found matching that criteria.";
                } else {
                    if (args.queryType === 'count') {
                        toolResult = `Found ${data.length} places.`;
                    } else { // list
                        // Limit to top 5 for recs
                        const top5 = data.slice(0, 5).map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype})`).join('\n');
                        toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
                    }
                }

                // Append Tool Result to History
                currentMessages.push(message as any);
                currentMessages.push({
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: toolResult
                });

                // Second Call: Get Final Answer based on Tool Result
                const finalCompletion = await openai.chat.completions.create({
                    messages: currentMessages as any,
                    model: 'gpt-4o-mini',
                    response_format: { type: "json_object" }
                });

                // Parse the final content to inject the raw place objects
                let finalContent = finalCompletion.choices[0].message.content || "{}";
                try {
                    const parsedContent = JSON.parse(finalContent);
                    // Inject the raw 'data' found by the tool into the 'places' key
                    if (args.queryType === 'list' && data) {
                        // Limit to top 10 to avoid payload bloat
                        parsedContent.places = data.slice(0, 10).map((p: any) => ({
                            name: p.name,
                            cuisine: p.cuisine_subtype
                        }));
                    }
                    finalContent = JSON.stringify(parsedContent);
                } catch (e) {
                    console.error("Error injecting places into final response", e);
                }

                return NextResponse.json({
                    role: 'assistant',
                    content: finalContent
                });
            }
        }

        // No tool call, just return the text (it should be JSON because of response_format)
        return NextResponse.json({
            role: 'assistant',
            content: message.content
        });

    } catch (error: any) {
        console.error('OpenAI API Error:', error);
        return NextResponse.json({
            error: error.message || 'An unexpected error occurred during AI processing.'
        }, { status: 500 });
    }
}
