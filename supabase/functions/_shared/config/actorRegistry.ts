/**
 * Actor registry — single source of truth for actor-reachable UI.
 *
 * Both the frontend (actorMap.ts re-exports this) and the edge planner
 * validator (actorPlan.ts) read these exact entries, so the model can
 * never propose a tour step the UI does not have — and the UI can never
 * drop an anchor the planner still references. The CI actor-map check
 * pins the data-actor attributes to the same list.
 *
 * Deno-safe: ASCII only, no imports, no Node APIs.
 */

export type ActorTargetKind = "button" | "card" | "input" | "panel" | "tab";

export interface ActorTarget {
  /** Stable key used in action scripts, e.g. "connect-google_reviews". */
  key: string;
  /** CSS selector that resolves it. Exact data-actor match, never fuzzy. */
  selector: string;
  /** Plain words for narration and receipts. */
  label: string;
  kind: ActorTargetKind;
  /**
   * Dangerous elements (delete, send, publish, pay, credentials, logout)
   * always require an inline owner confirm before a click. Nothing in the
   * pilot set is dangerous — the flag and its gate ship first anyway.
   */
  dangerous?: boolean;
  /** One plain-words line for "what's this?" — business language, no jargon. */
  why?: string;
}

export const ACTOR_TARGETS: ActorTarget[] = [
  // -- Connections page --
  { key: "connections-list", selector: '[data-actor="connections-list"]', label: "Connectors list", kind: "panel", why: "Every outside service your operator can use — email, social, SMS, payments, calendar." },
  { key: "modules-list", selector: '[data-actor="modules-list"]', label: "Modules list", kind: "panel", why: "Capability modules you switch on one at a time, from leads to reviews." },
  { key: "connect-google_reviews", selector: '[data-actor="connect-google_reviews"]', label: "Connect Google Reviews button", kind: "button", why: "Starts the Google Reviews connection — your ratings get watched and answered." },
  { key: "connector-card-google_reviews", selector: '[data-actor="connector-card-google_reviews"]', label: "Google Reviews connector card", kind: "card", why: "Google Reviews: live status plus what monitoring unlocks." },
  // -- Operator Console --
  { key: "console-stock-check", selector: '[data-actor="console-stock-check"]', label: "Stock check button", kind: "button", why: "Scans your shelf records for low, out-of-stock, and expiring items." },
  { key: "console-tasks-check", selector: '[data-actor="console-tasks-check"]', label: "Today's tasks button", kind: "button", why: "Shows what is overdue, due today, and coming up — the chase list." },
  { key: "console-roster-check", selector: '[data-actor="console-roster-check"]', label: "Roster gaps button", kind: "button", why: "Checks who works when, flagging overlaps and uncovered days." },
  { key: "console-chat-input", selector: '[data-actor="console-chat-input"]', label: "Console chat input", kind: "input", why: "Ask your helper anything about the shop in plain words." },
  // -- Builder right panel --
  { key: "builder-tab-test", selector: '[data-actor="builder-tab-test"]', label: "Test tab", kind: "tab", why: "Rehearse as a customer would experience it — nothing here touches reality." },
  { key: "builder-tab-improve", selector: '[data-actor="builder-tab-improve"]', label: "Improve tab", kind: "tab", why: "Describe changes in words; they go live only on your approval." },
  { key: "builder-tab-live", selector: '[data-actor="builder-tab-live"]', label: "Live tab", kind: "tab", why: "Real customer conversations arriving right now, read-only." },
  { key: "builder-history", selector: '[data-actor="builder-history"]', label: "Change history button", kind: "button", why: "Every past build and change chat for this operator, resumable." },
];

/**
 * Template prefixes for dynamically-rendered keys (connector cards render
 * one per catalog entry: data-actor={`connect-${def.connector_key}`}).
 */
export const ACTOR_TEMPLATE_PREFIXES = ["connect-", "connector-card-", "builder-tab-"];

export function findActorTarget(key: string): ActorTarget | null {
  return ACTOR_TARGETS.find((t) => t.key === key) ?? null;
}
