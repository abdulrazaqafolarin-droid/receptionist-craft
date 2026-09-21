import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GitBranch, MessageSquare, History, ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FloatingBackground } from "@/components/FloatingBackground";
import { ConversationalManagement } from "@/components/ConversationalManagement";
import { VersionHistory } from "@/components/VersionHistory";
import { toast } from "sonner";

interface ReceptionistRow {
  id: string;
  name: string;
  business_name: string;
}

interface ConfigVersionRow {
  version_number: number;
}

/**
 * Operator Management Page — redefined per §5.4 / Step 6.
 *
 * Now that every management page has its own inline "tell me what to change"
 * entry point (Step 4), this page's distinct, non-redundant purpose is to be
 * where the HISTORY lives: every past plan, every version, and the rollback
 * controls — the one place to see everything that's ever changed. Making a
 * brand-new change is kept here too, but as a clearly secondary, collapsed
 * surface, not the page's reason for existing.
 */
export default function ConversationalManagementPage() {
  const navigate = useNavigate();
  const [receptionists, setReceptionists] = useState<ReceptionistRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [currentVersion, setCurrentVersion] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedId) loadCurrentVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load receptionists";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCurrentVersion() {
    const { data } = await supabase
      .from("config_versions")
      .select("version_number")
      .eq("receptionist_id", selectedId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle<ConfigVersionRow>();
    setCurrentVersion(data?.version_number);
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
            <GitBranch className="h-8 w-8 text-primary" />
            Operator History &amp; Management
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            This is where every change to your operator is recorded. See what's ever changed,
            what's currently live, and roll back to a previous version with one tap. To make a
            new change, use the "Tell me what to change" button on the relevant page — or the
            chat below.
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

            {/* PRIMARY — the history / everything that's ever changed (§5.4) */}
            <Card className="border-2 border-border/50 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <History className="h-5 w-5 text-primary" />
                  </div>
                  Change History
                </CardTitle>
                <CardDescription>
                  Every approved change to your operator, with a snapshot you can roll back to.
                  {currentVersion ? ` Version ${currentVersion} is currently live.` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedId && (
                  <VersionHistory
                    receptionistId={selectedId}
                    currentVersion={currentVersion}
                    onReverted={(_, newVersion) => setCurrentVersion(newVersion)}
                  />
                )}
              </CardContent>
            </Card>

            {/* SECONDARY — make a new change (kept, but collapsed so history is the focus) */}
            <Collapsible open={showChat} onOpenChange={setShowChat}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="lg" className="w-full gap-2">
                  <MessageSquare className="h-4 w-4" />
                  {showChat ? "Hide" : "Make a change to your operator"} — talk it through
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card className="mt-3 border-2 border-border/50 shadow-lg">
                  <CardContent className="p-0">
                    {selectedId && (
                      <div className="h-[34rem]">
                        <ConversationalManagement receptionistId={selectedId} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>
    </div>
  );
}
