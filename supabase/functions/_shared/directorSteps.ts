/**
 * Director presence steps — what the cursor performs when the owner
 * watches an autonomous run happen.
 *
 * Steps use only registered actor targets (guard-checked at runtime like
 * everything else), so a step can never point at UI that does not exist.
 * Say-only steps narrate work with no UI surface (requeues, drafts).
 * Plain JSON: the sweep attaches them to the ledger row AND the activity
 * row, the client replays them verbatim through the normal ride path.
 *
 * Pure builders: unit-tested without network or DOM. Deno-safe.
 */

export interface PresenceStep {
  type: string;
  target?: string;
  route?: string;
  say?: string;
  ms?: number;
}

/** Steps for a completed-order stock decrement on the given operator. */
export function stockSteps(operatorName: string, lines: number): PresenceStep[] {
  return [
    { type: "goto", route: "/console" },
    { type: "highlight", target: "console-stock-check", ms: 1500 },
    {
      type: "say",
      say: `Stock updated for ${operatorName} — ${lines} order line${lines === 1 ? "" : "s"} counted out.`,
    },
  ];
}

/** Steps for a job requeue: no UI surface, narration only. */
export function requeueSteps(operatorName: string): PresenceStep[] {
  return [
    {
      type: "say",
      say: `Re-queued ${operatorName}'s failed plan — the failure was a timeout, so a fresh run should take it.`,
    },
  ];
}

/** Steps for a resumed shell draft: narration only (Builder ride comes later). */
export function draftSteps(operatorName: string): PresenceStep[] {
  return [
    {
      type: "say",
      say: `Picked ${operatorName} back up — its plan is running again. I'll leave the draft in your Builder.`,
    },
  ];
}
