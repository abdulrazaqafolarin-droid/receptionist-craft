/**
 * Action Spec — the verbs the platform can execute (Tier 1).
 *
 * Every will_do promise the Configurator makes must map to one of these
 * actions. If no action covers a promised outcome, the promise is invalid
 * and belongs in wont_do instead. This is the HONEST CONTRACT, enforced
 * as data rather than prose.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface ActionDef {
  key: string; // stable verb key used in reasoning
  label: string;
  does: string; // the business outcome, one line
  hook: string; // where the platform executes it (engine, module, RPC, cron)
  needsTag: string[]; // relevance tags (surfaceManifest vocabulary) or ["always"]
}

export const ACTIONS: ActionDef[] = [
  // Conversational
  { key: "answer", label: "Answer questions", does: "Answers from knowledge_base + FAQs.", hook: "widget-chat layers (identity/knowledge/memory)", needsTag: ["always"] },
  { key: "draft", label: "Draft content", does: "Ideas, captions, checklists, documents.", hook: "contentGeneration / documentGeneration modules", needsTag: ["content"] },
  { key: "remind", label: "Send reminders", does: "Appointment reminders and posting nudges.", hook: "reminder cron (setup-reminder-cron, appointment-reminder-runner, send-reminder)", needsTag: ["booking", "content"] },
  // Transactional
  { key: "book", label: "Book appointments", does: "Full SERVICE flow to a confirmed booking.", hook: "booking flow + create_widget_appointment RPC", needsTag: ["booking"] },
  { key: "order", label: "Take orders", does: "Full PRODUCT flow to a confirmed order.", hook: "ordering flow + create_widget_order RPC", needsTag: ["ordering"] },
  { key: "capture_lead", label: "Capture leads", does: "Name + contact stored for follow-up.", hook: "lead flow + customers table", needsTag: ["customers"] },
  { key: "escalate", label: "Hand off to human", does: "Escalation recorded, owner notified.", hook: "escalation flow + create-notification", needsTag: ["customers"] },
  { key: "collect_payment", label: "Collect payment", does: "Deposits and checkout links.", hook: "create-payment-intent + stripe/paystack connectors", needsTag: ["payments", "connected"] },
  // Growth & retention (module-backed)
  { key: "recover_payment", label: "Recover payments", does: "Chases unpaid invoices and deposits.", hook: "invoiceFollowUp module", needsTag: ["payments"] },
  { key: "win_back", label: "Win back visitors", does: "No-show and no-visit-30d texts.", hook: "smsCampaign module + twilio_sms connector", needsTag: ["booking", "ordering", "connected"] },
  { key: "manage_reviews", label: "Manage reviews", does: "Monitors reviews, drafts replies.", hook: "reviewManagement module + reviews connectors", needsTag: ["customers", "connected"] },
  { key: "run_referrals", label: "Run referrals", does: "Codes, conversion tracking, analytics.", hook: "referralProgram module", needsTag: ["ordering", "customers"] },
  { key: "survey", label: "Survey visitors", does: "Sends surveys, analyses satisfaction.", hook: "customerFeedback module", needsTag: ["customers"] },
  { key: "remember_customer", label: "Remember customers", does: "Repeat-visitor memory across conversations.", hook: "conversation_state + conversation_summaries", needsTag: ["customers"] },
  { key: "digest", label: "Report performance", does: "Plain-language analytics digest.", hook: "analyticsDigest module", needsTag: ["booking", "ordering", "customers"] },
  { key: "sync_calendar", label: "Sync calendar", does: "Two-way external calendar sync.", hook: "calendarSync module + calendar connectors", needsTag: ["booking", "connected"] },
  // Explicitly OUT OF REACH (never promise these — no hook exists)
  { key: "auto_post", label: "Auto-post to social", does: "NO HOOK — publishing needs a connected account and owner review.", hook: "none (connector-gated future)", needsTag: [] },
  { key: "move_money", label: "Move money / refunds", does: "NO HOOK — the platform never moves money on its own.", hook: "none", needsTag: [] },
  { key: "access_accounts", label: "Access outside accounts", does: "NO HOOK — reads/writes outside accounts only via connected connectors.", hook: "none (connector-gated)", needsTag: [] },
];

/** Actions the platform can execute today (excludes the no-hook trio). */
export function executableActions(): ActionDef[] {
  return ACTIONS.filter((a) => !a.hook.startsWith("none"));
}

/** Build the actions block injected into the file-drop bundle. */
export function buildActionsPrompt(): string {
  const lines = ACTIONS.map(
    (a) => `- ${a.key}: ${a.does} [executes via: ${a.hook}; when: ${a.needsTag.length ? a.needsTag.join("|") : "NEVER — no hook"}]`,
  ).join("\n");
  return `=== ACTIONS (the verbs the platform executes — will_do must map here) ===
${lines}

ACTION RULES:
1. Every will_do item must trace to an action above with matching tags. No trace = move it to wont_do.
2. The no-hook trio (auto_post, move_money, access_accounts) is NEVER promised as done — at most named in external_needs with the connector that would unlock it.
3. Prefer fewer, truer promises over an impressive list.`;
}
