import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle, Clock, MessageSquare, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Escalation {
  id: string;
  receptionist_id: string;
  session_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  reason: string;
  summary: string | null;
  status: string;
  owner_response: string | null;
  responded_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

const REASON_LABELS: Record<string, string> = {
  repeated_confusion: "AI Confused",
  complex_objection: "Complex Objection",
  request_human: "Customer Requested Human",
  repeated_failure: "AI Failed Repeatedly",
  edge_case: "Edge Case",
  unknown: "Unknown Reason",
};

export default function Escalations() {
  const navigate = useNavigate();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Escalation | null>(null);
  const [responseText, setResponseText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadEscalations();

    // Realtime subscription for new escalations
    const channel = supabase
      .channel("escalations-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "escalations" },
        (payload) => {
          setEscalations((prev) => [payload.new as Escalation, ...prev]);
          toast.warning("New escalation received", {
            description: (payload.new as Escalation).reason,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadEscalations() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: recs } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true);

    const recIds = (recs ?? []).map((r) => r.id);
    if (recIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("escalations")
      .select("*")
      .in("receptionist_id", recIds)
      .order("created_at", { ascending: false });

    setEscalations(data ?? []);
    setLoading(false);
  }

  async function resolveEscalation(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("escalations")
      .update({
        status: "resolved",
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to resolve escalation");
    } else {
      toast.success("Escalation resolved");
      setEscalations((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "resolved" } : e)),
      );
      setSelected(null);
    }
  }

  async function sendResponse() {
    if (!selected || !responseText.trim()) return;
    setSending(true);

    const { error } = await supabase
      .from("escalations")
      .update({
        owner_response: responseText.trim(),
        responded_at: new Date().toISOString(),
      })
      .eq("id", selected.id);

    if (error) {
      toast.error("Failed to send response");
    } else {
      toast.success("Response sent to customer");
      setEscalations((prev) =>
        prev.map((e) =>
          e.id === selected.id
            ? { ...e, owner_response: responseText.trim(), responded_at: new Date().toISOString() }
            : e,
        ),
      );
      setSelected({ ...selected, owner_response: responseText.trim(), responded_at: new Date().toISOString() });
      setResponseText("");
    }
    setSending(false);
  }

  const openCount = escalations.filter((e) => e.status === "open").length;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            Escalations
            {openCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {openCount} open
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground mt-1">
            Customer conversations that need human attention
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : escalations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-muted-foreground">No escalations yet</p>
            <p className="text-sm text-muted-foreground text-center max-w-md mt-2">
              When the AI can't resolve a customer issue, it will escalate here
              for your attention.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {escalations.map((esc) => (
            <Card
              key={esc.id}
              className={`cursor-pointer transition-colors ${
                esc.status === "open"
                  ? "border-destructive/30 hover:border-destructive/50"
                  : "opacity-60"
              }`}
              onClick={() => setSelected(esc)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      esc.status === "open"
                        ? "bg-destructive/10"
                        : "bg-green-500/10"
                    }`}
                  >
                    {esc.status === "open" ? (
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {esc.customer_name || "Unknown Customer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {REASON_LABELS[esc.reason] || esc.reason}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={esc.status === "open" ? "destructive" : "secondary"}>
                    {esc.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(esc.created_at).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Escalation Detail
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer</span>
                  <p className="font-medium">{selected.customer_name || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Reason</span>
                  <p className="font-medium">{REASON_LABELS[selected.reason] || selected.reason}</p>
                </div>
                {selected.customer_email && (
                  <div className="flex items-center gap-1 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {selected.customer_email}
                  </div>
                )}
                {selected.customer_phone && (
                  <div className="flex items-center gap-1 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    {selected.customer_phone}
                  </div>
                )}
              </div>

              {selected.summary && (
                <div>
                  <span className="text-sm text-muted-foreground">AI Summary</span>
                  <p className="text-sm mt-1 p-3 rounded-lg bg-muted/50">{selected.summary}</p>
                </div>
              )}

              {selected.owner_response && (
                <div>
                  <span className="text-sm text-muted-foreground">Your Response</span>
                  <p className="text-sm mt-1 p-3 rounded-lg bg-primary/10 border border-primary/20">{selected.owner_response}</p>
                  {selected.responded_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Sent {new Date(selected.responded_at).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {selected.status === "open" && !selected.owner_response && (
                <div>
                  <span className="text-sm text-muted-foreground mb-1 block">Send Response to Customer</span>
                  <textarea
                    className="w-full border border-border bg-background rounded-lg px-3 py-2 text-sm resize-none"
                    rows={3}
                    placeholder="Type your response to the customer..."
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                  />
                  <Button
                    onClick={sendResponse}
                    disabled={!responseText.trim() || sending}
                    className="mt-2 w-full"
                    size="sm"
                  >
                    {sending ? "Sending..." : "Send Response"}
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" />
                Session: {selected.session_id.slice(0, 12)}...
                <span className="mx-1">|</span>
                {new Date(selected.created_at).toLocaleString()}
              </div>

              {selected.status === "open" && (
                <Button
                  onClick={() => resolveEscalation(selected.id)}
                  className="w-full"
                >
                  <CheckCircle className="h-4 w-4 mr-2" /> Mark Resolved
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
