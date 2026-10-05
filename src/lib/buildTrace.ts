/**
 * Build trace (Phase D, frontend) — shapes for backend receipts.
 *
 * The backend emits these at the moment of doing; the Playground renders
 * them on demand. Timings + facts only — never prompt text or raw bodies.
 */

export interface TraceStep {
  step: string;
  label: string;
  ms: number;
  status: "ok" | "failed" | "skipped";
  facts: string[];
}

export interface PlayTrace {
  origin: string; // "Plan" | "Plan (offline draft)" | "Adjustment" | "Approval"
  summary: string;
  steps: TraceStep[];
  /** The AI's own stated reasoning (model words, not verified truth). */
  reasoning: string;
  /** When this run completed (client clock, display only). */
  at: number;
}

/** Parse a trace from any edge-function response body. Null when absent. */
export function parseTrace(data: unknown, origin: PlayTrace["origin"]): PlayTrace | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.trace)) return null;
  const steps = (d.trace as unknown[])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      step: typeof s.step === "string" ? s.step : "step",
      label: typeof s.label === "string" ? s.label : "Step",
      ms: typeof s.ms === "number" ? s.ms : 0,
      status: s.status === "failed" ? "failed" as const : s.status === "skipped" ? "skipped" as const : "ok" as const,
      facts: Array.isArray(s.facts) ? s.facts.filter((f): f is string => typeof f === "string").slice(0, 6) : [],
    }));
  if (steps.length === 0) return null;
  const reasoning =
    typeof d.reasoning === "string"
      ? d.reasoning.slice(0, 1500)
      : typeof (d as Record<string, unknown>).reasoning_notes === "string"
        ? ((d as Record<string, unknown>).reasoning_notes as string).slice(0, 1500)
        : "";
  return {
    origin,
    summary: typeof d.trace_summary === "string" && d.trace_summary ? d.trace_summary : `${steps.length} steps`,
    steps,
    reasoning,
    at: Date.now(),
  };
}

/** Offline fallback trace — synthesized honestly, labelled as such. */
export function offlineDraftTrace(substantiveCount: number): PlayTrace {
  return {
    origin: "Plan (offline draft)",
    summary: `2 steps · offline draft from ${substantiveCount} message${substantiveCount === 1 ? "" : "s"}`,
    reasoning:
      "No AI was involved in this draft — every switched-on capability traces to something you actually said, and everything unproven stayed off. A full AI plan can be regenerated anytime.",
    at: Date.now(),
    steps: [
      {
        step: "interview",
        label: `Guided interview (${substantiveCount} substantive message${substantiveCount === 1 ? "" : "s"})`,
        ms: 0,
        status: "ok",
        facts: ["gateway unreachable — built-in questions used"],
      },
      {
        step: "offline-draft",
        label: "Conservative draft from your own words",
        ms: 0,
        status: "ok",
        facts: ["only mentioned capabilities switched on", "review before approving"],
      },
    ],
  };
}

export function formatMs(ms: number): string {
  if (ms <= 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
}
