import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs, type PlayTrace } from "@/lib/buildTrace";

/**
 * Build Playground (Phase D) — opt-in live trace of the backend build.
 *
 * Collapsed by default, always: a quiet button with a one-line summary.
 * Expands to a timeline of reported steps (calls, files, models, timings).
 * Nothing here is inferred — every row was emitted at the moment of doing.
 * Timings + facts only; prompt contents never leave the backend.
 */
export function BuildPlayground({ trace }: { trace: PlayTrace | null }) {
  const [open, setOpen] = useState(false);
  if (!trace) return null;

  const dot = (status: string) =>
    status === "ok"
      ? "bg-green-500"
      : status === "failed"
        ? "bg-destructive"
        : "bg-muted-foreground/40";

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Hide build details" : "Peek inside the build"}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left pressable"
      >
        <FlaskConical className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">Peek inside</span>
          <span className="text-muted-foreground"> · {trace.origin} · {trace.summary}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ol className="space-y-2 border-t border-border px-3 py-3" aria-label="Backend build steps">
          {trace.steps.map((s) => (
            <li key={s.step} className="flex items-start gap-2.5 text-sm">
              <span
                className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot(s.status))}
                aria-label={s.status}
                role="img"
              />
              <div className="min-w-0 flex-1">
                <p className="leading-snug">
                  {s.label}
                  {s.status === "failed" && <span className="text-destructive"> — failed</span>}
                  {s.status === "skipped" && <span className="text-muted-foreground"> — skipped</span>}
                </p>
                {s.facts.length > 0 && (
                  <p className="type-metadata mt-0.5">{s.facts.join(" · ")}</p>
                )}
              </div>
              {s.ms > 0 && (
                <span className="type-metadata tnum shrink-0">{formatMs(s.ms)}</span>
              )}
            </li>
          ))}
          <p className="type-metadata pt-1">
            Reported by the backend as it ran — your review steps show above.
          </p>
        </ol>
      )}
    </div>
  );
}
