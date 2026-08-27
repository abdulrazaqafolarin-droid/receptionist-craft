import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquare, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FloatingBackground } from "@/components/FloatingBackground";
import { ConversationalManagement } from "@/components/ConversationalManagement";
import { toast } from "sonner";

/**
 * Conversational Management Page
 *
 * Lets the owner make change requests to any receptionist using natural
 * language (e.g., "change my opening hours", "add a new service", "lower prices").
 * Includes config version history + rollback.
 */
export default function ConversationalManagementPage() {
  const navigate = useNavigate();
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; business_name: string }>>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReceptionists();
  }, []);

  async function loadReceptionists() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("receptionists")
        .select("id, name, business_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const recs = data || [];
      setReceptionists(recs);
      if (recs.length > 0) setSelectedId(recs[0].id);
    } catch (err: any) {
      toast.error(err.message || "Failed to load receptionists");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6 hover:bg-primary/5">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2 flex items-center gap-3">
            <MessageSquare className="h-8 w-8 text-primary" />
            Operator Management
          </h1>
          <p className="text-muted-foreground">
            Talk to your AI operator in plain language — change hours, pricing, services,
            or anything else. Review the plan, approve, or roll back to a previous version.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : receptionists.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              No receptionists found. Create one in the Builder first.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {receptionists.length > 1 && (
              <Card>
                <CardContent className="flex items-center gap-3 py-4">
                  <Label className="whitespace-nowrap">Select Operator:</Label>
                  <Select value={selectedId} onValueChange={setSelectedId}>
                    <SelectTrigger className="w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {receptionists.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.business_name || r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {selectedId && <ConversationalManagement receptionistId={selectedId} />}
          </div>
        )}
      </div>
    </div>
  );
}
