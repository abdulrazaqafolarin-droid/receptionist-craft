import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, History, RotateCcw, Send, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PlanReview } from "@/components/PlanReview";
import { ChatShell } from "@/components/widget/ChatShell";

interface PlanSection {
  id: string;
  title: string;
  content: string;
  confidence: "high" | "medium" | "low";
  owner_action?: string;
}

interface ChatMessage {
  role: "owner" | "ai";
  content: string;
  timestamp: string;
  planData?: {
    planText: string;
    sections: PlanSection[];
    reasoningNotes: string;
    config: Record<string, unknown>;
    versionId: string;
    versionNumber: number;
  };
}

interface ConfigVersion {
  id: string;
  version_number: number;
  change_source: string;
  owner_input: string | null;
  created_at: string;
  plan_text: string | null;
}

interface ConversationalManagementProps {
  receptionistId: string;
}

export function ConversationalManagement({ receptionistId }: ConversationalManagementProps) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<ConfigVersion[]>([]);
  const [pendingPlan, setPendingPlan] = useState<ChatMessage["planData"] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Build threads: the same ChatGPT-style history as the onboarding chat,
  // scoped to this operator. Past change sessions persist; reopening one
  // loads its turns and new changes continue appending to it.
  interface BuildThread {
    id: string;
    title: string;
    status: "chatting" | "planned" | "approved";
    updated_at: string;
  }
  const [threads, setThreads] = useState<BuildThread[]>([]);
  const [showChats, setShowChats] = useState(false);
  const threadIdRef = useRef<string | null>(null);

  // Generated DB types lag behind migrations (never-edit file) — same
  // narrow handle as the onboarding chat uses for these tables.
  interface LooseQuery {
    select(s: string): LooseQuery;
    eq(c: string, v: unknown): LooseQuery;
    order(c: string, o?: unknown): LooseQuery;
    limit(n: number): LooseQuery;
    single(): Promise<{ data: unknown; error: { message: string } | null }>;
    then(onf: (v: { data: unknown; error: { message: string } | null }) => unknown): Promise<unknown>;
  }
  interface LooseTable {
    insert(v: unknown): LooseQuery;
    select(s: string): LooseQuery;
    update(v: unknown): LooseQuery;
    delete(): LooseQuery;
  }
  const looseTable = (name: string): LooseTable =>
    (supabase.from as unknown as (t: string) => LooseTable)(name);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await looseTable("build_threads")
          .select("id,title,status,updated_at").eq("receptionist_id", receptionistId)
          .order("updated_at", { ascending: false }).limit(20);
        if (data) setThreads(data as BuildThread[]);
      } catch {
        // history sidebar stays empty; chat works regardless
      }
    })();
  }, [receptionistId]);

  async function ensureThread(firstText: string): Promise<string | null> {
    if (threadIdRef.current) return threadIdRef.current;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await looseTable("build_threads").insert({
        user_id: user.id, receptionist_id: receptionistId,
        title: firstText.trim().slice(0, 42) || "Operator change",
      }).select("id,title,status,updated_at").single();
      if (error || !data) return null;
      const t = data as BuildThread;
      threadIdRef.current = t.id;
      setThreads((prev) => [t, ...prev]);
      return t.id;
    } catch {
      return null;
    }
  }

  async function saveThreadMsg(tid: string, role: "user" | "assistant", content: string) {
    try {
      await looseTable("build_messages").insert({ thread_id: tid, role, content });
    } catch {
      // history is a courtesy — the change itself already happened
    }
  }

  async function openThread(id: string) {
    try {
      const { data } = await looseTable("build_messages")
        .select("role,content,created_at").eq("thread_id", id).order("created_at", { ascending: true }).limit(200);
      const loaded: ChatMessage[] = ((data || []) as Array<{ role: string; content: string; created_at: string }>)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: (m.role === "assistant" ? "ai" : "owner") as ChatMessage["role"],
          content: m.content,
          timestamp: m.created_at,
        }));
      threadIdRef.current = id;
      setMessages(loaded);
      setPendingPlan(null);
      setShowChats(false);
    } catch {
      toast.error("Could not open that conversation");
    }
  }

  async function deleteThread(id: string) {
    try {
      await looseTable("build_threads").delete().eq("id", id);
    } catch {
      // list state is the truth
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (threadIdRef.current === id) {
      threadIdRef.current = null;
      setMessages([]);
      setPendingPlan(null);
    }
  }

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    const changeRequest = input.trim();
    setInput("");

    // Add owner message
    const ownerMsg: ChatMessage = {
      role: "owner",
      content: changeRequest,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, ownerMsg]);
    setLoading(true);
    const tid = await ensureThread(changeRequest);
    if (tid) void saveThreadMsg(tid, "user", changeRequest);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("request-change", {
        body: {
          change_request: changeRequest,
          receptionist_id: receptionistId,
          user_id: user.id,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to generate change plan");

      const planData = {
        planText: data.plan.full_text,
        sections: data.plan.sections,
        reasoningNotes: data.reasoning_notes,
        config: data.config,
        versionId: data.version_id,
        versionNumber: data.version_number,
      };

      // Add AI message with plan
      const aiMsg: ChatMessage = {
        role: "ai",
        content: `Here's what I'll change based on your request. Review the plan below and approve when ready.`,
        timestamp: new Date().toISOString(),
        planData,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setPendingPlan(planData);
      if (threadIdRef.current) {
        const activeTid = threadIdRef.current;
        void saveThreadMsg(activeTid, "assistant", `Planned version ${planData.versionNumber}: ${planData.planText.slice(0, 300)}`);
        try {
          await looseTable("build_threads").update({ status: "planned" }).eq("id", activeTid);
          setThreads((prev) => prev.map((t) => (t.id === activeTid ? { ...t, status: "planned" } : t)));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to process change";
      toast.error(message);
      const errorMsg: ChatMessage = {
        role: "ai",
        content: `Sorry, I couldn't process that change: ${message}`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprovePlan(feedback?: string) {
    if (!pendingPlan) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("approve-operator-plan", {
        body: {
          version_id: pendingPlan.versionId,
          receptionist_id: receptionistId,
          user_id: user.id,
          config: pendingPlan.config,
          plan_text: pendingPlan.planText,
          owner_feedback: feedback,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to apply change");

      const confirmMsg: ChatMessage = {
        role: "ai",
        content: `Done! Your operator has been updated (version ${pendingPlan.versionNumber}). The change is now live.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      setPendingPlan(null);
      toast.success("Change applied successfully");
      if (threadIdRef.current) {
        const activeTid = threadIdRef.current;
        void saveThreadMsg(activeTid, "assistant", `Approved and live: version ${pendingPlan.versionNumber}.`);
        try {
          await looseTable("build_threads").update({ status: "approved" }).eq("id", activeTid);
          setThreads((prev) => prev.map((t) => (t.id === activeTid ? { ...t, status: "approved" } : t)));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply change";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEditPlan(feedback: string) {
    if (!pendingPlan) return;
    setPendingPlan(null);
    setInput(`Actually, adjust that: ${feedback}`);
  }

  async function handleRevert(versionNumber: number) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use the versioning module to revert
      const { error } = await supabase.rpc("revert_config_version", {
        p_receptionist_id: receptionistId,
        p_target_version: versionNumber,
      });

      if (error) throw error;

      const revertMsg: ChatMessage = {
        role: "ai",
        content: `Reverted to version ${versionNumber}. Your operator is now running the previous configuration.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, revertMsg]);
      toast.success(`Reverted to version ${versionNumber}`);
      setShowHistory(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revert";
      toast.error(message);
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from("config_versions")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .order("version_number", { ascending: false })
      .limit(20);

    setHistory(data || []);
    setShowHistory(!showHistory);
  }

  return (
    <div className="flex flex-col h-full">
      <ChatShell
        theme="configurator"
        messages={messages}
        isUser={(m) => m.role === "owner"}
        loading={loading}
        scrollRef={messagesEndRef}
        contextLabel="Configurator · editing your operator"
        inputValue={input}
        onInputChange={setInput}
        onSend={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        disabled={loading}
        placeholder="Describe the change you want..."
        multiline
        sendIcon={<Send className="h-4 w-4" />}
        emptyState={
          <div className="text-center py-12 text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-primary/50" />
            <p className="text-sm">Tell me what you'd like to change about your AI operator.</p>
            <p className="text-xs mt-1">For example: "Add a new service — beard trims, 15 minutes, $20"</p>
          </div>
        }
        renderMessage={({ message, loading: planLoading }) => (
          <>
            {message.content && <p className="text-sm whitespace-pre-wrap">{message.content}</p>}
            {message.planData && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <PlanReview
                  planText={message.planData.planText}
                  sections={message.planData.sections}
                  reasoningNotes={message.planData.reasoningNotes}
                  onApprove={handleApprovePlan}
                  onEdit={handleEditPlan}
                  loading={planLoading}
                  mode="change"
                  onTest={() => navigate(`/test/${receptionistId}`)}
                />
              </div>
            )}
          </>
        )}
        footerBefore={
          <>
            <Button variant="ghost" size="icon" onClick={() => setShowChats((v) => !v)} title="Past change conversations">
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={loadHistory} title="Version history">
              <History className="h-4 w-4" />
            </Button>
          </>
        }
        typingIndicator={
          loading && !pendingPlan ? (
            <div className="flex gap-2 justify-start">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              </div>
            </div>
          ) : (
            <></>
          )
        }
      />

      {/* Past change conversations for this operator */}
      {showChats && (
        <div className="absolute inset-x-0 bottom-0 bg-card border-t border-border shadow-lg max-h-64 overflow-auto z-10">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Past conversations</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowChats(false)}>
                Close
              </Button>
            </div>
            {threads.length === 0 && (
              <p className="text-xs text-muted-foreground">No past change chats yet — each change you make here is kept.</p>
            )}
            <div className="space-y-2">
              {threads.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <button className="min-w-0 flex-1 text-left" onClick={() => openThread(t.id)}>
                    <p className="text-sm font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.status === "approved" ? "Live" : t.status === "planned" ? "Plan ready" : "Chatting"} — {new Date(t.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete conversation: ${t.title}`}
                    onClick={() => deleteThread(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Version History Panel */}
      {showHistory && (
        <div className="absolute inset-x-0 bottom-0 bg-card border-t border-border shadow-lg max-h-64 overflow-auto z-10">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-sm">Version History</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                Close
              </Button>
            </div>
            <div className="space-y-2">
              {history.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Version {v.version_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.change_source} — {new Date(v.created_at).toLocaleString()}
                    </p>
                    {v.owner_input && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        "{v.owner_input}"
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevert(v.version_number)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Revert
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
