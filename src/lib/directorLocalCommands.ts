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

const CLICK_RES = /^(click|tap|press|hit|select)\b/i;
const GOTO_RES = /^(go to|goto|open|show|take me to|navigate to|bring me to)\b/i;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

/** Every significant word (>3 chars) of `need` appears in `hay`. */
function covers(hay: string, need: string): boolean {
  const h = ` ${hay.toLowerCase()} `;
  const sig = words(need).filter((w) => w.length > 3);
  if (sig.length === 0) return false;
  return sig.every((w) => h.includes(w));
}

function stripVerb(text: string, re: RegExp): string {
  return text.replace(re, "").replace(/^(on|the|a|an|to|me|that|this)\b\s*/i, "").trim();
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
      let best: { key: string; label: string; score: number } | null = null;
      for (const t of ACTOR_TARGETS) {
        const hay = `${t.key.replace(/[-_]/g, " ")} ${t.label}`;
        if (!covers(hay, phrase)) continue;
        const score = words(phrase).filter((w) => w.length > 3).length;
        if (!best || score > best.score) best = { key: t.key, label: t.label, score };
      }
      if (best) return { kind: "click", target: best.key, label: best.label };
    }
    // Fall through to route match: "click on X" usually means go to X.
  }
  const phrase = isGoto ? stripVerb(clean, GOTO_RES) : stripVerb(clean, CLICK_RES);
  if (!phrase) return null;
  let bestRoute: { route: string; label: string; score: number } | null = null;
  for (const p of OWNER_PAGES) {
    const hay = `${p.key.replace(/[-_]/g, " ")} ${p.label} ${p.route}`;
    if (!covers(hay, phrase)) continue;
    const score = words(phrase).filter((w) => w.length > 3).length;
    if (!bestRoute || score > bestRoute.score) bestRoute = { route: p.route, label: p.label, score };
  }
  if (bestRoute) return { kind: "goto", route: bestRoute.route, label: bestRoute.label };
  return null;
}
