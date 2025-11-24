import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboardingStore } from "@/store/onboarding";
import { Progress } from "@/components/ui/progress";
import { Check } from "lucide-react";
import Step1CreateReceptionist from "./onboarding/Step1CreateReceptionist";
import Step2Services from "./onboarding/Step2Services";
import Step3Availability from "./onboarding/Step3Availability";
import Step4FAQs from "./onboarding/Step4FAQs";
import Step5Test from "./onboarding/Step5Test";
import Step6Install from "./onboarding/Step6Install";

const STEPS = [
  { number: 1, title: "Create Receptionist" },
  { number: 2, title: "Add Services" },
  { number: 3, title: "Set Availability" },
  { number: 4, title: "Add FAQs" },
  { number: 5, title: "Test" },
  { number: 6, title: "Install" },
];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const { currentStep } = useOnboardingStore();
  const progressPercentage = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl py-8">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {STEPS.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div
                  className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-colors ${
                    currentStep >= step.number
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-colors ${
                      currentStep > step.number ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            {STEPS.map((step) => (
              <span key={step.number} className={currentStep === step.number ? "text-foreground font-medium" : ""}>
                {step.title}
              </span>
            ))}
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Step Content */}
        <div className="animate-fade-in">
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
