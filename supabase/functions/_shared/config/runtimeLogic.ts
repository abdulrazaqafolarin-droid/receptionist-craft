/**
 * Runtime Logic Spec — the laws the engine enforces (Tier 1).
 *
 * These are not suggestions; the runtime applies them whether the plan
 * mentions them or not. The Configurator states them in plans so owners
 * understand WHY the operator behaves as it does — and never promises
 * behaviour that contradicts them.
 *
 * Includes the white-label theming flag (the ONLY visual dimension the
 * Configurator may plan: logo + primary colour per operator).
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface LogicDef {
  key: string;
  law: string; // one line, plain words
}

export const RUNTIME_LAWS: LogicDef[] = [
  { key: "greet_once", law: "The operator greets exactly once per session — never re-greets after the first message." },
  { key: "no_invention", law: "Prices, hours, and stock come from records only. Anything unproven stays null and is asked for, never guessed." },
  { key: "action_gate", law: "Booking and order tools fire only with all slots filled AND explicit visitor confirmation." },
  { key: "name_check", law: "Captured names are validated — greetings, pronouns, sentences, and profanity are rejected and re-asked." },
  { key: "intent_scoring", law: "Every visitor message scores 1-10 for buyer readiness; Money Mode engages at the operator's threshold and exits on disinterest." },
  { key: "money_mode", law: "Money Mode is sales behaviour (one clear next action, urgency on repeated hesitation, never ends without a CTA) — only for operators with something to sell or book." },
  { key: "memory_window", law: "Verbatim history keeps the last 30 messages; rolling summaries preserve decisions, details, and emotional state beyond that." },
  { key: "session_restore", law: "Reopening within 24h restores the full conversation." },
  { key: "compliance", law: "No medical, legal, or financial advice; sensitive topics escalate to the owner." },
  { key: "idempotency", law: "Double sends never double-book: idempotency keys dedupe appointments and orders at the database." },
];

export interface ThemingDef {
  key: string;
  means: string;
}

export const THEMING: ThemingDef[] = [
  { key: "white_label", means: "Per-operator branding: logo plus primary colour on the widget and owner dashboard. Stored as capabilities.ui_surface.theme {logo_url, primary_color}. Colours and typefaces beyond these two NEVER vary — the design system owns them." },
];

/** Build the runtime-logic block injected into the file-drop bundle. */
export function buildLogicPrompt(): string {
  const lawLines = RUNTIME_LAWS.map((l) => `- ${l.key}: ${l.law}`).join("\n");
  const themeLines = THEMING.map((t) => `- ${t.key}: ${t.means}`).join("\n");
  return `=== RUNTIME LAWS (enforced by the engine whether plans mention them or not) ===
${lawLines}

Theming (the ONLY visual dimension you may plan):
${themeLines}

LOGIC RULES:
1. State these laws in plans so owners understand behaviour — never promise behaviour that contradicts them.
2. Money Mode appears in ui_plan ONLY with the booking, ordering, or payments tag.
3. Theming is logo + primary colour or nothing. Never invent palettes, fonts, or spacing.`;
}
