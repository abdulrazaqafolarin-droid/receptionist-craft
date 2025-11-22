import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FAQ {
  id?: string;
  question: string;
  answer: string;
  priority?: number;
}

interface FAQManagerProps {
  receptionistId: string;
}

export function FAQManager({ receptionistId }: FAQManagerProps) {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(false);
  const [newFaq, setNewFaq] = useState<FAQ>({ question: "", answer: "", priority: 0 });

  useEffect(() => {
    if (receptionistId) {
      loadFAQs();
    }
  }, [receptionistId]);

  const loadFAQs = async () => {
    try {
      const { data, error } = await supabase
        .from("receptionist_faqs")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .order("priority", { ascending: false });

      if (error) throw error;
      setFaqs(data || []);
    } catch (error: any) {
      console.error("Error loading FAQs:", error);
      toast.error("Failed to load FAQs");
    }
  };

  const saveFAQ = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) {
      toast.error("Please fill in both question and answer");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from("receptionist_faqs").insert([
        {
          receptionist_id: receptionistId,
          question: newFaq.question,
          answer: newFaq.answer,
          priority: newFaq.priority || 0,
        },
      ]);

      if (error) throw error;

      toast.success("FAQ added successfully");
      setNewFaq({ question: "", answer: "", priority: 0 });
      loadFAQs();
    } catch (error: any) {
      console.error("Error saving FAQ:", error);
      toast.error("Failed to save FAQ");
    } finally {
      setLoading(false);
    }
  };

  const deleteFAQ = async (id: string) => {
    try {
      const { error } = await supabase.from("receptionist_faqs").delete().eq("id", id);

      if (error) throw error;

      toast.success("FAQ deleted");
      loadFAQs();
    } catch (error: any) {
      console.error("Error deleting FAQ:", error);
      toast.error("Failed to delete FAQ");
    }
  };

  const updateFAQ = async (faq: FAQ) => {
    if (!faq.id) return;

    try {
      const { error } = await supabase
        .from("receptionist_faqs")
        .update({
          question: faq.question,
          answer: faq.answer,
          priority: faq.priority,
        })
        .eq("id", faq.id);

      if (error) throw error;

      toast.success("FAQ updated");
      loadFAQs();
    } catch (error: any) {
      console.error("Error updating FAQ:", error);
      toast.error("Failed to update FAQ");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>FAQ Management</CardTitle>
        <CardDescription>
          Add frequently asked questions to help your AI respond more accurately
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New FAQ */}
        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label htmlFor="new-question">Question</Label>
            <Input
              id="new-question"
              placeholder="e.g., What are your business hours?"
              value={newFaq.question}
              onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-answer">Answer</Label>
            <Textarea
              id="new-answer"
              placeholder="e.g., We're open Monday to Friday, 9 AM - 5 PM"
              value={newFaq.answer}
              onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-priority">Priority (higher = more important)</Label>
            <Input
              id="new-priority"
              type="number"
              min="0"
              value={newFaq.priority}
              onChange={(e) => setNewFaq({ ...newFaq, priority: parseInt(e.target.value) })}
            />
          </div>
          <Button onClick={saveFAQ} disabled={loading} className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            Add FAQ
          </Button>
        </div>

        {/* Existing FAQs */}
        <div className="space-y-3">
          {faqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No FAQs yet. Add your first one above!
            </div>
          ) : (
            faqs.map((faq) => (
              <div key={faq.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Question</Label>
                      <Input
                        value={faq.question}
                        onChange={(e) => {
                          const updated = faqs.map((f) =>
                            f.id === faq.id ? { ...f, question: e.target.value } : f
                          );
                          setFaqs(updated);
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Answer</Label>
                      <Textarea
                        value={faq.answer}
                        onChange={(e) => {
                          const updated = faqs.map((f) =>
                            f.id === faq.id ? { ...f, answer: e.target.value } : f
                          );
                          setFaqs(updated);
                        }}
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <Label className="text-xs text-muted-foreground">Priority:</Label>
                      <Input
                        type="number"
                        min="0"
                        value={faq.priority}
                        onChange={(e) => {
                          const updated = faqs.map((f) =>
                            f.id === faq.id ? { ...f, priority: parseInt(e.target.value) } : f
                          );
                          setFaqs(updated);
                        }}
                        className="w-20"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button size="sm" variant="outline" onClick={() => updateFAQ(faq)}>
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => faq.id && deleteFAQ(faq.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
