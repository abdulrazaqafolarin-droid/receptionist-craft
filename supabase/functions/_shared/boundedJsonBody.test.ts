import { readBoundedJsonBody } from "./boundedJsonBody.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

Deno.test("parses a bounded JSON object", async () => {
  const result = await readBoundedJsonBody(new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ action: "list" }),
    headers: { "content-type": "application/json" },
  }));
  assert(result.ok, "valid JSON should parse");
  if (result.ok) assert((result.value as Record<string, unknown>).action === "list", "parsed value is preserved");
});

Deno.test("rejects a declared oversized request before reading its body", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: "{}",
    headers: { "content-length": "100" },
  });
  const result = await readBoundedJsonBody(request, 10);
  assert(!result.ok && result.status === 413 && result.error === "request_too_large", "declared oversize rejected");
});

Deno.test("counts streamed bytes when content length is absent", async () => {
  const payload = JSON.stringify({ blob: "x".repeat(100) });
  const result = await readBoundedJsonBody(new Request("https://example.test", {
    method: "POST",
    body: payload,
  }), 32);
  assert(!result.ok && result.status === 413, "actual streamed size is authoritative");
});

Deno.test("accepts a payload exactly at the configured byte limit", async () => {
  const payload = JSON.stringify({ value: "x".repeat(20) });
  const limit = new TextEncoder().encode(payload).byteLength;
  const result = await readBoundedJsonBody(new Request("https://example.test", {
    method: "POST",
    body: payload,
  }), limit);
  assert(result.ok, "payload at the exact limit should be accepted");
});

Deno.test("rejects malformed JSON with a client error", async () => {
  const result = await readBoundedJsonBody(new Request("https://example.test", {
    method: "POST",
    body: "{not-json",
  }));
  assert(!result.ok && result.status === 400 && result.error === "invalid_json", "malformed JSON rejected");
});

Deno.test("rejects an absent request body", async () => {
  const result = await readBoundedJsonBody(new Request("https://example.test", { method: "POST" }));
  assert(!result.ok && result.status === 400, "missing body rejected");
});
