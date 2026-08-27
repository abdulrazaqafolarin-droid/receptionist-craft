import { useState } from "react";
import { Check, MessageSquare, ChevronDown, ChevronUp, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface PlanSection {
  id: string;
  title: string;
  content: string;
  confidence: "high" | "medium" | "low";
  owner_action?: string;
}

interface PlanReviewProps {
  planText: string;
  sections: PlanSection[];
  reasoningNotes?: string;
  onApprove: (feedback?: string) => void;
  onEdit: (feedback: string) => void;
  loading?: boolean;
  mode?: "onboarding" | "change";
}

const CONFIDENCE_COLORS = {
  high: "bg-green-500/10 text-green-700 border-green-500/20",
  medium: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  low: "bg-red-500/10 text-red-700 border-red-500/20",
};

const CONFIDENCE_LABELS = {
  high: "Confident",
  medium: "Needs your input",
  low: "Unsure — please confirm",
};

export function PlanReview({
  planText,
  sections,
  reasoningNotes,
  onApprove,
  onEdit,
  loading,
  mode = "onboarding",
}: PlanReviewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.id)),
  );
  const [feedback, setFeedback] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);

  const needsAction = sections.some((s) => s.owner_action);
  const lowConfidence = sections.filter((s) => s.confidence === "low");

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {mode === "onboarding" ? "Your AI Operator Plan" : "Proposed Change"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "onboarding"
              ? "Here's what I'll set up for your business. Review and approve when ready."
              : "Here's what will change. Review and approve when ready."}
          </p>
        </div>
      </div>

      {/* Warning banner if low confidence sections */}
      {lowConfidence.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                I need your input on {lowConfidence.length} thing{lowConfidence.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Sections marked as "Unsure" below need your confirmation before I can proceed.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Sections */}
      <div className="space-y-2">
        {sections.map((section) => (
          <Card
            key={section.id}
            className={`transition-colors ${
              section.confidence === "low"
                ? "border-amber-300/50"
                : section.confidence === "medium"
                ? "border-amber-200/30"
                : ""
            }`}
          >
            <button
              className="w-full text-left p-4 flex items-center justify-between"
              onClick={() => toggleSection(section.id)}
            >
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-sm">{section.title}</h3>
                <Badge
                  variant="outline"
                  className={`text-xs ${CONFIDENCE_COLORS[section.confidence]}`}
                >
                  {CONFIDENCE_LABELS[section.confidence]}
                </Badge>
              </div>
              {expandedSections.has(section.id) ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {expandedSections.has(section.id) && (
              <div className="px-4 pb-4">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {section.content}
                </div>
                {section.owner_action && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <p className="text-xs font-medium text-amber-800 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {section.owner_action}
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Reasoning Notes (collapsible) */}
      {reasoningNotes && (
        <div>
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setShowReasoning(!showReasoning)}
          >
            {showReasoning ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Why I chose these options
          </button>
          {showReasoning && (
            <div className="mt-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground whitespace-pre-wrap">
              {reasoningNotes}
            </div>
          )}
        </div>
      )}

      {/* Feedback & Actions */}
      {needsAction && (
        <div>
          <Textarea
            placeholder="Tell me what to adjust (e.g., 'make the deposit 50% for weekends' or 'we don't do delivery')..."
            className="resize-none"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
      )}

      <div className="flex gap-3">
        {needsAction && (
          <Button
            variant="outline"
            onClick={() => onEdit(feedback)}
            disabled={loading || !feedback.trim()}
            className="flex-1"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Adjust Plan
          </Button>
        )}
        <Button
          onClick={() => onApprove(feedback || undefined)}
          disabled={loading}
          className="flex-1"
        >
          <Check className="h-4 w-4 mr-2" />
          {loading ? "Applying..." : mode === "onboarding" ? "Approve & Build" : "Approve Change"}
        </Button>
      </div>
    </div>
  );
}
