import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Puzzle, Bot, ArrowLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingBackground } from "@/components/FloatingBackground";
import { ConnectorRegistryPage } from "@/components/ConnectorRegistry";
import { ModuleRegistry } from "@/components/ModuleRegistry";
import { ConfiguratorAffordance } from "@/components/ConfiguratorAffordance";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { CONNECTIONS_TOUR, GOOGLE_WALKTHROUGH } from "@/lib/actorScripts";
import { supabase } from "@/integrations/supabase/client";

export default function Connections() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string>("");
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; business_name: string }>>([]);
  const [selectedReceptionistId, setSelectedReceptionistId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  // Phase 0 actor tour: cursor + narration only, touches nothing.
  // The collect handoff opens the connector's REAL dialog (same save path
  // as a manual click) — the cursor presents, never reimplements.
  const dialogNonce = useRef(0);
  const [dialogRequest, setDialogRequest] = useState<{ key: string; nonce: number } | null>(null);
  const tour = useActorHost({
    onCollect: (key) => {
      dialogNonce.current += 1;
      setDialogRequest({ key, nonce: dialogNonce.current });
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate("/auth");
          return;
        }
        setUserId(user.id);

        const { data: recs } = await supabase
          .from("receptionists")
          .select("id, name, business_name")
          .eq("user_id", user.id);

        if (recs && recs.length > 0) {
          setReceptionists(recs);
          setSelectedReceptionistId(recs[0].id);
        }
      } catch (error) {
        console.error("Error loading connections:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6 hover:bg-primary/5">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-2">Connections</h1>
            <p className="text-muted-foreground">
              Connect the external services your Operator uses, and turn on the growth &amp; operations
              modules that fit your business.
            </p>
          </div>
          {selectedReceptionistId && (
            <div className="flex flex-col gap-2 sm:items-end">
              <ConfiguratorAffordance
                receptionistId={selectedReceptionistId}
                context="Connections"
                title="Change operator setup"
                className="sm:self-start"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={tour.running}
                onClick={() => { void tour.start(CONNECTIONS_TOUR, { tour: "connections-tour", userId, receptionistId: selectedReceptionistId }); }}
              >
                {tour.running ? "Showing you around…" : "Show me around"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={tour.running}
                onClick={() => { void tour.start(GOOGLE_WALKTHROUGH, { tour: "walkthrough-google", userId, receptionistId: selectedReceptionistId }); }}
              >
                {tour.running ? "Walking through…" : "Connect Google Reviews"}
              </Button>
            </div>
          )}
        </div>

        <ActorCursor point={tour.point} />
        <ActorOverlay
          ring={tour.ring}
          bubble={tour.bubble}
          showcase={tour.showcase}
          confirmAsk={tour.confirmAsk}
          running={tour.running}
          onStop={tour.stop}
          onDismissBubble={tour.dismissBubble}
          onDismissShowcase={tour.dismissShowcase}
          onAnswerConfirm={tour.answerConfirm}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : receptionists.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed p-12 text-center">
            <Puzzle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Create your AI operator first</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mx-auto mb-6">
              Connectors and modules connect to your AI receptionist once it's set up. It takes just a minute to create one.
            </p>
            <Button onClick={() => (window.location.href = "/onboarding")}>
              Set up my AI operator
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <Card className="border-2 border-border/50 shadow-lg" data-actor="connections-list">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Puzzle className="h-5 w-5 text-primary" />
                  </div>
                  Connectors
                </CardTitle>
                <CardDescription>
                  Every external service your Operator can use — email, social, SMS, payments, calendar and more.
                  Each connector shows its real status so you always know what's actually possible right now.
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6 space-y-4">
                {receptionists.length > 1 && (
                  <div className="flex items-center gap-3">
                    <Label>Select Business:</Label>
                    <Select value={selectedReceptionistId} onValueChange={setSelectedReceptionistId}>
                      <SelectTrigger className="w-64">
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
                  </div>
                )}
                {userId && <ConnectorRegistryPage userId={userId} openRequest={dialogRequest} />}
              </div>
            </Card>

            <Card className="border-2 border-border/50 shadow-lg" data-actor="modules-list">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  Modules
                </CardTitle>
                <CardDescription>
                  Reusable capabilities any business Operator can add — lead generation, email, SMS,
                  reviews, analytics and more. Turn on one at a time to build trust as you go.
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-6 space-y-4">
                {receptionists.length > 1 && (
                  <div className="flex items-center gap-3">
                    <Label>Select Business:</Label>
                    <Select value={selectedReceptionistId} onValueChange={setSelectedReceptionistId}>
                      <SelectTrigger className="w-64">
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
                  </div>
                )}
                {selectedReceptionistId && (
                  <ModuleRegistry receptionistId={selectedReceptionistId} userId={userId} />
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
