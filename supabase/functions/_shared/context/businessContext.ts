/**
 * Shared Business-State Context (Step 8 / §4.2 + §4.4)
 *
 * A single, canonical, live snapshot of a business's current operational state
 * that EVERY AI agent reads before acting — the Responder (widget-chat), the
 * Configurator (propose-operator-plan / request-change), and future module
 * agents. Built fresh at the moment of use (never from a stale cached flag).
 *
 * Sources (all queried live):
 *   - receptionists row           (passed in by caller — already loaded)
 *   - config_versions            (latest config_json = full operations_config)
 *   - connectors + defs          (live connector/tier state, keyed by user_id)
 *   - integrations               (live payment provider rows, keyed by user_id)
 *   - conversion_events          (cheap recent-activity summary)
 *
 * Implements the §4.4 verified behavior: the Responder MUST NOT offer/send a
 * payment link unless `payment.canCollectPayments` is actually true.
 */

export type PaymentReadiness = {
  canCollectPayments: boolean;   // a payment provider is live & enabled
  canGenerateLinks: boolean;     // tier >= 2 (links available even if not autonomous)
  autonomous: boolean;           // tier 1 (collects/processes automatically)
  provider: string | null;       // "stripe" | "paystack" | null
  connector_tier: number;        // 1 | 2 | 3
  source: "connector" | "integration" | "none";
};

export interface ConnectorState {
  connector_key: string;
  display_name: string | null;
  category: string;
  status: string;
  current_tier: number;
}

export interface BusinessStateSnapshot {
  receptionistId: string;
  userId: string;
  businessName: string | null;
  businessType: string | null;
  capabilities: Record<string, unknown>;
  aiMode: string | null;
  latestOperationsConfig: Record<string, unknown> | null;
  configVersionNumber: number | null;
  payment: PaymentReadiness;
  connectors: ConnectorState[];
  openNow: boolean | null;
  recentActivity: {
    last24hConversations: number;
    last24hBookings: number;
    last24hOrders: number;
    last24hRevenue: number;
  };
  generatedAt: string;
}

const PAYMENT_CATEGORY = "payments";
const PAYMENT_INTEGRATION_TYPES = ["stripe", "paystack"];

interface AnyDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string | number | boolean): any;
      order(col: string, opts?: { ascending?: boolean }): any;
      limit(n: number): any;
      maybeSingle(): any;
    };
  };
}

/**
 * Build the live business-state snapshot. This is the single entry point every
 * agent calls before acting. Queries are fetched fresh on every call.
 */
