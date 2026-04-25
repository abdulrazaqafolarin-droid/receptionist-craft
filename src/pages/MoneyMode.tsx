import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingBackground } from "@/components/FloatingBackground";
import { RevenueEngine } from "@/components/RevenueEngine";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, DollarSign, Sparkles } from "lucide-react";

const MONEY_MODE_SELECTED_RECEPTIONIST_KEY = "moneyMode:selectedReceptionistId";

export default function MoneyModePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; ai_mode?: string; active?: boolean }>>([]);
  const [selectedReceptionistId, setSelectedReceptionistId] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!mounted || !user) return;

        const { data } = await supabase
          .from("receptionists")
          .select("id, name, ai_mode, active")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (!mounted) return;
        setReceptionists(data || []);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (receptionists.length === 0) {
      setSelectedReceptionistId("");
      return;
    }

    const storedReceptionistId = localStorage.getItem(MONEY_MODE_SELECTED_RECEPTIONIST_KEY);
    const hasStoredSelection = storedReceptionistId && receptionists.some((receptionist) => receptionist.id === storedReceptionistId);
    const nextSelection = hasStoredSelection ? storedReceptionistId : receptionists[0].id;

    setSelectedReceptionistId(nextSelection);
    localStorage.setItem(MONEY_MODE_SELECTED_RECEPTIONIST_KEY, nextSelection);
  }, [receptionists]);

  const selectedReceptionist = receptionists.find((receptionist) => receptionist.id === selectedReceptionistId) || receptionists[0];

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <FloatingBackground variant="minimal" />
      <main className="relative z-10 container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge className="bg-amber-500 text-white">Money Mode</Badge>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">Revenue Engine</Badge>
            </div>
            <h1 className="text-3xl font-bold">Revenue & Conversion Control Center</h1>
            <p className="text-muted-foreground">
              Configure Money Mode behavior, monitor conversion quality, and tune thresholds in one place.
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/80">Build {import.meta.env.VITE_APP_BUILD_SHA || "unknown"}</p>
          </div>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">Loading Money Mode workspace...</CardContent>
          </Card>
        ) : receptionists.length === 0 ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Create a receptionist first
              </CardTitle>
              <CardDescription>
                Money Mode needs at least one receptionist configuration before it can be used.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/onboarding-wizard")}>Create Receptionist</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex-1 min-w-[220px] space-y-1">
                  <div className="text-sm text-muted-foreground">
                    Now controlling: <span className="font-semibold text-foreground">{selectedReceptionist?.name || "Receptionist"}</span>
                  </div>
                  {receptionists.length > 1 && (
                    <Select
                      value={selectedReceptionistId}
                      onValueChange={(value) => {
                        setSelectedReceptionistId(value);
                        localStorage.setItem(MONEY_MODE_SELECTED_RECEPTIONIST_KEY, value);
                      }}
                    >
                      <SelectTrigger className="max-w-sm">
                        <SelectValue placeholder="Select receptionist" />
                      </SelectTrigger>
                      <SelectContent>
                        {receptionists.map((receptionist) => (
                          <SelectItem key={receptionist.id} value={receptionist.id}>
                            {receptionist.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">Current AI mode:</span>
                  <Badge variant="outline" className="capitalize">{selectedReceptionist?.ai_mode || "booking"}</Badge>
                </div>
              </CardContent>
            </Card>

            {selectedReceptionist && (
              <RevenueEngine receptionistId={selectedReceptionist.id} currentMode={selectedReceptionist?.ai_mode || "booking"} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
