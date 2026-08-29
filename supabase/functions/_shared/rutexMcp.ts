/**
 * Rutex Gateway — MCP connector (shared, Deno-compatible).
 *
 * Talks to the gateway's Model Context Protocol endpoint (/mcp) using raw
 * JSON-RPC over Streamable HTTP. No SDK dependency — works in Deno edge
 * functions, browsers, and Node alike.
 *
 * Required env vars:
 *   RUTEX_GATEWAY_URL  e.g. https://<gateway-host>      (stable; no longer rotating)
 *   RUTEX_GATEWAY_KEY  the project's bearer key (e.g. "frontdesk" row)
 *
 * Rules (from GATEWAY-BATTLE-LOG.docx):
 *   - Client timeout MUST be >= 90s; agentic turns take 5-15s typically,
 *     up to 120s. The gateway hard-caps at 120s.
 *   - conversationId is REQUIRED and stable per end-user thread.
 */

const GATEWAY_URL = (globalThis.Deno?.env.get("RUTEX_GATEWAY_URL") ?? process.env?.RUTEX_GATEWAY_URL ?? "").replace(/\/$/, "");
const GATEWAY_KEY = globalThis.Deno?.env.get("RUTEX_GATEWAY_KEY") ?? process.env?.RUTEX_GATEWAY_KEY ?? "";

let rpcId = 0;

export class RutexMcpError extends Error {
  constructor(message: string, readonly kind: "not_configured" | "auth" | "timeout" | "unreachable" | "protocol" | "tool_error") {
    super(message);
    this.name = "RutexMcpError";
  }
}

function requireConfig(): { url: string; key: string } {
  if (!GATEWAY_URL || !GATEWAY_KEY) {
    throw new RutexMcpError("Set RUTEX_GATEWAY_URL and RUTEX_GATEWAY_KEY", "not_configured");
  }
  return { url: GATEWAY_URL, key: GATEWAY_KEY };
}

/** One stateless JSON-RPC round trip against /mcp. Returns the result object. */
async function rpc<T = Record<string, unknown>>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<T> {
  const { url, key } = requireConfig();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? {} }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new RutexMcpError(
      ctrl.signal.aborted ? `gateway timed out after ${timeoutMs}ms` : `gateway unreachable: ${String(e)}`,
      ctrl.signal.aborted ? "timeout" : "unreachable",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) throw new RutexMcpError("gateway rejected the bearer key", "auth");
  if (!res.ok) throw new RutexMcpError(`gateway http_${res.status}`, "protocol");

  // Response may be plain JSON or SSE-framed; normalize to text then parse.
  const raw = await res.text();
  const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
  const payload = dataLine ? dataLine.slice(5).trim() : raw;
  let msg: { result?: T & { isError?: boolean }; error?: { message?: string } };
  try {
    msg = JSON.parse(payload);
  } catch {
    throw new RutexMcpError(`unparseable gateway response: ${payload.slice(0, 200)}`, "protocol");
  }
  if (msg.error) throw new RutexMcpError(msg.error.message ?? "jsonrpc error", "protocol");
  return (msg.result ?? {}) as T;
}

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const c = (result.content ?? []).find((p) => p.type === "text");
  return c?.text ?? "";
}

export interface AskResultText {
  text: string;
  model?: string;
  tokens?: { input: number; output: number; reasoning: number };
}

/** High-level: ask the Rutex AI with per-conversation memory. */
export async function askRutex(conversationId: string, prompt: string, opts?: { newSession?: boolean }): Promise<AskResultText> {
  const result = await rpc<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>("tools/call", {
    name: "rutex_ask",
    arguments: { conversationId, prompt, ...(opts?.newSession ? { newSession: true } : {}) },
  });
  if (result.isError) throw new RutexMcpError(firstText(result) || "ask failed", "tool_error");
  const raw = firstText(result);
  try {
    const parsed = JSON.parse(raw) as AskResultText;
    return { text: parsed.text ?? "", model: parsed.model, tokens: parsed.tokens };
  } catch {
    return { text: raw };
  }
}

/** Health probe of gateway + its OpenCode backend. */
export async function rutexHealth(): Promise<{ gateway: string; opencode: string }> {
  const result = await rpc<{ content?: Array<{ type: string; text?: string }> }>(
    "tools/call",
    { name: "rutex_health", arguments: {} },
    15_000,
  );
  try {
    return JSON.parse(firstText(result));
  } catch {
    return { gateway: "unknown", opencode: "unknown" };
  }
}

/** Forget a conversation so its next message starts fresh. */
export async function resetRutexConversation(conversationId: string, project?: string): Promise<boolean> {
  const args: Record<string, unknown> = { conversationId };
  if (project) args.project = project;
  const result = await rpc<{ content?: Array<{ type: string; text?: string }> }>("tools/call", {
    name: "rutex_reset_conversation",
    arguments: args,
  });
  try {
    return Boolean(JSON.parse(firstText(result)).cleared);
  } catch {
    return false;
  }
}
