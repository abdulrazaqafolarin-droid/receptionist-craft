import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface BuildStep {
  id: string;
  /** Business language, e.g. "Saving your services". Never jargon. */
  label: string;
  /** Evidence shown when done: INPUT → ACTION → RESULT. */
  evidence?: string;
  status: "pending" | "active" | "done";
}

interface BuildProgressProps {
  steps: BuildStep[];
  title?: string;
}

/**
 * Lovable-style build readout: one progress surface, step list with
 * state-driven motion, and evidence per completed step
 * (INPUT → AI ACTION → BUSINESS RESULT). Technical detail stays
 * collapsed behind progressive disclosure.
 */
export function BuildProgress({ steps, title = "Building your AI operator" }: BuildProgressProps) {
  const [showWhy, setShowWhy] = useState(false);
  const done = steps.filter((s) => s.status === "done").length;
  const pct = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-contact sm:p-5" role="status" aria-live="polite" aria-label={`${title}: ${pct}% complete`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="type-label tnum">{title}</p>
        <span className="type-metadata tnum" aria-hidden="true">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" aria-hidden="true" />

      <ol className="mt-4 space-y-2.5">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
              {step.status === "done" ? (
                <Check className="h-4 w-4 finance-positive" />
              ) : step.status === "active" ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-border" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm",
                  step.status === "done" && "text-foreground",
                  step.status === "active" && "font-medium text-foreground",
                  step.status === "pending" && "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {step.status === "done" && step.evidence && (
                <p className="type-caption mt-0.5 break-words">{step.evidence}</p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Collapsible open={showWhy} onOpenChange={setShowWhy} className="mt-3">
        <CollapsibleTrigger className="type-caption inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronDown className={cn("h-3 w-3 transition-transform", showWhy && "rotate-180")} aria-hidden="true" />
          What is happening behind this screen
        </CollapsibleTrigger>
        <CollapsibleContent className="type-caption mt-2 rounded-lg bg-muted/60 p-3 leading-relaxed">
          Your words are compiled into an operator plan, reviewed by you, then applied to your receptionist,
          services, hours, answers, and instructions — in that order. Nothing goes live until you approve it.
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
