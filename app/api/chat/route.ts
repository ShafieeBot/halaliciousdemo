// app/api/chat/route.ts
import { NextResponse } from "next/server";
import { chatWithApriel } from "@/lib/together-client";

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function emptyFilter() {
  return {
    cuisine_subtype: null,
    cuisine_category: null,
    price_level: null,
    tag: null,
    keyword: null,
    favorites: null,
  };
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({
        role: "assistant",
        content: JSON.stringify({
          filter: emptyFilter(),
          message: "Assalamualaikum! 👋 Ask me about halal food!",
          places: [],
        }),
      });
    }

    // Normalize messages for AI
    const typedMessages = messages.map((msg: any) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: normalizeContent(msg.content),
    }));

    console.log("🔍 Calling AI with messages:", typedMessages.length);

    // Call AI
    const completion = await chatWithApriel(typedMessages);
    
    console.log("✅ AI response received");
    console.log("Raw response:", JSON.stringify(completion, null, 2));

    const choice = completion.choices?.[0];
    const aiContent = choice?.message?.content || "";

    console.log("📝 AI content:", aiContent);

    // Try to parse AI response as JSON
    let parsed: any = null;
    try {
      parsed = JSON.parse(aiContent);
    } catch {
      console.log("⚠️ AI response is not JSON, using as message");
      parsed = {
        filter: emptyFilter(),
        message: aiContent || "I received your message!",
        places: [],
      };
    }

    // Ensure we have the required fields
    const response = {
      filter: parsed.filter || emptyFilter(),
      message: parsed.message || "Here's what I found!",
      places: parsed.places || [],
    };

    console.log("📤 Returning response:", response.message);

    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify(response),
    });

  } catch (error: unknown) {
    console.error("❌ API Error:", error);
    return NextResponse.json({
      role: "assistant",
      content: JSON.stringify({
        filter: emptyFilter(),
        message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        places: [],
      }),
    });
  }
}
