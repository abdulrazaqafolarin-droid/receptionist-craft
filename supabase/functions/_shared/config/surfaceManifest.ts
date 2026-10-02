/**
 * Platform Surface Manifest — EVERYTHING the Configurator can assemble.
 *
 * manifest.ts covers the customer-facing engine (capabilities, widget
 * components, tables/RPCs). THIS file covers the rest of the platform the
 * Configurator must reason about when building an operator for a consumer:
 *
 *   1. OWNER PAGES      — all 41 app routes that make up the owner's dashboard
 * 2. CONNECTORS       — the 24-entry connector catalog (DB: connector_definitions)
 *   3. MODULES          — the 18 growth & operations modules in _shared/modules
 *   4. OPERATIONS       — OperationsConfig workflows, reminder cron, notifications
 *   5. RETENTION        — the follow-up / win-back / recovery toolkit
 *
 * Maintenance rule: when a page, connector, module, or workflow is added or
 * removed, update this file. `scripts/verify-surface-manifest.mjs` diffs the
 * OWNER_PAGES list against src/App.tsx routes and src/components/AppSidebar.tsx
 * nav items in CI, so drift fails the build instead of silently rotting.
 *
 * Deno-safe: ASCII only, no imports, no Node APIs.
 */

export type PageScope = "operator" | "account";

/** A relevance tag. A page/module is relevant only when its tags match the business. */
export type RelevanceTag =
  | "booking" // operator books appointments (availability, calendar, staff matter)
  | "ordering" // operator sells or delivers products (orders matter)
  | "customers" // customer-facing receptionist work (conversations, escalations matter)
  | "payments" // money moves (deposits, checkout, billing follow-up matter)
  | "staffed" // more than one human on the team (staff scheduling matters)
  | "connected" // an external connector is needed (connections page matters)
  | "content" // content/social helper work (review, content, social modules matter)
  | "always"; // relevant to every operator, no conditions

export interface OwnerPageDef {
  key: string; // stable key used in ui_surface.visible_pages
  route: string; // real route in src/App.tsx
  label: string; // sidebar label
  group: string; // sidebar group
  scope: PageScope; // operator = hideable per operator; account = never hidden
  requires: RelevanceTag[]; // relevance tags; ["always"] = every operator gets it
  why: string; // one line: when this page earns its place
}

export interface ConnectorDef {
  key: string; // connector_definitions.connector_key
  name: string;
  category: string; // email | sms | social | calendar | reviews | payments | storage | ads
  auth: "oauth" | "api_key" | "webhook" | "manual";
  unlocks: string; // one line: what becomes possible once connected
}

export interface ModuleDef {
  key: string; // file basename in _shared/modules (without .ts)
  label: string;
  does: string; // one line: the business outcome it produces
  needs: string[]; // connector keys required, or [] for internal-only
  when: RelevanceTag[]; // which business needs trigger it
  retention: boolean; // true = part of the retention toolkit
}

export interface OperationsPieceDef {
  key: string;
  kind: "workflow" | "cron" | "notification" | "schema";
  does: string;
  when: RelevanceTag[];
}

