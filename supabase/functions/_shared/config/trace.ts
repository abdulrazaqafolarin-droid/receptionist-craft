/**
 * Build Trace (Phase D) — backend receipts for the Playground.
 *
 * Each edge function in the plan/approve path records what it DID
 * (calls, files, timings, models, counts) as TraceSteps and returns them
 * in the response. The frontend renders them on demand ("Peek inside").
 *
 * Honesty rules:
 * - Emitted at the moment of doing — a step that didn't run never appears.
 * - Facts only (names, counts, timings, models, licenses). No prompt text,
 *   no raw JSON bodies, no secrets — the trace is safe to show owners.
 * - Failures are recorded as failed steps with the reason, never hidden.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface TraceStep {
  step: string; // stable key, e.g. "upload-manifest"
  label: string; // human line, e.g. "Reference file uploaded (cached)"
  ms: number; // wall time for this step
  status: "ok" | "failed" | "skipped";
  facts: string[]; // short strings: "model X", "3 candidates, 2 OSS", …
}

/** Collector: start(label) → … → end(label, facts) → steps(). */
export class TraceCollector {
  private starts = new Map<string, number>();
  private order: string[] = [];
  private done: TraceStep[] = [];

  start(step: string): void {
    this.starts.set(step, Date.now());
    if (!this.order.includes(step)) this.order.push(step);
  }

  end(step: string, label: string, facts: string[] = [], status: TraceStep["status"] = "ok"): void {
    const t0 = this.starts.get(step);
    const ms = t0 === undefined ? 0 : Date.now() - t0;
    this.done.push({ step, label, ms, status, facts });
    this.starts.delete(step);
  }

  skip(step: string, label: string, facts: string[] = []): void {
    if (!this.order.includes(step)) this.order.push(step);
    this.done.push({ step, label, ms: 0, status: "skipped", facts });
  }

  fail(step: string, label: string, reason: string): void {
    const t0 = this.starts.get(step);
    const ms = t0 === undefined ? 0 : Date.now() - t0;
    this.done.push({ step, label, ms, status: "failed", facts: [reason.slice(0, 160)] });
    this.starts.delete(step);
  }

  steps(): TraceStep[] {
    // Close any step that was started but never ended (crash-safe).
    for (const s of this.order) {
      if (this.starts.has(s) && !this.done.some((d) => d.step === s)) {
        this.fail(s, s, "interrupted");
      }
    }
    return this.done;
  }

  /** One-line summary for the peek button: "4 steps · 43s · 1 file read". */
  summary(): string {
    const ok = this.done.filter((d) => d.status === "ok").length;
    const totalMs = this.done.reduce((a, d) => a + d.ms, 0);
    const secs = totalMs >= 1000 ? `${Math.round(totalMs / 1000)}s` : `${totalMs}ms`;
    const files = this.done
      .flatMap((d) => d.facts)
      .filter((f) => f.startsWith("file:")).length;
    const reposFound = this.done
      .flatMap((d) => d.facts)
      .filter((f) => f.startsWith("repos:"))
      .map((f) => f.replace("repos:", "").trim())
      .find((s) => s.length > 0);
    const bits = [`${ok} step${ok === 1 ? "" : "s"}`, secs];
    if (files > 0) bits.push(`${files} file${files === 1 ? "" : "s"} read`);
    if (reposFound !== undefined) bits.push(`${reposFound} repos found`);
    return bits.join(" · ");
  }
}
