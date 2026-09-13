import { useState, useEffect } from "react";
import { useOnboardingStore, type PrimaryGoal, type BusinessCapabilities } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Sparkles, MapPin, Users, History, Trophy, FileText, BookOpen, ChevronDown, ChevronUp, Target, ShoppingCart, Calendar, Headphones, UserPlus, Truck, Shield, AlertTriangle } from "lucide-react";
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

const PRIMARY_GOALS: { value: PrimaryGoal; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'sales', label: 'Increase Sales', description: 'Focus on selling products and closing deals', icon: <ShoppingCart className="h-4 w-4" /> },
  { value: 'bookings', label: 'Get More Bookings', description: 'Prioritize appointment scheduling', icon: <Calendar className="h-4 w-4" /> },
  { value: 'support', label: 'Answer Questions', description: 'Provide information and customer support', icon: <Headphones className="h-4 w-4" /> },
  { value: 'leads', label: 'Capture Leads', description: 'Collect contact information from prospects', icon: <UserPlus className="h-4 w-4" /> },
];

const CAPABILITY_OPTIONS: { key: keyof BusinessCapabilities; label: string; description: string; icon: React.ReactNode }[] = [
  { key: 'sells_products', label: 'Sell Products', description: 'Take product orders from customers', icon: <ShoppingCart className="h-4 w-4" /> },
  { key: 'books_appointments', label: 'Book Appointments', description: 'Schedule appointments and services', icon: <Calendar className="h-4 w-4" /> },
  { key: 'offers_services', label: 'Offer Services', description: 'Provide on-demand or scheduled services', icon: <Headphones className="h-4 w-4" /> },
  { key: 'delivers', label: 'Deliver to Customers', description: 'Offer delivery options for orders', icon: <Truck className="h-4 w-4" /> },
  { key: 'requires_compliance', label: 'Requires Compliance', description: 'Has regulatory or legal requirements', icon: <Shield className="h-4 w-4" /> },
  { key: 'supports_emergency', label: 'Handle Urgent Requests', description: 'Support emergency or urgent inquiries', icon: <AlertTriangle className="h-4 w-4" /> },
];

// Auto-detect capabilities based on business type
function getDefaultCapabilities(businessType: string): BusinessCapabilities {
  const defaults: BusinessCapabilities = {
    sells_products: false,
    books_appointments: true,
    offers_services: true,
    delivers: false,
    requires_compliance: false,
    supports_emergency: false,
    deposit_required: false,
    deposit_percent: 0,
  };

  switch (businessType) {
    case 'Dental Clinic':
    case 'Medical Clinic':
    case 'Spa & Wellness':
    case 'Barber Shop':
    case 'Hair Salon':
    case 'Law Office':
      return { ...defaults, books_appointments: true, offers_services: true, requires_compliance: true };
    
    case 'Grocery Store':
    case 'Electronics Store':
    case 'Retail Store':
    case 'Auto Parts':
    case 'Bakery':
      return { ...defaults, sells_products: true, books_appointments: false, offers_services: false, delivers: true };
    
    case 'Car Wash':
    case 'Gym & Fitness':
    case 'Florist':
      return { ...defaults, books_appointments: true, offers_services: true };
    
    case 'Pharmacy':
      return { sells_products: true, books_appointments: true, offers_services: true, delivers: true, requires_compliance: true, supports_emergency: true, deposit_required: false, deposit_percent: 0 };
    
    case 'Restaurant':
      return { ...defaults, sells_products: true, books_appointments: true, delivers: true };
    
    case 'Pet Shop':
      return { ...defaults, sells_products: true, books_appointments: true, offers_services: true, delivers: true };
    
    case 'Real Estate':
      return { ...defaults, books_appointments: true, offers_services: true, requires_compliance: true };
    
    default:
      return { ...defaults, sells_products: true, books_appointments: true, offers_services: true };
  }
}

