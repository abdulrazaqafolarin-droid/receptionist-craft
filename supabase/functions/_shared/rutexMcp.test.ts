import { askRutex, RutexMcpError } from "./rutexMcp.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(\`FAIL: \${message}\`);
}

Deno.test("Rutex Gateway response parsing and body timeout", async () => {
  const oldUrl = Deno.env.get("RUTEX_GATEWAY_URL");
  const oldKey = Deno.env.get("RUTEX_GATEWAY_KEY");
  const originalFetch = globalThis.fetch;
  Deno.env.set("RUTEX_GATEWAY_URL", "https://gateway.test/");
  Deno.env.set("RUTEX_GATEWAY_KEY", "test-key");

  try {
    let requestBody: Record<string, unknown> | undefined;
    let requestAuthorization = "";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestAuthorization = new Headers(init?.headers).get("Authorization") ?? "";
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: JSON.stringify({ text: "gateway-ok", model: "test-model" }) }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const result = await askRutex("stable-thread-123", "hello", { timeoutMs: 500 });
    check(result.text === "gateway-ok", "parses the gateway's text result");
    check(result.model === "test-model", "preserves model metadata");
    check(requestAuthorization === "Bearer test-key", "uses the configured gateway bearer key");
    const params = requestBody?.params as Record<string, unknown> | undefined;
    const args = params?.arguments as Record<string, unknown> | undefined;
    check(args?.conversationId === "stable-thread-123", "sends the stable conversation ID");
    check(args?.prompt === "hello", "sends the prompt");

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
          }, { once: true });
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }) as typeof fetch;

    let timeoutError: unknown;
    try {
      await askRutex("stable-thread-123", "slow response", { timeoutMs: 25 });
    } catch (error) {
      timeoutError = error;
    }
    check(timeoutError instanceof RutexMcpError, "reports a typed gateway timeout");
    check((timeoutError as RutexMcpError).kind === "timeout", "timeout remains classified as timeout");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) Deno.env.delete("RUTEX_GATEWAY_URL");
    else Deno.env.set("RUTEX_GATEWAY_URL", oldUrl);
    if (oldKey === undefined) Deno.env.delete("RUTEX_GATEWAY_KEY");
    else Deno.env.set("RUTEX_GATEWAY_KEY", oldKey);
  }
});
