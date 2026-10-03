/**
 * State Spec — the lifecycles plans must respect (Tier 1).
 *
 * Three lifecycles: the operator itself, a plan moving to live, and a
 * visitor moving through a flow. A plan that ignores these (e.g. promising
 * edits to a live booking mid-confirm) is invalid no matter how nicely
 * worded.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface StateDef {
  key: string;
  sequence: string[]; // states in lifecycle order
  rule: string; // the constraint, one line
}

export const STATE_LIFECYCLES: StateDef[] = [
  {
    key: "operator",
    sequence: ["draft", "preview", "approved", "live", "paused"],
    rule: "Nothing reaches live without approval; paused stops all visitor traffic but keeps history.",
  },
  {
    key: "config_version",
    sequence: ["draft", "pending_approval", "approved", "superseded"],
    rule: "Exactly one approved version is live; rollback re-approves a prior version, never edits history.",
  },
  {
    key: "flow_position",
    sequence: ["idle", "selecting", "collecting", "confirming", "completed"],
    rule: "Tools (booking/order RPCs) fire ONLY at confirming with all slots filled plus explicit visitor confirmation.",
  },
  {
    key: "session",
    sequence: ["new", "active", "restored_24h", "expired"],
    rule: "Reopening within 24h restores the full conversation; older sessions start fresh but keep records.",
  },
  {
    key: "escalation",
    sequence: ["open", "acknowledged", "resolved"],
    rule: "Every escalation ends resolved or explicitly handed back — none stay open silently.",
  },
];

/** Build the states block injected into the file-drop bundle. */
export function buildStatesPrompt(): string {
  const lines = STATE_LIFECYCLES.map(
    (s) => `- ${s.key}: ${s.sequence.join(" -> ")}. Rule: ${s.rule}`,
  ).join("\n");
  return `=== STATES (lifecycles every plan must respect) ===
${lines}

STATE RULES:
1. Never promise an outcome that skips a lifecycle step (no live without approval, no booking without confirmation).
2. The action gate is absolute: tools blocked until slots filled AND visitor confirmed.`;
}
