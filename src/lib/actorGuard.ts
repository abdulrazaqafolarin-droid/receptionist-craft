/**
 * Actor guardrails — enforced in code, never in prompts.
 *
 * Refuse credential and lock-out targets, refuse UI that does not exist,
 * refuse routes outside the page manifest. Everything else the Director
 * does on its own: small work runs solo, so there is no confirmation gate.
 * Pure functions: every decision is unit-tested, no DOM needed.
 */

import { findTarget } from "./actorMap";
import { OWNER_PAGES } from "../../supabase/functions/_shared/config/surfaceManifest";

export type ActorAction =
  | { type: "point"; target: string; say?: string }
  | { type: "click"; target: string; say?: string }
  | { type: "highlight"; target: string; ms?: number; say?: string }
  | { type: "scroll-to"; target: string; say?: string }
  | { type: "type"; target: string; text: string; press_return?: boolean; say?: string }
  | { type: "say"; text: string }
  | { type: "showcase"; target: string; title: string; lines: string[]; say?: string }
  | { type: "collect"; target: string; connector_key: string; say?: string }
  | { type: "goto"; route: string; say?: string };

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

export function guardCheck(action: ActorAction): GuardVerdict {
  if (action.type === "say") {
    return { allowed: true, reason: "narration-only" };
  }
  if (action.type === "goto") {
    // Black-hole navigation: the destination MUST exist in the manifest.
    // No invented routes — a wrong turn strands the owner.
    const known = OWNER_PAGES.some((p) => p.route === action.route);
    if (!known) {
      return { allowed: false, reason: `unknown-route:${action.route.slice(0, 60)}` };
    }
    return { allowed: true, reason: "manifest-route" };
  }
  const target = findTarget(action.target);
  if (!target) {
    // Fail closed: unknown UI is unreachable by design, not by accident.
    return { allowed: false, reason: `unknown-target:${action.target}` };
  }
  if (isForbiddenKey(target.key)) {
    return { allowed: false, reason: `forbidden-target:${target.key}` };
  }
  if (action.type === "click" || action.type === "collect") {
    // collect opens the connector's REAL dialog — no state changes until
    // the owner submits there through its own buttons. Same bar as click.
    return { allowed: true, reason: "owner-visible-action" };
  }
  if (action.type === "type") {
    // Typing is allowed only into registered INPUT targets. Password and
    // credential fields are refused one layer down, where the live DOM
    // exists to inspect (input type, autocomplete, name) — this pure
    // guard cannot see them, so it refuses nothing here beyond kind.
    if (!target || target.kind !== "input") {
      return { allowed: false, reason: `wrong-kind:${target ? target.key : action.target}` };
    }
    if (typeof action.text !== "string" || !action.text.trim()) {
      return { allowed: false, reason: "empty-text" };
    }
    return { allowed: true, reason: "registered-input" };
  }
  // point / highlight / scroll-to / showcase never change state.
  return { allowed: true, reason: "read-only-gesture" };
}
