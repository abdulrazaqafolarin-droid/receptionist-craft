/**
 * Operator surface — which owner pages the active operator gets.
 *
 * Single source of truth for route <-> page-key mapping. Keys MUST match
 * OWNER_PAGES in supabase/functions/_shared/config/surfaceManifest.ts.
 *
 * Rules:
 * - No surface set (null)  -> show everything (backwards compatible).
 * - Surface set             -> show only visible_pages + account pages.
 * - Account-scope pages are never gated, whatever the surface says.
 */

export const ROUTE_TO_PAGE_KEY: Record<string, string> = {
  "/analytics": "analytics",
  "/money-mode": "money-mode",
  "/meo-dashboard": "meo-dashboard",
  "/services": "services",
  "/availability": "availability",
  "/staff": "staff",
  "/faqs": "faqs",
  "/console": "console",
  "/quality-review": "quality-review",
  "/kb-rewrite": "kb-rewrite",
  "/escalations": "escalations",
  "/appointments": "appointments",
  "/orders": "appointments",
  "/calendar": "calendar",
  "/customers": "customers",
  "/channels": "channels",
  "/connections": "connections",
};

/** Pages that are never gated, whatever the operator's surface says. */
export const ALWAYS_VISIBLE_ROUTES = new Set([
  "/dashboard",
  "/onboarding",
  "/onboarding-wizard",
  "/conversational-onboarding",
  "/builder",
  "/operator-management",
  "/workers",
  "/conversations",
  "/organization",
  "/billing",
  "/notifications",
  "/diagnostics",
  "/realtime-logs",
  "/settings",
  "/help",
]);

/** Extract visible_pages from a receptionist row's capabilities JSONB. Returns null when unset. */
export function visiblePagesFromCapabilities(capabilities: unknown): string[] | null {
  if (!capabilities || typeof capabilities !== "object") return null;
  const surface = (capabilities as Record<string, unknown>).ui_surface;
  if (!surface || typeof surface !== "object") return null;
  const pages = (surface as Record<string, unknown>).visible_pages;
  if (!Array.isArray(pages)) return null;
  return pages.filter((p): p is string => typeof p === "string");
}

/** True when this route may render under the given surface (null surface = everything visible). */
export function isRouteVisible(route: string, visiblePages: string[] | null): boolean {
  if (!visiblePages) return true;
  const base = route.split("/:")[0];
  if (ALWAYS_VISIBLE_ROUTES.has(base) || ALWAYS_VISIBLE_ROUTES.has(route)) return true;
  const key = ROUTE_TO_PAGE_KEY[base] ?? ROUTE_TO_PAGE_KEY[route];
  if (!key) return true; // unknown route -> do not gate what we do not know
  return visiblePages.includes(key);
}

/**
 * Local surface planning (offline fallback + pre-deploy window).
 *
 * Mirrors the relevance rules in supabase/functions/_shared/config/
 * surfaceManifest.ts (the source of truth the gateway Configurator reasons
 * from). Page-level only. Used when the gateway plan carries no ui_plan —
 * never overrides an approved or gateway-provided plan.
 */

export interface SurfaceProfile {
  kind: "receptionist" | "assistant" | "both" | "ops";
  booking: boolean;
  ordering: boolean;
  payments: boolean;
  staffed: boolean;
  connected: boolean;
  content: boolean;
  customerFacing: boolean;
}

export interface UiPlanItem {
  key: string;
  why: string;
}

export interface UiPlan {
  show: UiPlanItem[];
  hide: UiPlanItem[];
}

