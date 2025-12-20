// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { chatWithApriel } from "@/lib/together-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Match the Message interface from together-client.ts
interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages format." },
        { status: 400 }
      );
    }

    // Sanitize messages to match the Message interface
    const typedMessages: Message[] = messages.map(
      (m: { role?: string; content?: string }) => ({
        role: (m.role || "user") as Message["role"],
        content: m.content ?? "",
      })
    );

    // First call to Apriel
    const completion = await chatWithApriel(typedMessages);
    const choice = completion.choices[0];

    // Check if choice and message exist
    if (!choice || !choice.message) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const message = choice.message;

    // Check for tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];

      if (toolCall.function?.name === "queryDatabase") {
        const args = JSON.parse(toolCall.function.arguments || "{}");

        // Execute Supabase query
        let query = supabase.from("places").select("*");

        if (args.cuisine) {
          query = query.ilike("cuisine_subtype", `%${args.cuisine}%`);
        }
        if (args.keyword) {
          query = query.or(
            `name.ilike.%${args.keyword}%,address.ilike.%${args.keyword}%`
          );
        }

        const { data, error } = await query;

        if (error) {
          console.error("Supabase error:", error);
          return NextResponse.json(
            { error: "Database query failed" },
            { status: 500 }
          );
        }

        // Build tool result
        const toolResult =
          args.queryType === "count"
            ? `Found ${data?.length || 0} places.`
            : `Found ${data?.length || 0} places: ${data
                ?.slice(0, 5)
                .map((p: { name: string }) => p.name)
                .join(", ")}`;

        // Second call with tool result
        const toolMessages: Message[] = [
          ...typedMessages,
          {
            role: "assistant",
            content: message.content || "",
          },
          {
            role: "tool",
            content: toolResult,
            tool_call_id: toolCall.id,
          },
        ];

        const secondCompletion = await chatWithApriel(toolMessages);
        const secondChoice = secondCompletion.choices[0];

        if (secondChoice?.message?.content) {
          try {
            const parsed = JSON.parse(secondChoice.message.content);
            return NextResponse.json(parsed);
          } catch {
            return NextResponse.json({
              filter: {},
              message: secondChoice.message.content,
            });
          }
        }
      }
    }

    // No tool call - return direct response
    if (message.content) {
      try {
        const parsed = JSON.parse(message.content);
        return NextResponse.json(parsed);
      } catch {
        return NextResponse.json({
          filter: {},
          message: message.content,
        });
      }
    }

    return NextResponse.json({
      filter: {},
      message: "I'm not sure how to help with that. Try asking about halal restaurants in Tokyo!",
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
