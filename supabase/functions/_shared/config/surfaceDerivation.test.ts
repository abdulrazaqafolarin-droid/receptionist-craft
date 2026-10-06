/**
 * Derivation matrix test (Phase A gate).
 *
 * Locks the model-never-guesses-pages contract: for each business shape,
 * the derived surface must show exactly the pages its capabilities earn —
 * no more, no less — regardless of what ui_plan the model supplied.
 *
 * Run: deno test supabase/functions/_shared/config/surfaceDerivation.test.ts
 */

import { applyDerivedSurface, deriveSurface, deriveTags } from "./surfaceDerivation.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function showKeys(config: Record<string, unknown>): string[] {
  const ui = (config.ui_plan || {}) as { show?: Array<{ key?: string }> };
  return (ui.show || []).map((x) => String(x.key));
}

function withAdversarialPlan(config: Record<string, unknown>): Record<string, unknown> {
  // A model that "shows everything" — derivation must cut it down.
  const all = [
    "dashboard", "analytics", "money-mode", "meo-dashboard", "operator-management",
    "services", "availability", "staff", "faqs", "conversations", "quality-review",
    "kb-rewrite", "escalations", "appointments", "calendar", "customers",
    "channels", "connections", "organization", "billing", "notifications",
    "diagnostics", "realtime-logs", "settings", "help",
  ];
  return { ...config, ui_plan: { show: all.map((key) => ({ key, why: "model guessed" })) } };
}

Deno.test("receptionist + booking shows booking cluster", () => {
  const config = withAdversarialPlan({
    operator_kind: "receptionist",
    capabilities: { books_appointments: true },
    workflows: { appointment_booking: { enabled: true } },
    external_needs: [],
  });
  const report = applyDerivedSurface(config);
  const show = showKeys(config);
  for (const k of ["availability", "calendar", "appointments", "services", "staff", "escalations", "channels"]) {
    check(show.includes(k), `booking receptionist shows ${k}`);
  }
  // Any-match rules: booking+customers earns every operator page, so the
  // adversarial list agrees here — the override muscle is proven below.
  check(report.overridden.length === 0, "derivation agrees with a correct model list");
  check(!show.includes("does-not-exist"), "sanity");
});

Deno.test("derivation overrides a wrong model list both ways", () => {
  // Model shows everything for a pure helper: derivation must cut.
  const cut = withAdversarialPlan({
    operator_kind: "assistant",
    capabilities: {},
    workflows: {},
    external_needs: [],
  });
  const cutReport = applyDerivedSurface(cut);
  for (const k of ["availability", "calendar", "appointments", "money-mode", "escalations"]) {
    check(cutReport.overridden.includes(k), `helper cut overrides ${k}`);
  }
  // Model shows almost nothing for a booking receptionist: derivation restores.
  const thin: Record<string, unknown> = {
    operator_kind: "receptionist",
    capabilities: { books_appointments: true },
    workflows: { appointment_booking: { enabled: true } },
    ui_plan: { show: [{ key: "faqs", why: "model minimal" }] },
  };
  const thinReport = applyDerivedSurface(thin);
  for (const k of ["availability", "calendar", "appointments"]) {
    check(thinReport.restored.includes(k), `booking receptionist restores ${k}`);
  }
});

Deno.test("assistant content helper hides customer machinery", () => {
  const config = withAdversarialPlan({
    operator_kind: "assistant",
    capabilities: {},
    workflows: {},
    external_needs: [],
  });
  const report = applyDerivedSurface(config);
  const show = showKeys(config);
  for (const k of ["availability", "calendar", "appointments", "money-mode", "escalations", "channels", "customers", "services"]) {
    check(!show.includes(k), `pure helper hides ${k}`);
  }
  check(show.includes("faqs"), "helper keeps faqs");
  check(show.includes("quality-review"), "helper keeps quality-review via content tag");
  check(show.includes("kb-rewrite"), "helper keeps kb-rewrite");
  const d = deriveSurface({ operator_kind: "assistant", capabilities: {} });
  check(d.widget_pieces.booking === false, "helper widget has no booking picker");
  check(d.widget_pieces.lead_capture === false, "helper widget has no lead form");
  // Any-match rules: 10 account + faqs + kb-rewrite (always) +
  // quality-review + connections (content tag) = exactly 14.
  check(report.derived_show === 14, `helper surface is exactly 14 (got ${report.derived_show})`);
});

Deno.test("ordering unlocks commerce pages and payments", () => {
  const config = withAdversarialPlan({
    operator_kind: "both",
    capabilities: { sells_products: true },
    workflows: { product_ordering: { enabled: true } },
    external_needs: [],
  });
  applyDerivedSurface(config);
  const show = showKeys(config);
  for (const k of ["appointments", "services", "money-mode", "meo-dashboard", "customers"]) {
    check(show.includes(k), `ordering operator shows ${k}`);
  }
  check(!show.includes("availability"), "no booking, no availability");
  check(!show.includes("calendar"), "no booking, no calendar");
});

Deno.test("empty config derives minimal honest surface", () => {
  const config = { operator_kind: "receptionist" };
  const report = applyDerivedSurface(config);
  const show = showKeys(config);
  check(show.includes("faqs"), "empty config keeps faqs");
  check(!show.includes("availability"), "empty config hides availability");
  check(report.model_show === 0, "no model list means nothing to override");
  check(report.restored.length === 0, "no model list means nothing restored");
});

Deno.test("steps-shape workflow counts as booking on", () => {
  const tags = deriveTags({
    operator_kind: "receptionist",
    capabilities: {},
    workflows: { appointment_booking: { steps: ["select_service", "confirm"], requires_confirmation: true } },
  });
  check(tags.includes("booking"), "steps-shape workflow earns the booking tag");
});

Deno.test("deposit alone earns the payments tag", () => {
  const config: Record<string, unknown> = {
    operator_kind: "receptionist",
    capabilities: { deposit_required: true },
    workflows: {},
  };
  applyDerivedSurface(config);
  check(showKeys(config).includes("money-mode"), "deposit earns money-mode via payments tag");
});

Deno.test("connected tag shows the connections page", () => {
  const config: Record<string, unknown> = {
    operator_kind: "assistant",
    capabilities: {},
    workflows: {},
    external_needs: ["needs Instagram publishing"],
  };
  applyDerivedSurface(config);
  check(showKeys(config).includes("connections"), "external need earns the connections page");
});
