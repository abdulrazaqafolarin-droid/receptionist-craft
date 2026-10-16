/**
 * Local command parser — Bluey's lesson: movement never waits on network.
 *
 * Obvious in-app orders ("click X", "go to Y") execute straight through
 * the local ride with zero gateway round-trip: no latency, no quota,
 * and they keep working when the brain is unreachable. Strict by
 * design — it must START with an imperative verb and match a real
 * anchor or route, or it returns null and the chat goes to the brain.
 * A non-match is never an error; vagueness belongs to the brain.
 *
 * Pure: no DOM, no network. Unit-tested in actorEngine.test.ts.
 */

import { ACTOR_TARGETS } from "./actorMap";
import { OWNER_PAGES } from "../../supabase/functions/_shared/config/surfaceManifest";

export type LocalCommand =
  | { kind: "click"; target: string; label: string }
  | { kind: "goto"; route: string; label: string };

const CLICK_RES = /^(clicks|click|taps|tap|presses|press|hits|hit|selects|select)\b/i;
const GOTO_RES = /^(goes to|go to|goto|opens|open|shows|show|take me to|navigate to|bring me to)\b/i;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

/**
 * Singular stems for forgiving matching ("operators" → "operator",
 * "services" → "service"). Guarded endings (ss/us/is/ics) so real words
 * like "analytics" or "settings" never get mangled — the original word
 * is always tried first.
 */
function stems(w: string): string[] {
  const out = [w];
  if (w.length > 4) {
    if (w.endsWith("ies")) out.push(`${w.slice(0, -3)}y`);
    else if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) out.push(w.slice(0, -2));
    else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) {
      out.push(w.slice(0, -1));
    }
  }
  return out;
}

/** Every significant word (>3 chars) of `need` appears in `hay` (stems allowed). */
function covers(hay: string, need: string): boolean {
  const h = ` ${hay.toLowerCase()} `;
  const sig = words(need).filter((w) => w.length > 3);
  if (sig.length === 0) return false;
  return sig.every((w) => stems(w).some((s) => h.includes(s)));
}

/** Route matching ignores the filler word "page" ("the X page" means the X route). */
function coversRoute(hay: string, need: string): boolean {
  const h = ` ${hay.toLowerCase()} `;
  const sig = words(need).filter((w) => w.length > 3 && w !== "page" && w !== "pages");
  if (sig.length === 0) return false;
  return sig.every((w) => stems(w).some((s) => h.includes(s)));
}

function stripVerb(text: string, re: RegExp): string {
  return text.replace(re, "").replace(/^(on|the|a|an|to|me|that|this)\b\s*/i, "").trim();
}

/**
 * Extract the raw click phrase for transient perception. This does not match
 * a registry anchor or route; it only preserves what the owner asked to
 * click so the current page can be observed and decided at runtime.
 */
export function extractClickPhrase(text: string): string | null {
  const clean = text.trim();
  if (!clean || !CLICK_RES.test(clean)) return null;
  const phrase = stripVerb(clean, CLICK_RES);
  return phrase || null;
}

