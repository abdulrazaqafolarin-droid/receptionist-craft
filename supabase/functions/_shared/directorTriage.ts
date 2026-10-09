/**
 * Director job triage — classify a failed plan_jobs row BEFORE any retry.
 *
 * The rule the owner set: re-run only when analysis says the failure was
 * transient and a retry can actually succeed. Permanent failures and
 * anything uncertain become a notification with the real error — never a
 * blind requeue. Blind retries defeat plan-worker's escalation ladder
 * (MAX_ATTEMPTS = 3) and can loop forever.
 *
 * Pure functions: unit-tested without network or DOM. Deno-safe.
 */

/** Transient infrastructure failures: the same work will likely succeed later. */
const TRANSIENT_PATTERNS = [
  /timed?\s*out/i,
  /ETIMEDOUT/i,
  /EAI_AGAIN/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /socket hang up/i,
  /gateway (timed out|unreachable|unavailable)/i,
  /rate.?limit/i,
  /\b429\b/,
  /\b502\b/,
  /\b503\b/,
  /\b504\b/,
  /service unavailable/i,
  /temporarily unavailable/i,
  /overloaded/i,
  /try again/i,
];

/**
 * Permanent failures: retrying the identical input cannot succeed.
 * Note what is deliberately ABSENT: context-length errors are permanent
 * (same input fails the same way), auth errors need the owner, and
 * validation errors need a human decision.
 */
const PERMANENT_PATTERNS = [
  /context (length|window|limit)|maximum context|too many tokens/i,
  /valid/i,
  /malformed/i,
  /invalid/i,
  /unauthorized|unauthorised/i,
  /forbidden/i,
  /\b401\b/,
  /\b403\b/,
  /auth/i,
  /permission/i,
  /constraint/i,
  /duplicate/i,
  /not found/i,
  /ambiguous/i,
];

export type JobVerdict = "retry" | "notify";

/**
 * Classify a plan_jobs error_text. Uncertain (no pattern matches either
 * way) notifies — the owner is asked, exactly as instructed.
 */
export function classifyJobError(errorText: string): { verdict: JobVerdict; reason: string } {
  const text = (errorText || "").slice(0, 500);
  if (!text.trim()) {
    return { verdict: "notify", reason: "empty error — nothing to analyse" };
  }
  if (PERMANENT_PATTERNS.some((p) => p.test(text))) {
    return { verdict: "notify", reason: "permanent failure — retry cannot help" };
  }
  if (TRANSIENT_PATTERNS.some((p) => p.test(text))) {
    return { verdict: "retry", reason: "transient infrastructure failure" };
  }
  return { verdict: "notify", reason: "unrecognised failure — owner decides" };
}