export async function buildBusinessContext(
  supabase: AnyDb,
  opts: {
    receptionist: Record<string, any>;
    includeRecentActivity?: boolean;
  },
): Promise<BusinessStateSnapshot> {
  const receptionist = opts.receptionist || {};
  const receptionistId = String(receptionist.id || "");
  const userId = String(receptionist.user_id || "");

  // 1. Canonical capabilities from the receptionist row (with safe defaulting)
  const capabilities = normalizeCapabilities(receptionist.capabilities);

  // 2. Latest operations_config — the full config lives ONLY in config_versions
  let latestOperationsConfig: Record<string, unknown> | null = null;
  let configVersionNumber: number | null = null;
  if (receptionistId) {
    const { data: latest } = await supabase
      .from("config_versions")
      .select("config_json, version_number")
      .eq("receptionist_id", receptionistId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && latest.config_json) {
      latestOperationsConfig = latest.config_json as Record<string, unknown>;
      configVersionNumber = (latest.version_number as number) || null;
    }
  }

  // 3. Live connector state (keyed by user_id) — NOT a cached flag
  let connectors: ConnectorState[] = [];
  if (userId && userId !== "00000000-0000-0000-0000-000000000000") {
    const { data } = await supabase
      .from("connectors")
      .select("connector_key, display_name, category, status, current_tier")
      .eq("user_id", userId);
    connectors = (data as ConnectorState[]) || [];
  }

  // 4. Payment readiness — derive from BOTH connectors and integrations
  const paymentConnectors = connectors.filter((c) => c.category === PAYMENT_CATEGORY);
  const tier = paymentConnectors.length ? Math.min(...paymentConnectors.map((c) => c.current_tier)) : 3;
  const liveConnector = paymentConnectors
    .slice()
    .sort((a, b) => a.current_tier - b.current_tier)[0];

  // integrations (payments) — live provider rows
  let integrationProvider: string | null = null;
  let integrationEnabled = false;
  if (userId && userId !== "00000000-0000-0000-0000-000000000000") {
    try {
      const { data: ints } = await supabase
        .from("integrations")
        .select("type, enabled")
        .eq("user_id", userId);
      const paymentInts = ((ints as Array<{ type: string; enabled: boolean }>) || []).filter(
        (i) => i.enabled && PAYMENT_INTEGRATION_TYPES.includes(String(i.type).toLowerCase()),
      );
      if (paymentInts.length) {
        integrationProvider = String(paymentInts[0].type).toLowerCase();
        integrationEnabled = true;
      }
    } catch {
      // integrations may not be relevant for some tenants; treat as none
    }
  }

  const provider = (liveConnector?.connector_key ?? integrationProvider) || null;
  const source: PaymentReadiness["source"] =
    liveConnector ? "connector" : integrationProvider ? "integration" : "none";
  const canCollectPayments = tier === 1 || integrationEnabled;
  const canGenerateLinks = tier <= 2 || integrationEnabled;

  const payment: PaymentReadiness = {
    canCollectPayments,
    canGenerateLinks,
    autonomous: tier === 1,
    provider,
    connector_tier: tier,
    source,
  };

  // 5. Open now — derived from operations_config hours when present (best effort)
  const openNow = deriveOpenNow(latestOperationsConfig);

  // 6. Recent activity (cheap) — optional
  const recentActivity = {
    last24hConversations: 0,
    last24hBookings: 0,
    last24hOrders: 0,
    last24hRevenue: 0,
  };
  if (opts.includeRecentActivity !== false && receptionistId) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await supabase
        .from("conversion_events")
        .select("event_type, revenue_value")
        .eq("receptionist_id", receptionistId);
      const list = (events as Array<{ event_type: string; revenue_value?: number }>) || [];
      for (const e of list) {
        if (e.event_type === "conversation" || e.event_type === "message") recentActivity.last24hConversations++;
        else if (e.event_type === "booking" || e.event_type === "appointment") recentActivity.last24hBookings++;
        else if (e.event_type === "order" || e.event_type === "sale") recentActivity.last24hOrders++;
        if (typeof e.revenue_value === "number") recentActivity.last24hRevenue += e.revenue_value;
      }
    } catch {
      // non-fatal
    }
  }

  return {
    receptionistId,
    userId,
    businessName: receptionist.business_name || receptionist.name || null,
    businessType: receptionist.business_type || null,
    capabilities,
    aiMode: receptionist.ai_mode || null,
    latestOperationsConfig,
    configVersionNumber,
    payment,
    connectors,
    openNow,
    recentActivity,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeCapabilities(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  return {};
}

function deriveOpenNow(config: Record<string, unknown> | null): boolean | null {
  if (!config) return null;
  const hours = (config as any).hours || (config as any).operating_hours;
  if (!hours || typeof hours !== "object") return null;
  try {
    const now = new Date();
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const day = dayNames[now.getDay()];
    const entry = (hours as Record<string, any>)[day] || (hours as Record<string, any>)[now.getDay()];
    if (!entry) return null;
    const openStr = String(entry.open ?? entry.start ?? entry.from ?? "").toLowerCase();
    const closeStr = String(entry.close ?? entry.end ?? entry.to ?? "").toLowerCase();
    if (!openStr || !closeStr) return null;
    const toMinutes = (hm: string) => {
      const m = hm.split(":")[0];
      return parseInt(m, 10);
    };
    const nowH = now.getHours();
    const openH = toMinutes(openStr);
    const closeH = toMinutes(closeStr);
    return nowH >= openH && nowH < closeH;
  } catch {
    return null;
  }
}

/**
 * Render the live-state block for the Responder's system prompt. Includes the
 * NON-NEGOTIABLE payment rule so the Responder never promises a payment link it
 * cannot actually deliver (the §4.4 verified scenario).
 */
export function buildLiveStatePromptBlock(
  snapshot: BusinessStateSnapshot,
  opts: { channel?: string } = {},
): string {
  const channel = (opts.channel || "widget").toUpperCase();

  const paymentLine = snapshot.payment.canCollectPayments
    ? `Payment collection is LIVE via ${String(snapshot.payment.provider || "the configured provider").toUpperCase()}.`
    : "Payment collection is NOT configured. You cannot send or promise a payment link or collect payment.";

  const paymentRule = snapshot.payment.canCollectPayments
    ? `You MAY offer to send a payment link when appropriate (autonomous: ${snapshot.payment.autonomous}).`
    : "NON-NEGOTIABLE: If a customer asks to pay or requests a payment link, tell them the payment step is being set up / to confirm with the business directly. NEVER imply a payment can be completed online if the business cannot actually collect it.";

  const openLine =
    snapshot.openNow === null
      ? "Open-now status: unknown (no hours configured)."
      : snapshot.openNow
        ? "The business is OPEN right now."
        : "The business is currently CLOSED.";

  return `#   LIVE BUSINESS STATE (checked at the moment of this message — source of truth)
Channel: ${channel}
Business: ${snapshot.businessName || "Unknown"} (${snapshot.businessType || "unspecified type"})
Mode: ${snapshot.aiMode ? snapshot.aiMode.toUpperCase() : "n/a"}
Config version: ${snapshot.configVersionNumber ?? "none"}
${openLine}
Payment: ${paymentLine}
${paymentRule}`;
}
