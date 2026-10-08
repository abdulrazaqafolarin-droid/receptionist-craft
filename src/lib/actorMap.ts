/**
 * Actor map — where everything is.
 *
 * The operator is born with a map instead of needing Vision to find
 * buttons: every entry names a UI element the actor cursor may point at,
 * highlight, scroll to, or (later, behind confirm gates) click. Elements
 * opt in explicitly with data-actor attributes — unlisted UI is
 * unreachable by design, not by accident.
 *
 * Maintenance rule: adding actor-reachable UI means adding the attribute
 * AND registering it here. `scripts/verify-actor-map.mjs` checks both
 * directions in CI (registered keys exist in source; data-actor values in
 * source are registered, including template prefixes for dynamic keys).
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
}

export const ACTOR_TARGETS: ActorTarget[] = [
  // -- Connections page --
  { key: "connections-list", selector: '[data-actor="connections-list"]', label: "Connectors list", kind: "panel" },
  { key: "modules-list", selector: '[data-actor="modules-list"]', label: "Modules list", kind: "panel" },
  { key: "connect-google_reviews", selector: '[data-actor="connect-google_reviews"]', label: "Connect Google Reviews button", kind: "button" },
  { key: "connector-card-google_reviews", selector: '[data-actor="connector-card-google_reviews"]', label: "Google Reviews connector card", kind: "card" },
  // -- Operator Console --
  { key: "console-stock-check", selector: '[data-actor="console-stock-check"]', label: "Stock check button", kind: "button" },
  { key: "console-tasks-check", selector: '[data-actor="console-tasks-check"]', label: "Today's tasks button", kind: "button" },
  { key: "console-roster-check", selector: '[data-actor="console-roster-check"]', label: "Roster gaps button", kind: "button" },
  { key: "console-chat-input", selector: '[data-actor="console-chat-input"]', label: "Console chat input", kind: "input" },
  // -- Builder right panel --
  { key: "builder-tab-test", selector: '[data-actor="builder-tab-test"]', label: "Test tab", kind: "tab" },
  { key: "builder-tab-improve", selector: '[data-actor="builder-tab-improve"]', label: "Improve tab", kind: "tab" },
  { key: "builder-tab-live", selector: '[data-actor="builder-tab-live"]', label: "Live tab", kind: "tab" },
  { key: "builder-history", selector: '[data-actor="builder-history"]', label: "Change history button", kind: "button" },
];

/**
 * Template prefixes for dynamically-rendered keys (connector cards render
 * one per catalog entry: data-actor={`connect-${def.connector_key}`}). A
 * registered key matches when its literal attribute exists in source OR its
 * template prefix does — the CI check enforces this, so dynamic keys can
 * never silently lose their anchors.
 */
export const ACTOR_TEMPLATE_PREFIXES = ["connect-", "connector-card-", "builder-tab-"];

export function findTarget(key: string): ActorTarget | null {
  return ACTOR_TARGETS.find((t) => t.key === key) ?? null;
}
