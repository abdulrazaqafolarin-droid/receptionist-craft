/**
 * Task-loop mechanics gate: fingerprints stable, tripwire trips, labels resolve.
 *
 * Run: deno test supabase/functions/_shared/directorTask.test.ts
 */

import { fingerprintTable, noProgress, labelForIndex } from "./directorTask.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const TABLE = `[1] button | Find stays
[4] textbox | Destination
[7] select | Stay category`;

Deno.test("fingerprints are stable and sensitive", () => {
  check(fingerprintTable(TABLE) === fingerprintTable(TABLE), "same table, same print");
  check(fingerprintTable(TABLE) !== fingerprintTable(TABLE + "\n[8] button | Extra"), "changed table, changed print");
  check(fingerprintTable("").length > 0, "empty table still prints");
});

Deno.test("no-progress trips on three stagnant non-wait steps", () => {
  const fp = "abc123";
  check(noProgress([
    { fingerprint: fp, kind: "click" },
    { fingerprint: fp, kind: "click" },
    { fingerprint: fp, kind: "type" },
  ]), "three same-print acts trip");
  check(!noProgress([
    { fingerprint: fp, kind: "click" },
    { fingerprint: fp, kind: "wait" },
    { fingerprint: fp, kind: "click" },
  ]), "waits don't count as spinning");
  check(!noProgress([
    { fingerprint: fp, kind: "click" },
    { fingerprint: "other", kind: "click" },
    { fingerprint: fp, kind: "click" },
  ]), "changed pages reset the tripwire");
  check(!noProgress([{ fingerprint: fp, kind: "click" }]), "short history never trips");
});

Deno.test("labels resolve by index for expect-fill", () => {
  check(labelForIndex(TABLE, "4") === "Destination", "label found");
  check(labelForIndex(TABLE, "9") === null, "missing index is null, never guessed");
  check(labelForIndex(TABLE, "4; DROP") === null, "injection-ish index is null");
});
