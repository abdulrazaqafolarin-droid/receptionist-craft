/**
 * Self-driving task loop — the mechanics Jev's prompt file prescribes,
 * ported to every lane (in-app cursor, companions, browser):
 *
 * - Freshness before acting: fingerprint the table at decide time;
 *   re-fingerprint before executing. Mismatch means re-observe and
 *   replan — never a blind retry of a mutation.
 * - Record before observing: the step lands in history at act time,
 *   so a stale post-action look cannot erase what happened.
 * - No-progress tripwire: 3 acted steps, same fingerprint, none of
 *   them waits → BLOCKED. Spinning is failure, stated as such.
 * - DONE needs evidence: a terminal claim triggers one final verify
 *   look; the trail, not the claim, is the proof.
 * - Budgets: step cap + wall clock per run call; state persists so
 *   continue calls resume exactly where the last one stopped.
 *
 * Pure helpers here (tested); the loop driver lives in
 * director-task/index.ts. Deno-safe.
 */

export interface TaskStep {
  n: number;
  op: string;
  target?: string;
  detail: string;
  fingerprint: string;
  at: string;
}

/** Short stable fingerprint of an observation table. */
export function fingerprintTable(table: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdead;
  for (let i = 0; i < table.length; i++) {
    const c = table.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 1597334677) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/**
 * No-progress tripwire (Jev: three acted steps, unchanged page, none
 * a wait → blocked). History entries carry { fingerprint, kind } where
 * kind is the executed lane kind ('wait' excluded from progress).
 */
export function noProgress(history: Array<{ fingerprint: string; kind: string }>): boolean {
  if (history.length < 3) return false;
  const last3 = history.slice(-3);
  if (last3.some((h) => h.kind === "wait")) return false;
  return last3.every((h) => h.fingerprint === last3[0].fingerprint);
}

/** Extract the visible label for an index from a "[n] role | label" table. */
export function labelForIndex(table: string, index: string): string | null {
  const re = new RegExp(`^\\[${index.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*[^|]*\\|\\s*(.+)$`, "m");
  const m = table.match(re);
  return m ? m[1].trim().slice(0, 120) : null;
}

const REFUSE_GOAL_RE =
  /log\s*[-_\s]*in|sign\s*[-_\s]*in|password|passcode|pay(ment|ing)?|checkout|credit\s*card|2fa|\botp\b|verify.*(code|identity)/i;

/** Goals that need the owner in person, never any loop. Reason or null. */
export function refusedGoal(goal: string): string | null {
  if (REFUSE_GOAL_RE.test(goal || "")) {
    return "refused (logins and payments need the owner)";
  }
  return null;
}
