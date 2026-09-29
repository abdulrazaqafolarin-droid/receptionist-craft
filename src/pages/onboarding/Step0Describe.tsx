import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { draftOperationsConfig } from "@/lib/gateway";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Sparkles, ArrowRight, AlertTriangle, Wand2 } from "lucide-react";

/**
 * Step 0 — Business Configuration Agent entry point (Phase 1).
 *
 * The owner describes their business in plain language; the configurator
 * agent drafts a validated OperationsConfig that pre-fills Steps 1-3.
 * The wizard remains the source of truth: everything after this is
 * confirm/adjust. Skipping is always available — manual setup unchanged.
 */
export default function Step0Describe() {
  const { setStep, applyOperationsConfig } = useOnboardingStore();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<{ error: string; issues?: string[] } | null>(null);

  async function handleGenerate() {
    if (!description.trim() || loading) return;
    setLoading(true);
    setFailure(null);
    try {
      const result = await draftOperationsConfig(description);
      if (result.ok) {
        applyOperationsConfig(result.config);
        setStep(1);
      } else {
        setFailure({ error: result.error, issues: result.issues });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8 glass-1">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Wand2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Describe your business</h2>
          <p className="text-sm text-muted-foreground">
            The AI will draft your entire setup — you review and adjust it on the next steps.
          </p>
        </div>
      </div>

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={
          "Example: Sunrise Dental Clinic in Lagos. Open weekdays 9am-5pm and Saturdays 10am-2pm. We offer cleanings, fillings and whitening, and also sell electric toothbrushes with home delivery."
        }
        className="min-h-[160px] mt-4 text-base"
        disabled={loading}
      />

      {failure && (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn't generate a valid setup</AlertTitle>
          <AlertDescription>
            <p className="mb-1 text-sm opacity-90">
              {failure.error === "gateway_unreachable" &&
                "The AI service is unreachable right now — try again in a moment, or continue manually."}
              {failure.error === "gateway_timeout" && "The AI took too long to respond — please retry."}
              {failure.error === "gateway_auth_failed" && "AI service authentication failed — contact support."}
              {failure.error === "empty_description" && "Please write a description first."}
              {!["gateway_unreachable", "gateway_timeout", "gateway_auth_failed", "empty_description"].includes(failure.error) &&
                "The AI's draft didn't pass validation:"}
            </p>
            {failure.issues && failure.issues.length > 0 && (
              <ul className="list-disc pl-5 text-xs space-y-0.5">
                {failure.issues.slice(0, 6).map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-5">
        <Button
          onClick={handleGenerate}
          disabled={!description.trim() || loading}
          className="flex-1 h-12 text-base"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Drafting your setup…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generate my setup
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={() => setStep(1)} disabled={loading} className="h-12">
          Set up manually
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Takes ~30 seconds · nothing is created until you review and confirm
      </p>
    </Card>
  );
}
