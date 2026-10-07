import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FloatingBackground } from "@/components/FloatingBackground";
import { RevenueEngine } from "@/components/RevenueEngine";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, DollarSign, Sparkles } from "lucide-react";

type ScopeType = "single" | "multi" | "all";

export default function MoneyModePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; ai_mode?: string; active?: boolean }>>([]);
  const [scopeType, setScopeType] = useState<ScopeType>("single");
  const [singleReceptionistId, setSingleReceptionistId] = useState<string>("");
  const [multiReceptionistIds, setMultiReceptionistIds] = useState<string[]>([]);

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
        const rows = data || [];
        setReceptionists(rows as Array<{ id: string; name: string; ai_mode?: string; active?: boolean }>);

        if (rows.length > 0) {
          setSingleReceptionistId(rows[0].id);
          setMultiReceptionistIds(rows.slice(0, Math.min(2, rows.length)).map((r) => r.id));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedReceptionistIds = useMemo(() => {
    if (scopeType === "all") return receptionists.map((r) => r.id);
    if (scopeType === "multi") return multiReceptionistIds;
    return singleReceptionistId ? [singleReceptionistId] : [];
  }, [scopeType, receptionists, multiReceptionistIds, singleReceptionistId]);

  const selectedReceptionists = useMemo(
    () => receptionists.filter((r) => selectedReceptionistIds.includes(r.id)),
    [receptionists, selectedReceptionistIds],
  );

  const scopeLabel = useMemo(() => {
    if (scopeType === "all") return "All receptionists";
    if (scopeType === "multi") {
      return selectedReceptionists.length
        ? `${selectedReceptionists.length} selected receptionists`
        : "No receptionists selected";
    }
    return selectedReceptionists[0]?.name || "No receptionist selected";
  }, [scopeType, selectedReceptionists]);

  const modeLabel = useMemo(() => {
    const modes = Array.from(new Set(selectedReceptionists.map((r) => r.ai_mode || "booking")));
    return modes.length === 1 ? modes[0] : "mixed";
  }, [selectedReceptionists]);

  const receptionistNameMap = useMemo(
    () => Object.fromEntries(receptionists.map((r) => [r.id, r.name])),
    [receptionists],
  );

  return (
    <div className="relative min-h-screen bg-background">
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
          <Card className="glass-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" /> Create a receptionist first
              </CardTitle>
              <CardDescription>
                Money Mode needs at least one receptionist configuration before it can be used.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/onboarding?returning=1")}>Create Receptionist</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="space-y-4 py-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Button variant={scopeType === "single" ? "default" : "outline"} onClick={() => setScopeType("single")}>Single receptionist</Button>
                  <Button variant={scopeType === "multi" ? "default" : "outline"} onClick={() => setScopeType("multi")}>Multi-select receptionist</Button>
                  <Button variant={scopeType === "all" ? "default" : "outline"} onClick={() => setScopeType("all")}>All receptionists</Button>
                </div>

                {scopeType === "single" ? (
                  <div className="max-w-sm">
                    <Select value={singleReceptionistId} onValueChange={setSingleReceptionistId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose receptionist" />
                      </SelectTrigger>
                      <SelectContent>
                        {receptionists.map((r) => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {scopeType === "multi" ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {receptionists.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 rounded-md border bg-background/70 p-2 text-sm">
                        <Checkbox
                          checked={multiReceptionistIds.includes(r.id)}
                          onCheckedChange={(checked) => {
                            setMultiReceptionistIds((prev) =>
                              checked ? Array.from(new Set([...prev, r.id])) : prev.filter((id) => id !== r.id),
                            );
                          }}
                        />
                        <span>{r.name}</span>
                      </label>
                    ))}
                  </div>
                ) : null}


                {scopeType === "multi" && multiReceptionistIds.length === 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
                    Select at least one receptionist before changing AI mode or saving Money Mode settings.
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="text-sm text-muted-foreground">
                    Now controlling: <span className="font-semibold text-foreground">{scopeLabel}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign className="h-4 w-4 text-amber-500" />
                    <span className="text-muted-foreground">Current AI mode:</span>
                    <Badge variant="outline" className="capitalize">{modeLabel}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <RevenueEngine
              receptionistIds={selectedReceptionistIds}
              receptionistNames={receptionistNameMap}
              scopeLabel={scopeLabel}
              currentMode={modeLabel}
            />
          </div>
        )}
      </main>
    </div>
  );
}
