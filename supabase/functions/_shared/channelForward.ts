/**
 * Shared channel → widget-chat forwarder (Phase 2 parity hardening).
 *
 * Every messaging channel (web widget via browser, WhatsApp, phone voice,
 * future SMS/Instagram) funnels messages into the same brain through this
 * one function. One implementation = one place to fix when the contract
 * evolves (timeouts, retries, new required fields).
 *
 * Contract with widget-chat: POST {message, receptionistId, sessionId, source}
 * — always HTTP 200 with {reply, ...} (stability mode), never 5xx.
 */

export interface ForwardOptions {
  message: string;
  receptionistId: string;
  sessionId: string;
  source: string;
  /** Abort budget. Phone channels should keep ≤13s (Twilio waits ~15s for TwiML). */
  timeoutMs?: number;
}

export interface ForwardResult {
  /** User-safe reply text produced by widget-chat (or its fallback). */
  reply: string;
  raw: unknown;
}

export class ChannelForwardError extends Error {
  constructor(
    message: string,
    readonly kind: "timeout" | "unreachable" | "bad_response",
  ) {
    super(message);
    this.name = "ChannelForwardError";
  }
}

export async function forwardToWidgetChat(opts: ForwardOptions): Promise<ForwardResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("RUTEX_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new ChannelForwardError("Missing SUPABASE_URL or service key", "unreachable");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000);

  let res: Response;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/widget-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
      },
      body: JSON.stringify({
        message: opts.message,
        receptionistId: opts.receptionistId,
        sessionId: opts.sessionId,
        source: opts.source,
      }),
      signal: ctrl.signal,
    });
  } catch (_) {
    clearTimeout(timer);
    throw new ChannelForwardError(
      ctrl.signal.aborted ? `widget-chat timed out after ${opts.timeoutMs ?? 30_000}ms` : "network failure reaching widget-chat",
      ctrl.signal.aborted ? "timeout" : "unreachable",
    );
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new ChannelForwardError(`widget-chat returned ${res.status}`, "bad_response");
  }

  const raw = await res.json().catch(() => null);
  const reply =
    (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).reply === "string"
      ? (raw as Record<string, unknown>).reply
      : "") || "I'm sorry, I had trouble processing that. Could you please try again?";

  return { reply, raw };
}
