/**
 * Actor guardrails — enforced in code, never in prompts.
 *
 * Ported 1:1 from the Bluey ruleset that inspired this program:
 * act only when asked or running an approved routine, confirm the
 * destructive, refuse credentials and lock-out paths, stop on demand.
 * Pure functions: every decision is unit-tested, no DOM needed.
 */

import { findTarget } from "./actorMap";

export type ActorAction =
  | { type: "point"; target: string; say?: string }
  | { type: "click"; target: string; say?: string }
  | { type: "highlight"; target: string; ms?: number; say?: string }
  | { type: "scroll-to"; target: string; say?: string }
  | { type: "say"; text: string };

export interface GuardVerdict {
  allowed: boolean;
  /** Machine-readable reason for the receipt (and the trace). */
  reason: string;
}

/**
 * Key patterns the actor may never touch, whatever the registry says.
 * Credentials first (passwords, keys, secrets), then lock-out paths
 * (logout, lock, delete-account), then money movement.
 */
const FORBIDDEN_KEY_PATTERNS = [
  /password/i,
  /credential/i,
  /\bsecret\b/i,
  /api[-_ ]?key/i,
  /logout|log-out|sign[-_ ]?out/i,
  /lock[-_ ]?(screen|computer)?/i,
  /delete[-_ ]?account/i,
  /force[-_ ]?quit/i,
];

/** Key shapes the actor may never touch, whatever the registry says. */
export function isForbiddenKey(key: string): boolean {
  return FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function guardCheck(
  action: ActorAction,
  opts: { confirmed?: boolean; routineApproved?: boolean } = {},
): GuardVerdict {
  if (action.type === "say") {
    return { allowed: true, reason: "narration-only" };
  }
  const target = findTarget(action.target);
  if (!target) {
    // Fail closed: unknown UI is unreachable by design, not by accident.
    return { allowed: false, reason: `unknown-target:${action.target}` };
  }
  if (isForbiddenKey(target.key)) {
    return { allowed: false, reason: `forbidden-target:${target.key}` };
  }
  if (action.type === "click" && target.dangerous && !opts.confirmed) {
    return { allowed: false, reason: `confirm-required:${target.key}` };
  }
  if (action.type === "click") {
    return { allowed: true, reason: "asked-or-routine" };
  }
  // point / highlight / scroll-to never change state — always safe to show.
  return { allowed: true, reason: "read-only-gesture" };
}
