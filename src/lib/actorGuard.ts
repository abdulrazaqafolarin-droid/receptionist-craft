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
import { checkGestureBounds, MOTION_BOUNDS, type GestureStep } from "../../supabase/functions/_shared/config/actorCapabilities";

export type ActorAction =
  | { type: "point"; target: string; say?: string }
  | { type: "click"; target: string; say?: string; dwellMs?: number }
  | { type: "highlight"; target: string; ms?: number; say?: string }
  | { type: "scroll-to"; target: string; say?: string }
  | { type: "type"; target: string; text: string; press_return?: boolean; say?: string }
  | { type: "drag"; from: string; to: string; say?: string }
  | { type: "live_click"; index: number; expect?: string; say?: string; dwellMs?: number }
  | { type: "live_point"; index: number; expect?: string; say?: string }
  | { type: "live_type"; index: number; text: string; expect?: string; press_return?: boolean; say?: string }
  | { type: "live_drag"; from: number; to: number; say?: string }
  | { type: "gesture"; kind: GestureStep["kind"]; target?: string; index?: number; expect?: string; amplitude?: number; cycles?: number; radius?: number; ms?: number; say?: string }
  | { type: "say"; text: string }
  | { type: "showcase"; target: string; title: string; lines: string[]; say?: string }
  | { type: "collect"; target: string; connector_key: string; say?: string }
  | { type: "goto"; route: string; say?: string };

/**
 * Live-label refusals, checked at resolve time against the element's
 * CURRENT label. Credentials strand or lock the owner; money moves
 * irreversibly. The registry path keeps its own curated rules — this
 * is the open-world counterpart for unregistered UI.
 */
export const LIVE_REFUSE_RE =
  /passw|credential|secret|api[-_ ]?key|logout|log[-_ ]?out|sign[-_ ]?out|delete[-_ ]?account|lock[-_ ]?(screen|computer)?|\bpay\b|buy\b|checkout|submit/i;

/** Plain-words label for a live element (aria → text → placeholder). */
export function describeLiveLabel(el: Element): string {
  const input = el as HTMLInputElement;
  const label =
    el.getAttribute("aria-label") ||
    ((el.textContent || "").trim().replace(/\s+/g, " ")) ||
    input.getAttribute?.("placeholder") ||
    input.name ||
    input.value ||
    el.tagName;
  return label.slice(0, 80);
}

/** One transient open-world candidate from a fresh live table. */
export interface LiveCandidate {
  index: number;
  label: string;
  role?: string;
  /** Extra row segments (e.g. href=/staff) — context only, never values. */
  meta?: string;
}