/** Owner pages. scope=account pages are NEVER hidden. requires drives show/hide. */
export const OWNER_PAGES: OwnerPageDef[] = [
  // -- Overview (home + revenue) --
  { key: "dashboard", route: "/dashboard", label: "Dashboard", group: "Overview", scope: "account", requires: ["always"], why: "Home base for every operator, no exceptions." },
  { key: "analytics", route: "/analytics", label: "Analytics", group: "Overview", scope: "operator", requires: ["booking", "ordering", "customers"], why: "Shows conversation and funnel numbers; pointless with no customer traffic." },
  { key: "money-mode", route: "/money-mode", label: "Money Mode", group: "Overview", scope: "operator", requires: ["booking", "ordering", "payments"], why: "Sales acceleration; only when something is actually being sold or booked." },
  { key: "meo-dashboard", route: "/meo-dashboard", label: "MEO Dashboard", group: "Overview", scope: "operator", requires: ["booking", "ordering", "payments"], why: "Revenue-leak analytics; needs a money flow to measure." },
  // -- Your Operator --
  { key: "operator-management", route: "/operator-management", label: "Operator Management", group: "Your Operator", scope: "account", requires: ["always"], why: "Managing the operator itself is always relevant." },
  { key: "services", route: "/services", label: "Products & Services", group: "Your Operator", scope: "operator", requires: ["booking", "ordering"], why: "The catalog behind bookings and orders; hide when there is nothing to sell or book." },
  { key: "availability", route: "/availability", label: "Availability", group: "Your Operator", scope: "operator", requires: ["booking"], why: "Schedule source of truth; meaningless without appointment booking." },
  { key: "staff", route: "/staff", label: "Staff", group: "Your Operator", scope: "operator", requires: ["booking", "staffed"], why: "Staff-specific scheduling; hide for solo operators with no booking." },
  { key: "faqs", route: "/faqs", label: "FAQs", group: "Your Operator", scope: "operator", requires: ["always"], why: "Every operator answers questions; FAQs always earn their place." },
  // -- Conversations --
  { key: "conversations", route: "/conversations", label: "Conversations", group: "Conversations", scope: "account", requires: ["always"], why: "The operator's output lives here; always visible." },
  { key: "quality-review", route: "/quality-review", label: "Quality Review", group: "Conversations", scope: "operator", requires: ["customers", "content"], why: "Review AI answers; relevant whenever the operator talks to customers or drafts content." },
  { key: "kb-rewrite", route: "/kb-rewrite", label: "KB Suggestions", group: "Conversations", scope: "operator", requires: ["always"], why: "Knowledge improvement suggestions help every operator stay accurate." },
  { key: "escalations", route: "/escalations", label: "Escalations", group: "Conversations", scope: "operator", requires: ["customers"], why: "Human handoff queue; only when customers are being served." },
  // -- Bookings --
  { key: "appointments", route: "/appointments", label: "Orders & Appointments", group: "Bookings", scope: "operator", requires: ["booking", "ordering"], why: "The fulfillment list; hide when nothing is booked or ordered." },
  { key: "calendar", route: "/calendar", label: "Calendar", group: "Bookings", scope: "operator", requires: ["booking"], why: "Visual schedule; needs appointment booking to exist." },
  // -- Customers --
  { key: "customers", route: "/customers", label: "Customers", group: "Customers", scope: "operator", requires: ["booking", "ordering", "customers"], why: "Customer records; hide for a pure back-office helper with no customer contact." },
  // -- Connections --
  { key: "channels", route: "/channels", label: "Channels", group: "Connections", scope: "operator", requires: ["customers"], why: "Widget/WhatsApp/phone setup; only when serving customers somewhere." },
  { key: "connections", route: "/connections", label: "Connections", group: "Connections", scope: "operator", requires: ["connected", "ordering", "content", "booking"], why: "External connectors (social, payments, calendar); show when a need exists." },
  // -- Account (never hidden) --
  { key: "organization", route: "/organization", label: "Organization", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "billing", route: "/billing", label: "Billing", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "notifications", route: "/notifications", label: "Notifications", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "diagnostics", route: "/diagnostics", label: "Diagnostics", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "realtime-logs", route: "/realtime-logs", label: "Realtime Logs", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "settings", route: "/settings", label: "Settings", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
  { key: "help", route: "/help", label: "Help", group: "Account", scope: "account", requires: ["always"], why: "Account-level, never hidden." },
];

/** The 24-entry connector catalog (mirrors connector_definitions seed migration). */
export const CONNECTORS: ConnectorDef[] = [
  { key: "gmail", name: "Gmail", category: "email", auth: "oauth", unlocks: "AI reads and replies to business email." },
  { key: "outlook", name: "Outlook / Microsoft 365", category: "email", auth: "oauth", unlocks: "AI reads and replies to Outlook email." },
  { key: "smtp_custom", name: "Custom SMTP Server", category: "email", auth: "manual", unlocks: "Send email through any provider." },
  { key: "twilio_sms", name: "Twilio SMS", category: "sms", auth: "api_key", unlocks: "SMS reminders, campaigns, and win-back texts." },
  { key: "instagram", name: "Instagram", category: "social", auth: "oauth", unlocks: "Post content and respond to DMs on Instagram." },
  { key: "facebook", name: "Facebook", category: "social", auth: "oauth", unlocks: "Post content and respond to messages on Facebook." },
  { key: "tiktok", name: "TikTok", category: "social", auth: "oauth", unlocks: "Schedule and publish TikTok videos." },
  { key: "linkedin", name: "LinkedIn", category: "social", auth: "oauth", unlocks: "Post professional content on LinkedIn." },
  { key: "twitter_x", name: "X (Twitter)", category: "social", auth: "oauth", unlocks: "Post and engage on X." },
  { key: "instagram_business", name: "Instagram Business (Advanced)", category: "social", auth: "oauth", unlocks: "Advanced Instagram insights and publishing." },
  { key: "google_calendar", name: "Google Calendar", category: "calendar", auth: "oauth", unlocks: "Two-way sync between bookings and Google Calendar." },
  { key: "outlook_calendar", name: "Outlook Calendar", category: "calendar", auth: "oauth", unlocks: "Two-way sync between bookings and Outlook Calendar." },
  { key: "google_meet", name: "Google Meet", category: "calendar", auth: "oauth", unlocks: "Auto-generate video links for consultations." },
  { key: "google_reviews", name: "Google Reviews", category: "reviews", auth: "oauth", unlocks: "Monitor and auto-respond to Google Reviews." },
  { key: "yelp", name: "Yelp", category: "reviews", auth: "oauth", unlocks: "Monitor and respond to Yelp reviews." },
  { key: "trustpilot", name: "Trustpilot", category: "reviews", auth: "oauth", unlocks: "Monitor and respond to Trustpilot reviews." },
  { key: "stripe", name: "Stripe", category: "payments", auth: "api_key", unlocks: "Accept payments, deposits, and subscriptions." },
  { key: "paystack", name: "Paystack", category: "payments", auth: "api_key", unlocks: "Accept payments through Paystack." },
  { key: "google_drive", name: "Google Drive", category: "storage", auth: "oauth", unlocks: "Store generated documents and reports." },
  { key: "google_sheets", name: "Google Sheets", category: "storage", auth: "oauth", unlocks: "Export bookings, leads, and reports to sheets." },
  { key: "google_contacts", name: "Google Contacts", category: "storage", auth: "oauth", unlocks: "Keep customer contacts synced." },
  { key: "google_ads", name: "Google Ads", category: "ads", auth: "oauth", unlocks: "Manage and monitor Google Ads campaigns." },
  { key: "meta_ads", name: "Meta Ads", category: "ads", auth: "oauth", unlocks: "Manage and monitor Meta ad campaigns." },
  { key: "google_maps", name: "Google Maps", category: "calendar", auth: "api_key", unlocks: "Business location and service-area checks." },
];

/** The 18 growth & operations modules in _shared/modules. */
export const MODULES: ModuleDef[] = [
  { key: "leadGenerator", label: "Lead Generator", does: "Extracts and scores leads from conversations.", needs: [], when: ["customers"], retention: false },
  { key: "contentGeneration", label: "Content Generator", does: "Drafts posts, captions, and content ideas.", needs: [], when: ["content"], retention: false },
  { key: "analyticsDigest", label: "Analytics Digest", does: "Summarises performance into a plain-language digest.", needs: [], when: ["booking", "ordering", "customers"], retention: false },
  { key: "competitorMonitoring", label: "Competitor Monitoring", does: "Watches competitors and raises alerts.", needs: [], when: ["ordering", "booking"], retention: false },
  { key: "emailResponder", label: "Email Responder", does: "Drafts replies to inbound business email.", needs: ["gmail", "outlook", "smtp_custom"], when: ["customers"], retention: false },
  { key: "emailSender", label: "Email Campaigns", does: "Sends bulk email campaigns.", needs: ["gmail", "outlook", "smtp_custom"], when: ["ordering", "customers"], retention: true },
  { key: "smsCampaign", label: "SMS Campaigns", does: "Sends reminders and no-show / no-visit-30d win-back texts.", needs: ["twilio_sms"], when: ["booking", "ordering"], retention: true },
  { key: "customerFeedback", label: "Customer Feedback", does: "Sends surveys and analyses satisfaction.", needs: [], when: ["customers", "booking", "ordering"], retention: true },
  { key: "referralProgram", label: "Referral Program", does: "Referral codes, conversion tracking, analytics.", needs: [], when: ["ordering", "customers"], retention: true },
  { key: "invoiceFollowUp", label: "Payment Recovery", does: "Chases unpaid invoices and deposits automatically.", needs: [], when: ["payments"], retention: true },
  { key: "documentGeneration", label: "Document Generator", does: "Generates quotes, contracts, and documents.", needs: [], when: ["ordering", "booking"], retention: false },
  { key: "socialMediaPosting", label: "Social Posting", does: "Publishes scheduled posts to connected social accounts.", needs: ["instagram", "facebook", "tiktok", "linkedin", "twitter_x"], when: ["content", "connected"], retention: false },
  { key: "socialMediaResponder", label: "Social Responder", does: "Responds to social DMs and comments.", needs: ["instagram", "facebook", "tiktok"], when: ["content", "connected", "customers"], retention: false },
  { key: "reviewManagement", label: "Review Management", does: "Monitors reviews and drafts replies.", needs: ["google_reviews", "yelp", "trustpilot"], when: ["customers", "booking", "ordering"], retention: true },
  { key: "emailManager", label: "Email Manager", does: "Organises and triages the business inbox.", needs: ["gmail", "outlook"], when: ["customers"], retention: false },
  { key: "adCampaignManager", label: "Ad Campaign Manager", does: "Creates and manages ad campaigns.", needs: ["google_ads", "meta_ads"], when: ["ordering", "connected"], retention: false },
  { key: "calendarSync", label: "Calendar Sync", does: "Two-way sync with external calendars.", needs: ["google_calendar", "outlook_calendar"], when: ["booking", "connected"], retention: false },
  { key: "recruitmentAssistant", label: "Recruitment Assistant", does: "Posts jobs and screens candidates.", needs: [], when: ["staffed"], retention: false },
];

/** Operations machinery: what keeps the business running day to day. */
export const OPERATIONS_PIECES: OperationsPieceDef[] = [
  { key: "workflow_appointment_booking", kind: "workflow", does: "Appointment booking flow (select service, date, time, confirm) via OperationsConfig + create_widget_appointment RPC.", when: ["booking"] },
  { key: "workflow_product_ordering", kind: "workflow", does: "Product ordering flow (picker, quantity, confirm) via OperationsConfig + create_widget_order RPC.", when: ["ordering"] },
  { key: "reminder_cron", kind: "cron", does: "Appointment reminders: setup-reminder-cron schedules, appointment-reminder-runner fires, send-reminder delivers.", when: ["booking"] },
  { key: "notifications", kind: "notification", does: "Owner notifications on bookings, orders, escalations via create-notification.", when: ["booking", "ordering", "customers"] },
  { key: "availability_rules", kind: "schema", does: "Schedule source of truth (weekly rules + holiday/sick-day exceptions).", when: ["booking"] },
  { key: "transactional_email", kind: "notification", does: "Booking confirmations and receipts via send-booking-email / send-booking-confirmation (Resend).", when: ["booking", "ordering"] },
  { key: "customer_memory", kind: "schema", does: "Remembers repeat customers via conversation_state + conversation_summaries tables.", when: ["customers", "booking", "ordering"] },
  { key: "compliance_guardrails", kind: "schema", does: "No medical/legal/financial advice; escalation rules for sensitive requests.", when: ["customers"] },
];

/** Retention toolkit derived view: every module flagged retention, plus the flow. */
export function retentionPlays(): ModuleDef[] {
  return MODULES.filter((m) => m.retention);
}

export interface BusinessProfile {
  operatorKind: "receptionist" | "assistant" | "both";
  tags: RelevanceTag[];
}

function profileMatches(requires: RelevanceTag[], profile: BusinessProfile): boolean {
  if (requires.includes("always")) return true;
  return requires.some((t) => profile.tags.includes(t));
}

/**
 * Compose the operator's surface: which owner pages this business gets,
 * which modules switch on, which connectors are needed, which operations
 * run, and which retention plays activate — each with its reason.
 */
export interface ComposedSurface {
  pages_show: { key: string; why: string }[];
  pages_hide: { key: string; why: string }[];
  modules_on: { key: string; why: string }[];
  connectors_needed: { key: string; why: string }[];
  operations_on: { key: string; why: string }[];
  retention_on: { key: string; why: string }[];
}

export function composeSurface(profile: BusinessProfile): ComposedSurface {
  const pages_show: ComposedSurface["pages_show"] = [];
  const pages_hide: ComposedSurface["pages_hide"] = [];
  for (const p of OWNER_PAGES) {
    if (p.scope === "account" || profileMatches(p.requires, profile)) {
      pages_show.push({ key: p.key, why: p.why });
    } else {
      pages_hide.push({ key: p.key, why: `Hidden: ${p.why}` });
    }
  }

  const modules_on = MODULES.filter((m) => profileMatches(m.when, profile)).map(
    (m) => ({ key: m.key, why: m.does }),
  );

  const neededKeys = new Set<string>();
  for (const m of MODULES) {
    if (profileMatches(m.when, profile)) {
      for (const c of m.needs) neededKeys.add(c);
    }
  }
  // "connected" tag alone also implies the connections page work is needed.
  const connectors_needed = [...neededKeys].map((k) => {
    const def = CONNECTORS.find((c) => c.key === k);
    return { key: k, why: def ? def.unlocks : "Required by an enabled module." };
  });

  const operations_on = OPERATIONS_PIECES.filter((o) => profileMatches(o.when, profile)).map(
    (o) => ({ key: o.key, why: o.does }),
  );

  const retention_on = retentionPlays()
    .filter((m) => profileMatches(m.when, profile))
    .map((m) => ({ key: m.key, why: m.does }));

  return { pages_show, pages_hide, modules_on, connectors_needed, operations_on, retention_on };
}

/** All known page keys — approve-operator-plan rejects anything not in this set. */
export function knownPageKeys(): string[] {
  return OWNER_PAGES.map((p) => p.key);
}

export interface WidgetSurface {
  booking: boolean; // service/date/time pickers + booking confirmation
  ordering: boolean; // product picker + order confirmation
  voice: boolean; // voice input button
  lead_capture: boolean; // lead form before handoff
}

/**
 * Compose the CUSTOMER-facing widget from the business profile: which flow
 * widgets the visitor gets. The widget assembles existing pieces only
 * (service_selector, date_selector, time_slot_selector, product_selector,
 * booking_confirmation, order_confirmation, lead_form, voice_input,
 * ui_signal_renderer from manifest.ts) — never new ones.
 */
export function composeWidgetSurface(profile: BusinessProfile): WidgetSurface {
  const tags = profile.tags;
  const booking = tags.includes("booking");
  const ordering = tags.includes("ordering");
  return {
    booking,
    ordering,
    voice: true,
    lead_capture: booking || ordering || tags.includes("customers"),
  };
}

/** Build the surface block injected into the Configurator's system prompt. */
export function buildSurfacePrompt(): string {
  const pageLines = OWNER_PAGES.map(
    (p) => `- ${p.key} (${p.route}, ${p.scope}): ${p.why} [needs: ${p.requires.join("|")}]`,
  ).join("\n");
  const connLines = CONNECTORS.map(
    (c) => `- ${c.key} [${c.category}/${c.auth}]: ${c.unlocks}`,
  ).join("\n");
  const modLines = MODULES.map(
    (m) => `- ${m.key}: ${m.does} (needs: ${m.needs.length ? m.needs.join(",") : "internal"}; when: ${m.when.join("|")}${m.retention ? "; RETENTION" : ""})`,
  ).join("\n");
  const opsLines = OPERATIONS_PIECES.map(
    (o) => `- ${o.key} (${o.kind}): ${o.does} [when: ${o.when.join("|")}]`,
  ).join("\n");

  return `=== WHAT THE OWNER'S DASHBOARD HAS (SURFACE MANIFEST — PLAN WITH THIS INVENTORY) ===
Owner pages (scope=account pages are NEVER hidden; scope=operator pages are shown/hidden per business):
${pageLines}

Connector catalog (external accounts the owner can connect on the Connections page; auth=oauth|api_key|webhook|manual):
${connLines}

Growth & operations modules (switch on automatically when their "when" tags match the business):
${modLines}

Operations machinery (what keeps the business running):
${opsLines}

COMPOSITION RULES:
1. Compose the SIMPLEST surface that fully serves this operator: show every page whose needs-tags match, hide the rest, and say WHY for each hide.
2. Account-scope pages are never hidden. Setup pages (onboarding, builder) are not part of the surface.
3. Modules switch on by need, never by default. A module needing a connector the owner has not connected stays OFF and its connector lands in connectors_needed with a plain-language reason.
4. Retention plays (tagged RETENTION) activate whenever their tags match — payment recovery, win-back texts, reviews, referrals, feedback, customer memory.
5. Never promise a connector integration the catalog does not list. If the need maps to no catalog entry, name it as a missing connector honestly.
6. WIDGET (customer-facing chat): set widget_pieces from the same tags — booking true only with the booking tag, ordering true only with the ordering tag, lead_capture true when serving customers. A pure helper operator gets a clean Q&A chat: no booking pickers, no product pickers, no lead form. Voice stays on (input-only, harmless). Describe the visitor's chat in plain words in your reasoning notes.`;
}