// Operator-scope page keys with the tags that earn them a place.
// (Mirrors OWNER_PAGES requires in surfaceManifest.ts.)
const PAGE_RULES: Array<{ key: string; needs: string[]; why: string }> = [
  { key: "analytics", needs: ["booking", "ordering", "customers"], why: "Shows conversation and funnel numbers." },
  { key: "money-mode", needs: ["booking", "ordering", "payments"], why: "Sales acceleration for something being sold or booked." },
  { key: "meo-dashboard", needs: ["booking", "ordering", "payments"], why: "Revenue-leak analytics needs a money flow to measure." },
  { key: "services", needs: ["booking", "ordering", "internal"], why: "The catalog behind bookings and orders — and the stock book for internal operators." },
  { key: "availability", needs: ["booking"], why: "Schedule source of truth for appointment booking." },
  { key: "staff", needs: ["booking", "staffed", "internal"], why: "Staff scheduling for a booked team — and the roster for an internal operator." },
  { key: "faqs", needs: [], why: "Every operator answers questions." },
  { key: "console", needs: ["internal"], why: "Staff home for an internal operator — hidden for customer-facing ones." },
  { key: "quality-review", needs: ["customers", "content"], why: "Review AI answers to customers or drafted content." },
  { key: "kb-rewrite", needs: [], why: "Knowledge improvement helps every operator stay accurate." },
  { key: "escalations", needs: ["customers"], why: "Human handoff queue for served customers." },
  { key: "appointments", needs: ["booking", "ordering"], why: "The fulfillment list for bookings and orders." },
  { key: "calendar", needs: ["booking"], why: "Visual schedule for appointment booking." },
  { key: "customers", needs: ["booking", "ordering", "customers"], why: "Customer records for served customers." },
  { key: "channels", needs: ["customers"], why: "Widget/WhatsApp/phone setup for customer contact." },
  { key: "connections", needs: ["connected", "ordering", "content", "booking"], why: "External connectors the operator relies on." },
];

function profileTags(p: SurfaceProfile): string[] {
  const tags: string[] = [];
  if (p.booking) tags.push("booking");
  if (p.ordering) tags.push("ordering");
  if (p.payments) tags.push("payments");
  if (p.staffed) tags.push("staffed");
  if (p.connected) tags.push("connected");
  if (p.content) tags.push("content");
  if (p.customerFacing) tags.push("customers");
  if (p.kind === "ops") tags.push("internal");
  return tags;
}

/** Derive a ui_plan {show, hide} from a business profile using the manifest rules. */
export function uiPlanForProfile(profile: SurfaceProfile): UiPlan {
  const tags = profileTags(profile);
  const show: UiPlanItem[] = [];
  const hide: UiPlanItem[] = [];
  for (const rule of PAGE_RULES) {
    const match = rule.needs.length === 0 || rule.needs.some((t) => tags.includes(t));
    if (match) show.push({ key: rule.key, why: rule.why });
    else hide.push({ key: rule.key, why: `Hidden: ${rule.why}` });
  }
  return { show, hide };
}

export interface WidgetPieces {
  booking: boolean;
  ordering: boolean;
  voice: boolean;
  lead_capture: boolean;
}

/**
 * Customer-facing widget pieces from an OperationsConfig-shaped object.
 * The widget (customer side) assembles exactly these: booking flow
 * (service/date/time pickers + confirmation), ordering flow (product
 * picker + confirmation), voice input, and lead capture. Voice defaults
 * on — it is input-only and harmless; lead capture follows customer work.
 */
export function widgetPiecesFromConfig(config: Record<string, unknown>): WidgetPieces {
  const profile = surfaceProfileFromConfig(config);
  return {
    booking: profile.booking,
    ordering: profile.ordering,
    voice: true,
    lead_capture: profile.customerFacing,
  };
}

/** Build a SurfaceProfile from an OperationsConfig-shaped object. */
export function surfaceProfileFromConfig(config: Record<string, unknown>): SurfaceProfile {
  const caps = (config.capabilities || {}) as Record<string, unknown>;
  const workflows = (config.workflows || {}) as Record<string, unknown>;
  // Tolerant "on": models answer {enabled}, {steps}, or bare true.
  const wfOn = (v: unknown): boolean => {
    if (v === true) return true;
    if (!v || typeof v !== "object") return false;
    return (v as Record<string, unknown>).enabled !== false;
  };
  const needs = config.external_needs;
  const rawKind = config.operator_kind;
  const kind = rawKind === "assistant" || rawKind === "both" || rawKind === "ops" ? rawKind : "receptionist";
  const booking = caps.books_appointments === true || wfOn(workflows.appointment_booking);
  const ordering = caps.sells_products === true || caps.delivers === true || wfOn(workflows.product_ordering);
  return {
    kind,
    booking,
    ordering,
    payments: ordering || caps.deposit_required === true,
    staffed: false, // unknown from config alone; staff page still shows on booking
    connected: Array.isArray(needs) && needs.length > 0,
    content: kind === "assistant" || kind === "both",
    customerFacing: kind !== "assistant" && kind !== "ops",
  };
}
