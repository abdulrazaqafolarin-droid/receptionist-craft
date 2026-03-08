import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Edit, AlertCircle, Brain, BarChart3, TrendingDown, MessageSquareWarning, ArrowUpCircle } from "lucide-react";
import { FloatingBackground } from "@/components/FloatingBackground";

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

interface GapReport {
  total_responses: number;
  unanswered_count: number;
  low_confidence_count: number;
  escalation_count: number;
  gap_rate: string;
  top_gaps: Array<{ topic: string; count: number; examples: string[] }>;
  recent_unanswered: Array<{ question: string; confidence: number; date: string }>;
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
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [gapReport, setGapReport] = useState<Record<string, GapReport>>({});
  const [loadingGap, setLoadingGap] = useState<string | null>(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (userId) loadRewriteLogs();
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
      const { data: receptData, error: receptError } = await supabase
        .from("receptionists")
        .select("id, name, business_name")
        .eq("user_id", userId!);

      if (receptError) throw receptError;

      const receptMap: Record<string, Receptionist> = {};
      (receptData || []).forEach((r) => { receptMap[r.id] = r; });
      setReceptionists(receptMap);

      const receptionistIds = Object.keys(receptMap);
      if (receptionistIds.length === 0) { setLogs([]); return; }

      const { data: logsData, error: logsError } = await supabase
        .from("kb_rewrite_log")
        .select("*")
        .in("receptionist_id", receptionistIds)
        .eq("auto_suggest", true)
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

  async function triggerAnalysis(receptionistId: string) {
    try {
      setAnalyzing(receptionistId);
      const { data, error } = await supabase.functions.invoke("kb-rewrite", {
        body: { action: "analyze", receptionistId, userId },
      });
      if (error) throw error;
      
      const count = data?.suggestions?.length || 0;
      if (count > 0) {
        toast.success(`${count} suggestion${count > 1 ? 's' : ''} generated!`);
        loadRewriteLogs();
      } else {
        toast.info(data?.message || "No gaps found — KB is performing well!");
      }
    } catch (err: any) {
      toast.error(err.message || "Analysis failed");
    } finally {
      setAnalyzing(null);
    }
  }

  async function loadGapReport(receptionistId: string) {
    try {
      setLoadingGap(receptionistId);
      const { data, error } = await supabase.functions.invoke("kb-rewrite", {
        body: { action: "gap-report", receptionistId },
      });
      if (error) throw error;
      setGapReport(prev => ({ ...prev, [receptionistId]: data }));
    } catch (err: any) {
      toast.error("Failed to load gap report");
    } finally {
      setLoadingGap(null);
    }
  }

  async function applyRewrite(log: KBRewriteLog) {
    try {
      const { error } = await supabase.functions.invoke("kb-rewrite", {
        body: { action: "apply", logId: log.id, receptionistId: log.receptionist_id, userId },
      });
      if (error) throw error;
      toast.success("KB rewrite applied successfully!");
      loadRewriteLogs();
      setSelectedLog(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to apply rewrite");
    }
  }

  async function rejectRewrite(log: KBRewriteLog) {
    try {
      const { error } = await supabase
        .from("kb_rewrite_log")
        .update({ auto_suggest: false })
        .eq("id", log.id);
      if (error) throw error;
      toast.success("Suggestion rejected");
      loadRewriteLogs();
      setSelectedLog(null);
    } catch (err: any) {
      toast.error("Failed to reject suggestion");
    }
  }

  async function applyEditedRewrite(log: KBRewriteLog) {
    try {
      const { error: updateError } = await supabase
        .from("receptionists")
        .update({ knowledge_base: editedKB })
        .eq("id", log.receptionist_id);
      if (updateError) throw updateError;

      await supabase.from("kb_rewrite_log").update({ auto_suggest: false }).eq("id", log.id);
      toast.success("Custom KB update applied!");
      setEditMode(false);
      setSelectedLog(null);
      loadRewriteLogs();
    } catch (err: any) {
      toast.error("Failed to apply changes");
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-center text-muted-foreground">Loading KB suggestions...</p>
      </div>
    );
  }

  // Detail view
  if (selectedLog) {
    const receptionist = receptionists[selectedLog.receptionist_id];
    const suggestions = selectedLog.rewritten?.suggestions || [];
    const summary = selectedLog.changes?.gap_summary || selectedLog.rewritten?.summary || {};
    
    return (
      <>
        <Navbar />
        <div className="relative min-h-screen">
          <FloatingBackground variant="minimal" />
          <div className="relative z-10 container mx-auto p-6 max-w-6xl">
            <Button variant="ghost" onClick={() => { setSelectedLog(null); setEditMode(false); }} className="mb-4">
              ← Back to suggestions
            </Button>

            {/* Summary Banner */}
            {summary.total_gaps && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-destructive">{summary.total_gaps}</p>
                  <p className="text-xs text-muted-foreground">Total Gaps</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-orange-500">{summary.unanswered_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Unanswered</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-yellow-500">{summary.low_confidence_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Low Confidence</p>
                </CardContent></Card>
                <Card><CardContent className="pt-4 text-center">
                  <p className="text-2xl font-bold text-red-500">{summary.escalation_count || 0}</p>
                  <p className="text-xs text-muted-foreground">Escalations</p>
                </CardContent></Card>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>KB Improvement Suggestions</CardTitle>
                <CardDescription>
                  For {receptionist?.name || "Unknown"} • {receptionist?.business_name} • {selectedLog.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {editMode ? (
                  <div>
                    <h3 className="font-semibold mb-2">Edit Knowledge Base</h3>
                    <textarea
                      value={editedKB}
                      onChange={(e) => setEditedKB(e.target.value)}
                      className="w-full h-96 p-3 border rounded-md font-mono text-sm bg-background"
                    />
                    <div className="flex gap-2 mt-4">
                      <Button onClick={() => applyEditedRewrite(selectedLog)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Apply Edited Version
                      </Button>
                      <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Structured Suggestions */}
                    <div className="space-y-3">
                      {suggestions.map((s: any, i: number) => (
                        <Card key={i} className="border-l-4" style={{ borderLeftColor: s.priority === 'high' ? 'hsl(var(--destructive))' : s.priority === 'medium' ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}>
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={s.type === 'faq' ? 'default' : 'secondary'}>
                                  {s.type === 'faq' ? 'New FAQ' : 'KB Addition'}
                                </Badge>
                                <Badge variant="outline">{s.priority}</Badge>
                                {s.addresses_count && (
                                  <span className="text-xs text-muted-foreground">
                                    Addresses {s.addresses_count} question{s.addresses_count > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            {s.type === 'faq' && s.faq_question ? (
                              <div className="space-y-1">
                                <p className="font-medium text-sm">Q: {s.faq_question}</p>
                                <p className="text-sm text-muted-foreground">A: {s.faq_answer}</p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-medium">{s.section}</p>
                                <p className="text-sm text-muted-foreground">{s.content}</p>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2 italic">{s.reason}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex gap-2 justify-end">
                      <Button onClick={() => applyRewrite(selectedLog)} variant="default">
                        <CheckCircle2 className="mr-2 h-4 w-4" /> Approve All
                      </Button>
                      <Button onClick={() => { setEditMode(true); setEditedKB(selectedLog.original?.knowledge_base || ""); }} variant="outline">
                        <Edit className="mr-2 h-4 w-4" /> Edit Manually
                      </Button>
                      <Button onClick={() => rejectRewrite(selectedLog)} variant="destructive">
                        <XCircle className="mr-2 h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  // List view
  const receptionistList = Object.values(receptionists);

  return (
    <>
      <Navbar />
      <div className="relative min-h-screen">
        <FloatingBackground variant="minimal" />
        <div className="relative z-10 container mx-auto p-6 max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Knowledge Base Optimization</h1>
            <p className="text-muted-foreground mt-2">
              Detect gaps in your AI's knowledge and auto-generate improvements
            </p>
          </div>

          {/* Receptionist Cards with Analyze Button */}
          {receptionistList.length > 0 && (
            <div className="grid gap-4 mb-8">
              {receptionistList.map((r) => {
                const report = gapReport[r.id];
                return (
                  <Card key={r.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">{r.name}</CardTitle>
                          <CardDescription>{r.business_name}</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" size="sm"
                            onClick={() => loadGapReport(r.id)}
                            disabled={loadingGap === r.id}
                          >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            {loadingGap === r.id ? "Loading..." : "Gap Report"}
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => triggerAnalysis(r.id)}
                            disabled={analyzing === r.id}
                          >
                            <Brain className="mr-2 h-4 w-4" />
                            {analyzing === r.id ? "Analyzing..." : "Analyze & Suggest"}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {report && (
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                          <div className="text-center p-2 bg-muted rounded-md">
                            <p className="text-lg font-bold">{report.total_responses}</p>
                            <p className="text-xs text-muted-foreground">Total Responses</p>
                          </div>
                          <div className="text-center p-2 bg-muted rounded-md">
                            <p className="text-lg font-bold text-orange-500">{report.unanswered_count}</p>
                            <p className="text-xs text-muted-foreground">Unanswered</p>
                          </div>
                          <div className="text-center p-2 bg-muted rounded-md">
                            <p className="text-lg font-bold text-yellow-500">{report.low_confidence_count}</p>
                            <p className="text-xs text-muted-foreground">Low Confidence</p>
                          </div>
                          <div className="text-center p-2 bg-muted rounded-md">
                            <p className="text-lg font-bold text-red-500">{report.escalation_count}</p>
                            <p className="text-xs text-muted-foreground">Escalations</p>
                          </div>
                          <div className="text-center p-2 bg-muted rounded-md">
                            <p className="text-lg font-bold">{report.gap_rate}</p>
                            <p className="text-xs text-muted-foreground">Gap Rate</p>
                          </div>
                        </div>
                        {report.top_gaps && report.top_gaps.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                              <TrendingDown className="h-4 w-4" /> Top Knowledge Gaps
                            </h4>
                            <div className="space-y-1">
                              {report.top_gaps.slice(0, 5).map((gap, i) => (
                                <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                                  <span className="truncate flex-1">{gap.examples?.[0] || gap.topic}</span>
                                  <Badge variant="outline" className="ml-2">{gap.count}x</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pending Suggestions */}
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5" />
            Pending Suggestions ({logs.length})
          </h2>

          {logs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">No pending suggestions</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Click "Analyze & Suggest" above to scan for knowledge gaps
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => {
                const receptionist = receptionists[log.receptionist_id];
                const suggestionsCount = log.rewritten?.suggestions?.length || 0;
                const gapSummary = log.changes?.gap_summary;

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
                        <div className="flex items-center gap-2">
                          {gapSummary?.unanswered_count > 0 && (
                            <Badge variant="destructive">{gapSummary.unanswered_count} unanswered</Badge>
                          )}
                          <Badge variant="secondary">
                            {suggestionsCount} suggestion{suggestionsCount !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">
                        {log.reason || "No reason provided"}
                      </p>
                      <Button onClick={() => { setSelectedLog(log); setEditMode(false); setEditedKB(log.rewritten?.knowledge_base || ""); }} variant="outline" className="w-full">
                        <ArrowUpCircle className="mr-2 h-4 w-4" /> Review Suggestions
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
