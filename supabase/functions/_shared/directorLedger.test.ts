/**
 * Director ledger gate: writers record honestly and never throw.
 *
 * Run: deno test supabase/functions/_shared/directorLedger.test.ts
 */

import { ledgerStart, ledgerFinish } from "./directorLedger.ts";
import type { LedgerClient } from "./directorLedger.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function fakeClient(log: Array<{ op: string; row?: unknown; patch?: unknown }>): LedgerClient {
  return {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          log.push({ op: "insert", row });
          return {
            select(_col: string) {
              return {
                single: async () => ({ data: { id: "ledger-1" }, error: null }),
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          log.push({ op: "update", patch });
          return { eq: async (_c: string, _v: string) => ({ error: null }) };
        },
      };
    },
  };
}

function brokenClient(): LedgerClient {
  return {
    from(_table: string) {
      throw new Error("db down");
    },
  };
}

Deno.test("ledger start records kind, summary, before, and visibility", async () => {
  const log: Array<{ op: string; row?: unknown; patch?: unknown }> = [];
  const id = await ledgerStart(fakeClient(log), {
    user_id: "u-1",
    receptionist_id: "op-1",
    kind: "bookkeeping",
    summary: "Marked task done",
    before: { done: false },
    visible: true,
  });
  check(id === "ledger-1", "returns the row id");
  const row = log[0].row as Record<string, unknown>;
  check(row.kind === "bookkeeping", "kind recorded");
  check(row.status === "running", "opens running");
  check(row.summary === "Marked task done", "summary recorded");
  check((row.before as { done: boolean }).done === false, "before recorded");
  check(row.visible === true, "visibility recorded");
});

Deno.test("ledger finish closes the row with outcome and after", async () => {
  const log: Array<{ op: string; row?: unknown; patch?: unknown }> = [];
  await ledgerFinish(fakeClient(log), "ledger-1", {
    status: "done",
    summary: "Marked task done",
    after: { done: true },
  });
  const patch = log[0].patch as Record<string, unknown>;
  check(patch.status === "done", "status closed");
  check((patch.after as { done: boolean }).done === true, "after recorded");
  check(typeof patch.finished_at === "string", "finished_at stamped");
});

Deno.test("ledger never throws and null ids are no-ops", async () => {
  const id = await ledgerStart(brokenClient(), {
    user_id: "u-1",
    kind: "report",
    summary: "sweep",
  });
  check(id === null, "broken start returns null, never throws");
  await ledgerFinish(brokenClient(), null, { status: "done" });
  await ledgerFinish(brokenClient(), "ledger-1", { status: "failed", error: "boom" });
  check(true, "broken finish and null id never throw");
});
