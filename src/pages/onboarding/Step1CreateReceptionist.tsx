import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Sparkles, MapPin, Users, History, Trophy, FileText, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Additional business info state
  const [businessInfo, setBusinessInfo] = useState({
    location: "",
    customerInteraction: "",
    businessHistory: "",
    competitiveAdvantages: "",
    aiGuidelines: "",
    generalKnowledge: "",
  });

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

      // Build comprehensive business info JSON
      const comprehensiveBusinessInfo = {
        location: businessInfo.location || null,
        customer_interaction_guidelines: businessInfo.customerInteraction || null,
        business_history: businessInfo.businessHistory || null,
        competitive_advantages: businessInfo.competitiveAdvantages || null,
        ai_guidelines: businessInfo.aiGuidelines || null,
        general_knowledge: businessInfo.generalKnowledge || null,
      };

      // Build enhanced goal with all business context
      const enhancedGoal = buildEnhancedGoal(receptionist.goal, businessInfo);

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
          goal: enhancedGoal,
          address: businessInfo.location || null,
          business_info: comprehensiveBusinessInfo,
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

  // Build enhanced goal combining user goal with business context
  function buildEnhancedGoal(userGoal: string, info: typeof businessInfo): string {
    const parts: string[] = [];
    
    if (userGoal) parts.push(`PRIMARY GOAL: ${userGoal}`);
    
    if (info.location) {
      parts.push(`LOCATION: Our business is located at ${info.location}. Use this for directions and location questions.`);
    }
    
    if (info.customerInteraction) {
      parts.push(`CUSTOMER INTERACTION GUIDELINES: ${info.customerInteraction}`);
    }
    
    if (info.businessHistory) {
      parts.push(`ABOUT US: ${info.businessHistory}`);
    }
    
    if (info.competitiveAdvantages) {
      parts.push(`WHY CHOOSE US: ${info.competitiveAdvantages}`);
    }
    
    if (info.aiGuidelines) {
      parts.push(`SPECIFIC RULES TO FOLLOW: ${info.aiGuidelines}`);
    }
    
    if (info.generalKnowledge) {
      parts.push(`ADDITIONAL KNOWLEDGE: ${info.generalKnowledge}`);
    }
    
    return parts.join('\n\n');
  }

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

        {/* Advanced Business Information Section */}
        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Advanced Business Information
              </span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              Add detailed information about your business to make your AI receptionist smarter and more helpful.
            </p>

            <div className="space-y-2">
              <Label htmlFor="location" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Business Location & Address
              </Label>
              <Textarea
                id="location"
                placeholder="Enter your full business address, landmarks nearby, parking information, or directions. Example: '123 Main Street, Suite 200, Downtown Seattle. Free parking available in the back lot. We're right next to Starbucks.'"
                value={businessInfo.location}
                onChange={(e) => setBusinessInfo({ ...businessInfo, location: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerInteraction" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                How to Interact with Customers
              </Label>
              <Textarea
                id="customerInteraction"
                placeholder="Describe how you want the AI to interact with customers. Example: 'Always be empathetic. If a customer mentions pain, prioritize their appointment. Never rush customers. Always confirm appointment details twice.'"
                value={businessInfo.customerInteraction}
                onChange={(e) => setBusinessInfo({ ...businessInfo, customerInteraction: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessHistory" className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Business History & Background
              </Label>
              <Textarea
                id="businessHistory"
                placeholder="Share your business story. Example: 'We've been serving the community since 1985. Founded by Dr. Smith, a third-generation dentist. We specialize in family dentistry and have won the Best Dentist award 5 years in a row.'"
                value={businessInfo.businessHistory}
                onChange={(e) => setBusinessInfo({ ...businessInfo, businessHistory: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="competitiveAdvantages" className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-primary" />
                Why You Stand Out (Competitive Advantages)
              </Label>
              <Textarea
                id="competitiveAdvantages"
                placeholder="What makes you different from competitors? Example: 'We offer same-day appointments. All our dentists are board-certified specialists. We accept all insurance plans. We have a spa-like atmosphere with massage chairs and Netflix.'"
                value={businessInfo.competitiveAdvantages}
                onChange={(e) => setBusinessInfo({ ...businessInfo, competitiveAdvantages: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="aiGuidelines" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Specific AI Guidelines & Rules
              </Label>
              <Textarea
                id="aiGuidelines"
                placeholder="Any specific rules the AI must follow? Example: 'Never discuss pricing for cosmetic procedures over chat - always ask them to call. Always mention our 10% senior discount. Never schedule appointments before 9 AM on Mondays.'"
                value={businessInfo.aiGuidelines}
                onChange={(e) => setBusinessInfo({ ...businessInfo, aiGuidelines: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="generalKnowledge" className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                General Knowledge & Other Information
              </Label>
              <Textarea
                id="generalKnowledge"
                placeholder="Any other information the AI should know? Example: 'We're closed for lunch from 12-1 PM. We have a referral program - $50 credit for each referral. Our waiting room has toys for kids. We speak Spanish and Mandarin.'"
                value={businessInfo.generalKnowledge}
                onChange={(e) => setBusinessInfo({ ...businessInfo, generalKnowledge: e.target.value })}
                rows={3}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Button onClick={handleContinue} disabled={loading} size="lg" className="w-full">
          {loading ? "Creating..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
