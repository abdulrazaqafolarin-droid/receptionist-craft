import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, MessageSquare, Sparkles, Clock, Phone, HelpCircle } from "lucide-react";
import { toast } from "sonner";

const TEST_SCENARIOS = [
  { label: "Ask about hours", message: "What are your business hours?" },
  { label: "Ask about pricing", message: "How much does it cost?" },
  { label: "Try booking", message: "I'd like to book an appointment" },
  { label: "Ask an FAQ", message: "Do you accept insurance?" },
  { label: "Small talk", message: "Hi, how are you?" },
];

export default function Step5Test() {
  const { receptionist, services, faqs, setStep, receptionistId } = useOnboardingStore();
  const [showChat, setShowChat] = useState(false);

  const handleContinue = () => {
    toast.success("Testing complete! Let's get your widget installed.");
    setStep(6);
  };

  const widgetUrl = `${window.location.origin}/widget?rid=${receptionistId}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle>Test Your AI Receptionist</CardTitle>
        </div>
        <CardDescription>
          Try out your receptionist before going live
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Receptionist Summary */}
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="flex items-start gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{receptionist.name}</h3>
              <p className="text-sm text-muted-foreground">{receptionist.business_name}</p>
            </div>
            <Badge variant="secondary">{receptionist.tone}</Badge>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-background rounded">
              <div className="text-2xl font-bold text-primary">{services.length}</div>
              <div className="text-xs text-muted-foreground">Services</div>
            </div>
            <div className="p-3 bg-background rounded">
              <div className="text-2xl font-bold text-primary">{faqs.length}</div>
              <div className="text-xs text-muted-foreground">FAQs</div>
            </div>
            <div className="p-3 bg-background rounded">
              <div className="text-2xl font-bold text-primary">✓</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
          </div>
        </div>

        {/* Test Scenarios */}
        <div className="space-y-3">
          <h4 className="font-semibold">Try These Test Scenarios:</h4>
          <div className="grid gap-2">
            {TEST_SCENARIOS.map((scenario, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="justify-start h-auto p-3"
                onClick={() => {
                  setShowChat(true);
                  window.open(widgetUrl, "_blank", "width=400,height=600");
                }}
              >
                <MessageSquare className="mr-2 h-4 w-4 text-primary" />
                <div className="text-left">
                  <div className="font-medium text-sm">{scenario.label}</div>
                  <div className="text-xs text-muted-foreground">{scenario.message}</div>
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Info */}
        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Your AI answers instantly, 24/7</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>Handles bookings automatically</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Answers FAQs without human intervention</span>
          </div>
        </div>

        {/* Start Test Button */}
        {!showChat && (
          <Button
            onClick={() => {
              setShowChat(true);
              window.open(widgetUrl, "_blank", "width=400,height=600");
            }}
            size="lg"
            className="w-full"
          >
            <MessageSquare className="mr-2 h-5 w-5" />
            Open Test Chat
          </Button>
        )}

        {/* Navigation */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep(4)} size="lg">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleContinue} className="flex-1" size="lg">
            Continue to Install <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
