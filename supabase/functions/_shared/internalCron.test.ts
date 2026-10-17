import { authorizeInternalCron, INTERNAL_CRON_HEADER } from "./internalCron.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const validSecret = "test-only-secret-that-is-at-least-32-bytes-long";

Deno.test("rejects missing server secret configuration with 503", () => {
  const req = new Request("https://example.test", { headers: { [INTERNAL_CRON_HEADER]: validSecret } });
  check(authorizeInternalCron(req, undefined)?.status === 503, "missing secret fails closed");
  check(authorizeInternalCron(req, "short")?.status === 503, "weak secret fails closed");
});

Deno.test("rejects missing or incorrect request secret", () => {
  check(authorizeInternalCron(new Request("https://example.test"), validSecret)?.status === 401, "missing header denied");
  const wrong = new Request("https://example.test", { headers: { [INTERNAL_CRON_HEADER]: "wrong-secret-value" } });
  check(authorizeInternalCron(wrong, validSecret)?.status === 401, "incorrect header denied");
});

Deno.test("accepts the configured internal secret", () => {
  const req = new Request("https://example.test", { headers: { [INTERNAL_CRON_HEADER]: validSecret } });
  check(authorizeInternalCron(req, validSecret) === null, "correct secret accepted");
});
