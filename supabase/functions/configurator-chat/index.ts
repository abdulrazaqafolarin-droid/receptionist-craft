// configurator-chat - SELF-CONTAINED (Management API / dashboard deploy safe).
// No relative imports: the gateway MCP client is embedded below because
// single-body deploys do not bundle ../_shared/* files.
// ASCII only: non-ASCII characters break the edge parser on single-body deploy.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// --- Embedded Rutex gateway MCP client (mirrors _shared/rutexMcp.ts) ---
class RutexMcpError extends Error {
  kind: "not_configured" | "auth" | "timeout" | "unreachable" | "protocol" | "tool_error";
  constructor(message: string, kind: "not_configured" | "auth" | "timeout" | "unreachable" | "protocol" | "tool_error") {
    super(message);
    this.name = "RutexMcpError";
    this.kind = kind;
  }
}

let rpcId = 0;

async function askRutex(conversationId: string, prompt: string): Promise<string> {
  const url = (Deno.env.get("RUTEX_GATEWAY_URL") || "").replace(/\/$/, "");
  const key = Deno.env.get("RUTEX_GATEWAY_KEY") || "";
  if (!url || !key) throw new RutexMcpError("Set RUTEX_GATEWAY_URL and RUTEX_GATEWAY_KEY", "not_configured");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  let res: Response;
  try {
    res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name: "rutex_ask", arguments: { conversationId, prompt } },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new RutexMcpError(
      ctrl.signal.aborted ? "gateway timed out" : `gateway unreachable: ${String(e)}`,
      ctrl.signal.aborted ? "timeout" : "unreachable",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new RutexMcpError("gateway rejected the bearer key", "auth");
  if (!res.ok) throw new RutexMcpError(`gateway http_${res.status}`, "protocol");

  const raw = await res.text();
  const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
  const payload = dataLine ? dataLine.slice(5).trim() : raw;
  let msg: { result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean }; error?: { message?: string } };
  try {
    msg = JSON.parse(payload);
  } catch {
    throw new RutexMcpError("unparseable gateway response", "protocol");
  }
  if (msg.error) throw new RutexMcpError(msg.error.message || "jsonrpc error", "protocol");
  const result = msg.result || {};
  if (result.isError) {
    const first = (result.content || []).find((p) => p.type === "text");
    throw new RutexMcpError((first && first.text) || "ask failed", "tool_error");
  }
  const part = (result.content || []).find((p) => p.type === "text");
  const text = (part && part.text) || "";
  try {
    const parsed = JSON.parse(text) as { text?: string };
    return parsed.text || "";
  } catch {
    return text;
  }
}
// --- End embedded client ---

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

const SYSTEM = `You are the Rutex Setup Interviewer - a warm business consultant helping a small business owner describe their business so an AI operator can be built for them. You speak plain business language. Never mention LLMs, prompts, embeddings, models, or infrastructure.

RULES:
- Ask EXACTLY ONE focused question per reply. Keep it short (1-2 sentences) plus the question.
- Follow this slot order: (1) what the business does and offers, (2) how customers reach/book/buy today, (3) hours and busiest times, (4) prices or price ranges, (5) policies that matter (cancellation, deposits, no-shows, walk-ins), (6) contact details and preferred tone.
- Never invent business details. If the owner already answered something, do NOT ask it again - acknowledge briefly and move on.
- Set ready=true ONLY when you know: business type, what it offers (services or products), and how customers transact (booking, ordering, walk-in, or calls) - plus at least one of hours/prices/policies/contact. Or when 6+ owner messages exist and further questions add little value.
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

    const prompt = `${SYSTEM}\n\n${context}\n\nConversation so far:\n${transcript || "(no messages yet - greet warmly and ask the first question)"}\n\nReply with the STRICT JSON object only.`;

    const text = await askRutex(
      `configurator-chat-${conversationId || crypto.randomUUID()}`,
      prompt,
    );
    const parsed = parseReply(text);

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
