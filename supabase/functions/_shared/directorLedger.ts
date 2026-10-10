/**
 * Director action ledger — writers for every autonomous write.
 *
 * One row per solo action with before/after, so any autonomous change is
 * auditable and undoable. The sweep (Phase 2) and all future autonomous
 * writers go through these functions; there is no second path.
 *
 * The ledger never throws: a failed record must never break the sweep it
 * is recording. Errors return null and the caller carries on.
 *
 * Deno-safe: ASCII only, no imports, no Node APIs. The client is typed
 * loosely so edge functions (service role) and tests (fakes) both fit.
 */

export type DirectorActionKind = "bookkeeping" | "operator_draft" | "job_retry" | "report" | "hands";
export type DirectorActionStatus = "running" | "done" | "failed" | "skipped";

export interface LedgerEntry {
  user_id: string;
  receptionist_id?: string | null;
  kind: DirectorActionKind;
  summary: string;
  before?: Record<string, unknown>;
  visible?: boolean;
}

export interface LedgerFinish {
  status: Exclude<DirectorActionStatus, "running">;
  summary?: string;
  after?: Record<string, unknown>;
  error?: string;
}

/** Minimal shape of the supabase-js surface the ledger touches. `any` on
 * purpose: the generated DB types lag migrations, and a ledger write must
 * never fail type-check over a column the types don't know yet. */
export interface LedgerClient {
  from(table: string): any;
}

/** Open a ledger row. Returns its id, or null when recording failed. */
export async function ledgerStart(
  client: LedgerClient,
  entry: LedgerEntry,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("director_actions")
      .insert({
        user_id: entry.user_id,
        receptionist_id: entry.receptionist_id ?? null,
        kind: entry.kind,
        status: "running",
        summary: entry.summary.slice(0, 500),
        before: entry.before ?? {},
        after: {},
        visible: entry.visible ?? false,
      })
      .select("id")
      .single();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

/** Close a ledger row. A null id is a no-op — callers never branch on it. */
export async function ledgerFinish(
  client: LedgerClient,
  id: string | null,
  finish: LedgerFinish,
): Promise<void> {
  if (!id) return;
  try {
    await client.from("director_actions").update({
      status: finish.status,
      summary: (finish.summary ?? "").slice(0, 500),
      after: finish.after ?? {},
      error: finish.error ? finish.error.slice(0, 500) : null,
      finished_at: new Date().toISOString(),
    }).eq("id", id);
  } catch {
    // Recording the outcome failed; the work itself already happened.
  }
}
