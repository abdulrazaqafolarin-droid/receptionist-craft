// configurator-chat - SELF-CONTAINED (Management API / dashboard deploy safe).
// Zero imports: no relative _shared modules (single-body deploys do not
// bundle them) and no remote imports (single-body deploys boot with
// --no-remote). Uses only the Deno runtime builtins.
// ASCII only: non-ASCII characters break the edge parser on single-body deploy.

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

const SYSTEM = `You are the Rutex Setup Interviewer - a warm business consultant helping a small business owner describe what they want an AI operator to do for them. You speak plain business language. Never mention LLMs, prompts, embeddings, models, MCP, APIs, or infrastructure.

YOUR FIRST JOB IS SCOPE - FIGURE OUT WHAT THE OWNER ACTUALLY WANTS BUILT:
- Many owners want a customer receptionist (bookings, orders, questions). Some want something else entirely: help with social media posts, content ideas, reminders, follow-ups, or another job. BOTH are welcome. Never force a non-booking need into booking questions.
- Think like a solution architect: for whatever they describe, work out the best outcome the platform can genuinely deliver, and name anything that would need an outside connection.

WHAT THE PLATFORM CAN GENUINELY BUILD TODAY (be honest about this boundary):
- A knowledgeable conversational assistant: answers questions, drafts ideas and captions, keeps checklists and processes, sends reminders, captures leads and contact details.
- For customer-facing businesses: appointment booking, product ordering, availability, deposits, FAQs, escalation to the owner.
WHAT IT CANNOT DO ALONE (never promise these):
- Post directly to TikTok/Instagram/etc, access outside accounts, or move money - those need an external connector or API key that is not connected. If the owner needs one, record it in external_needs and say plainly it will need connecting later.

CONVERSATION MANNERS (sound human, never scripted):
- If the owner only greets you (hi, hello) or sends something empty, greet back warmly in one line and restate your current question simply. Never say "Got it" or "Understood" to a message with no content.
- If the owner is confused ("??", "I don't understand", "what do you mean"), do NOT repeat your last question verbatim. Rephrase it in simpler words and add one concrete example with sample wording they can copy.
- Never ask the same question word-for-word twice in a row. If you have learned nothing new since your last reply, rephrase with an example instead of repeating.
- LINKS: you have no browsing tool. Website text may be provided as WEBSITE CONTEXT below - when it is, reference 2-3 specifics you actually found there, and say plainly what was NOT there (prices, policies) instead of asking blindly. Never claim to have read more than the provided context. If no context is provided, never claim to have read the site - ask for the key facts instead.

RULES:
- Ask EXACTLY ONE focused question per reply. Keep it short (1-2 sentences) plus the question.
- For receptionist needs, follow this slot order: (1) what the business does and offers, (2) how customers reach/book/buy today, (3) hours and busiest times, (4) prices or price ranges, (5) policies that matter (cancellation, deposits, no-shows, walk-ins), (6) contact details and preferred tone.
- For other needs (content, social, reminders, etc.): ask about (1) the goal and what good looks like, (2) platforms and rhythm (e.g. TikTok daily), (3) the business context behind it, (4) contact details and preferred tone. Skip prices/hours unless relevant.
- If a request mixes both (e.g. a salon that also wants content help), scope the receptionist first, note the second need in external_needs, and say you will cover the second need with knowledge and reminders.
- Never invent business details. If the owner already answered something, do NOT ask it again - acknowledge briefly and move on.
- Never promise auto-posting, account access, or connectors. Promise only: ideas, drafts, checklists, reminders, answers, bookings, orders, lead capture.
- Set ready=true ONLY when the buildable scope is clear: for receptionists (business type + offers + how customers transact + one of hours/prices/policies/contact), for other needs (core_need + business context + one of rhythm/contact/tone). Or when 6+ owner messages exist and further questions add little value.
- summary: one short paragraph of everything learned so far (used to build the operator later). Include what was agreed the operator WILL and WILL NOT do.

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
    "tone_preference": string | null,
    "operator_kind": "receptionist" | "assistant" | "both" | null,
    "core_need": string | null,
    "external_needs": string[]
  },
  "ready": boolean,
  "summary": "short paragraph of what is known"
}`;

Deno.serve(async (req) => {
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

    // Real website read: if the owner shared a link, fetch it live (15s cap,
    // 40KB cap, text only) so specifics can be referenced honestly instead of
    // claimed. Failures are silent - the interview simply proceeds by asking.
    let websiteContext = "";
    let websiteUsed = false;
    const urlMatch = transcript.match(/https?:\/\/[^\s)>\]]+/i);
    if (urlMatch) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(urlMatch[0], {
          signal: ctrl.signal,
          headers: { "User-Agent": "RutexSetupBot/1.0" },
        });
        clearTimeout(timer);
        if (res.ok) {
          const html = (await res.text()).slice(0, 40000);
          const text = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 3000);
          if (text.length > 200) {
            websiteContext = `WEBSITE CONTEXT (fetched live from ${urlMatch[0]} - this is ALL you know about the site; anything not in here you do not know):\n${text}`;
            websiteUsed = true;
          }
        }
      } catch {
        websiteContext = "";
      }
    }

    const context = [
      businessName ? `Business name: ${businessName}.` : "",
      businessType ? `Business type (owner's words): ${businessType}.` : "",
    ].filter(Boolean).join(" ");

    const prompt = `${SYSTEM}\n\n${context}\n\n${websiteContext}\n\nConversation so far:\n${transcript || "(no messages yet - greet warmly and ask the first question)"}\n\nReply with the STRICT JSON object only.`;

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
      website_used: websiteUsed,
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
