// src/pages/Builder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { BuilderAnalyticsPanel } from "@/components/BuilderAnalyticsPanel";
import { ConversationalManagement } from "@/components/ConversationalManagement";
import { HistoryGlyph } from "@/components/HistoryGlyph";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { BUILDER_TOUR } from "@/lib/actorScripts";
import { useBuildThreads } from "@/hooks/useBuildThreads";
import { FAQManager } from "@/components/FAQManager";
import { WidgetEmbedCode } from "@/components/WidgetEmbedCode";
import { CustomerFieldsConfig, DEFAULT_CUSTOMER_FIELDS, type CustomerField } from "@/components/CustomerFieldsConfig";
import { useToast } from "@/hooks/use-toast";
import { recordManualVersion } from "@/lib/manualVersion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2 } from "lucide-react";
import { FloatingBackground } from "@/components/FloatingBackground";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Builder.tsx
 * Clean, robust AI Receptionist Builder page.
 *
 * Features:
 * - Load receptionist by id (route param :id)
 * - Save / update receptionist
 * - Load chat history filtered by receptionist_id & user_id
 * - Send messages to chat Edge Function (server does AI & logging)
 * - Optimistic UI for user messages
 *
 * Uses integrated Supabase client from @/integrations/supabase/client
 */

type PrimaryGoal = 'sales' | 'bookings' | 'support' | 'leads';

type BusinessCapabilities = {
  sells_products: boolean;
  books_appointments: boolean;
  offers_services: boolean;
  delivers: boolean;
  requires_compliance: boolean;
  supports_emergency: boolean;
};

type Receptionist = {
  id?: string;
  name?: string;
  business_name?: string;
  business_type?: string;
  phone?: string;
  tone?: "friendly" | "professional" | "playful";
  greeting_message?: string;
  default_response?: string;
  knowledge_base?: string;
  system_prompt?: string;
  temperature?: number;
  language?: string;
  currency?: string;
  goal?: string;
  created_at?: string;
  primary_goal?: PrimaryGoal;
  active?: boolean;
  business_model?: string;
  capabilities?: BusinessCapabilities | Json;
  customer_fields?: CustomerField[] | Json;
};

type ChatMessage = {
  id?: string;
  sender: "user" | "bot";
  message: string;
  created_at?: string;
};

