/**
 * Surface Derivation — Phase A of the deterministic split.
 *
 * The model is good at judgment (what the business needs, which
 * capabilities matter) and bad at inventory math (which of the 25 pages
 * those needs imply). So the model decides MEANING, code decides SURFACE.
 *
 * deriveSurface() takes an OperationsConfig and returns the full surface
 * (pages, modules, connectors, operations, retention, widget pieces)
 * computed from capabilities/workflows/kind via the manifest's
 * relevance tags — the same composeSurface() the prompt describes.
 * The model's own ui_plan becomes advisory: applyDerivedSurface()
 * overwrites it and records what changed in the trace.
 *
 * Deno-safe: ASCII only, no Node APIs.
 */

import {
  composeSurface,
  type BusinessProfile,
  type ComposedSurface,
  type RelevanceTag,
} from "./surfaceManifest.ts";
import type { TraceCollector } from "./trace.ts";

/** Tolerant "workflow on": models answer {enabled}, {steps}, or bare true. */
function wfOn(v: unknown): boolean {
  if (v === true) return true;
  if (!v || typeof v !== "object") return false;
  return (v as Record<string, unknown>).enabled !== false;
}

/** Derive relevance tags from an OperationsConfig-shaped object. */
export function deriveTags(config: Record<string, unknown>): RelevanceTag[] {
  const caps = (config.capabilities || {}) as Record<string, unknown>;
  const workflows = (config.workflows || {}) as Record<string, unknown>;
  const kind = config.operator_kind;
  const needs = config.external_needs;

  const booking = caps.books_appointments === true || wfOn(workflows.appointment_booking);
  const ordering =
    caps.sells_products === true || caps.delivers === true || wfOn(workflows.product_ordering);
  // Phase C: an ops operator is staff-facing by definition — it never earns
  // the customers tag, so no customer page, channel, or widget piece can
  // leak onto an inside-the-business operator no matter what the model wrote.
  const customerFacing = kind !== "assistant" && kind !== "ops";
  // Phase C: ops is staff-facing work, not content work — the content
  // tag belongs to assistant/both only, so social modules and their
  // connector demands can never leak onto an internal operator.
  const content = kind === "assistant" || kind === "both";

  const tags: RelevanceTag[] = [];
  if (booking) tags.push("booking");
  if (ordering) tags.push("ordering");
  if (customerFacing) tags.push("customers");
  if (ordering || caps.deposit_required === true) tags.push("payments");
  if (Array.isArray(needs) && needs.length > 0) tags.push("connected");
  if (content) tags.push("content");
  if (kind === "ops") tags.push("internal");
  // NOTE: "staffed" is never derived here — team size is not in the
  // config schema, so the staff page shows on booking alone (same as the
  // frontend's surfaceProfileFromConfig). Claiming staff knowledge we do
  // not have would be dishonest either way; booking-implies-team is the
  // documented, conservative direction.
  return tags;
}

export type OperatorKind = "receptionist" | "assistant" | "both" | "ops";

function deriveKind(config: Record<string, unknown>): OperatorKind {
  const k = config.operator_kind;
  if (k === "assistant" || k === "both" || k === "ops") return k;
  return "receptionist";
}

export interface DerivedSurface extends ComposedSurface {
  tags: RelevanceTag[];
  operatorKind: OperatorKind;
  widget_pieces: { booking: boolean; ordering: boolean; voice: boolean; lead_capture: boolean };
}

/** Full deterministic surface for an OperationsConfig. Pure function. */
export function deriveSurface(config: Record<string, unknown>): DerivedSurface {
  const tags = deriveTags(config);
  const operatorKind = deriveKind(config);
  const profile: BusinessProfile = { operatorKind, tags };
  const composed = composeSurface(profile);
  const booking = tags.includes("booking");
  const ordering = tags.includes("ordering");
  return {
    ...composed,
    tags,
    operatorKind,
    widget_pieces: {
      booking,
      ordering,
      voice: true,
      lead_capture: booking || ordering || tags.includes("customers"),
    },
  };
}

/** Normalize one model-supplied page entry to a bare key for comparison. */
function normPageKey(entry: unknown): string | null {
  if (typeof entry === "string") {
    const s = entry.trim();
    if (!s) return null;
    return s.startsWith("/") ? s.slice(1).toLowerCase() : s.toLowerCase();
  }
  if (entry && typeof entry === "object") {
    const k = (entry as Record<string, unknown>).key;
    if (typeof k === "string" && k.trim()) {
      const s = k.trim();
      return s.startsWith("/") ? s.slice(1).toLowerCase() : s.toLowerCase();
    }
  }
  return null;
}

export interface DerivationReport {
  derived_show: number;
  derived_hide: number;
  model_show: number;
  overridden: string[]; // pages the model showed that derivation hides
  restored: string[]; // pages the model hid that derivation shows
}

/**
 * Overwrite config.ui_plan with the derived surface. The model's list is
 * advisory — derivation wins, and the report says exactly what changed.
 * Mutates config in place and returns the report (also traced when a
 * collector is passed).
 */
export function applyDerivedSurface(
  config: Record<string, unknown>,
  trace?: TraceCollector,
): DerivationReport {
  const prev = (config.ui_plan || {}) as { show?: unknown[] };
  const modelKeys = new Set<string>();
  if (Array.isArray(prev.show)) {
    for (const e of prev.show) {
      const k = normPageKey(e);
      if (k) modelKeys.add(k);
    }
  }

  const d = deriveSurface(config);
  const derivedKeys = new Set(d.pages_show.map((p) => p.key.toLowerCase()));
  const overridden = [...modelKeys].filter((k) => !derivedKeys.has(k));
  const restored = [...derivedKeys].filter((k) => !modelKeys.has(k) && modelKeys.size > 0);

  config.ui_plan = {
    show: d.pages_show,
    hide: d.pages_hide,
    modules_on: d.modules_on,
    connectors_needed: d.connectors_needed,
    retention_on: d.retention_on,
    widget_pieces: d.widget_pieces,
  };

  const report: DerivationReport = {
    derived_show: d.pages_show.length,
    derived_hide: d.pages_hide.length,
    model_show: modelKeys.size,
    overridden,
    restored,
  };

  if (trace) {
    trace.start("derive-surface");
    const facts = [
      `show:${d.pages_show.length} hide:${d.pages_hide.length}`,
      `tags:${d.tags.length ? d.tags.join(",") : "none"}`,
      overridden.length ? `overridden:${overridden.join(",")}` : "model-agreed",
    ];
    if (restored.length) facts.push(`restored:${restored.join(",")}`);
    trace.end("derive-surface", "Surface derived in code from capabilities, not guessed by the model", facts);
  }

  return report;
}
