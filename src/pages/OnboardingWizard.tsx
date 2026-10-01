import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOnboardingStore } from "@/store/onboarding";
import { Progress } from "@/components/ui/progress";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import Step0Describe from "./onboarding/Step0Describe";
import Step1CreateReceptionist from "./onboarding/Step1CreateReceptionist";
import Step2Services from "./onboarding/Step2Services";
import Step3Availability from "./onboarding/Step3Availability";
import Step4FAQs from "./onboarding/Step4FAQs";
import Step5Test from "./onboarding/Step5Test";
import Step6Install from "./onboarding/Step6Install";

const STEPS = [
  { number: 0, title: "Describe" },
  { number: 1, title: "Create" },
  { number: 2, title: "Services" },
  { number: 3, title: "Availability" },
  { number: 4, title: "FAQs" },
  { number: 5, title: "Test" },
  { number: 6, title: "Install" },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentStep, setStep, reset } = useOnboardingStore();
  const progressPercentage = (currentStep / STEPS.length) * 100;

  // A fresh start (first run from the choice screen) discards any abandoned
  // mid-flow wizard state so a new operator never inherits old data.
  // The flag is stripped immediately so a mid-flow refresh preserves progress.
  useEffect(() => {
    if (searchParams.get("fresh") === "1") {
      reset();
      setStep(0);
      navigate("/onboarding-wizard", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl py-6 sm:py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Setup Wizard
          </div>
          <h1 className="type-page text-foreground">
            Create Your AI Receptionist
          </h1>
          <p className="text-muted-foreground mt-2">Follow these steps to get started</p>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div
                  className={cn(
                    "flex items-center justify-center h-10 w-10 sm:h-12 sm:w-12 rounded-xl border-2 transition-all duration-300 font-semibold text-sm",
                    currentStep > step.number
                      ? "bg-primary border-primary text-primary-foreground shadow-contact"
                      : currentStep === step.number
                      ? "bg-primary/10 border-primary text-primary"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-1 mx-2 rounded-full transition-all duration-300",
                      currentStep > step.number ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="hidden sm:flex justify-between text-xs text-muted-foreground px-1">
            {STEPS.map((step) => (
              <span 
                key={step.number} 
                className={cn(
                  "transition-colors",
                  currentStep === step.number ? "text-primary font-medium" : ""
                )}
              >
                {step.title}
              </span>
            ))}
          </div>
          <Progress value={progressPercentage} className="h-1.5 mt-4" />
        </div>

        {/* Step Content */}
        <div className="animate-fade-in">
          {currentStep === 0 && <Step0Describe />}
          {currentStep === 1 && <Step1CreateReceptionist />}
          {currentStep === 2 && <Step2Services />}
          {currentStep === 3 && <Step3Availability />}
          {currentStep === 4 && <Step4FAQs />}
          {currentStep === 5 && <Step5Test />}
          {currentStep === 6 && <Step6Install />}
        </div>
      </div>
    </div>
  );
}
