import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Edit, AlertCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";

interface KBRewriteLog {
  id: string;
  receptionist_id: string;
  created_at: string;
  reason: string | null;
  original: any;
  rewritten: any;
  changes: any;
  auto_suggest: boolean;
}

interface Receptionist {
  id: string;
  name: string;
  business_name: string;
}

export default function KBRewrite() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<KBRewriteLog[]>([]);
  const [receptionists, setReceptionists] = useState<Record<string, Receptionist>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<KBRewriteLog | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedKB, setEditedKB] = useState("");

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (userId) {
      loadRewriteLogs();
    }
  }, [userId]);

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please log in to view KB rewrites");
      setTimeout(() => navigate("/auth"), 2000);
      return;
    }
    setUserId(user.id);
  }

  async function loadRewriteLogs() {
    try {
      setLoading(true);

      // Get user's receptionists first
      const { data: receptData, error: receptError } = await supabase
        .from("receptionists")
        .select("id, name, business_name")
        .eq("user_id", userId!);

      if (receptError) throw receptError;

      const receptMap: Record<string, Receptionist> = {};
      (receptData || []).forEach((r) => {
        receptMap[r.id] = r;
      });
      setReceptionists(receptMap);

      // Get KB rewrite logs for these receptionists
      const receptionistIds = Object.keys(receptMap);
      if (receptionistIds.length === 0) {
        setLogs([]);
        return;
      }

      const { data: logsData, error: logsError } = await supabase
        .from("kb_rewrite_log")
        .select("*")
        .in("receptionist_id", receptionistIds)
        .eq("auto_suggest", true) // Only show suggestions, not applied rewrites
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;

      setLogs(logsData || []);
    } catch (err: any) {
      console.error("Failed to load KB rewrite logs:", err);
      toast.error("Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function applyRewrite(log: KBRewriteLog) {
    try {
      const { data, error } = await supabase.functions.invoke("kb-rewrite", {
        body: {
          action: "apply",
          logId: log.id,
          receptionistId: log.receptionist_id,
          userId,
        },
      });

      if (error) throw error;

      toast.success("KB rewrite applied successfully!");
      loadRewriteLogs(); // Reload to remove from pending list
      setSelectedLog(null);
    } catch (err: any) {
      console.error("Failed to apply rewrite:", err);
      toast.error(err.message || "Failed to apply rewrite");
    }
  }

  async function rejectRewrite(log: KBRewriteLog) {
    try {
      // Mark as rejected by removing auto_suggest flag
      const { error } = await supabase
        .from("kb_rewrite_log")
        .update({ auto_suggest: false })
        .eq("id", log.id);

      if (error) throw error;

      toast.success("Suggestion rejected");
      loadRewriteLogs();
      setSelectedLog(null);
    } catch (err: any) {
      console.error("Failed to reject rewrite:", err);
      toast.error("Failed to reject suggestion");
    }
  }

  async function applyEditedRewrite(log: KBRewriteLog) {
    try {
      // Apply the manually edited KB
      const { error: updateError } = await supabase
        .from("receptionists")
        .update({ knowledge_base: editedKB })
        .eq("id", log.receptionist_id);

      if (updateError) throw updateError;

      // Mark log as applied
      const { error: logError } = await supabase
        .from("kb_rewrite_log")
        .update({ auto_suggest: false })
        .eq("id", log.id);

      if (logError) throw logError;

      toast.success("Custom KB update applied!");
      setEditMode(false);
      setSelectedLog(null);
      loadRewriteLogs();
    } catch (err: any) {
      console.error("Failed to apply edited rewrite:", err);
      toast.error("Failed to apply changes");
    }
  }

  function openDetailView(log: KBRewriteLog) {
    setSelectedLog(log);
    setEditMode(false);
    setEditedKB(log.rewritten?.knowledge_base || "");
  }

  function closeDetailView() {
    setSelectedLog(null);
    setEditMode(false);
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto p-6">
          <p className="text-center text-muted-foreground">Loading KB suggestions...</p>
        </div>
      </>
    );
  }

  // Detail view
  if (selectedLog) {
    const receptionist = receptionists[selectedLog.receptionist_id];
    
    return (
      <>
        <Navbar />
        <div className="container mx-auto p-6 max-w-6xl">
          <Button variant="ghost" onClick={closeDetailView} className="mb-4">
            ← Back to suggestions
          </Button>

          <Card>
            <CardHeader>
              <CardTitle>KB Rewrite Suggestion</CardTitle>
              <CardDescription>
                For {receptionist?.name || "Unknown"} • {receptionist?.business_name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Reason</h3>
                <p className="text-sm text-muted-foreground">{selectedLog.reason || "No reason provided"}</p>
              </div>

              <Separator />

              {editMode ? (
                <div>
                  <h3 className="font-semibold mb-2">Edit Knowledge Base</h3>
                  <textarea
                    value={editedKB}
                    onChange={(e) => setEditedKB(e.target.value)}
                    className="w-full h-96 p-3 border rounded-md font-mono text-sm"
                  />
                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => applyEditedRewrite(selectedLog)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Apply Edited Version
                    </Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}>
                      Cancel Edit
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <span className="text-destructive">Original</span>
                      </h3>
                      <div className="bg-muted p-4 rounded-md max-h-96 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.original, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2 flex items-center gap-2">
                        <span className="text-primary">Suggested</span>
                      </h3>
                      <div className="bg-muted p-4 rounded-md max-h-96 overflow-auto">
                        <pre className="text-xs whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.rewritten, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button onClick={() => applyRewrite(selectedLog)} variant="default">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve & Apply
                    </Button>
                    <Button onClick={() => setEditMode(true)} variant="outline">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit & Apply
                    </Button>
                    <Button onClick={() => rejectRewrite(selectedLog)} variant="destructive">
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // List view
  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Knowledge Base Suggestions</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve AI-suggested improvements to your receptionist knowledge bases
          </p>
        </div>

        {logs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No pending suggestions</p>
              <p className="text-sm text-muted-foreground mt-2">
                KB suggestions will appear here when the system detects low-quality responses
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => {
              const receptionist = receptionists[log.receptionist_id];
              const suggestionsCount = log.rewritten?.suggestions?.length || 0;

              return (
                <Card key={log.id} className="hover:bg-accent/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {receptionist?.name || "Unknown Receptionist"}
                        </CardTitle>
                        <CardDescription>
                          {receptionist?.business_name} • {new Date(log.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {suggestionsCount} suggestion{suggestionsCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {log.reason || "No reason provided"}
                    </p>
                    <Button onClick={() => openDetailView(log)} variant="outline" className="w-full">
                      Review Suggestions
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
