import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyWorkerHeartbeat } from "./workerHeartbeat.ts";

Deno.test("successful heartbeat keeps model execution alive", () => {
  assertEquals(classifyWorkerHeartbeat({ ok: true }), "ok");
});

Deno.test("cancellation request is distinguished from lease loss", () => {
  assertEquals(classifyWorkerHeartbeat({ ok: false, error: "cancellation_requested" }), "cancellation_requested");
  assertEquals(classifyWorkerHeartbeat({ ok: false, error: "lease_not_owned" }), "lease_lost");
  assertEquals(classifyWorkerHeartbeat({ ok: false, error: "lease_expired" }), "lease_lost");
});

Deno.test("heartbeat transport and malformed responses fail closed", () => {
  assertEquals(classifyWorkerHeartbeat(null), "unavailable");
  assertEquals(classifyWorkerHeartbeat({ ok: false }), "unavailable");
  assertEquals(classifyWorkerHeartbeat({ ok: true }, true), "unavailable");
});
