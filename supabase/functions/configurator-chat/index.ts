import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { askRutex, RutexMcpError } from "../_shared/rutexMcp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

function parseReply(text: string): {
  assistant_message: string;
  slots: Record<string, unknown>;
  ready: boolean;
  summary: string;
} {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (m) return JSON.parse(m[1]);
    throw new Error("Could not parse interviewer response as JSON");
  }
}

const SYSTEM = `You are the Rutex Setup Interviewer — a warm business consultant helping a small business owner describe their business so an AI operator can be built for them. You speak plain business language. Never mention LLMs, prompts, embeddings, models, or infrastructure.

RULES:
- Ask EXACTLY ONE focused question per reply. Keep it short (1-2 sentences) plus the question.
- Follow this slot order: (1) what the business does and offers, (2) how customers reach/book/buy today, (3) hours and busiest times, (4) prices or price ranges, (5) policies that matter (cancellation, deposits, no-shows, walk-ins), (6) contact details and preferred tone.
- Never invent business details. If the owner already answered something, do NOT ask it again — acknowledge briefly and move on.
- Set ready=true ONLY when you know: business type, what it offers (services or products), and how customers transact (booking, ordering, walk-in, or calls) — plus at least one of hours/prices/policies/contact. Or when 6+ owner messages exist and further questions add little value.
- summary: one short paragraph of everything learned so far (used to build the operator later).

OUTPUT STRICT JSON, no markdown fences:
{
  "assistant_message": "your reply to the owner",
  "slots": {
    "business_type": string | null,
    "offers": string | null,
    "how_customers_transact": string | null,
    "hours": string | null,
    "prices": string | null,
    "policies": string | null,
    "contact": string | null,
    "tone_preference": string | null
  },
  "ready": boolean,
  "summary": "short paragraph of what is known"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { messages, businessName, businessType, conversationId } = body as {
      messages: ChatMsg[];
      businessName?: string;
      businessType?: string;
      conversationId?: string;
    };

    if (!Array.isArray(messages)) {
      return jsonRes({ ok: false, error: "missing_messages" }, 400);
    }

    const transcript = messages
      .slice(-12)
      .map((m) => `${m.role === "user" ? "Owner" : "Interviewer"}: ${m.content}`)
      .join("\n");

    const context = [
      businessName ? `Business name: ${businessName}.` : "",
      businessType ? `Business type (owner's words): ${businessType}.` : "",
    ].filter(Boolean).join(" ");

    const prompt = `${SYSTEM}\n\n${context}\n\nConversation so far:\n${transcript || "(no messages yet — greet warmly and ask the first question)"}\n\nReply with the STRICT JSON object only.`;

    const r = await askRutex(
      `configurator-chat-${conversationId || crypto.randomUUID()}`,
      prompt,
    );
    const parsed = parseReply(r.text);

    if (typeof parsed.assistant_message !== "string" || !parsed.assistant_message.trim()) {
      throw new Error("Empty interviewer reply");
    }

    return jsonRes({
      ok: true,
      assistant_message: parsed.assistant_message.trim(),
      slots: parsed.slots || {},
      ready: parsed.ready === true,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    });
  } catch (e) {
    console.error("[configurator-chat] Error:", e);
    if (e instanceof RutexMcpError) {
      const map: Record<string, string> = {
        not_configured: "gateway_not_configured",
        auth: "gateway_auth_failed",
        timeout: "gateway_timeout",
        unreachable: "gateway_unreachable",
        tool_error: "gateway_empty_response",
        protocol: "gateway_protocol_error",
      };
      return jsonRes({ ok: false, error: map[e.kind] ?? "gateway_unreachable" }, 502);
    }
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
