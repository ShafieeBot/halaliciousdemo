// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { chatWithTogether } from "@/lib/together-client";

function normalizeContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(c => c.text).join(" ");
  return "";
}

export async function POST(req: Request) {
  try {
    const { messages, context } = await req.json();
    const lastFilter = context?.lastFilter ?? null;

    const typedMessages = messages.map((msg: any) => ({
      role: msg.role as "system" | "user" | "assistant",
      content: normalizeContent(msg.content),
    }));

    // 🔑 Inject current filter context for follow-ups
    if (lastFilter) {
      typedMessages.unshift({
        role: "system",
        content:
          `CURRENT_FILTER_JSON=${JSON.stringify(lastFilter)}\n` +
          `For follow-ups, refine this filter instead of starting over.`,
      });
    }

    const completion = await chatWithTogether(typedMessages);

    if (!completion) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(completion);

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("Chat API error:", err);
    return NextResponse.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}
