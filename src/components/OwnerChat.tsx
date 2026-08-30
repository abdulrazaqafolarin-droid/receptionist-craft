// ═══════════════════════════════════════════════════════════════════════════
// OWNER CHAT — Persistent Conversational Management Sidebar
// ═══════════════════════════════════════════════════════════════════════════
// The owner's primary interface: voice + text, clarifications as clickable options,
// proposals as cards with explanation dial, insights as proactive cards.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Mic,
  MicOff,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Settings,
  HelpCircle,
  Info,
  Terminal,
  FileText,
  RotateCcw,
  MessageSquare,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Clock,
  Loader2,
} from "lucide-react";

interface OwnerChatMessage {
  id: string;
  role: "owner" | "agent" | "system";
  content: string;
  message_type: "text" | "proposal" | "diff" | "confirmation" | "insight" | "voice" | "clarification";
  proposal?: OwnerChangeProposal;
  clarifications?: ClarificationQuestion[];
  clarification_responses?: ClarificationResponse[];
  created_at: string;
}

interface ClarificationQuestion {
  id: string;
  key: string;
  label: string;
  type: "select" | "multiselect" | "input" | "number" | "price" | "duration" | "datetime" | "boolean" | "staff_picker" | "service_picker" | "date_range";
  required: boolean;
  options?: ClarificationOption[];
  placeholder?: string;
  default_value?: unknown;
  validation?: { min?: number; max?: number; pattern?: string; message?: string };
}

