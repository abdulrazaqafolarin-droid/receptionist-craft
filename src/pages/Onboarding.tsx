import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordSignal } from "@/lib/successSignals";
import { Sparkles, ArrowRight, MessageSquareText, ListChecks, ArrowLeft } from "lucide-react";

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Returning owners creating another operator skip the intro and land on the choice.
  const returning = params.get("returning") === "1";
  const [step, setStep] = useState<"intro" | "fork">(returning ? "fork" : "intro");
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState({
    name: "",
    businessName: "",
    businessType: "",
  });

  const handleSaveDetails = async () => {
    if (!details.name.trim() || !details.businessName.trim() || !details.businessType.trim()) {
      toast.error("Please fill in all fields — this takes a few seconds");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ full_name: details.name.trim() }).eq("id", user.id);
      }
    } catch (err) {
      // non-fatal — the fork still works
      console.error("Failed to save personalization:", err);
    } finally {
      setSaving(false);
      setStep("fork");
    }
  };

  const buildQuery = () => {
    const params = new URLSearchParams();
    if (details.businessName.trim()) params.set("businessName", details.businessName.trim());
    if (details.businessType.trim()) params.set("businessType", details.businessType.trim());
    return params.toString();
  };

  const goConversational = () => {
    const query = buildQuery();
    recordSignal("onboarding_path_chosen", {
      path: "conversational",
      businessType: details.businessType.trim(),
    });
    navigate(query ? `/conversational-onboarding?${query}` : "/conversational-onboarding");
  };

  const goForm = () => {
    const query = buildQuery();
    recordSignal("onboarding_path_chosen", {
      path: "form",
      businessType: details.businessType.trim(),
    });
    // fresh=1 makes the wizard discard any abandoned mid-flow state so every
    // operator — first or fifth — starts clean.
    navigate(query ? `/onboarding-wizard?fresh=1&${query}` : "/onboarding-wizard?fresh=1");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-2xl py-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Welcome to FrontDesk
          </div>
        </div>

        {step === "intro" ? (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-2xl">Tell us about you and your business</CardTitle>
              <CardDescription>
                Just a few quick details — this is a greeting, not an intake form.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Sarah"
                  value={details.name}
                  onChange={(e) => setDetails({ ...details, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  placeholder="e.g., Sunshine Dental Clinic"
                  value={details.businessName}
                  onChange={(e) => setDetails({ ...details, businessName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessType">Business type</Label>
                <Input
                  id="businessType"
                  placeholder="e.g., a dental clinic, a hair salon, a gym"
                  value={details.businessType}
                  onChange={(e) => setDetails({ ...details, businessType: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">Describe it in your own words</p>
              </div>

              <Button onClick={handleSaveDetails} disabled={saving} className="w-full" size="lg">
                {saving ? "Saving..." : "Continue"}
                {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="text-2xl">How would you like to set up your AI operator?</CardTitle>
              <CardDescription>
                Both paths build the same thing — choose whichever feels natural to you.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                onClick={goConversational}
                className="w-full text-left rounded-xl border-2 border-primary bg-primary/5 p-6 transition-all hover:shadow-lg cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                    <MessageSquareText className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Build by talking it through</div>
                    <div className="text-xs font-medium text-primary">Recommended — fastest to a setup</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Just describe your business in plain language and we'll design your whole operator for you. You review it, then it's live.
                </p>
              </button>

              <button
                onClick={goForm}
                className="w-full text-left rounded-xl border-2 border-border p-6 transition-all hover:border-primary/50 hover:shadow cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <ListChecks className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-lg">Build with a step-by-step form</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Prefer to fill everything in yourself? Work through the guided wizard at your own pace.
                </p>
              </button>

              <Button variant="outline" onClick={() => (returning ? navigate("/dashboard") : setStep("intro"))} className="w-full" size="lg">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
