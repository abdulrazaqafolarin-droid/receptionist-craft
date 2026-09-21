import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, ArrowLeft, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordSignal } from "@/lib/successSignals";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FloatingBackground } from "@/components/FloatingBackground";
import { PlanReview } from "@/components/PlanReview";

interface PlanSection {
  id: string;
  title: string;
  content: string;
  confidence: "high" | "medium" | "low";
  owner_action?: string;
}

type Step = "describe" | "review" | "building" | "done";

export default function ConversationalOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const businessName = searchParams.get("businessName") || "";
  const businessType = searchParams.get("businessType") || "";
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState(() => {
    if (businessName && businessType) {
      return `I run ${businessName}, ${businessType}. Please set up my AI operator for it.`;
    }
    if (businessName) {
      return `I run ${businessName}. Please set up my AI operator for it.`;
    }
    return "";
  });
  const [planData, setPlanData] = useState<{
    planText: string;
    sections: PlanSection[];
    reasoningNotes: string;
    config: Record<string, unknown>;
    versionId: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDescribe() {
    if (!description.trim()) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      // Create a receptionist first so we have an ID
      const { data: rec, error: recErr } = await supabase
        .from("receptionists")
        .insert({
          user_id: user.id,
          name: "Setting up...",
          business_name: "Setting up...",
          business_type: "General Business",
          tone: "friendly",
        })
        .select("id")
        .single();

      if (recErr || !rec) {
        throw new Error("Failed to create receptionist");
      }

      // Call the propose-operator-plan function
      const { data, error } = await supabase.functions.invoke("propose-operator-plan", {
        body: {
          description: description.trim(),
          receptionist_id: rec.id,
          user_id: user.id,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to generate plan");

      setPlanData({
        planText: data.plan.full_text,
        sections: data.plan.sections,
        reasoningNotes: data.reasoning_notes,
        config: data.config,
        versionId: data.version_id,
      });
      setStep("review");
    } catch (err) {
      console.error("Onboarding error:", err);
      const message = err instanceof Error ? err.message : "Failed to generate plan";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(feedback?: string) {
    setLoading(true);
    setStep("building");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get the receptionist we created
      const { data: recs } = await supabase
        .from("receptionists")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!recs || recs.length === 0) throw new Error("No receptionist found");
      const recId = recs[0].id;

      // Approve the plan
      const { data, error } = await supabase.functions.invoke("approve-operator-plan", {
        body: {
          version_id: planData?.versionId,
          receptionist_id: recId,
          user_id: user.id,
          config: planData?.config,
          plan_text: planData?.planText,
          owner_feedback: feedback,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to apply plan");

      // Mark onboarding as completed
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      recordSignal("configured_operator", { path: "conversational", receptionist_id: recId });

      setStep("done");
      toast.success("Your AI Operator is ready!");

      setTimeout(() => navigate(`/builder/${recId}`), 2000);
    } catch (err) {
      console.error("Approval error:", err);
      const message = err instanceof Error ? err.message : "Failed to apply plan";
      toast.error(message);
      setStep("review");
    } finally {
      setLoading(false);
    }
  }

  async function handleEdit(feedback: string) {
    // Re-submit with the feedback as an adjustment
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: recs } = await supabase
        .from("receptionists")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!recs || recs.length === 0) return;

      // Call request-change with the adjustment
      const { data, error } = await supabase.functions.invoke("request-change", {
        body: {
          change_request: `Based on the original description: "${description.trim()}", the owner wants this adjustment: "${feedback}". Please regenerate the plan with this change.`,
          receptionist_id: recs[0].id,
          user_id: user.id,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to update plan");

      setPlanData({
        planText: data.plan.full_text,
        sections: data.plan.sections,
        reasoningNotes: data.reasoning_notes,
        config: data.config,
        versionId: data.version_id,
      });
      toast.success("Plan updated with your feedback");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update plan";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Build Your AI Operator</h1>
              <p className="text-sm text-muted-foreground">
                Describe your business — I'll build the plan
              </p>
            </div>
          </div>
        </div>

        {/* Step: Describe */}
        {step === "describe" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div>
                <h2 className="font-medium mb-2">Tell me about your business</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Describe what your business does, how customers typically interact with you,
                  what matters to you (cancellation policies, deposit requirements, busiest days,
                  etc.). The more detail you give, the better I can tailor your operator.
                </p>
                <Textarea
                  placeholder={`For example: "I run a dental clinic in Lagos. We do checkups, cleanings, and cosmetic work. Patients usually want to know prices before booking. We need a 20% deposit because no-shows are expensive. We're closed Sundays. If someone sounds frustrated, I want to know immediately so I can call them back myself."`}
                  className="resize-none min-h-[200px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button
                onClick={handleDescribe}
                disabled={!description.trim() || loading}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Building your plan...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Build My AI Operator
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Review Plan */}
        {step === "review" && planData && (
          <PlanReview
            planText={planData.planText}
            sections={planData.sections}
            reasoningNotes={planData.reasoningNotes}
            onApprove={handleApprove}
            onEdit={handleEdit}
            loading={loading}
            mode="onboarding"
          />
        )}

        {/* Step: Building */}
        {step === "building" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
              <h2 className="text-lg font-medium mb-2">Building your AI Operator</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Applying your approved plan. This takes just a moment...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-lg font-medium mb-2">Your AI Operator is ready!</h2>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Redirecting you to the Builder where you can test and fine-tune your operator.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