interface ClarificationOption {
  value: string | number | boolean;
  label: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

interface ClarificationResponse {
  question_id: string;
  key: string;
  value: unknown;
  answered_at: string;
}

interface OwnerChangeProposal {
  id: string;
  summary: string;
  diffs: ConfigDiff[];
  reasoning: string;
  warnings: string[];
  estimated_impact?: string;
  requires_approval: boolean;
  created_at: string;
}

interface ConfigDiff {
  path: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  change_type: "added" | "removed" | "modified";
  description: string;
}

type ExplanationLevel = "executive" | "understanding" | "technical" | "audit";

interface InsightCard {
  id: string;
  type: "revenue_leak" | "capacity_waste" | "channel_decay" | "growth_pattern" | "risk" | "opportunity";
  title: string;
  description: string;
  metric_value: string;
  metric_trend: "up" | "down" | "stable";
  confidence: number;
  urgency: "low" | "medium" | "high" | "critical";
  suggested_action: string;
  action_type: "autonomous" | "suggest" | "alert";
  dismissible: boolean;
  created_at: string;
}

const INSIGHT_ICONS = {
  revenue_leak: "💸",
  capacity_waste: "📅",
  channel_decay: "📱",
  growth_pattern: "📈",
  risk: "⚠️",
  opportunity: "💡",
};

const INSIGHT_COLORS = {
  revenue_leak: "border-red-200 bg-red-50 text-red-900",
  capacity_waste: "border-amber-200 bg-amber-50 text-amber-900",
  channel_decay: "border-orange-200 bg-orange-50 text-orange-900",
  growth_pattern: "border-green-200 bg-green-50 text-green-900",
  risk: "border-red-200 bg-red-50 text-red-900",
  opportunity: "border-blue-200 bg-blue-50 text-blue-900",
};

export function OwnerChat() {
  const [isOpen, setIsOpen] = useState(true);
  const [messages, setMessages] = useState<OwnerChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId] = useState(() => `owner_${Date.now()}`);
  const [pendingClarifications, setPendingClarifications] = useState<ClarificationQuestion[] | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, unknown>>({});
  const [pendingProposal, setPendingProposal] = useState<OwnerChangeProposal | null>(null);
  const [explanationLevel, setExplanationLevel] = useState<ExplanationLevel>("executive");
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load initial insights (mock for now)
  useEffect(() => {
    const mockInsights: InsightCard[] = [
      {
        id: "ins_1",
        type: "revenue_leak",
        title: "3 quotes ghosted this week",
        description: "Customers received quotes but didn't respond. Last week it was 0.",
        metric_value: "3 ghosted (was 0)",
        metric_trend: "up",
        confidence: 0.87,
        urgency: "high",
        suggested_action: "Add automated follow-up nudge after quote",
        action_type: "suggest",
        dismissible: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "ins_2",
        type: "growth_pattern",
        title: "New patient flow ↑ 28%",
        description: "Monday leads converting at 74% since Tuesday follow-up campaign launched.",
        metric_value: "Conversion 74% (was 52%)",
        metric_trend: "up",
        confidence: 0.92,
        urgency: "low",
        suggested_action: "Expand Tuesday campaign to Wednesday",
        action_type: "suggest",
        dismissible: true,
        created_at: new Date().toISOString(),
      },
      {
        id: "ins_3",
        type: "channel_decay",
        title: "WhatsApp SLA slipping",
        description: "Response time doubled to 4.2hrs. SLA is 2hrs. Root cause: no auto-reply after hours.",
        metric_value: "4.2hr avg (SLA: 2hr)",
        metric_trend: "up",
        confidence: 0.95,
        urgency: "critical",
        suggested_action: "Enable after-hours auto-reply module",
        action_type: "alert",
        dismissible: true,
        created_at: new Date().toISOString(),
      },
    ];
    setInsights(mockInsights);
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() && !pendingClarifications) return;

    const messageText = input.trim();
    setInput("");
    setIsProcessing(true);

    // Add user message optimistically
    const userMsg: OwnerChatMessage = {
      id: `msg_${Date.now()}`,
      role: "owner",
      content: messageText,
      message_type: "text",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: "send_message",
          sessionId,
          message: messageText,
          pendingClarifications,
          clarificationResponses: Object.entries(clarificationAnswers).map(([key, value]) => ({
            question_id: `clarify_${key}`,
            key,
            value,
            answered_at: new Date().toISOString(),
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed");

      // Add agent messages
      setMessages((prev) => [...prev, ...data.messages]);

      // Update state
      if (data.pending_proposal) setPendingProposal(data.pending_proposal);
      if (data.needs_clarification) {
        setPendingClarifications(data.messages.find((m: OwnerChatMessage) => m.message_type === "clarification")?.clarifications || null);
        setClarificationAnswers({});
      } else {
        setPendingClarifications(null);
        setClarificationAnswers({});
      }
    } catch (error) {
      console.error("Owner chat error:", error);
      setMessages((prev) => [...prev, {
        id: `err_${Date.now()}`,
        role: "agent",
        content: "Sorry, something went wrong. Please try again.",
        message_type: "text",
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setIsProcessing(false);
    }
  }, [input, pendingClarifications, clarificationAnswers, sessionId]);

  const handleClarificationAnswer = (questionId: string, key: string, value: unknown) => {
    setClarificationAnswers((prev) => ({ ...prev, [key]: value }));
    // Check if all required answered
    const allRequiredAnswered = pendingClarifications?.every(
      (q) => !q.required || clarificationAnswers[q.key] !== undefined || (value !== undefined && q.key === key)
    );
    if (allRequiredAnswered) {
      sendMessage();
    }
  };

  const handleProposalAction = async (action: "approve" | "tweak" | "cancel") => {
    if (!pendingProposal) return;

    if (action === "cancel") {
      setPendingProposal(null);
      return;
    }

    if (action === "tweak") {
      setInput(`Modify: ${pendingProposal.summary}`);
      setPendingProposal(null);
      return;
    }

    // Approve
    setIsProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/owner-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "apply_proposal",
          proposalId: pendingProposal.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to apply");

      setMessages((prev) => [...prev, {
        id: `msg_${Date.now()}`,
        role: "agent",
        content: "✅ Done! The change is now live. Config version updated.",
        message_type: "confirmation",
        created_at: new Date().toISOString(),
      }]);
      setPendingProposal(null);
    } catch (error) {
      console.error("Apply proposal error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          // In production: send to STT endpoint
          // For now, simulate
          setInput("Voice input: " + audioBlob.size + " bytes recorded");
        };

        mediaRecorderRef.current.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Voice recording failed:", error);
      }
    }
  };

  const dismissInsight = (id: string) => {
    setDismissedInsights((prev) => new Set([...prev, id]));
  };

  const getExplanationText = (proposal: OwnerChangeProposal, level: ExplanationLevel): string => {
    // Simplified - in production would call diffRenderer
    const { diffs, reasoning } = proposal;
    if (level === "executive") {
      return proposal.summary;
    }
    if (level === "understanding") {
      return diffs.map(d => `• ${d.description}`).join("\n") + "\n\n" + reasoning;
    }
    if (level === "technical") {
      return diffs.map(d => `${d.path}: ${JSON.stringify(d.old_value)} → ${JSON.stringify(d.new_value)}`).join("\n");
    }
    return JSON.stringify({ methodology: "Config diff", diffs, reasoning }, null, 2);
  };

  const renderClarification = (q: ClarificationQuestion) => {
    const answer = clarificationAnswers[q.key] as unknown;
    const isMulti = q.type === "multiselect";
    const isPlainObj = answer && typeof answer === "object" && !Array.isArray(answer) && Object.keys(answer as object).length === 0;
    const currentValue: string | string[] = isMulti ? ((answer as string[]) || []) : (isPlainObj ? "" : (answer as string | undefined ?? ""));

    switch (q.type) {
      case "select":
        return (
          <Select
            value={currentValue as string}
            onValueChange={(v) => handleClarificationAnswer(q.id, q.key, v)}
            disabled={!!answer}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={q.placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {q.options?.map((opt) => (
                <SelectItem key={String(opt.value)} value={String(opt.value)}>
                  <div className="flex items-center gap-2">
                    {opt.icon && <span>{opt.icon}</span>}
                    <div>
                      <div>{opt.label}</div>
                      {opt.description && <div className="text-xs text-muted-foreground">{opt.description}</div>}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multiselect":
        return (
          <div className="space-y-2">
            {q.options?.map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={isMulti && (currentValue as unknown[]).includes(opt.value)}
                  onCheckedChange={(checked: boolean) => {
                    const arr = [...((currentValue as unknown[]) || [])];
                    const idx = arr.indexOf(opt.value);
                    if (checked && idx === -1) arr.push(opt.value);
                    else if (!checked && idx !== -1) arr.splice(idx, 1);
                    handleClarificationAnswer(q.id, q.key, arr);
                  }}
                />
                <div>
                  <div className="font-medium">{opt.label}</div>
                  {opt.description && <div className="text-xs text-muted-foreground">{opt.description}</div>}
                </div>
              </label>
            ))}
          </div>
        );

      case "boolean":
        return (
          <div className="space-y-2">
            {q.options?.map((opt) => (
              <label key={String(opt.value)} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors">
                <input
                  type="radio"
                  name={q.key}
                  value={String(opt.value)}
                  checked={currentValue === opt.value}
                  onChange={() => handleClarificationAnswer(q.id, q.key, opt.value)}
                  className="sr-only"
                />
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                  ${currentValue === opt.value ? 'border-primary bg-primary/10' : 'border-muted-foreground/20'}">
                  {currentValue === opt.value && <Check className="w-3 h-3 text-primary" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{opt.label}</div>
                  {opt.description && <div className="text-sm text-muted-foreground">{opt.description}</div>}
                </div>
              </label>
            ))}
          </div>
        );

      case "price":
      case "number":
        return (
          <Input
            type="number"
            placeholder={q.placeholder}
            value={currentValue ?? ""}
            onChange={(e) => handleClarificationAnswer(q.id, q.key, q.type === "price" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
            min={q.validation?.min}
            max={q.validation?.max}
            step={q.type === "price" ? "0.01" : "1"}
            disabled={!!answer}
          />
        );

      case "duration":
        return (
          <Input
            placeholder={q.placeholder || "e.g., 60 min, 1.5 hr"}
            value={currentValue ?? ""}
            onChange={(e) => handleClarificationAnswer(q.id, q.key, e.target.value)}
            disabled={!!answer}
          />
        );

      case "date_range":
        return (
          <Input
            placeholder={q.placeholder}
            value={currentValue ?? ""}
            onChange={(e) => handleClarificationAnswer(q.id, q.key, e.target.value)}
            disabled={!!answer}
          />
        );

      default:
        return (
          <Input
            placeholder={q.placeholder}
            value={currentValue ?? ""}
            onChange={(e) => handleClarificationAnswer(q.id, q.key, e.target.value)}
            disabled={!!answer}
          />
        );
    }
  };

  const renderMessage = (msg: OwnerChatMessage) => {
    const isOwner = msg.role === "owner";

    if (msg.message_type === "clarification" && msg.clarifications) {
      return (
        <div className="flex gap-3 animate-slide-in">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-2">{msg.content}</div>
            <div className="space-y-3">
              {msg.clarifications?.map((q) => (
                <div key={q.id} className="p-3 rounded-lg bg-muted/50 border">
                  <label className="block text-sm font-medium mb-2">{q.label} {q.required && <span className="text-red-500 ml-1">*</span>}</label>
                  {renderClarification(q)}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    if (msg.message_type === "proposal" && msg.proposal) {
      return (
        <div className="flex gap-3 animate-slide-in">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="p-4 rounded-lg border bg-green-50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">Proposal</Badge>
                <span className="text-sm text-muted-foreground">{new Date(msg.proposal.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="prose prose-sm max-w-none">{getExplanationText(msg.proposal, explanationLevel)}</div>
              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <div className="flex gap-1 mr-auto">
                  {(["executive", "understanding", "technical", "audit"] as ExplanationLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setExplanationLevel(lvl)}
                      className={`px-2 py-1 rounded text-xs transition-colors ${explanationLevel === lvl ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {lvl.charAt(0).toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={() => handleProposalAction("approve")} disabled={isProcessing}>
                    <Check className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleProposalAction("tweak")}>
                    Tweak
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleProposalAction("cancel")}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (msg.message_type === "confirmation") {
      return (
        <div className="flex gap-3 animate-slide-in">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-green-600" />
          </div>
          <div className="flex-1 p-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm">
            {msg.content}
          </div>
        </div>
      );
    }

    if (msg.message_type === "insight") {
      // Handled separately in insights panel
      return null;
    }

    return (
      <div className={cn("flex gap-3 animate-slide-in", isOwner && "flex-row-reverse")}>
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", isOwner ? "bg-primary/10" : "bg-muted")}>
          {isOwner ? <MessageSquare className="w-4 h-4 text-primary" /> : <Sparkles className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className={cn("flex-1 max-w-[85%] p-3 rounded-2xl", isOwner ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>
          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
          <div className="text-xs opacity-60 mt-1 text-right">{new Date(msg.created_at).toLocaleTimeString()}</div>
        </div>
      </div>
    );
  };

  const visibleInsights = insights.filter((i) => !dismissedInsights.has(i.id));

  return (
    <div className={cn("flex flex-col h-full bg-card border-l", isOpen ? "w-96" : "w-14")}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        {isOpen && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold">FrontDesk AI</h3>
              <p className="text-xs text-muted-foreground">Your Operations Partner</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </Button>
      </div>

      {/* Insights Panel (Proactive) */}
      {isOpen && visibleInsights.length > 0 && (
        <div className="p-3 border-b bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Insights</span>
            {visibleInsights.length > 1 && (
              <Badge variant="secondary" className="text-xs">{visibleInsights.length}</Badge>
            )}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {visibleInsights.map((insight) => (
              <Card key={insight.id} className={cn(INSIGHT_COLORS[insight.type], "shadow-sm")}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{INSIGHT_ICONS[insight.type]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{insight.title}</p>
                      <p className="text-xs text-muted-foreground/80 mt-0.5">{insight.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {insight.metric_trend === "up" ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {insight.metric_value}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Confidence: {Math.round(insight.confidence * 100)}%
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-xs h-7 px-2"
                        onClick={() => {
                          setInput(insight.suggested_action);
                          sendMessage();
                        }}
                      >
                        {insight.action_type === "autonomous" ? <Zap className="w-3 h-3 mr-1" /> : ""}
                        {insight.suggested_action}
                      </Button>
                    </div>
                    {insight.dismissible && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2 text-muted-foreground/50 hover:text-foreground"
                        onClick={() => dismissInsight(insight.id)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 overflow-y-auto p-3 space-y-3" style={{ scrollbarWidth: "thin" }}>
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Input Area */}
      {isOpen && (
        <div className="p-3 border-t space-y-2">
          {pendingClarifications && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Answer the questions above to continue
            </div>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              placeholder={`Type or hold 🎤 to speak... (e.g., "Add teeth whitening for $299, 60 min")`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              rows={1}
              className="min-h-[44px] max-h-32 resize-none pr-12"
              disabled={isProcessing}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleVoiceToggle}
                disabled={isProcessing}
                className={cn("relative", isRecording && "text-red-500 animate-pulse")}
                aria-label={isRecording ? "Stop recording" : "Start voice input"}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {isRecording && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
              </Button>
              <Button
                variant={isProcessing ? "default" : "default"}
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() && !pendingClarifications || isProcessing}
              >
                {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-1">
            {[
              { label: "Add Service", icon: Plus },
              { label: "Set Hours", icon: Clock },
              { label: "Connect WhatsApp", icon: MessageSquare },
              { label: "Money Mode", icon: Zap },
              { label: "Rollback", icon: RotateCcw },
            ].map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  setInput(action.label.toLowerCase());
                  sendMessage();
                }}
                disabled={isProcessing}
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Collapsed state - just the toggle button is visible */}
    </div>
  );
}