/**
 * Actor plan validation (Phase 2c) — model proposes tours, code disposes.
 *
 * The Configurator may emit an optional actor_plan: a guided tour of the
 * operator's own surface. This validator runs deterministically on every
 * propose/change: unknown targets, forbidden shapes, and malformed steps
 * are REJECTED (listed in the trace); valid steps are sanitized (unknown
 * fields stripped, text capped). Dangerous clicks are KEPT but flagged —
 * the runner asks the owner live, so a plan can never pre-authorize harm.
 *
 * The planner's list is advisory. This function's output is what a tour
 * consumer may execute. Deno-safe: ASCII only, no Node APIs.
 */

import { ACTOR_TARGETS } from "./actorRegistry.ts";
import { OWNER_PAGES } from "./surfaceManifest.ts";

export type ActorStepType =
  | "point" | "click" | "highlight" | "scroll-to" | "say" | "showcase" | "collect" | "goto";

const KNOWN_TYPES: ActorStepType[] = [
  "point", "click", "highlight", "scroll-to", "say", "showcase", "collect", "goto",
];

const FORBIDDEN_PATTERNS = [
  /password/i,
  /credential/i,
  /\bsecret\b/i,
  /api[-_ ]?key/i,
  /logout|log-out|sign[-_ ]?out/i,
  /lock[-_ ]?(screen|computer)?/i,
  /delete[-_ ]?account/i,
  /force[-_ ]?quit/i,
];

const MAX_STEPS = 12;
const MAX_TEXT = 300;
const MAX_LINES = 5;

export interface ValidActorStep {
  type: ActorStepType;
  target?: string;
  route?: string;
  text?: string;
  title?: string;
  lines?: string[];
  ms?: number;
  connector_key?: string;
  say?: string;
  requiresConfirm: boolean;
}

export interface ActorPlanReport {
  valid: ValidActorStep[];
  rejected: Array<{ index: number; reason: string }>;
}

function capText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, MAX_TEXT);
  return t ? t : undefined;
}

function capLines(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, MAX_TEXT))
    .slice(0, MAX_LINES);
  return out.length > 0 ? out : undefined;
}

function forbiddenKey(key: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => p.test(key));
}

/**
 * Validate + sanitize a planner-supplied actor_plan. Never throws —
 * garbage in produces an empty valid list with reasons, never a crash.
 */
export function validateActorPlan(input: unknown): ActorPlanReport {
  const valid: ValidActorStep[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];
  if (input === undefined || input === null) return { valid, rejected };
  if (!Array.isArray(input)) {
    return { valid, rejected: [{ index: -1, reason: "actor_plan-not-an-array" }] };
  }
  const steps = input.slice(0, MAX_STEPS);
  if (input.length > MAX_STEPS) {
    rejected.push({ index: MAX_STEPS, reason: `actor_plan-capped-at-${MAX_STEPS}` });
  }
  steps.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      rejected.push({ index, reason: "step-not-an-object" });
      return;
    }
    const s = raw as Record<string, unknown>;
    if (typeof s.type !== "string" || !(KNOWN_TYPES as string[]).includes(s.type)) {
      rejected.push({ index, reason: `unknown-type:${String(s.type).slice(0, 40)}` });
      return;
    }
    const type = s.type as ActorStepType;
    if (type === "goto") {
      // Black-hole navigation: the destination must exist in the manifest.
      // A wrong turn strands the owner, so invented routes reject.
      const route = typeof s.route === "string" ? s.route.trim() : "";
      if (!route || !OWNER_PAGES.some((p) => p.route === route)) {
        rejected.push({ index, reason: `unknown-route:${route.slice(0, 60)}` });
        return;
      }
      valid.push({ type, route, say: capText(s.say), requiresConfirm: false });
      return;
    }
    if (type === "say") {
      const text = capText(s.text);
      if (!text) {
        rejected.push({ index, reason: "say-missing-text" });
        return;
      }
      valid.push({ type, text, requiresConfirm: false });
      return;
    }
    if (typeof s.target !== "string" || !s.target.trim()) {
      rejected.push({ index, reason: "step-missing-target" });
      return;
    }
    const target = s.target.trim();
    const known = ACTOR_TARGETS.some((t) => t.key === target) ||
      ["connect-", "connector-card-", "builder-tab-"].some((p) => target.startsWith(p));
    if (!known) {
      rejected.push({ index, reason: `unknown-target:${target.slice(0, 60)}` });
      return;
    }
    if (forbiddenKey(target)) {
      rejected.push({ index, reason: `forbidden-target:${target.slice(0, 60)}` });
      return;
    }
    const entry = ACTOR_TARGETS.find((t) => t.key === target);
    const requiresConfirm = entry?.dangerous === true;

    if (type === "showcase") {
      const lines = capLines(s.lines);
      const title = capText(s.title);
      if (!title || !lines) {
        rejected.push({ index, reason: "showcase-missing-title-or-lines" });
        return;
      }
      valid.push({ type, target, title, lines, say: capText(s.say), requiresConfirm });
      return;
    }
    if (type === "collect") {
      if (typeof s.connector_key !== "string" || !s.connector_key.trim()) {
        rejected.push({ index, reason: "collect-missing-connector_key" });
        return;
      }
      valid.push({ type, target, connector_key: s.connector_key.trim(), say: capText(s.say), requiresConfirm });
      return;
    }
    if (type === "highlight") {
      const ms = typeof s.ms === "number" && s.ms > 0 ? Math.min(Math.floor(s.ms), 5000) : undefined;
      valid.push({ type, target, ms, say: capText(s.say), requiresConfirm });
      return;
    }
    valid.push({ type, target, say: capText(s.say), requiresConfirm });
  });
  return { valid, rejected };
}

/** One-line inventory + rules for the Configurator prompt. */
export function buildActorPrompt(): string {
  const lines = ACTOR_TARGETS.map((t) => `- ${t.key} (${t.kind}): ${t.why || t.label}`).join("\n");
  return `=== GUIDED TOURS (ACTOR PLAN — OPTIONAL) ===
The operator can show itself: a cursor that points, highlights, opens showcase boxes, and presents real connection dialogs. Tours use ONLY these registered targets (dynamic connect-*/connector-card-*/builder-tab-* keys allowed):
${lines}

RULES:
1. actor_plan is OPTIONAL. Omit it when the operator needs no tour.
2. Max 12 steps. Narration (say) under 40 words per step, business language.
3. NEVER tour credentials, passwords, keys, logout, or deletion. NEVER invent a target — unlisted UI rejects your whole step.
4. Clicks only open dialogs, tabs, and panels (reversible). Anything destructive stays a human tap — flag it in reasoning_notes instead.
5. Showcase boxes describe connection chains (connector + module + retention) from this same manifest, never marketing copy.
6. A "goto" step rides the cursor to another page: route MUST be a manifest route below (OwnerPageDef route). Invented routes reject the step.`;
}
