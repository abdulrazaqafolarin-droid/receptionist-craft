import { useState } from "react";
import { Brain, ChevronDown, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMs, type PlayTrace } from "@/lib/buildTrace";

/**
 * Build Playground (Phase D) — the whole build story in one place.
 *
 * A session timeline, not a single run: Plan → Adjustment(s) → Approval
 * accumulate here in order, each with its backend receipts (thought =
 * process = build evidence) plus its own "what the AI was thinking" block.
 * Collapsed by default, always. Ephemeral — a new plan starts a new story.
 * Nothing here is inferred: rows were emitted at the moment of doing,
 * reasoning is the model's own labelled words.
 */
export function BuildPlayground({ traces }: { traces: PlayTrace[] }) {
  const [open, setOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState<Record<number, boolean>>({});
  if (traces.length === 0) return null;

  const totalSteps = traces.reduce((a, t) => a + t.steps.length, 0);
  const failed = traces.some((t) => t.steps.some((s) => s.status === "failed"));
  const origins = traces.map((t) => t.origin).join(" → ");

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
          <span className="text-muted-foreground"> · {origins} · {totalSteps} steps{failed ? " · 1 failed" : ""}</span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-3 py-3">
          {traces.map((trace, i) => (
            <section key={`${trace.origin}-${trace.at}-${i}`} aria-label={`${trace.origin} run`}>
              <p className="type-label mb-1.5">
                {trace.origin} <span className="font-normal text-muted-foreground">· {trace.summary}</span>
              </p>
              <ol className="space-y-2" aria-label={`${trace.origin} steps`}>
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
              </ol>
              {trace.reasoning && (
                <div className="mt-2 rounded-xl border border-border bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setThinkingOpen((v) => ({ ...v, [i]: !v[i] }))}
                    aria-expanded={!!thinkingOpen[i]}
                    aria-label={thinkingOpen[i] ? "Hide AI reasoning" : "Show what the AI was thinking"}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left pressable"
                  >
                    <Brain className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      What the AI was thinking
                    </span>
                    <ChevronDown
                      className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", thinkingOpen[i] && "rotate-180")}
                      aria-hidden="true"
                    />
                  </button>
                  {thinkingOpen[i] && (
                    <div className="border-t border-border px-3 py-2.5">
                      <p className="text-sm leading-relaxed">{trace.reasoning}</p>
                      <p className="type-metadata mt-1.5">
                        The model's own words — its reasons, not verified truth. Judge the plan, not the prose.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
          <p className="type-metadata">
            Reported by the backend as it ran — your review steps show above.
          </p>
        </div>
      )}
    </div>
  );
}
