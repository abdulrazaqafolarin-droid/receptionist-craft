import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, History, RotateCcw, Send, Loader2 } from "lucide-react";
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
    } catch (err: any) {
      toast.error(err.message || "Failed to process change");
      const errorMsg: ChatMessage = {
        role: "ai",
        content: `Sorry, I couldn't process that change: ${err.message}`,
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
    } catch (err: any) {
      toast.error(err.message || "Failed to apply change");
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
      const { error } = await supabase.rpc("revert_config_version" as any, {
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
    } catch (err: any) {
      toast.error(err.message || "Failed to revert");
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
          <Button variant="ghost" size="icon" onClick={loadHistory} title="Version history">
            <History className="h-4 w-4" />
          </Button>
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
