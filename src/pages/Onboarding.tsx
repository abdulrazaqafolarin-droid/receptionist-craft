import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const templates = [
  { id: "clinic", name: "Medical Clinic", icon: "🏥", faqs: [
    { question: "What services do you offer?", answer: "We offer general consultations, vaccinations, lab tests, and minor procedures." },
    { question: "What are your hours?", answer: "We're open Monday to Friday, 8am to 6pm, and Saturday 9am to 2pm." },
    { question: "How do I book an appointment?", answer: "You can book by calling us or I can help you book one right now!" },
  ]},
  { id: "salon", name: "Hair Salon", icon: "💇", faqs: [
    { question: "What services do you provide?", answer: "We offer haircuts, coloring, styling, treatments, and extensions." },
    { question: "Do I need an appointment?", answer: "We recommend booking ahead, but walk-ins are welcome when available." },
    { question: "What are your prices?", answer: "Haircuts start at $45. Would you like to know about specific services?" },
  ]},
  { id: "contractor", name: "Contractor", icon: "🔨", faqs: [
    { question: "What services do you offer?", answer: "We provide home renovations, repairs, remodeling, and custom builds." },
    { question: "Do you offer free estimates?", answer: "Yes! We provide free estimates for all projects. When works best for you?" },
    { question: "Are you licensed and insured?", answer: "Yes, we are fully licensed, bonded, and insured." },
  ]},
  { id: "dental", name: "Dental Office", icon: "🦷", faqs: [
    { question: "What services do you offer?", answer: "We offer cleanings, exams, fillings, crowns, whitening, and cosmetic dentistry." },
    { question: "Do you accept insurance?", answer: "Yes, we accept most major dental insurance plans." },
    { question: "How often should I visit?", answer: "We recommend a cleaning and checkup every 6 months." },
  ]},
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    businessName: "",
    receptionistName: "",
    tone: "friendly" as "friendly" | "professional" | "playful",
    language: "English",
    template: "",
  });

  const handleNext = () => {
    if (step === 1) {
      if (!formData.businessName || !formData.receptionistName) {
        toast.error("Please fill in all required fields");
        return;
      }
    }
    if (step === 2) {
      if (!formData.template) {
        toast.error("Please select a template");
        return;
      }
    }
    setStep(step + 1);
  };

  const handlePublish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const selectedTemplate = templates.find(t => t.id === formData.template);
      
      // Create receptionist
      const { data: receptionist, error: recError } = await supabase
        .from("receptionists")
        .insert({
          user_id: user.id,
          name: formData.receptionistName,
          business_name: formData.businessName,
          tone: formData.tone,
          language: formData.language,
          greeting_message: `Hi! Thanks for calling ${formData.businessName}. This is ${formData.receptionistName}. How can I help you today?`,
          persona_description: `${formData.tone.charAt(0).toUpperCase() + formData.tone.slice(1)}, efficient, and professional. Greets customers warmly and helps with booking and inquiries.`,
        })
        .select()
        .single();

      if (recError) throw recError;

      // Create FAQs
      if (selectedTemplate && receptionist) {
        const faqsToInsert = selectedTemplate.faqs.map((faq, idx) => ({
          receptionist_id: receptionist.id,
          question: faq.question,
          answer: faq.answer,
          priority: idx,
        }));

        const { error: faqError } = await supabase
          .from("receptionist_faqs")
          .insert(faqsToInsert);

        if (faqError) throw faqError;
      }

      // Mark onboarding as complete
      await supabase
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", user.id);

      toast.success(`🎉 Your AI Receptionist '${formData.receptionistName}' has been created successfully!`);
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to create receptionist");
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-4xl py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center h-10 w-10 rounded-full border-2 transition-colors ${
                  step >= s ? "bg-primary border-primary text-primary-foreground" : "border-border"
                }`}>
                  {step > s ? <Check className="h-5 w-5" /> : s}
                </div>
                {s < 3 && (
                  <div className={`flex-1 h-0.5 mx-2 ${step > s ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Basic Info</span>
            <span>Choose Template</span>
            <span>Preview & Publish</span>
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Let's start with the basics</CardTitle>
              <CardDescription>
                Tell us about your business and your AI receptionist
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  placeholder="e.g., Sunshine Dental Clinic"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">This is how your receptionist will introduce your business</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receptionistName">Receptionist Name *</Label>
                <Input
                  id="receptionistName"
                  placeholder="e.g., Sarah, Alex, or Maya"
                  value={formData.receptionistName}
                  onChange={(e) => setFormData({ ...formData, receptionistName: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">Give your AI receptionist a friendly name</p>
              </div>

              <div className="space-y-2">
                <Label>Preferred Tone</Label>
                <RadioGroup 
                  value={formData.tone} 
                  onValueChange={(value: any) => setFormData({ ...formData, tone: value })}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="friendly" id="friendly" />
                    <Label htmlFor="friendly" className="font-normal cursor-pointer">
                      Friendly — Warm and welcoming
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="professional" id="professional" />
                    <Label htmlFor="professional" className="font-normal cursor-pointer">
                      Professional — Polished and formal
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="playful" id="playful" />
                    <Label htmlFor="playful" className="font-normal cursor-pointer">
                      Playful — Fun and energetic
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Button onClick={handleNext} className="w-full" size="lg">
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Template Selection */}
        {step === 2 && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Choose a template</CardTitle>
              <CardDescription>
                Select a template that matches your business. You can customize everything later.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card
                    key={template.id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      formData.template === template.id 
                        ? "border-2 border-primary shadow-lg" 
                        : "border-2 border-transparent"
                    }`}
                    onClick={() => setFormData({ ...formData, template: template.id })}
                  >
                    <CardHeader>
                      <div className="text-4xl mb-2">{template.icon}</div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </CardHeader>
                  </Card>
                ))}
              </div>

              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep(1)} size="lg">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handleNext} className="flex-1" size="lg">
                  Continue <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview & Publish */}
        {step === 3 && (
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Preview & Publish</CardTitle>
              <CardDescription>
                Here's what your receptionist will say
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 bg-card p-4 rounded-lg border">
                    <p className="text-sm">
                      Hi! Thanks for calling {formData.businessName}. This is {formData.receptionistName}. How can I help you today?
                    </p>
                  </div>
                </div>
              </div>

              <Badge className="bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" />
                Demo Mode Active - Ready to test!
              </Badge>

              <div className="flex gap-4">
                <Button variant="outline" onClick={() => setStep(2)} size="lg">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button onClick={handlePublish} className="flex-1" size="lg">
                  Publish My Receptionist <Check className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
