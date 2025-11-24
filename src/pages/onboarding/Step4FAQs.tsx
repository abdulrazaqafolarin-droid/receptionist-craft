import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ArrowRight, Plus, Trash2, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const FAQ_TEMPLATES = {
  "Dental Clinic": [
    { question: "Do you accept insurance?", answer: "Yes, we accept most major dental insurance plans. Please contact us with your provider details." },
    { question: "How much does a cleaning cost?", answer: "A standard cleaning typically costs $120-$180 depending on your needs." },
    { question: "What are your hours?", answer: "We're open Monday-Friday 9am-5pm, and Saturday 9am-2pm." },
    { question: "Do you accept walk-ins?", answer: "We recommend booking an appointment, but we'll try to accommodate walk-ins when possible." },
    { question: "How long does a cleaning take?", answer: "Most cleanings take about 60 minutes." },
  ],
  "Spa & Wellness": [
    { question: "What should I bring to my appointment?", answer: "Just bring yourself! We provide robes, towels, and all amenities." },
    { question: "Can I book multiple services?", answer: "Yes! You can combine services. Just let us know when booking." },
    { question: "What is your cancellation policy?", answer: "Please give us 24 hours notice for cancellations or changes." },
  ],
};

export default function Step4FAQs() {
  const { receptionist, faqs, addFAQ, removeFAQ, setFAQs, setStep, receptionistId } = useOnboardingStore();
  const [newFAQ, setNewFAQ] = useState({ question: "", answer: "" });
  const [loading, setLoading] = useState(false);

  const templateFAQs = FAQ_TEMPLATES[receptionist.business_type as keyof typeof FAQ_TEMPLATES] || [];

  const handleImportTemplates = () => {
    const faqsWithPriority = templateFAQs.map((faq, idx) => ({ ...faq, priority: idx }));
    setFAQs([...faqs, ...faqsWithPriority]);
    toast.success(`${templateFAQs.length} template FAQs imported`);
  };

  const handleAddCustomFAQ = () => {
    if (!newFAQ.question || !newFAQ.answer) {
      toast.error("Please enter both question and answer");
      return;
    }
    addFAQ({ ...newFAQ, priority: faqs.length });
    setNewFAQ({ question: "", answer: "" });
    toast.success("FAQ added");
  };

  const handleContinue = async () => {
    if (faqs.length < 3) {
      toast.error("Please add at least 3 FAQs (templates or custom)");
      return;
    }

    setLoading(true);
    try {
      const faqsToInsert = faqs.map((faq) => ({
        receptionist_id: receptionistId,
        question: faq.question,
        answer: faq.answer,
        priority: faq.priority,
      }));

      const { error } = await supabase.from("receptionist_faqs").insert(faqsToInsert);
      if (error) throw error;

      toast.success("FAQs saved successfully!");
      setStep(5);
    } catch (error: any) {
      toast.error(error.message || "Failed to save FAQs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <CardTitle>Add Frequently Asked Questions</CardTitle>
        </div>
        <CardDescription>
          Help your AI receptionist answer common customer questions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Import */}
        {templateFAQs.length > 0 && (
          <div className="p-4 border rounded-lg bg-primary/5">
            <h4 className="font-semibold mb-2">Import Template FAQs</h4>
            <p className="text-sm text-muted-foreground mb-4">
              We've prepared {templateFAQs.length} common FAQs for {receptionist.business_type}
            </p>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {templateFAQs.map((faq, idx) => (
                <div key={idx} className="p-2 bg-background rounded text-sm">
                  <div className="font-medium">{faq.question}</div>
                  <div className="text-xs text-muted-foreground">{faq.answer}</div>
                </div>
              ))}
            </div>
            <Button onClick={handleImportTemplates} variant="default">
              Import All Template FAQs
            </Button>
          </div>
        )}

        {/* Current FAQs */}
        {faqs.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Your FAQs ({faqs.length})</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {faqs.map((faq, idx) => (
                <div key={idx} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{faq.question}</div>
                      <div className="text-xs text-muted-foreground mt-1">{faq.answer}</div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFAQ(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Custom FAQ */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-semibold">Add Custom FAQ</h4>
          <div className="space-y-3">
            <div>
              <Label htmlFor="question">Question</Label>
              <Input
                id="question"
                placeholder="e.g., What are your business hours?"
                value={newFAQ.question}
                onChange={(e) => setNewFAQ({ ...newFAQ, question: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="answer">Answer</Label>
              <Textarea
                id="answer"
                placeholder="Enter a detailed answer..."
                value={newFAQ.answer}
                onChange={(e) => setNewFAQ({ ...newFAQ, answer: e.target.value })}
                rows={3}
              />
            </div>
            <Button onClick={handleAddCustomFAQ} variant="outline" className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add FAQ
            </Button>
          </div>
        </div>

        {/* Minimum requirement notice */}
        {faqs.length < 3 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm">
            <p className="text-yellow-700 dark:text-yellow-300">
              Add at least {3 - faqs.length} more FAQ{3 - faqs.length > 1 ? "s" : ""} to continue
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep(3)} size="lg">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleContinue} disabled={loading || faqs.length < 3} className="flex-1" size="lg">
            {loading ? "Saving..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