function liveWords(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Parse a fresh live table (`[n] role | label`) into candidates. The table
 * itself is transient: callers stamp it, pick one index, act, then discard
 * it. Nothing here registers UI.
 */
export function parseLiveTable(rows: unknown): LiveCandidate[] {
  if (!Array.isArray(rows)) return [];
  const out: LiveCandidate[] = [];
  for (const row of rows) {
    if (typeof row !== "string") continue;
    const m = /^\s*\[(\d+)\]\s*(.*)$/.exec(row);
    if (!m) continue;
    const index = Number(m[1]);
    if (!Number.isInteger(index) || index <= 0) continue;
    const rest = m[2];
    const segs = rest.split("|").map((s) => s.trim());
    const role = (segs[0] || "").slice(0, 40);
    const label = (segs[1] || "").slice(0, 80);
    const meta = segs.slice(2).join(" | ").slice(0, 120);
    if (!label) continue;
    out.push({ index, label, role: role || undefined, meta: meta || undefined });
  }
  return out;
}

/**
 * Pick one unambiguous visible label for a click phrase. Refused labels are
 * never considered; equal-strength matches refuse by ambiguity. Null means
 * do not click: fall back to registry, route, or the brain.
 */
export function pickLiveCandidate(phrase: string, candidates: LiveCandidate[]): LiveCandidate | null {
  const words = liveWords(phrase).filter((w) => w.length > 3);
  if (words.length === 0 || candidates.length === 0) return null;
  let best: LiveCandidate | null = null;
  let bestScore = -1;
  let tied = false;
  for (const c of candidates) {
    if (!c || !Number.isInteger(c.index) || c.index <= 0) continue;
    const label = (c.label || "").slice(0, 80);
    if (!label || LIVE_REFUSE_RE.test(label)) continue;
    const hay = ` ${label.toLowerCase()} ${(c.meta || "").toLowerCase()} `;
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += 1;
    }
    if (score <= 0) continue;
    if (score > bestScore) {
      best = { index: c.index, label, role: c.role, meta: c.meta };
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  if (!best || tied) return null;
  return best;
}

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

/**
 * Pre-click dwell bounds (single source: MOTION_BOUNDS). Absent is
 * always fine; present must be a finite 0..max number. Dwell applies
 * to click-then-act steps only — carrying it elsewhere is refused.
 */
export function validDwell(ms: unknown): boolean {
  if (ms === undefined) return true;
  return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 && ms <= MOTION_BOUNDS.maxDwellMs;
}

export function guardCheck(action: ActorAction): GuardVerdict {
  if (action.type === "say") {
    return { allowed: true, reason: "narration-only" };
  }
  // Dwell belongs to click-then-act steps only — carrying it anywhere
  // else is a malformed plan, refused before execution.
  if (action.type !== "click" && action.type !== "live_click") {
    if ((action as { dwellMs?: unknown }).dwellMs !== undefined) {
      return { allowed: false, reason: "bad-dwell" };
    }
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
  if (action.type === "drag") {
    // Both ends must be known, reachable, and touchable. Either end
    // unknown or forbidden fails the whole drag — a half-drag that
    // grabs and drops blind is worse than none. Checked before the
    // single-target resolution below (drag carries from/to, no target).
    const from = findTarget(action.from);
    const to = findTarget(action.to);
    if (!from) return { allowed: false, reason: `unknown-target:${action.from}` };
    if (!to) return { allowed: false, reason: `unknown-target:${action.to}` };
    if (isForbiddenKey(from.key)) return { allowed: false, reason: `forbidden-target:${from.key}` };
    if (isForbiddenKey(to.key)) return { allowed: false, reason: `forbidden-target:${to.key}` };
    return { allowed: true, reason: "registered-drag" };
  }
  if (action.type === "live_click" || action.type === "live_point" || action.type === "live_type" || action.type === "live_drag") {
    // Open-world actions resolve at runtime against the FRESH live
    // table (stamped indexes, verified labels). The guard checks shape
    // only: positive indexes, non-empty text. Refusals happen at resolve
    // time against live labels — this pure function cannot see them.
    const idx = action.type === "live_drag" ? [action.from, action.to] : [action.index];
    if (!idx.every((i) => typeof i === "number" && Number.isInteger(i) && i > 0)) {
      return { allowed: false, reason: "bad-live-index" };
    }
    if (action.type === "live_type" && (typeof action.text !== "string" || !action.text.trim())) {
      return { allowed: false, reason: "empty-text" };
    }
    if (!validDwell((action as { dwellMs?: unknown }).dwellMs)) {
      return { allowed: false, reason: "bad-dwell" };
    }
    return { allowed: true, reason: "live-action" };
  }
  if (action.type === "gesture") {
    // Expressive movement only: bounds come from the single capability
    // contract (checkGestureBounds). Anchor-key screening below still
    // applies for target-anchored gestures; index resolution (with
    // label + refusal checks) happens in the runner at resolve time.
    const bad = checkGestureBounds(action);
    if (bad) return { allowed: false, reason: `bad-gesture:${bad}` };
    if (typeof action.target === "string" && action.target && isForbiddenKey(action.target)) {
      return { allowed: false, reason: `forbidden-target:${action.target}` };
    }
    return { allowed: true, reason: "expressive-gesture" };
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
    if (!validDwell((action as { dwellMs?: unknown }).dwellMs)) {
      return { allowed: false, reason: "bad-dwell" };
    }
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
