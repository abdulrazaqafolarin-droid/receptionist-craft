// src/pages/Builder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BuilderAnalyticsPanel } from "@/components/BuilderAnalyticsPanel";
import { FAQManager } from "@/components/FAQManager";
import { WidgetEmbedCode } from "@/components/WidgetEmbedCode";
import { CustomerFieldsConfig, DEFAULT_CUSTOMER_FIELDS, type CustomerField } from "@/components/CustomerFieldsConfig";
import { useToast } from "@/hooks/use-toast";
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
  capabilities?: BusinessCapabilities;
  customer_fields?: CustomerField[];
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Array<{ start: string; end: string; score?: number; reason?: string }> | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const previewSessionIdRef = useRef<string>(crypto.randomUUID());

  // Auto-scroll when messages change
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receptionistId]);

  // Helper: fetch receptionist from DB
  async function loadReceptionist(id: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("receptionists")
        .select(
        "id, name, business_name, business_type, phone, tone, greeting_message, default_response, knowledge_base, system_prompt, temperature, language, currency, goal, created_at, primary_goal, capabilities, customer_fields"
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
          currency: (data as any).currency || 'USD',
          customer_fields: Array.isArray(data.customer_fields) ? (data.customer_fields as unknown as CustomerField[]) : DEFAULT_CUSTOMER_FIELDS,
        }));
      } else {
        // not found
        setError("Receptionist not found");
      }
    } catch (err: any) {
      console.error("loadReceptionist error", err);
      setError(err.message || String(err));
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
          customer_fields: (receptionist.customer_fields || DEFAULT_CUSTOMER_FIELDS) as unknown as any,
        }).eq("id", receptionistId).eq("user_id", currentUserId);

        if (error) {
          console.error("Update error:", error);
          throw new Error(`Failed to update: ${error.message}`);
        }
        
        toast({ title: "Success", description: "Receptionist updated successfully!" });
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
          customer_fields: (receptionist.customer_fields || DEFAULT_CUSTOMER_FIELDS) as unknown as any,
        }]).select().single();

        if (error) {
          console.error("Create error:", error);
          throw new Error(`Failed to create: ${error.message}`);
        }
        
        toast({ title: "Success", description: "Receptionist created successfully!" });
        
        if (data?.id) {
          navigate(`/builder/${data.id}`, { replace: true });
        }
      }
    } catch (err: any) {
      console.error("saveReceptionist error", err);
      const errorMsg = err.message || "Failed to save receptionist";
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
  }): Promise<{ reply: string; alternatives?: string[]; appointment?: any }> {
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
    } catch (err: any) {
      console.error('Chat function exception:', err);
      throw new Error(err.message || 'Failed to communicate with AI');
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

      // Handle alternatives (if time not available)
      if (result.alternatives && Array.isArray(result.alternatives) && result.alternatives.length > 0) {
        console.log('Available alternative times:', result.alternatives);
        
        // Transform alternatives to proper format if needed
        const formattedAlternatives = result.alternatives.map((alt: any) => {
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
    } catch (err: any) {
      console.error("handleSendMessage error", err);
      
      let errorMsg = "Failed to get response";
      
      if (err.message?.includes("402")) {
        errorMsg = "Lovable AI credits exhausted. Please add credits to continue.";
      } else if (err.message?.includes("429")) {
        errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
      } else if (err.message) {
        errorMsg = err.message;
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
    } catch (err: any) {
      console.error("Delete receptionist error:", err);
      toast({ title: "Error", description: err.message || "Failed to delete receptionist", variant: "destructive" });
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
    } catch (err: any) {
      console.error("Book alternative error:", err);
      toast({ 
        title: "Booking Failed", 
        description: err.message || "Could not book appointment", 
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
        const updates: any = {};
        if (generateKB && newKB) updates.knowledge_base = newKB;
        if (generatePrompt && newPrompt) updates.system_prompt = newPrompt;

        const { error: updateError } = await supabase
          .from('receptionists')
          .update(updates)
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
    } catch (err: any) {
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
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg glow-sm">
              <span className="text-lg font-bold text-primary-foreground">R</span>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Rutex FrontDesk Builder
            </h1>
          </div>
          <p className="text-muted-foreground ml-13">Create an AI receptionist and preview how it will talk to your customers.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => document.getElementById('builder-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Business Details</button>
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => document.getElementById('builder-preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Preview & Test</button>
            {receptionistId && (
              <>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => document.getElementById('builder-faqs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>FAQs</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => document.getElementById('builder-embed')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Widget Install</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-blue-500/40 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20" onClick={() => navigate(`/test/${receptionistId}`)}>Test Operator</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20" onClick={() => navigate('/operator-management')}>Manage Operator</button>
                <button className="px-3 py-1.5 text-xs rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20" onClick={() => navigate('/money-mode')}>Money Mode</button>
              </>
            )}
            <button className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-muted" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left panel: form */}
          <section className="lg:col-span-1 space-y-6">
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
                Edit AI Receptionist
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
                          checked={receptionist.capabilities?.[cap.key as keyof BusinessCapabilities] ?? false}
                          onChange={(e) => {
                            setReceptionist(prev => ({
                              ...prev,
                              capabilities: {
                                ...prev.capabilities!,
                                [cap.key]: e.target.checked,
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
                  fields={receptionist.customer_fields || DEFAULT_CUSTOMER_FIELDS}
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
                  className="px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl font-medium shadow-lg hover:shadow-glow hover:-translate-y-0.5 transition-all disabled:opacity-50" 
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
          </section>

          {/* Right panel: chat preview */}
          <section id="builder-preview" className="lg:col-span-2 bg-card rounded-2xl shadow-card border border-border/50 p-6 flex flex-col animate-slide-in-right">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
              <div>
                <div className="text-xl font-semibold flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-success animate-pulse"></div>
                  {previewHeader}
                </div>
                <div className="text-sm text-muted-foreground">{receptionist.business_name || "No business set yet"}</div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${previewMode ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'}`} 
                  onClick={() => setPreviewMode((p) => !p)}
                >
                  {previewMode ? "Preview: ON" : "Preview: OFF"}
                </button>
                <button className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-all" onClick={handleRefresh}>↻ Refresh</button>
              </div>
            </div>

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
                      ? "bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-br-md" 
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
                        className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-lg hover:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
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
                className="px-6 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl font-medium shadow-lg hover:shadow-glow hover:-translate-y-0.5 transition-all" 
                onClick={handleSendMessage}
              >
                Send
              </button>
              <button className="px-4 py-3 border border-border rounded-xl hover:bg-muted transition-all" title="Voice (coming soon)">🎙️</button>
              <button className="px-4 py-3 border border-border rounded-xl hover:bg-muted transition-all" title="Play reply (coming soon)">🔊</button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
