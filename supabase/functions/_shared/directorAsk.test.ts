/**
 * Ask validation gate: formats checked, dispositions correct.
 *
 * Run: deno test supabase/functions/_shared/directorAsk.test.ts
 */

import { validateAnswer, answerDisposition } from "./directorAsk.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("required, lengths, otp digits, choices validate honestly", () => {
  const fields = [
    { key: "name", label: "Name", type: "text" as const, required: true },
    { key: "key", label: "API key", type: "password" as const },
    { key: "code", label: "Code", type: "otp" as const },
    { key: "pick", label: "Pick", type: "choice" as const, options: ["a", "b"] },
    { key: "ok", label: "OK?", type: "yesno" as const },
  ];
  const good = validateAnswer(fields, { name: "x", key: "sk-12345678", code: "483920", pick: "a", ok: true });
  check(good.ok, "valid answers pass");
  const bad = validateAnswer(fields, { name: " ", key: "short", code: "12ab", pick: "zzz", ok: "yes" });
  check(!bad.ok && bad.errors.length === 5, "every bad field named");
  check(bad.errors.some((e) => e.includes("digits only")), "otp rule stated");
  const optional = validateAnswer([{ key: "n", label: "N", type: "text" as const, required: false }], {});
  check(optional.ok, "optional may be absent");
});

Deno.test("dispositions route secrets away from storage", () => {
  check(answerDisposition("credential") === "vault", "credentials to vault");
  check(answerDisposition("otp") === "burn", "otp burns");
  check(answerDisposition("approval") === "keep", "approvals kept as audit");
  check(answerDisposition("choice") === "keep", "choices kept");
  check(answerDisposition("files") === "keep", "file refs kept");
});
