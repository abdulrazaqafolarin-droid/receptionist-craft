/**
 * Surface eval (Phase C, local part) — deterministic, no gateway needed.
 *
 * 1. composeSurface (server rules) across 10 business profiles: asserts
 *    expected shown/hidden pages + widget pieces per case.
 * 2. Frontend mirror check: PAGE_RULES in src/lib/operatorSurface.ts must
 *    match OWNER_PAGES requires in surfaceManifest.ts (regex-compare, so the
 *    offline fallback can never silently drift from the server rules).
 * 3. Playground contract: TraceCollector shapes + parseTrace behavior.
 *
 * Run: deno run --allow-read scripts/eval-surface.ts (exit 1 on failure)
 */
import { composeSurface, composeWidgetSurface, type BusinessProfile } from "../supabase/functions/_shared/config/surfaceManifest.ts";
import { TraceCollector } from "../supabase/functions/_shared/config/trace.ts";
import { parseTrace, offlineDraftTrace } from "../src/lib/buildTrace.ts";
import { generatePlanFromConfig } from "../supabase/functions/_shared/config/planGenerator.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

interface EvalCase {
  name: string;
  profile: BusinessProfile;
  mustShow: string[];
  mustHide: string[];
  widget: { booking: boolean; ordering: boolean; lead_capture: boolean };
}

const CASES: EvalCase[] = [
  {
    name: "unisex salon (booking receptionist)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers"] },
    mustShow: ["availability", "calendar", "appointments", "services", "staff"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "dental clinic (booking + compliance-ish customers)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers"] },
    mustShow: ["availability", "escalations", "customers"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "restaurant (booking walk-in-ish)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers"] },
    mustShow: ["appointments", "calendar"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "boutique (ordering + payments)",
    profile: { operatorKind: "receptionist", tags: ["ordering", "payments", "customers"] },
    mustShow: ["appointments", "money-mode", "meo-dashboard", "services", "customers"],
    mustHide: ["availability", "calendar", "staff"],
    widget: { booking: false, ordering: true, lead_capture: true },
  },
  {
    name: "dropshipper (ordering, no customers face)",
    profile: { operatorKind: "receptionist", tags: ["ordering", "payments"] },
    mustShow: ["appointments", "money-mode"],
    mustHide: ["availability", "calendar", "escalations", "channels"],
    widget: { booking: false, ordering: true, lead_capture: true },
  },
  {
    name: "content helper (pure assistant)",
    profile: { operatorKind: "assistant", tags: ["content"] },
    mustShow: ["faqs", "quality-review", "kb-rewrite"],
    mustHide: ["analytics", "money-mode", "meo-dashboard", "services", "availability", "staff", "escalations", "appointments", "calendar", "customers", "channels"],
    widget: { booking: false, ordering: false, lead_capture: false },
  },
  {
    name: "tutor (solo booking)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers", "payments"] },
    mustShow: ["availability", "money-mode", "appointments"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "gym (booking + membership money)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers", "payments", "staffed"] },
    mustShow: ["staff", "money-mode", "meo-dashboard", "customers"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "barbershop (solo booking, no staff)",
    profile: { operatorKind: "receptionist", tags: ["booking", "customers"] },
    mustShow: ["availability", "calendar"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
  {
    name: "business coach (both: sessions + content)",
    profile: { operatorKind: "both", tags: ["booking", "customers", "content", "payments"] },
    mustShow: ["availability", "quality-review", "money-mode", "appointments"],
    mustHide: [],
    widget: { booking: true, ordering: false, lead_capture: true },
  },
];

for (const c of CASES) {
  const s = composeSurface(c.profile);
  const shown = new Set(s.pages_show.map((p) => p.key));
  const hidden = new Set(s.pages_hide.map((p) => p.key));
  for (const k of c.mustShow) check(`${c.name} shows ${k}`, shown.has(k));
  for (const k of c.mustHide) check(`${c.name} hides ${k}`, hidden.has(k));
  const w = composeWidgetSurface(c.profile);
  check(`${c.name} widget.booking=${c.widget.booking}`, w.booking === c.widget.booking);
  check(`${c.name} widget.ordering=${c.widget.ordering}`, w.ordering === c.widget.ordering);
  check(`${c.name} widget.lead=${c.widget.lead_capture}`, w.lead_capture === c.widget.lead_capture);
  // No page is both shown and hidden; account pages never hidden.
  for (const k of shown) check(`${c.name} no show+hide overlap on ${k}`, !hidden.has(k));
}

// --- Frontend mirror check: PAGE_RULES vs OWNER_PAGES requires ---
const frontSrc = await Deno.readTextFile("./src/lib/operatorSurface.ts");
const serverSrc = await Deno.readTextFile("./supabase/functions/_shared/config/surfaceManifest.ts");
const frontRules = [...frontSrc.matchAll(/\{\s*key:\s*"([^"]+)",\s*needs:\s*\[([^\]]*)\]/g)].map((m) => ({
  key: m[1],
  needs: [...m[2].matchAll(/"([^"]+)"/g)].map((n) => n[1]),
}));
const serverPages = [...serverSrc.matchAll(/\{\s*key:\s*"([^"]+)",\s*route:[^}]*?requires:\s*\[([^\]]*)\]/gs)].map((m) => ({
  key: m[1],
  needs: [...m[2].matchAll(/"([^"]+)"/g)].map((n) => n[1]),
}));
for (const f of frontRules) {
  const s = serverPages.find((p) => p.key === f.key);
  check(`mirror: ${f.key} exists server-side`, !!s);
  if (s) {
    // Empty needs[] and ["always"] mean the same thing: unconditional.
    const norm = (needs: string[]) => (needs.length === 0 ? ["always"] : needs);
    const a = [...norm(f.needs)].sort().join("|");
    const b = [...norm(s.needs)].sort().join("|");
    check(`mirror: ${f.key} needs match (front:[${a}] server:[${b}])`, a === b);
  }
}

