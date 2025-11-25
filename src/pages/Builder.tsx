// src/pages/Builder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BuilderAnalyticsPanel } from "@/components/BuilderAnalyticsPanel";
import { FAQManager } from "@/components/FAQManager";
import { WidgetEmbedCode } from "@/components/WidgetEmbedCode";
import { useToast } from "@/hooks/use-toast";
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
  goal?: string;
  created_at?: string;
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
    goal: "",
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
          "id, name, business_name, business_type, phone, tone, greeting_message, default_response, knowledge_base, system_prompt, temperature, language, goal, created_at"
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setReceptionist((prev) => ({ ...prev, ...data }));
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

  // Helper: fetch chat history for given receptionist and current user (if available)
  async function loadMessages(id: string) {
    setError(null);
    try {
      const query = supabase
        .from("chat_messages")
        .select("id, sender, message, created_at")
        .eq("receptionist_id", id)
        .order("created_at", { ascending: true })
        .limit(200);

      // If you use row-level security and want only messages for the current user, include user filter:
      if (currentUserId) {
        query.eq("user_id", currentUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Type-safe mapping to ensure sender is correctly typed
      setMessages((data || []).map((m) => ({
        id: m.id,
        sender: (m.sender === "bot" || m.sender === "user") ? m.sender : "user",
        message: m.message,
        created_at: m.created_at,
      })));
    } catch (err: any) {
      console.error("loadMessages error", err);
      setError(err.message || String(err));
    }
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
          goal: receptionist.goal,
        }).eq("id", receptionistId).eq("user_id", currentUserId);

        if (error) {
          console.error("Update error:", error);
          throw new Error(`Failed to update: ${error.message}`);
        }
        
        toast({ title: "Success", description: "Receptionist updated successfully!" });
        await loadReceptionist(receptionistId);
      } else {
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
          goal: receptionist.goal,
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
      const { data, error } = await supabase.functions.invoke('chat', {
        body: payload
      });

      if (error) {
        console.error('Chat function error:', error);
        throw new Error(error.message || 'Failed to get response from AI');
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
        supabase.functions.invoke("analytics/ingest", {
          body: {
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
        supabase.functions.invoke("analytics/compute", {
          body: { userId: currentUserId }
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
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Rutex FrontDesk Builder</h1>
        <p className="text-sm text-gray-600">Create an AI receptionist and preview how it will talk to your customers.</p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left panel: form */}
        <section className="md:col-span-1 space-y-4">
          {/* Analytics Panel */}
          {receptionistId && currentUserId && (
            <BuilderAnalyticsPanel 
              receptionistId={receptionistId} 
              userId={currentUserId}
            />
          )}
          
          <div className="bg-white rounded-lg shadow-sm p-4">
          <h2 className="font-semibold mb-2">Edit AI Receptionist</h2>

          <label className="block text-xs mt-2">Receptionist Name *</label>
          <input className="w-full border rounded p-2" value={receptionist.name || ""} onChange={(e) => onFieldChange("name", e.target.value)} />

          <label className="block text-xs mt-2">Business Name *</label>
          <input className="w-full border rounded p-2" value={receptionist.business_name || ""} onChange={(e) => onFieldChange("business_name", e.target.value)} />

          <label className="block text-xs mt-2">Business Type *</label>
          <select className="w-full border rounded p-2" value={receptionist.business_type || ""} onChange={(e) => onFieldChange("business_type", e.target.value)}>
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

          <label className="block text-xs mt-2">Business Phone</label>
          <input className="w-full border rounded p-2" type="tel" placeholder="+1 (555) 000-0000" value={receptionist.phone || ""} onChange={(e) => onFieldChange("phone", e.target.value)} />

          <label className="block text-xs mt-2">Tone of Voice *</label>
          <select className="w-full border rounded p-2" value={receptionist.tone} onChange={(e) => onFieldChange("tone", e.target.value as "friendly" | "professional" | "playful")}>
            <option value="friendly">Friendly - Warm, welcoming, conversational</option>
            <option value="professional">Professional - Polished, formal, efficient</option>
            <option value="playful">Playful - Fun, energetic, engaging</option>
          </select>

          <label className="block text-xs mt-2">Primary Language</label>
          <select className="w-full border rounded p-2" value={receptionist.language || "English"} onChange={(e) => onFieldChange("language", e.target.value)}>
            <option value="English">English</option>
            <option value="Spanish">Spanish</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Italian">Italian</option>
            <option value="Portuguese">Portuguese</option>
          </select>

          <label className="block text-xs mt-2">Greeting Message</label>
          <textarea className="w-full border rounded p-2" rows={2} placeholder="Hi! Thanks for reaching out..." value={receptionist.greeting_message || ""} onChange={(e) => onFieldChange("greeting_message", e.target.value)} />

          <label className="block text-xs mt-2">Goal (optional)</label>
          <textarea className="w-full border rounded p-2" rows={2} placeholder="e.g., Book appointments, answer FAQs, collect leads" value={receptionist.goal || ""} onChange={(e) => onFieldChange("goal", e.target.value)} />

          <label className="block text-xs mt-2">Default Response</label>
          <textarea className="w-full border rounded p-2" rows={2} value={receptionist.default_response || ""} onChange={(e) => onFieldChange("default_response", e.target.value)} />

          <label className="block text-xs mt-2">Knowledge Base</label>
          <textarea className="w-full border rounded p-2" rows={4} placeholder="Add your business knowledge here..." value={receptionist.knowledge_base || ""} onChange={(e) => onFieldChange("knowledge_base", e.target.value)} />

          <label className="block text-xs mt-2">Temperature (AI Creativity)</label>
          <div className="flex items-center gap-2">
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              className="flex-1" 
              value={receptionist.temperature || 0.7} 
              onChange={(e) => onFieldChange("temperature", parseFloat(e.target.value))} 
            />
            <span className="text-xs font-mono w-8">{(receptionist.temperature || 0.7).toFixed(1)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Higher = more creative, Lower = more focused</p>

          <label className="block text-xs mt-2">System Prompt (Advanced)</label>
          <textarea className="w-full border rounded p-2" rows={3} placeholder="Optional custom system instructions..." value={receptionist.system_prompt || ""} onChange={(e) => onFieldChange("system_prompt", e.target.value)} />

          <div className="flex gap-2 mt-4">
            <button className="px-4 py-2 bg-yellow-500 text-white rounded" onClick={saveReceptionist} disabled={saving}>
              {saving ? "Saving..." : receptionistId ? "Save & Update" : "Save & Generate AI Receptionist"}
            </button>
            {receptionistId && (
              <button 
                className="px-4 py-2 bg-blue-500 text-white rounded" 
                onClick={() => navigate(`/builder/${receptionistId}#test`)}
              >
                Test Your AI Receptionist
              </button>
            )}
            <button className="px-4 py-2 border rounded" onClick={() => { setReceptionistId(undefined); setReceptionist({ name: "", business_name: "", business_type: "", phone: "", tone: "friendly", greeting_message: "", default_response: "I'm sorry — I don't have that info yet.", knowledge_base: "", system_prompt: "", temperature: 0.7, language: "English", goal: "" }); navigate("/builder"); }}>
              New Receptionist
            </button>
            {receptionistId && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
                    Delete Receptionist
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the receptionist "{receptionist.name || 'this receptionist'}" and all associated data including FAQs, conversations, and appointments. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleDeleteReceptionist}
                      disabled={deleting}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      {deleting ? "Deleting..." : "Yes, Delete Receptionist"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          {error && <div className="mt-3 text-red-600">{error}</div>}
          <div className="mt-4 text-xs text-gray-500">Tip: Save the receptionist before testing voice or live calls.</div>
          </div>

          {/* FAQ Manager */}
          {receptionistId && (
            <FAQManager receptionistId={receptionistId} />
          )}

          {/* Widget Embed Code */}
          {receptionistId && receptionist.name && (
            <WidgetEmbedCode 
              receptionistId={receptionistId} 
              receptionistName={receptionist.name}
            />
          )}
        </section>

        {/* Right panel: chat preview */}
        <section className="md:col-span-2 bg-white rounded-lg shadow-sm p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-lg font-semibold">{previewHeader}</div>
              <div className="text-sm text-gray-500">{receptionist.business_name || "No business set yet"}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 border rounded" onClick={() => setPreviewMode((p) => !p)}>{previewMode ? "Preview: ON" : "Preview: OFF"}</button>
              <button className="px-3 py-1 border rounded" onClick={handleRefresh}>Refresh</button>
            </div>
          </div>

          {/* chat window */}
          <div ref={messagesRef} className="flex-1 overflow-auto border rounded p-4 mb-3" style={{ minHeight: 300 }}>
            {messages.length === 0 && <div className="text-gray-400">No conversation yet — try saying "Hi" or ask about services.</div>}
            {messages.map((m, idx) => (
              <div key={idx} className={`mb-3 max-w-[80%] ${m.sender === "user" ? "ml-auto text-right" : "mr-auto text-left"}`}>
                <div className={`inline-block px-4 py-2 rounded ${m.sender === "user" ? "bg-gray-200" : "bg-yellow-50"}`}>
                  <div className="text-sm whitespace-pre-wrap">{m.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{m.sender === "user" ? "You" : (receptionist.name || "Receptionist")}</div>
                </div>
              </div>
            ))}
          </div>

          {/* alternatives panel */}
          {alternatives && alternatives.length > 0 && (
            <div className="mb-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-semibold mb-3">📅 Available Alternative Times</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {alternatives.map((alt, idx) => (
                  <div key={idx} className="p-3 bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-sm font-medium">
                      {new Date(alt.start).toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="text-lg font-bold text-blue-600">
                      {new Date(alt.start).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </div>
                    {alt.reason && (
                      <div className="text-xs text-gray-500 mt-1">{alt.reason}</div>
                    )}
                    {alt.score && (
                      <div className="text-xs text-gray-400 mt-1">Match: {(alt.score * 100).toFixed(0)}%</div>
                    )}
                    <button
                      className="mt-2 w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      onClick={() => handleBookAlternative(alt.start, alt.end)}
                      disabled={bookingLoading}
                    >
                      {bookingLoading ? "Booking..." : "Book This Time"}
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mt-3 text-sm text-gray-600 hover:text-gray-900 underline"
                onClick={() => setAlternatives(null)}
              >
                Close alternatives
              </button>
            </div>
          )}

          {/* input */}
          <div className="flex gap-2 items-center">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }} className="flex-1 border rounded p-2" placeholder='Try: "Hi", "How much is a cleaning?"' />
            <button className="px-4 py-2 bg-black text-white rounded" onClick={handleSendMessage}>Send</button>
            <button className="px-3 py-2 border rounded" title="Voice (coming soon)">🎙️</button>
            <button className="px-3 py-2 border rounded" title="Play reply (coming soon)">🔊</button>
          </div>
        </section>
      </main>
    </div>
  );
}
