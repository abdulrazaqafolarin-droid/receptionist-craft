import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BUSINESS_TYPES = [
  // Service-based
  "Dental Clinic",
  "Spa & Wellness",
  "Barber Shop",
  "Restaurant",
  "Real Estate",
  "Medical Clinic",
  "Law Office",
  "Hair Salon",
  "Gym & Fitness",
  "Car Wash",
  // Product-based
  "Retail Store",
  "Electronics Store",
  "Bakery",
  "Florist",
  "Grocery Store",
  "Auto Parts",
  // Both
  "Pharmacy",
  "Pet Shop",
  "General Business",
];

export default function Step1CreateReceptionist() {
  const { receptionist, setReceptionist, setStep, setReceptionistId } = useOnboardingStore();
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!receptionist.name || !receptionist.business_name || !receptionist.business_type) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const greetingMessage = receptionist.greeting_message || 
        `Hi! Thanks for reaching out to ${receptionist.business_name}. This is ${receptionist.name}. How can I help you today?`;

      const { data, error } = await supabase
        .from("receptionists")
        .insert({
          user_id: user.id,
          name: receptionist.name,
          business_name: receptionist.business_name,
          business_type: receptionist.business_type,
          phone: receptionist.phone || null,
          tone: receptionist.tone,
          language: receptionist.language,
          greeting_message: greetingMessage,
          goal: receptionist.goal || null,
          persona_description: `${receptionist.tone.charAt(0).toUpperCase() + receptionist.tone.slice(1)}, professional AI receptionist for ${receptionist.business_name}.`,
        })
        .select()
        .single();

      if (error) throw error;

      setReceptionistId(data.id);
      setReceptionist({ greeting_message: greetingMessage });
      toast.success("Receptionist created successfully!");
      setStep(2);
    } catch (error: any) {
      toast.error(error.message || "Failed to create receptionist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Create Your AI Receptionist</CardTitle>
        </div>
        <CardDescription>
          Let's start by setting up your AI receptionist's identity and personality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Receptionist Name *</Label>
          <Input
            id="name"
            placeholder="e.g., Sarah, Alex, Maya"
            value={receptionist.name}
            onChange={(e) => setReceptionist({ name: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Give your AI a friendly, professional name</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_name">Business Name *</Label>
          <Input
            id="business_name"
            placeholder="e.g., Sunshine Dental Clinic"
            value={receptionist.business_name}
            onChange={(e) => setReceptionist({ business_name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_type">Business Type *</Label>
          <Select value={receptionist.business_type} onValueChange={(value) => setReceptionist({ business_type: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select your business type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Business Phone (Optional)</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={receptionist.phone}
            onChange={(e) => setReceptionist({ phone: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label>Tone & Personality *</Label>
          <RadioGroup value={receptionist.tone} onValueChange={(value: any) => setReceptionist({ tone: value })}>
            <div className="flex items-center space-x-2 p-3 border rounded-md">
              <RadioGroupItem value="friendly" id="friendly" />
              <Label htmlFor="friendly" className="font-normal cursor-pointer flex-1">
                <div className="font-medium">Friendly</div>
                <div className="text-xs text-muted-foreground">Warm, welcoming, and conversational</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-md">
              <RadioGroupItem value="professional" id="professional" />
              <Label htmlFor="professional" className="font-normal cursor-pointer flex-1">
                <div className="font-medium">Professional</div>
                <div className="text-xs text-muted-foreground">Polished, formal, and efficient</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-md">
              <RadioGroupItem value="playful" id="playful" />
              <Label htmlFor="playful" className="font-normal cursor-pointer flex-1">
                <div className="font-medium">Playful</div>
                <div className="text-xs text-muted-foreground">Fun, energetic, and engaging</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language">Primary Language</Label>
          <Select value={receptionist.language} onValueChange={(value) => setReceptionist({ language: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="English">English</SelectItem>
              <SelectItem value="Spanish">Spanish</SelectItem>
              <SelectItem value="French">French</SelectItem>
              <SelectItem value="German">German</SelectItem>
              <SelectItem value="Italian">Italian</SelectItem>
              <SelectItem value="Portuguese">Portuguese</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="greeting">Custom Greeting Message (Optional)</Label>
          <Textarea
            id="greeting"
            placeholder={`Hi! Thanks for reaching out to ${receptionist.business_name || "us"}. This is ${receptionist.name || "your AI receptionist"}. How can I help you today?`}
            value={receptionist.greeting_message}
            onChange={(e) => setReceptionist({ greeting_message: e.target.value })}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="goal">Main Goal & Custom Instructions (Optional)</Label>
          <Textarea
            id="goal"
            placeholder="Describe how you want your AI receptionist to behave, what information it should prioritize, and any specific business details it should know. Example: 'Focus on booking appointments quickly. Always mention our 20% new patient discount.'"
            value={receptionist.goal}
            onChange={(e) => setReceptionist({ goal: e.target.value })}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            This information will be refined and integrated into the AI's behavior
          </p>
        </div>

        <Button onClick={handleContinue} disabled={loading} size="lg" className="w-full">
          {loading ? "Creating..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