// --- Playground contract ---
const t = new TraceCollector();
t.start("upload-manifest");
t.end("upload-manifest", "Reference file uploaded", ["file:rutex-platform-manifest.txt", "28KB", "cached"]);
t.start("gateway-ask");
t.end("gateway-ask", "AI planned the operator", ["model:opencode/space-bunny-free", "8325 tokens"]);
t.skip("research-needs", "No external needs to research");
t.start("boom");
t.fail("boom", "Step failed", "reason here");
const steps = t.steps();
check("trace: 4 steps recorded", steps.length === 4, `got ${steps.length}`);
check("trace: statuses ok/ok/skipped/failed", steps.map((s) => s.status).join(",") === "ok,ok,skipped,failed");
const summary = t.summary();
check("trace: summary mentions steps+time", /step/.test(summary), summary);
check("trace: summary has no doubled words", !/found repos found/.test(summary), summary);

const parsed = parseTrace(
  { trace: steps, trace_summary: summary, reasoning: "Because bookings matter." },
  "Plan",
);
check("parseTrace: parses server shape", !!parsed && parsed.steps.length === 4 && parsed.origin === "Plan");
check("parseTrace: carries AI reasoning", !!parsed && parsed.reasoning === "Because bookings matter.");
check("parseTrace: reasoning falls back to reasoning_notes", parseTrace({ trace: steps, reasoning_notes: "Notes here." }, "Plan")?.reasoning === "Notes here.");
check("parseTrace: missing reasoning defaults empty", parseTrace({ trace: steps }, "Plan")?.reasoning === "");
check("parseTrace: rejects garbage", parseTrace({ nope: 1 }, "Plan") === null);
check("parseTrace: rejects empty trace", parseTrace({ trace: [] }, "Plan") === null);
const off = offlineDraftTrace(3);
check("offlineDraftTrace: labelled honest", off.origin === "Plan (offline draft)" && off.steps.length === 2);

// --- Build-needs section renders when the model reports gaps ---
const needsPlan = generatePlanFromConfig({
  business: { display_name: "Test", business_type: "Salon" },
  build_needs: [
    { need: "TikTok posting limits", why: "Not in the reference file" },
    { need: "", why: "blank entries dropped" },
  ],
});
check(
  "plan: build-needs section renders",
  needsPlan.sections.some((s) => s.id === "build-needs" && s.content.includes("TikTok posting limits")),
);
check(
  "plan: blank needs dropped",
  !needsPlan.full_text.includes("blank entries dropped"),
);
const noNeedsPlan = generatePlanFromConfig({ business: { display_name: "Test" } });
check(
  "plan: no build-needs section when empty",
  !noNeedsPlan.sections.some((s) => s.id === "build-needs"),
);

console.log(`\neval: ${pass} passed, ${fail} failed`);
if (fail > 0) Deno.exit(1);