// Auto-detect primary goal based on business type
function getDefaultPrimaryGoal(businessType: string): PrimaryGoal {
  switch (businessType) {
    case 'Dental Clinic':
    case 'Medical Clinic':
    case 'Spa & Wellness':
    case 'Barber Shop':
    case 'Hair Salon':
    case 'Law Office':
    case 'Real Estate':
    case 'Restaurant':
    case 'Car Wash':
    case 'Gym & Fitness':
      return 'bookings';
    
    case 'Grocery Store':
    case 'Electronics Store':
    case 'Retail Store':
    case 'Auto Parts':
    case 'Bakery':
    case 'Pharmacy':
    case 'Pet Shop':
    case 'Florist':
      return 'sales';
    
    default:
      return 'support';
  }
}

export default function Step1CreateReceptionist() {
  const { receptionist, setReceptionist, setStep, setReceptionistId } = useOnboardingStore();
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [hasManuallySetCapabilities, setHasManuallySetCapabilities] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Additional business info state
  const [businessInfo, setBusinessInfo] = useState({
    location: "",
    customerInteraction: "",
    businessHistory: "",
    competitiveAdvantages: "",
    aiGuidelines: "",
    generalKnowledge: "",
  });

  // Auto-update capabilities and primary goal when business type changes
  // ONLY if user hasn't manually set them
  useEffect(() => {
    if (receptionist.business_type && !hasManuallySetCapabilities) {
      const defaultCaps = getDefaultCapabilities(receptionist.business_type);
      const defaultGoal = getDefaultPrimaryGoal(receptionist.business_type);
      setReceptionist({ 
        capabilities: defaultCaps, 
        primary_goal: defaultGoal 
      });
    }
  }, [receptionist.business_type, hasManuallySetCapabilities, setReceptionist]);

  // Auto-set business_model based on capabilities
  // Guard against undefined capabilities from persisted state
  useEffect(() => {
    // Ensure capabilities exists before destructuring
    if (!receptionist.capabilities) {
      // Initialize with defaults if missing
      setReceptionist({ capabilities: getDefaultCapabilities(receptionist.business_type || 'General Business') });
      return;
    }
    
    const { sells_products, books_appointments, offers_services } = receptionist.capabilities;
    if (sells_products && (books_appointments || offers_services)) {
      setReceptionist({ business_model: 'both' });
    } else if (sells_products) {
      setReceptionist({ business_model: 'products' });
    } else {
      setReceptionist({ business_model: 'services' });
    }
  }, [receptionist.capabilities, receptionist.business_type, setReceptionist]);

  const handleCapabilityChange = (key: keyof BusinessCapabilities, checked: boolean) => {
    setHasManuallySetCapabilities(true); // Mark as manually set
    setReceptionist({
      capabilities: {
        ...receptionist.capabilities,
        [key]: checked,
      },
    });
  };

  // Clear validation error when field is updated
  const handleFieldChange = (field: string, value: string) => {
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    setReceptionist({ [field]: value });
  };

  // Validate all required fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!receptionist.name?.trim()) {
      errors.name = "Receptionist name is required";
    }
    if (!receptionist.business_name?.trim()) {
      errors.business_name = "Business name is required";
    }
    if (!receptionist.business_type) {
      errors.business_type = "Please select a business type";
    }
    if (!receptionist.primary_goal) {
      errors.primary_goal = "Please select a primary goal";
    }
    
    // Check at least one capability is selected (guard against undefined)
    const capabilities = receptionist.capabilities || {};
    const hasCapability = Object.values(capabilities).some(v => v);
    if (!hasCapability) {
      errors.capabilities = "Please select at least one capability";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) {
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
          // New capability-based fields
          primary_goal: receptionist.primary_goal,
          capabilities: receptionist.capabilities,
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
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Create Your AI Receptionist</CardTitle>
        </div>
        <CardDescription>
          Let's start by setting up your AI receptionist's identity and capabilities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name" className={validationErrors.name ? "text-destructive" : ""}>
            Receptionist Name *
          </Label>
          <Input
            id="name"
            placeholder="e.g., Sarah, Alex, Maya"
            value={receptionist.name}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            className={validationErrors.name ? "border-destructive" : ""}
          />
          {validationErrors.name ? (
            <p className="text-xs text-destructive">{validationErrors.name}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Give your AI a friendly, professional name</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_name" className={validationErrors.business_name ? "text-destructive" : ""}>
            Business Name *
          </Label>
          <Input
            id="business_name"
            placeholder="e.g., Sunshine Dental Clinic"
            value={receptionist.business_name}
            onChange={(e) => handleFieldChange('business_name', e.target.value)}
            className={validationErrors.business_name ? "border-destructive" : ""}
          />
          {validationErrors.business_name && (
            <p className="text-xs text-destructive">{validationErrors.business_name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="business_type" className={validationErrors.business_type ? "text-destructive" : ""}>
            Business Type *
          </Label>
          <Select 
            value={receptionist.business_type} 
            onValueChange={(value) => {
              setHasManuallySetCapabilities(false); // Reset manual flag when type changes
              handleFieldChange('business_type', value);
            }}
          >
            <SelectTrigger className={validationErrors.business_type ? "border-destructive" : ""}>
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
          {validationErrors.business_type ? (
            <p className="text-xs text-destructive">{validationErrors.business_type}</p>
          ) : (
            <p className="text-xs text-muted-foreground">This helps us auto-configure your AI's capabilities</p>
          )}
        </div>

        {/* Primary Business Goal Selector */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            What's your main goal with this AI? *
          </Label>
          <RadioGroup 
            value={receptionist.primary_goal} 
            onValueChange={(value: PrimaryGoal) => setReceptionist({ primary_goal: value })}
            className="grid grid-cols-1 md:grid-cols-2 gap-3"
          >
            {PRIMARY_GOALS.map((goal) => (
              <div key={goal.value} className="flex items-center space-x-2 p-3 border rounded-md hover:bg-muted/50 transition-colors">
                <RadioGroupItem value={goal.value} id={goal.value} />
                <Label htmlFor={goal.value} className="font-normal cursor-pointer flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {goal.icon}
                    {goal.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{goal.description}</div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Business Capabilities Section */}
        {/* Business Capabilities Section */}
        <Collapsible open={showCapabilities} onOpenChange={setShowCapabilities}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="outline" 
              className={`w-full justify-between ${validationErrors.capabilities ? "border-destructive" : ""}`}
            >
              <span className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Business Capabilities
                {hasManuallySetCapabilities && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">Customized</span>
                )}
              </span>
              {showCapabilities ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Select what your business can do. The AI will adapt its behavior based on these capabilities.
            </p>
            {validationErrors.capabilities && (
              <p className="text-xs text-destructive">{validationErrors.capabilities}</p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {CAPABILITY_OPTIONS.map((cap) => (
                <div 
                  key={cap.key} 
                  className={`flex items-start space-x-3 p-3 border rounded-md hover:bg-muted/50 transition-colors ${
                    receptionist.capabilities[cap.key] ? "border-primary/50 bg-primary/5" : ""
                  }`}
                >
                  <Checkbox
                    id={cap.key}
                    checked={!!receptionist.capabilities[cap.key]}
                    onCheckedChange={(checked) => handleCapabilityChange(cap.key, checked === true)}
                  />
                  <Label htmlFor={cap.key} className="font-normal cursor-pointer flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      {cap.icon}
                      {cap.label}
                    </div>
                    <div className="text-xs text-muted-foreground">{cap.description}</div>
                  </Label>
                </div>
              ))}
            </div>
            
            {/* Business Model Summary */}
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">AI Mode: <span className="text-primary capitalize">{receptionist.business_model}</span></p>
              <p className="text-xs text-muted-foreground mt-1">
                {receptionist.business_model === 'both' && "Your AI will handle both appointments/services and product orders."}
                {receptionist.business_model === 'services' && "Your AI will focus on booking appointments and providing service information."}
                {receptionist.business_model === 'products' && "Your AI will focus on taking product orders and managing inventory."}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

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