// Non-strict movement verbs: found ANYWHERE for natural phrasing ("please
// click the availability page"). Strict leading-verb matching stays above;
// this is the understanding lane, not the feeding lane.
const MOVEMENT_RES = /(clicks|click|taps|tap|presses|press|hits|hit|selects|select|closes|close|collapses|collapse|expands|expand|toggles|toggle|goes to|go to|goto|opens|open|shows|show|take me to|navigate to|bring me to)\b/i;
const LEAD_FILLER_RES = /^(on|the|a|an|to|me|that|this|please|for|you|now|it|my)\b\s*/i;
const TRAIL_FILLER_RES = /\s*\b(for me|for you|please|now|right now|thanks|thank you)\s*$/i;
const NEGATION_RES = /(n'?t|never|stop|not)\b/i;

/**
 * Find a movement target in natural phrasing. Returns the cleaned noun
 * phrase after the first movement verb, or null when there is no verb, no
 * phrase, or the verb is negated ("don't click cancel" never acts).
 */
export function extractMovementTarget(text: string): string | null {
  const m = MOVEMENT_RES.exec(text);
  if (!m || m.index === undefined) return null;
  if (NEGATION_RES.test(text.slice(0, m.index))) return null;
  let phrase = text.slice(m.index + m[0].length).trim();
  if (!phrase) return null;
  let prev = "";
  while (prev !== phrase) {
    prev = phrase;
    phrase = phrase.replace(LEAD_FILLER_RES, "").trim();
  }
  phrase = phrase.replace(TRAIL_FILLER_RES, "").trim();
  phrase = phrase.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  return phrase || null;
}

/**
 * Split a movement target on conjunctions ("A and B", "A, B") so one
 * message can drive several targets. Capped at 3 — more is a plan,
 * not an instruction. Returns single-element for plain targets.
 */
export function splitTargets(phrase: string): string[] {
  return phrase
    .split(/\s+and\s+|\s*&\s*|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Match a raw phrase against anchors first, then routes. No verb needed —
 * the caller already knows this is movement intent.
 */
export function matchAnchorOrRoute(phrase: string, includeAnchors = true): LocalCommand | null {
  if (!phrase) return null;
  if (includeAnchors) {
    let best: { key: string; label: string; score: number } | null = null;
    for (const t of ACTOR_TARGETS) {
      const hay = `${t.key.replace(/[-_]/g, " ")} ${t.label}`;
      if (!covers(hay, phrase)) continue;
      const score = words(phrase).filter((w) => w.length > 3).length;
      if (!best || score > best.score) best = { key: t.key, label: t.label, score };
    }
    if (best) return { kind: "click", target: best.key, label: best.label };
  }
  let bestRoute: { route: string; label: string; score: number } | null = null;
  for (const p of OWNER_PAGES) {
    const hay = `${p.key.replace(/[-_]/g, " ")} ${p.label} ${p.route}`;
    if (!coversRoute(hay, phrase)) continue;
    const score = words(phrase).filter((w) => w.length > 3).length;
    if (!bestRoute || score > bestRoute.score) bestRoute = { route: p.route, label: p.label, score };
  }
  if (bestRoute) return { kind: "goto", route: bestRoute.route, label: bestRoute.label };
  return null;
}

/**
 * Try to resolve an imperative instruction locally. Anchors first for
 * click verbs (with route fallback — "click on Analytics" means go),
 * routes for goto verbs. Null = ask the brain.
 */
export function parseLocalCommand(text: string): LocalCommand | null {
  const clean = text.trim();
  if (!clean) return null;
  const isClick = CLICK_RES.test(clean);
  const isGoto = GOTO_RES.test(clean);
  if (!isClick && !isGoto) return null;

  if (isClick) {
    const phrase = stripVerb(clean, CLICK_RES);
    if (phrase) {
      // Anchors first, route fallback ("click on Analytics" means go).
      const hit = matchAnchorOrRoute(phrase, true);
      if (hit) return hit;
    }
    // Fall through to route match below.
  }
  const phrase = isGoto ? stripVerb(clean, GOTO_RES) : stripVerb(clean, CLICK_RES);
  if (!phrase) return null;
  return matchAnchorOrRoute(phrase, false);
}

export type LocalGestureCommand = {
  kind: "oscillate" | "circle";
  target: string;
  label: string;
};

/**
 * Resolve explicit, anchored cursor gestures locally. The target must match
 * a registered UI anchor; unanchored requests fall through to the Director
 * so it can clarify rather than guessing where to move the cursor.
 */
export function parseLocalGestureCommand(text: string): LocalGestureCommand | null {
  const clean = text.trim();
  if (!clean || !/\b(cursor|mouse|pointer)\b/i.test(clean)) return null;

  const verb = /\b(wiggle|wriggle|oscillate|circle)\b/i.exec(clean);
  if (!verb || verb.index === undefined) return null;
  if (NEGATION_RES.test(clean.slice(0, verb.index))) return null;

  const kind = /^circle$/i.test(verb[0]) ? "circle" : "oscillate";
  const remainder = clean.slice(verb.index + verb[0].length);
  const targetMatch = /\b(?:at|around|over|on|near)\s+(?:the\s+)?(.+?)\s*$/i.exec(remainder);
  if (!targetMatch) return null;

  const targetPhrase = targetMatch[1]
    .replace(TRAIL_FILLER_RES, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (!targetPhrase) return null;

  // Require enough identifying words and exactly one registered anchor.
  // The general navigation matcher intentionally picks a best effort match;
  // gestures must not wiggle around the first of several plausible targets.
  const identifyingWords = words(targetPhrase).filter((word) => word.length > 3);
  if (identifyingWords.length < 2) return null;
  const candidates = ACTOR_TARGETS.filter((entry) =>
    covers(`${entry.key.replace(/[-_]/g, " ")} ${entry.label}`, targetPhrase)
  );
  if (candidates.length !== 1) return null;

  // Gestures are anchored movement only. Never translate a route into a
  // guessed DOM target, and never allow this parser to perform a click.
  const target = candidates[0];
  return { kind, target: target.key, label: target.label };
}