export default function BuilderPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const receptionistIdParam = params.id;
  const [receptionistId, setReceptionistId] = useState<string | undefined>(receptionistIdParam ?? undefined);

  const [receptionist, setReceptionist] = useState<Receptionist>({
    name: "",
    business_name: "",
    business_type: "",
    phone: "",
    tone: "friendly",
    greeting_message: "",
    default_response: "I'm sorry — I don't have that info yet.",
    knowledge_base: "",
    system_prompt: "",
    temperature: 0.7,
    language: "English",
    currency: "USD",
    goal: "",
    primary_goal: "bookings",
    capabilities: {
      sells_products: false,
      books_appointments: true,
      offers_services: true,
      delivers: false,
      requires_compliance: false,
      supports_emergency: false,
    },
  });

  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [previewMode, setPreviewMode] = useState(true);
  // Right panel tabs: Test (isolated rehearsal), Improve (change the
  // operator by chatting), Live (real production messages, read-only).
  // Test and Live never mix — that isolation is deliberate.
  const [rightTab, setRightTab] = useState<"test" | "improve" | "live">("test");
  const [liveMessages, setLiveMessages] = useState<Array<{ id: string; sender: string; message: string; created_at: string; session_id: string | null }>>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  // History rail (same threads as the talk-it-through chat, scoped here to
  // this operator). Selecting a thread always lands in Improve — threads
  // ARE build conversations; the Test tab stays an ephemeral rehearsal.
  const { threads: opThreads, refresh: refreshThreads, remove: removeThread } = useBuildThreads(receptionistId ?? null);
  const [threadCommand, setThreadCommand] = useState<{ kind: "open" | "new"; id?: string; nonce: number } | null>(null);
  const [activeImproveThread, setActiveImproveThread] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [railDragX, setRailDragX] = useState<number | null>(null);
  const railSwipeStartX = useRef<number | null>(null);
  const commandNonce = useRef(0);
  const sendCommand = (cmd: { kind: "open" | "new"; id?: string }) => {
    commandNonce.current += 1;
    setThreadCommand({ ...cmd, nonce: commandNonce.current });
  };
  const panelTour = useActorHost();

  // History rail actions: threads ARE build chats, so selecting one always
  // lands in Improve (the Test tab stays an ephemeral rehearsal).
  const openThreadFromRail = (id: string) => {
    if (rightTab !== "improve") setRightTab("improve");
    sendCommand({ kind: "open", id });
    setRailOpen(false);
  };
  const newThreadFromRail = () => {
    if (rightTab !== "improve") setRightTab("improve");
    sendCommand({ kind: "new" });
    setRailOpen(false);
  };
  const deleteThreadFromRail = async (id: string) => {
    await removeThread(id);
    if (id === activeImproveThread) sendCommand({ kind: "new" });
  };

  const threadRail = (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
      <button
        onClick={newThreadFromRail}
        className="mb-1 shrink-0 rounded-lg border border-border px-2.5 py-2 text-left text-sm font-medium hover:bg-muted"
      >
        + New chat
      </button>
      {opThreads.length === 0 && (
        <p className="px-2 py-4 text-xs text-muted-foreground">Past change chats will appear here — pick any up where you left off.</p>
      )}
      {opThreads.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => { if (t.id !== activeImproveThread) openThreadFromRail(t.id); else setRailOpen(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") openThreadFromRail(t.id); }}
          className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted ${t.id === activeImproveThread ? "bg-muted" : ""}`}
          aria-label={`Open change chat: ${t.title}`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${t.status === "approved" ? "bg-emerald-500" : t.status === "planned" ? "bg-amber-500" : "bg-muted-foreground/40"}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{t.title}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {t.status === "approved" ? "Live" : t.status === "planned" ? "Plan ready" : "Chatting"} · {new Date(t.updated_at).toLocaleDateString()}
            </span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); void deleteThreadFromRail(t.id); }}
            aria-label={`Delete chat: ${t.title}`}
            className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Array<{ start: string; end: string; score?: number; reason?: string }> | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const previewSessionIdRef = useRef<string>(crypto.randomUUID());

  // Auto-scroll when messages change
  useEffect(() => {    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  // Live tab: real production messages stream in read-only. Only runs
  // while the tab is open — no background subscription cost otherwise.
  useEffect(() => {
    if (rightTab !== "live" || !receptionistId) return;
    let cancelled = false;
    setLiveLoading(true);
    supabase.from("chat_messages")
      .select("id,sender,message,created_at,session_id")
      .eq("receptionist_id", receptionistId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelled) {
          setLiveMessages(((data || []) as Array<{ id: string; sender: string; message: string; created_at: string; session_id: string | null }>).reverse());
          setLiveLoading(false);
        }
      });
    const channel = supabase
      .channel(`builder-live-${receptionistId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `receptionist_id=eq.${receptionistId}` },
        (payload) => {
          const row = payload.new as { id: string; sender: string; message: string; created_at: string; session_id: string | null };
          setLiveMessages((prev) => [...prev.slice(-49), row]);
        })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rightTab, receptionistId]);

  // load user id from supabase auth (if any)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const {
          data: { user },
          error
        } = await supabase.auth.getUser();
        
        if (!mounted) return;
        
        if (error) {
          console.warn("Auth error:", error);
          setCurrentUserId(null);
          setError("Please log in to use the Builder. Redirecting to login...");
          setTimeout(() => navigate("/auth"), 2000);
          return;
        }
        
        setCurrentUserId(user?.id ?? null);
        
        if (!user?.id) {
          setError("Please log in to use the Builder. Redirecting to login...");
          setTimeout(() => navigate("/auth"), 2000);
        }
      } catch (err) {
        console.warn("Failed to get supabase user", err);
        setCurrentUserId(null);
        setError("Authentication failed. Please log in.");
        setTimeout(() => navigate("/auth"), 2000);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  // Load receptionist when id changes (or on first mount if id present)
  useEffect(() => {
    if (receptionistId) {
      loadReceptionist(receptionistId);
      loadMessages(receptionistId);
    }
     
  }, [receptionistId]);

  // Helper: fetch receptionist from DB
  async function loadReceptionist(id: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("receptionists")
        .select(
        "id, name, business_name, business_type, phone, tone, greeting_message, default_response, knowledge_base, system_prompt, temperature, language, currency, goal, created_at, primary_goal, capabilities, customer_fields, active, business_model"
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setReceptionist((prev) => ({ 
          ...prev, 
          ...(data as unknown as Receptionist),
          primary_goal: (data.primary_goal as PrimaryGoal) || 'bookings',
          capabilities: (data.capabilities as BusinessCapabilities) || prev.capabilities,
          currency: data.currency || 'USD',
          customer_fields: Array.isArray(data.customer_fields) ? (data.customer_fields as unknown as CustomerField[]) : DEFAULT_CUSTOMER_FIELDS,
        } as Receptionist));
      } else {
        // not found
        setError("Receptionist not found");
      }
    } catch (err) {
      console.error("loadReceptionist error", err);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // ISOLATED PREVIEW: Don't load live chat messages - use local preview session only
  // This ensures the preview doesn't show conversations from the live widget
  async function loadMessages(id: string) {
    // For builder preview, we start with empty messages to keep it isolated
    // The preview should simulate a fresh conversation, not show production data
    setMessages([]);
    setError(null);
  }

  // Save or update receptionist
  async function saveReceptionist() {
    if (!currentUserId) {
      setError("Please log in to save receptionists.");
      toast({ title: "Authentication Required", description: "Please log in first.", variant: "destructive" });
      setTimeout(() => navigate("/auth"), 2000);
      return;
    }
    
    // Validation
    if (!receptionist.name?.trim()) {
      const errorMsg = "Receptionist name is required";
      setError(errorMsg);
      toast({ title: "Validation Error", description: errorMsg, variant: "destructive" });
      return;
    }
    if (!receptionist.business_name?.trim()) {
      const errorMsg = "Business name is required";
      setError(errorMsg);
      toast({ title: "Validation Error", description: errorMsg, variant: "destructive" });
      return;
    }
    if (!receptionist.tone) {
      const errorMsg = "Tone of voice is required";
      setError(errorMsg);
      toast({ title: "Validation Error", description: errorMsg, variant: "destructive" });
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      if (receptionistId) {
        // update
        const { error } = await supabase.from("receptionists").update({
          name: receptionist.name,
          business_name: receptionist.business_name,
          business_type: receptionist.business_type,
          phone: receptionist.phone,
          tone: receptionist.tone,
          greeting_message: receptionist.greeting_message,
          default_response: receptionist.default_response,
          knowledge_base: receptionist.knowledge_base,
          system_prompt: receptionist.system_prompt,
          temperature: receptionist.temperature,
          language: receptionist.language,
          currency: receptionist.currency || 'USD',
          goal: receptionist.goal,
          primary_goal: receptionist.primary_goal,
capabilities: receptionist.capabilities,
          customer_fields: (receptionist.customer_fields ?? DEFAULT_CUSTOMER_FIELDS) as Json,
        }).eq("id", receptionistId).eq("user_id", currentUserId);

        if (error) {
          console.error("Update error:", error);
          throw new Error(`Failed to update: ${error.message}`);
        }

        toast({ title: "Success", description: "Receptionist updated successfully!" });
        // Side door closed: the hand-edit is versioned like everything else.
        void recordManualVersion(receptionistId, "Business details updated in the Builder.");
        setHasUnsavedChanges(false);
        await loadReceptionist(receptionistId);
      } else {
        // Check plan limit before creating
        const { data: profileData } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", currentUserId)
          .maybeSingle();
        const userPlan = profileData?.plan || "free";
        const { count: rCount } = await supabase
          .from("receptionists")
          .select("id", { count: "exact", head: true })
          .eq("user_id", currentUserId);
        const limits: Record<string, number> = { free: 1, pro: 5, enterprise: 9999 };
        if ((rCount || 0) >= (limits[userPlan] || 1)) {
          setError(`Receptionist limit reached (${rCount}/${limits[userPlan]}) on ${userPlan} plan. Upgrade to add more.`);
          toast({ title: "Plan Limit", description: `Upgrade to add more receptionists.`, variant: "destructive" });
          setSaving(false);
          return;
        }

        // insert new
        const { data, error } = await supabase.from("receptionists").insert([{
          user_id: currentUserId,
          name: receptionist.name,
          business_name: receptionist.business_name,
          business_type: receptionist.business_type,
          phone: receptionist.phone,
          tone: receptionist.tone,
          greeting_message: receptionist.greeting_message,
          default_response: receptionist.default_response,
          knowledge_base: receptionist.knowledge_base,
          system_prompt: receptionist.system_prompt,
          temperature: receptionist.temperature,
          language: receptionist.language,
          currency: receptionist.currency || 'USD',
          goal: receptionist.goal,
          primary_goal: receptionist.primary_goal,
capabilities: receptionist.capabilities,
          customer_fields: (receptionist.customer_fields ?? DEFAULT_CUSTOMER_FIELDS) as Json,
        }]).select().single();

        if (error) {
          console.error("Create error:", error);
          throw new Error(`Failed to create: ${error.message}`);
        }
        
        toast({ title: "Success", description: "Receptionist created successfully!" });

        if (data?.id) {
          // History starts at birth: the created row gets its first version.
          void recordManualVersion(data.id, "Operator created in the Builder.");
          navigate(`/builder/${data.id}`, { replace: true });
        }
      }
    } catch (err) {
      console.error("saveReceptionist error", err);
      const errorMsg = err instanceof Error ? err.message : "Failed to save receptionist";
      setError(errorMsg);
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Prepare system preview (display only) — used for preview header
  const previewHeader = useMemo(() => {
    return `${receptionist.name || "Receptionist"} — Tone: ${receptionist.tone || "Friendly"}`;
  }, [receptionist]);

  // call the chat Edge Function using Supabase client
  async function callChatFunction(payload: {
    messages: { role: string; content: string }[];
    receptionistId: string;
    userId: string | null;
  }): Promise<{ reply: string; alternatives?: string[]; appointment?: Record<string, unknown> }> {
    try {
      const latestMessage = payload.messages[payload.messages.length - 1]?.content?.trim() || "";
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          message: latestMessage,
          receptionistId: payload.receptionistId,
          sessionId: previewSessionIdRef.current,
          source: "builder_preview"
        }
      });

      if (error) {
        console.error('Chat function error:', error);
        throw new Error(error.message || "Failed to get response from AI");
      }

      if (!data?.reply) {
        throw new Error('No response from AI');
      }

      return {
        reply: data.reply,
        alternatives: data.alternatives,
        appointment: data.appointment
      };
    } catch (err) {
      console.error('Chat function exception:', err);
      const message = err instanceof Error ? err.message : 'Failed to communicate with AI';
      throw new Error(message);
    }
  }

  // send message handler (optimistic UI)
  async function handleSendMessage() {
    setError(null);
    const text = input.trim();
    if (!text) return;
    if (!receptionistId) {
      const errorMsg = "Please save the receptionist first before testing chat.";
      setError(errorMsg);
      toast({ title: "Save Required", description: errorMsg, variant: "destructive" });
      return;
    }

    // optimistic: show user message immediately
    const optimisticMsg: ChatMessage = { sender: "user", message: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimisticMsg]);
    setInput("");

    const startTime = Date.now();

    try {
      const result = await callChatFunction({
        messages: [{ role: "user", content: text }],
        receptionistId: receptionistId,
        userId: currentUserId,
      });

      const latencyMs = Date.now() - startTime;

      const botMsg: ChatMessage = { 
        sender: "bot", 
        message: result.reply, 
        created_at: new Date().toISOString() 
      };

      setMessages((m) => [...m, botMsg]);

      // Handle appointment confirmation
      if (result.appointment) {
        toast({ 
          title: "✅ Appointment Booked!", 
          description: `Confirmation ID: ${result.appointment.id}` 
        });
      }

      interface AlternativeTime {
  start: string;
  end: string;
  score?: number;
  reason?: string;
}

// Handle alternatives (if time not available)
      if (result.alternatives && Array.isArray(result.alternatives) && result.alternatives.length > 0) {
        console.log('Available alternative times:', result.alternatives);
        
        // Transform alternatives to proper format if needed
        const formattedAlternatives = result.alternatives.map((alt: AlternativeTime | string) => {
          // If it's already an object with start/end, use it
          if (typeof alt === 'object' && alt.start && alt.end) {
            return {
              start: alt.start,
              end: alt.end,
              score: alt.score,
              reason: alt.reason
            };
          }
          // If it's a string (ISO date), create object
          if (typeof alt === 'string') {
            const start = new Date(alt);
            const end = new Date(start.getTime() + 30 * 60000); // 30min default
            return {
              start: start.toISOString(),
              end: end.toISOString(),
              score: undefined,
              reason: undefined
            };
          }
          return null;
        }).filter(Boolean);
        
        if (formattedAlternatives.length > 0) {
          setAlternatives(formattedAlternatives as Array<{ start: string; end: string; score?: number; reason?: string }>);
        }
      } else {
        setAlternatives(null);
      }
      
      // Ingest analytics data with detailed metrics
      if (currentUserId && receptionistId) {
        supabase.functions.invoke("analytics", {
          body: {
            action: "ingest",
            receptionist_id: receptionistId,
            user_id: currentUserId,
            request_message: text,
            reply_text: result.reply,
            latency_ms: latencyMs,
            channel: "builder_preview",
            model: "gpt-4",
            temperature: receptionist.temperature || 0.7,
            confidence: 0.85,
            quality_score: {
              coherence: 0.9,
              relevance: 0.85,
              completeness: 0.8
            }
          }
        }).catch(err => console.warn("Analytics ingest failed:", err));

        // Trigger analytics computation (non-blocking)
        supabase.functions.invoke("analytics", {
          body: { action: "compute", userId: currentUserId }
        }).catch(err => console.warn("Analytics compute failed:", err));
      }
      
      // Don't reload messages - keep the optimistic UI
      
      toast({ title: "Success", description: "Response received" });
    } catch (err) {
      console.error("handleSendMessage error", err);
      
      let errorMsg = "Failed to get response";
      const errMessage = err instanceof Error ? err.message : String(err);
      
      if (errMessage.includes("402")) {
        errorMsg = "Lovable AI credits exhausted. Please add credits to continue.";
      } else if (errMessage.includes("429")) {
        errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (errMessage) {
        errorMsg = errMessage;
      }
      
      setError(errorMsg);
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
    }
  }

  // Manual refresh
  async function handleRefresh() {
    if (!receptionistId) return;
    await loadMessages(receptionistId);
  }

  // Delete receptionist
  async function handleDeleteReceptionist() {
    if (!receptionistId || !currentUserId) {
      toast({ title: "Error", description: "Cannot delete receptionist", variant: "destructive" });
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("receptionists")
        .delete()
        .eq("id", receptionistId)
        .eq("user_id", currentUserId);

      if (error) throw error;

      toast({ title: "Success", description: "Receptionist deleted successfully" });
      navigate("/dashboard");
    } catch (err) {
      console.error("Delete receptionist error:", err);
      const message = err instanceof Error ? err.message : "Failed to delete receptionist";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  // Book an alternative slot
  async function handleBookAlternative(startTime: string, endTime: string) {
    if (!receptionistId) {
      toast({ title: "Error", description: "Save receptionist first", variant: "destructive" });
      return;
    }

    setBookingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("book-appointment", {
        body: {
          receptionistId,
          customerName: "Guest",
          customerEmail: null,
          customerPhone: null,
          startTime,
          endTime,
          serviceId: null,
          userId: currentUserId,
          source: "builder_preview",
          metadata: { booked_via_alternatives: true },
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ 
          title: "✅ Appointment Booked!", 
          description: `Booked for ${new Date(startTime).toLocaleString()}` 
        });
        setAlternatives(null);
        // Add bot message confirming booking
        setMessages(m => [...m, {
          sender: "bot",
          message: `✅ Perfect! I've booked your appointment for ${new Date(startTime).toLocaleString()}.`,
          created_at: new Date().toISOString()
        }]);
      } else {
        throw new Error(data?.error || "Booking failed");
      }
    } catch (err) {
      console.error("Book alternative error:", err);
      const message = err instanceof Error ? err.message : "Could not book appointment";
      toast({ 
        title: "Booking Failed", 
        description: message, 
        variant: "destructive" 
      });
    } finally {
      setBookingLoading(false);
    }
  }

  // UI small helpers
  function onFieldChange<K extends keyof Receptionist>(key: K, val: Receptionist[K]) {
    setReceptionist((p) => ({ ...p, [key]: val }));
    // Mark as having unsaved changes when user edits
    setHasUnsavedChanges(true);
  }

  // Track unsaved changes and auto-generation state
  const [generatingKB, setGeneratingKB] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [autoGenerateTriggered, setAutoGenerateTriggered] = useState(false);
  // Manual settings live collapsed (chat-first page) — jump buttons expand first.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Attention strip: what needs the owner now (operator-scoped, dashboard pattern).
  const [attention, setAttention] = useState({ bookings: 0, escalations: 0, stock: 0, tasks: 0 });

  const operatorKind = (() => {
    const caps = ((receptionist.capabilities || {}) as Record<string, unknown>);
    if (caps.operator_kind === "ops" || caps.operator_kind === "assistant" || caps.operator_kind === "both") {
      return caps.operator_kind as string;
    }
    if (receptionist.business_model === "internal") return "ops";
    return "receptionist";
  })();

  const openAdvanced = (anchor: string) => {
    setAdvancedOpen(true);
    setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  useEffect(() => {
    if (!receptionistId) return;
    (async () => {
      try {
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);
        const [apptRes, escRes, stockRes] = await Promise.all([
          supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", receptionistId).gte("start_time", midnight.toISOString()),
          supabase.from("escalations").select("*", { count: "exact", head: true }).eq("receptionist_id", receptionistId).is("resolved_at", null),
          supabase.from("services").select("stock_quantity,low_stock_threshold,expiry_date").eq("receptionist_id", receptionistId).eq("active", true).not("stock_quantity", "is", null),
        ]);
        let stock = 0;
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 30);
        const hstr = `${horizon.getFullYear()}-${String(horizon.getMonth() + 1).padStart(2, "0")}-${String(horizon.getDate()).padStart(2, "0")}`;
        for (const row of ((stockRes.data || []) as unknown) as Array<{ stock_quantity: number | null; low_stock_threshold: number | null; expiry_date: string | null }>) {
          const qty = row.stock_quantity ?? 0;
          if (qty <= 0 || qty <= (row.low_stock_threshold ?? 5)) { stock++; continue; }
          if (row.expiry_date && row.expiry_date <= hstr) stock++;
        }
        const caps = ((receptionist.capabilities || {}) as Record<string, unknown>);
        const tasks = (Array.isArray(caps.ops_tasks) ? caps.ops_tasks : []) as Array<{ due?: string; done?: boolean }>;
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        setAttention({
          bookings: apptRes.count || 0,
          escalations: escRes.count || 0,
          stock,
          tasks: tasks.filter((t) => !t.done && t.due && t.due <= today).length,
        });
      } catch {
        // attention degrades silently
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receptionistId]);
  
  // Auto-generate KB and System Prompt when receptionist loads
  useEffect(() => {
    if (receptionistId && receptionist.business_name && !autoGenerateTriggered && !loading) {
      // Only auto-generate if KB or System Prompt is empty
      const needsKB = !receptionist.knowledge_base || receptionist.knowledge_base.trim() === '';
      const needsPrompt = !receptionist.system_prompt || receptionist.system_prompt.trim() === '';
      
      if (needsKB || needsPrompt) {
        setAutoGenerateTriggered(true);
        autoGenerateContent(needsKB, needsPrompt);
      }
    }
  }, [receptionistId, receptionist.business_name, loading, autoGenerateTriggered]);
  
  // Auto-generate and auto-save content
  async function autoGenerateContent(generateKB: boolean, generatePrompt: boolean) {
    if (!receptionistId) return;
    try {
      // Fetch services and FAQs for this receptionist
      let services: Array<{ name: string; description: string | null; duration_minutes: number; price: number }> = [];
      let faqs: Array<{ question: string; answer: string }> = [];
      
      if (receptionistId) {
        const { data: servicesData } = await supabase
          .from('services')
          .select('*')
          .eq('receptionist_id', receptionistId);
        services = (servicesData || []) as Array<{ name: string; description: string | null; duration_minutes: number; price: number }>;

        const { data: faqsData } = await supabase
          .from('receptionist_faqs')
          .select('*')
          .eq('receptionist_id', receptionistId)
          .order('priority', { ascending: false });
        faqs = faqsData || [];
      }

      // Build structured data
      const receptionistData = {
        business_name: receptionist.business_name,
        business_type: receptionist.business_type,
        phone: receptionist.phone,
        language: receptionist.language,
        greeting_message: receptionist.greeting_message,
        tone: receptionist.tone,
        goal: receptionist.goal,
        temperature: receptionist.temperature,
        services: services.map(s => ({
          name: s.name,
          description: s.description,
          duration: `${s.duration_minutes} minutes`,
          price: s.price,
        })),
        faqs: faqs.map(f => ({
          question: f.question,
          answer: f.answer,
        })),
      };

      let newKB = receptionist.knowledge_base;
      let newPrompt = receptionist.system_prompt;

      // Generate KB if needed
      if (generateKB) {
        setGeneratingKB(true);
        const { data: kbData, error: kbError } = await supabase.functions.invoke('generate-knowledge-base', {
          body: { receptionistData }
        });
        if (!kbError && kbData?.knowledge_base) {
          newKB = kbData.knowledge_base;
        }
        setGeneratingKB(false);
      }

      // Generate System Prompt if needed
      if (generatePrompt) {
        setGeneratingPrompt(true);
        const { data: promptData, error: promptError } = await supabase.functions.invoke('generate-system-prompt', {
          body: { receptionistData }
        });
        if (!promptError && promptData?.system_prompt) {
          newPrompt = promptData.system_prompt;
        }
        setGeneratingPrompt(false);
      }

      // Auto-save the generated content
      if ((generateKB && newKB) || (generatePrompt && newPrompt)) {
        const updates: Record<string, unknown> = {};
        if (generateKB && newKB) updates.knowledge_base = newKB;
        if (generatePrompt && newPrompt) updates.system_prompt = newPrompt;

        const { error: updateError } = await supabase
          .from('receptionists')
          .update(updates as Record<string, unknown>)
          .eq('id', receptionistId);

        if (!updateError) {
          setReceptionist(p => ({
            ...p,
            ...(generateKB && newKB ? { knowledge_base: newKB } : {}),
            ...(generatePrompt && newPrompt ? { system_prompt: newPrompt } : {}),
          }));
          toast({ 
            title: "Auto-Generated", 
            description: "Knowledge base and system prompt have been automatically generated and saved." 
          });
        }
      }
    } catch (err) {
      console.error('Auto-generate error:', err);
    }
  }
  
  // Manual regenerate function (for button if user wants to regenerate)
  async function regenerateContent() {
    setAutoGenerateTriggered(true);
    await autoGenerateContent(true, true);
  }

  // Show loading or auth error state
  if (!currentUserId && !error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-center py-12">
          <p className="text-lg">Loading authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-background p-6">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Modern Header */}
        <header className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-contact">
              <span className="text-lg font-bold text-primary-foreground">R</span>
            </div>
            <h1 className="type-display text-foreground">
              Operator Builder
            </h1>
          </div>
          <p className="text-muted-foreground ml-13">Shape your AI operator — chat first, forms only if you insist.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => openAdvanced('builder-details')}>Business Details</button>
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => document.getElementById('builder-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Preview & Test</button>
            {receptionistId && (
              <>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => openAdvanced('builder-faqs')}>FAQs</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => openAdvanced('builder-embed')}>Widget Install</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20" onClick={() => navigate(`/test/${receptionistId}`)}>Test Operator</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20" onClick={() => navigate('/operator-management')}>Manage Operator</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20" onClick={() => navigate('/money-mode')}>Money Mode</button>
              </>
            )}
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
          </div>
        </header>

        {/* Operator identity + attention: what this is, what needs you.
            Reads the loaded row only — no new concepts, no new queries
            beyond the attention counts. */}
        {receptionistId && (
          <section className="mb-6 rounded-2xl border border-border/50 bg-card p-4 sm:p-5 shadow-card" aria-label="Operator overview">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {receptionist.business_name || receptionist.name || "Untitled operator"}
              </h2>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {operatorKind === "ops" ? "Internal helper" : operatorKind === "assistant" ? "Helper" : operatorKind === "both" ? "Customers + helper" : "Receptionist"}
              </span>
              {receptionist.active !== undefined && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${receptionist.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                  {receptionist.active ? "Live" : "Paused"}
                </span>
              )}
              {receptionist.business_model && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {receptionist.business_model === "internal" ? "Internal" : receptionist.business_model === "both" ? "Bookings + orders" : receptionist.business_model === "products" ? "Orders" : "Bookings"}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {operatorKind === "ops" ? (
                <>
                  {attention.stock > 0 && <button className="text-primary hover:underline" onClick={() => navigate("/services")}>{attention.stock} stock item{attention.stock === 1 ? "" : "s"} need{attention.stock === 1 ? "s" : ""} you</button>}
                  {attention.tasks > 0 && <button className="text-primary hover:underline" onClick={() => navigate("/console")}>{attention.tasks} overdue task{attention.tasks === 1 ? "" : "s"}</button>}
                  {attention.stock === 0 && attention.tasks === 0 && <span className="text-muted-foreground">All clear — nothing needs you right now.</span>}
                </>
              ) : (
                <>
                  {attention.bookings > 0 && <button className="text-primary hover:underline" onClick={() => navigate("/appointments")}>{attention.bookings} upcoming booking{attention.bookings === 1 ? "" : "s"}</button>}
                  {attention.escalations > 0 && <button className="text-primary hover:underline" onClick={() => navigate("/escalations")}>{attention.escalations} open escalation{attention.escalations === 1 ? "" : "s"}</button>}
                  {attention.bookings === 0 && attention.escalations === 0 && <span className="text-muted-foreground">All clear — nothing needs you right now.</span>}
                </>
              )}
            </div>
          </section>
        )}

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left panel: manual settings — collapsed by default. The chat is
              the builder now; forms are the fallback, still fully working. */}
          <section className="lg:col-span-1 order-2">
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button className="mb-4 flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card px-4 py-3 text-left shadow-card">
                  <span className="text-sm font-medium">
                    Advanced — manual settings
                    {hasUnsavedChanges && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500" aria-label="Unsaved changes" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{advancedOpen ? "Hide" : "Show"}</span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6">
            {/* Analytics Panel */}
            {receptionistId && currentUserId && (
              <BuilderAnalyticsPanel 
                receptionistId={receptionistId} 
                userId={currentUserId}
              />
            )}
            
            <div id="builder-details" className="bg-card rounded-2xl shadow-card border border-border/50 p-6 animate-scale-in">
              <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                Edit operator details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Receptionist Name *</label>
                  <input className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" value={receptionist.name || ""} onChange={(e) => onFieldChange("name", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Business Name *</label>
                  <input className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" value={receptionist.business_name || ""} onChange={(e) => onFieldChange("business_name", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Business Type *</label>
                  <select className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" value={receptionist.business_type || ""} onChange={(e) => onFieldChange("business_type", e.target.value)}>
                    <option value="">Select business type</option>
                    <option value="Dental Clinic">Dental Clinic</option>
                    <option value="Spa & Wellness">Spa & Wellness</option>
                    <option value="Barber Shop">Barber Shop</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Real Estate">Real Estate</option>
                    <option value="Medical Clinic">Medical Clinic</option>
                    <option value="Law Office">Law Office</option>
                    <option value="Hair Salon">Hair Salon</option>
                    <option value="Gym & Fitness">Gym & Fitness</option>
                    <option value="General Business">General Business</option>
                  </select>
                </div>

                {/* Primary Goal */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Business Goal</label>
                  <select 
                    className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" 
                    value={receptionist.primary_goal || "bookings"} 
                    onChange={(e) => onFieldChange("primary_goal", e.target.value as PrimaryGoal)}
                  >
                    <option value="bookings">📅 Drive Bookings - Fill your calendar</option>
                    <option value="sales">💰 Increase Sales - Sell products & services</option>
                    <option value="support">💬 Reduce Support Calls - Answer questions</option>
                    <option value="leads">🎯 Capture Leads - Collect contact info</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">This influences how your AI prioritizes conversations</p>
                </div>

                {/* Business Capabilities */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2">What can your business do?</label>
                  <div className="space-y-2 p-3 bg-muted/30 rounded-lg border border-border">
                    {[
                      { key: 'books_appointments', label: '📅 Book Appointments', desc: 'Schedule meetings, consultations' },
                      { key: 'offers_services', label: '🔧 Offer Services', desc: 'Provide services to customers' },
                      { key: 'sells_products', label: '🛒 Sell Products', desc: 'Physical or digital products' },
                      { key: 'delivers', label: '🚚 Deliver', desc: 'Delivery or shipping services' },
                      { key: 'requires_compliance', label: '📋 Requires Compliance', desc: 'Medical, legal, financial' },
                      { key: 'supports_emergency', label: '🚨 Emergency Support', desc: 'Urgent after-hours support' },
                    ].map((cap) => (
                      <label key={cap.key} className="flex items-start gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={((receptionist.capabilities as BusinessCapabilities) ?? {})[cap.key as keyof BusinessCapabilities] ?? false}
                          onChange={(e) => {
                            setReceptionist(prev => ({
                              ...prev,
                              capabilities: {
                                ...(prev.capabilities as BusinessCapabilities)!,
                                [cap.key as keyof BusinessCapabilities]: e.target.checked,
                              },
                            }));
                            setHasUnsavedChanges(true);
                          }}
                          className="mt-1 rounded border-border accent-primary"
                        />
                        <div>
                          <div className="text-sm font-medium group-hover:text-primary transition-colors">{cap.label}</div>
                          <div className="text-xs text-muted-foreground">{cap.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">AI will only offer features your business supports</p>
                </div>

                {/* Customer Information Fields */}
                <CustomerFieldsConfig
                  fields={(receptionist.customer_fields as CustomerField[]) ?? DEFAULT_CUSTOMER_FIELDS}
                  onChange={(fields) => {
                    setReceptionist(prev => ({ ...prev, customer_fields: fields }));
                    setHasUnsavedChanges(true);
                  }}
                />

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Business Phone</label>
                  <input className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" type="tel" placeholder="+1 (555) 000-0000" value={receptionist.phone || ""} onChange={(e) => onFieldChange("phone", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tone of Voice *</label>
                  <select className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" value={receptionist.tone} onChange={(e) => onFieldChange("tone", e.target.value as "friendly" | "professional" | "playful")}>
                    <option value="friendly">Friendly - Warm, welcoming, conversational</option>
                    <option value="professional">Professional - Polished, formal, efficient</option>
                    <option value="playful">Playful - Fun, energetic, engaging</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Language</label>
                  <select className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" value={receptionist.language || "English"} onChange={(e) => onFieldChange("language", e.target.value)}>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Italian">Italian</option>
                    <option value="Portuguese">Portuguese</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Currency</label>
                  <select
                    className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    value={receptionist.currency || "USD"}
                    onChange={(e) => onFieldChange("currency", e.target.value)}
                  >
                    <option value="USD">USD — US Dollar ($)</option>
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="GBP">GBP — British Pound (£)</option>
                    <option value="NGN">NGN — Nigerian Naira (₦)</option>
                    <option value="KES">KES — Kenyan Shilling (KSh)</option>
                    <option value="GHS">GHS — Ghanaian Cedi (GH₵)</option>
                    <option value="ZAR">ZAR — South African Rand (R)</option>
                    <option value="CAD">CAD — Canadian Dollar (CA$)</option>
                    <option value="AUD">AUD — Australian Dollar (A$)</option>
                    <option value="INR">INR — Indian Rupee (₹)</option>
                    <option value="JPY">JPY — Japanese Yen (¥)</option>
                    <option value="BRL">BRL — Brazilian Real (R$)</option>
                    <option value="MXN">MXN — Mexican Peso (MX$)</option>
                    <option value="SGD">SGD — Singapore Dollar (S$)</option>
                    <option value="AED">AED — UAE Dirham (د.إ)</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">Widget will display prices in this currency</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Greeting Message</label>
                  <textarea className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" rows={2} placeholder="Hi! Thanks for reaching out..." value={receptionist.greeting_message || ""} onChange={(e) => onFieldChange("greeting_message", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Default Response</label>
                  <textarea className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" rows={2} value={receptionist.default_response || ""} onChange={(e) => onFieldChange("default_response", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Main Goal & Custom Instructions</label>
                  <textarea 
                    className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" 
                    rows={4} 
                    placeholder="Describe how you want your AI receptionist to behave..." 
                    value={receptionist.goal || ""} 
                    onChange={(e) => onFieldChange("goal", e.target.value)} 
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">This information will be refined and integrated into the AI's system prompt</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">Knowledge Base</label>
                    {generatingKB && (
                      <span className="text-xs text-primary animate-pulse">✨ Auto-generating...</span>
                    )}
                  </div>
                  <textarea className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" rows={4} placeholder="Knowledge base will be auto-generated..." value={receptionist.knowledge_base || ""} onChange={(e) => onFieldChange("knowledge_base", e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Auto-generated from your business info. Edit as needed, then save.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Temperature (AI Creativity)</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.1" 
                      className="flex-1 accent-primary" 
                      value={receptionist.temperature || 0.7} 
                      onChange={(e) => onFieldChange("temperature", parseFloat(e.target.value))} 
                    />
                    <span className="text-sm font-mono bg-secondary px-2 py-1 rounded-md w-12 text-center">{(receptionist.temperature || 0.7).toFixed(1)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Higher = more creative, Lower = more focused</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-muted-foreground">System Prompt (Advanced)</label>
                    {generatingPrompt && (
                      <span className="text-xs text-primary animate-pulse">✨ Auto-generating...</span>
                    )}
                  </div>
                  <textarea className="w-full border border-border bg-background rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none" rows={3} placeholder="System prompt will be auto-generated..." value={receptionist.system_prompt || ""} onChange={(e) => onFieldChange("system_prompt", e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">Auto-generated from your business info. Edit as needed, then save.</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-border">
                <button 
                  className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-contact hover:-translate-y-0.5 transition-all disabled:opacity-50"
                  onClick={saveReceptionist} 
                  disabled={saving}
                >
                  {saving ? "Saving..." : receptionistId ? "💾 Save Changes" : "🚀 Create Receptionist"}
                </button>
                {receptionistId && (
                  <button 
                    className="px-5 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-all" 
                    onClick={() => navigate(`/builder/${receptionistId}#test`)}
                  >
                    🧪 Test AI
                  </button>
                )}
                <button 
                  className="px-5 py-2.5 border border-border rounded-xl font-medium hover:bg-muted transition-all" 
                  onClick={() => { setReceptionistId(undefined); setReceptionist({ name: "", business_name: "", business_type: "", phone: "", tone: "friendly", greeting_message: "", default_response: "I'm sorry — I don't have that info yet.", knowledge_base: "", system_prompt: "", temperature: 0.7, language: "English", goal: "" }); navigate("/builder"); }}
                >
                  + New
                </button>
                {receptionistId && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="px-5 py-2.5 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl font-medium hover:bg-destructive hover:text-destructive-foreground transition-all">
                        🗑️ Delete
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="bg-card border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the receptionist "{receptionist.name || 'this receptionist'}" and all associated data. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleDeleteReceptionist}
                          disabled={deleting}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          {deleting ? "Deleting..." : "Yes, Delete"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {error && <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">{error}</div>}
              <div className="mt-4 text-xs text-muted-foreground">💡 Tip: Save the receptionist before testing voice or live calls.</div>
            </div>

            {/* FAQ Manager */}
            {receptionistId && (
              <div id="builder-faqs">
                <FAQManager receptionistId={receptionistId} />
              </div>
            )}

            {/* Widget Embed Code */}
            {receptionistId && receptionist.name && (
              <div id="builder-embed">
                <WidgetEmbedCode
                  receptionistId={receptionistId}
                  receptionistName={receptionist.name}
                />
              </div>
            )}
              </CollapsibleContent>
            </Collapsible>
          </section>

          {/* Right panel: chat preview — first because it IS the builder now */}
          <section
            id="builder-preview"
            className="lg:col-span-2 order-1 bg-card rounded-2xl shadow-card border border-border/50 p-6 flex flex-col animate-slide-in-right"
            onTouchStart={(e) => {
              if (railOpen || e.touches.length !== 1 || e.touches[0].clientX >= 40) {
                railSwipeStartX.current = null;
                return;
              }
              railSwipeStartX.current = e.touches[0].clientX;
            }}
            onTouchMove={(e) => {
              if (railSwipeStartX.current === null || railOpen || e.touches.length !== 1) return;
              const dx = e.touches[0].clientX - railSwipeStartX.current;
              if (dx > 8) setRailDragX(dx);
            }}
            onTouchEnd={() => {
              if (railDragX !== null) {
                if (railDragX > 100) setRailOpen(true);
                setRailDragX(null);
              }
              railSwipeStartX.current = null;
            }}
            onTouchCancel={() => {
              setRailDragX(null);
              railSwipeStartX.current = null;
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-border">
              <div>
                <div className="text-xl font-semibold flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-success animate-pulse"></div>
                  {previewHeader}
                </div>
                <div className="text-sm text-muted-foreground">{receptionist.business_name || "No business set yet"}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setRailOpen((v) => !v)}
                  aria-label="Change history"
                  data-actor="builder-history"
                  className="liquid-glass-btn flex h-9 w-9 items-center justify-center rounded-lg text-primary transition-transform active:scale-95 lg:hidden"
                >
                  <HistoryGlyph className="h-5 w-5" />
                </button>
                <button
                  onClick={() => { void panelTour.start(BUILDER_TOUR, { tour: "builder-tour", userId: currentUserId ?? undefined, receptionistId }); }}
                  disabled={panelTour.running}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {panelTour.running ? "Touring…" : "Tour"}
                </button>
                <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Builder chat mode">
                  {(["test", "improve", "live"] as const).map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={rightTab === t}
                      data-actor={`builder-tab-${t}`}
                      onClick={() => setRightTab(t)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${rightTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {t === "test" ? "Test" : t === "improve" ? "Improve" : "Live"}
                    </button>
                  ))}
                </div>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${previewMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`}
                  onClick={() => setPreviewMode((p) => !p)}
                >
                  {previewMode ? "Preview: ON" : "Preview: OFF"}
                </button>
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-all" onClick={handleRefresh}>↻ Refresh</button>
              </div>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 gap-3">
              {/* Desktop: history rail beside every tab — threads ARE build
                  chats, so selecting one always lands in Improve */}
                <aside className="hidden w-52 shrink-0 flex-col gap-2 lg:flex" aria-label="Change history">
                  <div className="flex items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
                    History
                  </div>
                  {threadRail}
                </aside>
                {/* Mobile: swipe/drawer history */}
                {(railOpen || railDragX !== null) && (
                  <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-label="Change history">
                    <div
                      className="absolute inset-0 bg-background/80"
                      style={railDragX !== null ? { opacity: Math.min(0.8, railDragX / 300) } : undefined}
                      onClick={() => setRailOpen(false)}
                      aria-hidden="true"
                    />
                    <aside
                      className="absolute inset-y-0 left-0 flex w-72 flex-col gap-2 bg-background p-4 shadow-xl"
                      style={railDragX !== null && !railOpen
                        ? { transform: `translateX(${Math.min(0, railDragX - 288)}px)` }
                        : undefined}
                    >
                      <div className="flex items-center gap-2 px-2 text-sm font-medium">
                        History
                      </div>
                      {threadRail}
                    </aside>
                  </div>
                )}
                <div className="min-h-0 min-w-0 flex-1">
            {rightTab === "improve" ? (
              <div className="flex-1 overflow-auto" style={{ minHeight: 400 }}>
                {receptionistId ? (
                  <ConversationalManagement
                    receptionistId={receptionistId}
                    threadCommand={threadCommand}
                    onHistoryChanged={() => { void refreshThreads(); }}
                    onActiveThreadChange={(id) => setActiveImproveThread(id)}
                  />
                ) : (
                  <div className="text-muted-foreground text-center py-12">
                    <p>Save the operator first — then describe changes here and they go live on approval.</p>
                  </div>
                )}
                </div>
            ) : rightTab === "live" ? (
              <div className="flex-1 overflow-auto bg-muted/30 rounded-xl p-4 mb-4" style={{ minHeight: 400 }}>
                <div className="mb-3 flex items-center gap-2 text-xs font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  LIVE — real customer conversations as they happen (read-only)
                </div>
                {liveLoading && <p className="text-sm text-muted-foreground">Loading recent conversations…</p>}
                {!liveLoading && liveMessages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No customer conversations yet. New messages appear here the moment they arrive.</p>
                )}
                {liveMessages.map((m) => (
                  <div key={m.id} className={`mb-3 max-w-[85%] ${m.sender === "user" || m.sender === "visitor" || m.sender === "customer" ? "ml-auto" : "mr-auto"}`}>
                    <div className={`inline-block px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      m.sender === "user" || m.sender === "visitor" || m.sender === "customer"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card border border-border shadow-sm rounded-bl-md"
                    }`}>
                      {m.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(m.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <>
            {/* chat window */}
            <div ref={messagesRef} className="flex-1 overflow-auto bg-muted/30 rounded-xl p-4 mb-4" style={{ minHeight: 400 }}>
              {messages.length === 0 && (
                <div className="text-muted-foreground text-center py-12">
                  <div className="text-4xl mb-3">💬</div>
                  <p>No conversation yet — try saying "Hi" or ask about services.</p>
                </div>
              )}
              {messages.map((m, idx) => (
                <div key={idx} className={`mb-4 max-w-[80%] animate-fade-in ${m.sender === "user" ? "ml-auto" : "mr-auto"}`}>
                  <div className={`inline-block px-4 py-3 rounded-2xl ${
                    m.sender === "user" 
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border shadow-sm rounded-bl-md"
                  }`}>
                    <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                  </div>
                  <div className={`text-xs text-muted-foreground mt-1 ${m.sender === "user" ? "text-right" : ""}`}>
                    {m.sender === "user" ? "You" : (receptionist.name || "Receptionist")}
                  </div>
                </div>
              ))}
            </div>

            {/* alternatives panel */}
            {alternatives && alternatives.length > 0 && (
              <div className="mb-4 p-5 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <span className="text-lg">📅</span> Available Alternative Times
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {alternatives.map((alt, idx) => (
                    <div key={idx} className="p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all">
                      <div className="text-sm font-medium text-muted-foreground">
                        {new Date(alt.start).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                      <div className="text-xl font-bold text-primary">
                        {new Date(alt.start).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit' 
                        })}
                      </div>
                      {alt.reason && (
                        <div className="text-xs text-muted-foreground mt-1">{alt.reason}</div>
                      )}
                      {alt.score && (
                        <div className="text-xs text-muted-foreground mt-1">Match: {(alt.score * 100).toFixed(0)}%</div>
                      )}
                      <button
                        className="mt-3 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
                        onClick={() => handleBookAlternative(alt.start, alt.end)}
                        disabled={bookingLoading}
                      >
                        {bookingLoading ? "Booking..." : "Book This Time"}
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-4 text-sm text-muted-foreground hover:text-foreground underline"
                  onClick={() => setAlternatives(null)}
                >
                  Close alternatives
                </button>
              </div>
            )}

            {/* input */}
            <div className="flex gap-3 items-center">
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} 
                className="flex-1 border border-border bg-background rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" 
                placeholder='Try: "Hi", "How much is a cleaning?"' 
              />
              <button
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-contact hover:-translate-y-0.5 transition-all"
                onClick={handleSendMessage}
              >
                Send
              </button>
            </div>
            </>
            )}
                </div>
              </div>
              <ActorCursor point={panelTour.point} />
              <ActorOverlay
                ring={panelTour.ring}
                bubble={panelTour.bubble}
                showcase={panelTour.showcase}
                confirmAsk={panelTour.confirmAsk}
                running={panelTour.running}
                onStop={panelTour.stop}
                onDismissBubble={panelTour.dismissBubble}
                onDismissShowcase={panelTour.dismissShowcase}
                onAnswerConfirm={panelTour.answerConfirm}
              />
          </section>
        </main>
      </div>
    </div>
  );
}
