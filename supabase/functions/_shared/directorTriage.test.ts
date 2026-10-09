/**
 * Director triage gate: transient retries, permanent notifies, unknown asks.
 *
 * Run: deno test supabase/functions/_shared/directorTriage.test.ts
 */

import { classifyJobError } from "./directorTriage.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("transient infrastructure failures retry", () => {
  for (const e of [
    "gateway timed out after 90000ms",
    "socket hang up",
    "rate limit exceeded, try again",
    "service unavailable 503",
    "request ETIMEDOUT",
  ]) {
    const r = classifyJobError(e);
    check(r.verdict === "retry", `retries: ${e}`);
  }
});

Deno.test("permanent failures notify, never retry", () => {
  for (const e of [
    "maximum context length exceeded",
    "validation failed: missing business_name",
    "gateway rejected the bearer key (auth)",
    "duplicate key violates constraint",
    "ambiguous change request",
  ]) {
    const r = classifyJobError(e);
    check(r.verdict === "notify", `notifies: ${e}`);
  }
});

Deno.test("empty and unrecognised errors notify — uncertain means ask", () => {
  check(classifyJobError("").verdict === "notify", "empty notifies");
  check(classifyJobError("   ").verdict === "notify", "blank notifies");
  const r = classifyJobError("something strange happened in lane 4");
  check(r.verdict === "notify", "unknown notifies");
  check(r.reason.includes("owner"), "reason says the owner decides");
});
