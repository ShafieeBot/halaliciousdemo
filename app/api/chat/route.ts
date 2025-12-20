// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chatWithApriel, type Message as AprielMessage } from "@/lib/together-client";
import type { ChatCompletionMessageParam } from "together-ai/resources/chat/completions";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function toAprielMessages(messages: any[]): AprielMessage[] {
  return messages.map((msg: any) => ({
    role: msg.role as "user" | "assistant" | "system",
    content: normalizeContent(msg.content),
  }));
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages format." }, { status: 400 });
    }

    // ✅ Use your app's message type for chatWithApriel
    const aprielMessages: AprielMessage[] = toAprielMessages(messages);

    // First call to Apriel
    const completion = await chatWithApriel(aprielMessages);
    const choice = completion.choices?.[0];

    if (!choice || !choice.message) {
      return NextResponse.json({ error: "Invalid response from AI service" }, { status: 500 });
    }

    const message = choice.message;

    // Check if model wants to use tool
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];

      if (toolCall.function.name === "queryDatabase") {
        const args = JSON.parse(toolCall.function.arguments);
        console.log("Using queryDatabase tool:", args);

        // Execute Supabase query
        let query = supabase.from("places").select("name, cuisine_subtype, city, address");

        if (args.cuisine) {
          query = query.ilike("cuisine_subtype", `%${args.cuisine}%`);
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
          if (args.queryType === "count") {
            toolResult = `Found ${data.length} places.`;
          } else {
            const top5 = data
              .slice(0, 5)
              .map((p: any) => `Name: "${p.name}" (Cuisine: ${p.cuisine_subtype})`)
              .join("\n");
            toolResult = `Found ${data.length} places. Here are the top ones:\n${top5}`;
          }
        }

        // ✅ Second call messages in AprielMessage[] format (NOT ChatCompletionMessageParam[])
        const secondCallMessages: AprielMessage[] = [
          ...aprielMessages,
          {
            role: "assistant",
            content: normalizeContent(message.content), // may be null in tool-call messages
          },
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          },
        ];

        const finalCompletion = await chatWithApriel(secondCallMessages);

        const finalChoice = finalCompletion.choices?.[0];
        if (!finalChoice || !finalChoice.message) {
          return NextResponse.json({ error: "Invalid response from AI service" }, { status: 500 });
        }

        let finalContent = finalChoice.message?.content ?? "{}";

        // Inject actual place data into response
        try {
          const parsed = JSON.parse(finalContent);

          if (args.queryType === "list" && data) {
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
          role: "assistant",
          content: finalContent,
        });
      }
    }

    // No tool call - return direct response
    return NextResponse.json({
      role: "assistant",
      content: message.content || "I couldn't generate a response.",
    });
  } catch (error: any) {
    console.error("Apriel API Error:", error);
    return NextResponse.json(
      { error: error.message || "AI processing failed" },
      { status: 500 }
    );
  }
}
