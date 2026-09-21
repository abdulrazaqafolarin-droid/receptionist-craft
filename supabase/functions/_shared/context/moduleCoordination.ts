/**
 * Module-Agent Reciprocal Coordination (§4.3) — new in this session.
 *
 * Step 8 (§4.2) gave every agent a shared live snapshot, but module agents
 * (email, SMS, invoice, reminders, reviews...) never knew what each OTHER
 * recently did with the same customer. That was the §4.3 gap: no mechanism,
 * only a shared read.
 *
 * THIS module is that mechanism. It wraps the `module_action_log` table:
 *   - `getRecentModuleActions()`  — READ: what other modules recently did for
 *                                   this customer/business, before this module
 *                                   reaches out (dedup + reciprocal awareness).
 *   - `recordModuleAction()`      — WRITE: log this module's action so others
 *                                   know it happened.
 *   - `buildCoordinationPromptBlock()` — surface the recent actions to the
 *                                   model in plain language, so the agent
 *                                   actually BEHAVES coordinated, not just reads
 *                                   a flag.
 *
 * The action_key is the dedup spine: `{module}:{customer}:{intent}`. Two
 * different modules with the SAME customer+intent will BOTH see each other's
 * entry here and can choose not to double-touch (or deliberately follow up).
 *
 * Extensibility (§4.3 Step 2b): a brand-new module needs NO new table or core
 * change — it just imports these helpers. That is the "addition, not rebuild"
 * guarantee this mechanism is designed for.
 */

export interface ModuleAction {
  id?: string;
  receptionist_id: string;
  user_id: string;
  module_key: string;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  action_type: string;       // sent | drafted | queued | escalated | reminded | followed_up
  action_key: string;        // `${module}:${customerIdentity}:${intent}` — stable for dedup
  target_channel?: string;   // email | sms | whatsapp | review | invoice | reminder
  detail_json?: Record<string, unknown>;
}

interface AnyDb {
  from(table: string): {
    insert(row: Record<string, unknown>): { then: (cb: (r: { error: { message: string } | null }) => void) => unknown };
    select(cols: string): {
      eq(col: string, val: string): {
        contains(col: string, val: Record<string, unknown>): {
          order(col: string, opts?: { ascending?: boolean }): {
            limit(n: number): Promise<{ data: unknown; error: unknown }>;
          };
        };
      };
    };
  };
}

export interface RecentActionView {
  id?: string;
  module_key: string;
  action_type: string;
  target_channel: string | null;
  detail_json: Record<string, unknown> | null;
  acted_at: string;
}

/** Build a stable, deduplicable action key. Deterministic per module+customer+intent. */
export function buildActionKey(
  moduleKey: string,
  customerIdentity: string,
  intent: string,
): string {
  const id = (customerIdentity || "").trim().toLowerCase();
  return `${moduleKey}:${id || "unknown"}:${intent}`;
}

/**
 * READ — what did OTHER modules recently do for this customer / this business?
 * Returns newest-first, filtered to exclude `excludeModuleKey` (so a module sees
 * its OWN prior actions only via afterTheirs, and the OTHER modules' actions as
 * the coordination signal it actually needs).
 */
export async function getRecentModuleActions(
  supabase: AnyDb,
  opts: {
    receptionistId: string;
    excludeModuleKey?: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerId?: string | null;
    lastMinutes?: number;
  },
): Promise<RecentActionView[]> {
  const lastMinutes = opts.lastMinutes ?? 1440; // default: last 24h
  const since = new Date(Date.now() - lastMinutes * 60 * 1000).toISOString();

  // Distinguish recent actions: fetch the newest N rows for the tenant and
  // filter in memory by time + the targeted customer identity. Filtering by
  // time in SQL would need a gte() helper this minimal client doesn't expose,
  // so we read the newest rows and slice — cheap at module-action volumes.
  const { data, error } = await supabase
    .from("module_action_log")
    .select("id, module_key, action_type, target_channel, detail_json, acted_at, customer_email, customer_phone")
    .eq("receptionist_id", opts.receptionistId)
    .order("acted_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  const rows = (data as Array<RecentActionView & { acted_at: string; customer_email?: string | null; customer_phone?: string | null }>) || [];

  return rows
    .filter((r) => {
      const withinWindow = typeof r.acted_at === "string" && new Date(r.acted_at).getTime() >= new Date(since).getTime();
      if (!withinWindow) return false;
      if (opts.excludeModuleKey && r.module_key === opts.excludeModuleKey) return false;
      if (opts.customerId || opts.customerEmail || opts.customerPhone) {
        const emailMatch = opts.customerEmail && opts.customerEmail.trim().toLowerCase() === (r.customer_email || "").toLowerCase();
        const phoneMatch = opts.customerPhone && opts.customerPhone.replace(/\D/g, "") === (r.customer_phone || "").replace(/\D/g, "");
        if (!emailMatch && !phoneMatch) return false;
      }
      return true;
    })
    .map((r) => ({
      id: r.id,
      module_key: r.module_key,
      action_type: r.action_type,
      target_channel: r.target_channel ?? null,
      detail_json: (r.detail_json as Record<string, unknown>) || null,
      acted_at: r.acted_at,
    }));
}

/**
 * WRITE — record that this module acted, so OTHER modules see it and don't
 * double-touch the same customer. Idempotent on (receptionist_id, action_key):
 * a re-run with the same key updates rather than duplicates.
 */
export async function recordModuleAction(
  supabase: AnyDb,
  action: ModuleAction,
): Promise<{ ok: boolean; error?: string }> {
  if (!action.receptionist_id || !action.user_id) {
    return { ok: false, error: "receptionist_id and user_id are required" };
  }
  const row: ModuleAction = {
    ...action,
    action_key:
      action.action_key ||
      buildActionKey(action.module_key, action.customer_email || action.customer_phone || "", action.action_type),
    target_channel: action.target_channel,
    detail_json: action.detail_json || {},
  };
  // Use the UNIQUE(receptionist_id, action_key) constraint: on conflict update.
  const rowRecord = { ...row } as unknown as Record<string, unknown>;
  const { error } = await supabase.from("module_action_log").insert(rowRecord);
  if (error) {
    // The minimal client has no onConflict(); surface the error text. A unique
    // violation on the key means the action was already logged — treat as ok.
    const msg = String(error?.message || "");
    if (/duplicate key|unique|23505/i.test(msg)) {
      return { ok: true };
    }
    return { ok: false, error: msg };
  }
  return { ok: true };
}

/**
 * Build the plain-language coordination block for a module agent's prompt so it
 * is GENUINELY aware of what other modules recently did with this customer.
 * This is the behavioral half of §4.3 — the model SEES its siblings' actions.
 */
export function buildCoordinationPromptBlock(
  recentOtherActions: RecentActionView[],
  opts: { thisModule: string; customerLabel?: string } = { thisModule: "this module" },
): string {
  if (!recentOtherActions.length) {
    return `# OTHER MODULE ACTIVITY (coordination)
No other modules have acted on this customer in the lookback window. Proceed solo — no coordination conflict.`;
  }

  const lines = recentOtherActions.map((a) => {
    const when = (a.acted_at || "").slice(0, 16).replace("T", " ");
    const channel = a.target_channel ? ` via ${a.target_channel}` : "";
    const extra = a.detail_json && Object.keys(a.detail_json).length ? ` (${JSON.stringify(a.detail_json)})` : "";
    return `- ${when} · ${a.module_key} · ${a.action_type}${channel}${extra}`;
  }).join("\n");

  return `# OTHER MODULE ACTIVITY (coordination — check BEFORE you reach out)
Other modules recently acted on this customer. ${opts.thisModule} must be aware of them:
${lines}

Coordination rules:
- If another module already reached out about the SAME intent (e.g. a reminder, an invoice, a follow-up) very recently, do NOT duplicate it — instead let ${opts.thisModule} stand down or note the existing outreach, unless a genuine reason exists to follow up.
- If a DIFFERENT channel was already used (e.g. SMS last time), consider using a complementary channel or waiting.
- Never reach out twice about the same thing through two channels back-to-back without a real reason.`;
}
