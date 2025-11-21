// src/pages/Builder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BuilderAnalyticsPanel } from "@/components/BuilderAnalyticsPanel";

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
  tone?: string;
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
      setTimeout(() => navigate("/auth"), 2000);
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
          tone: receptionist.tone as any, // Type assertion for enum compatibility
          greeting_message: receptionist.greeting_message,
          default_response: receptionist.default_response,
          knowledge_base: receptionist.knowledge_base,
          system_prompt: receptionist.system_prompt,
          temperature: receptionist.temperature,
          language: receptionist.language,
          goal: receptionist.goal,
        }).eq("id", receptionistId);

        if (error) throw error;
      } else {
        // insert new
        const { data, error } = await supabase.from("receptionists").insert([{
          user_id: currentUserId,
          name: receptionist.name,
          business_name: receptionist.business_name,
          business_type: receptionist.business_type,
          phone: receptionist.phone,
          tone: receptionist.tone as any, // Type assertion for enum compatibility
          greeting_message: receptionist.greeting_message,
          default_response: receptionist.default_response,
          knowledge_base: receptionist.knowledge_base,
          system_prompt: receptionist.system_prompt,
          temperature: receptionist.temperature,
          language: receptionist.language,
          goal: receptionist.goal,
        }]).select().single();

        if (error) throw error;
        if (data?.id) {
          setReceptionistId(data.id);
          // update url to new id (optional)
          navigate(`/builder/${data.id}`, { replace: true });
        }
      }
    } catch (err: any) {
      console.error("saveReceptionist error", err);
      setError(err.message || String(err));
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
  }): Promise<string> {
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

      return data.reply;
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
      setError("Please save the receptionist first (click Save & Generate).");
      return;
    }

    // optimistic: show user message immediately
    const optimisticMsg: ChatMessage = { sender: "user", message: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimisticMsg]);
    setInput("");

    const startTime = Date.now();

    try {
      const reply = await callChatFunction({
        messages: [{ role: "user", content: text }],
        receptionistId: receptionistId,
        userId: currentUserId,
      });

      const latencyMs = Date.now() - startTime;

      const botMsg: ChatMessage = { 
        sender: "bot", 
        message: reply, 
        created_at: new Date().toISOString() 
      };

      setMessages((m) => [...m, botMsg]);
      
      // Ingest analytics data with detailed metrics
      if (currentUserId && receptionistId) {
        supabase.functions.invoke("analytics/ingest", {
          body: {
            receptionist_id: receptionistId,
            user_id: currentUserId,
            request_message: text,
            reply_text: reply,
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
      
      // Optionally refresh from server to sync persisted messages
      setTimeout(() => loadMessages(receptionistId), 400);
    } catch (err: any) {
      console.error("handleSendMessage error", err);
      setError(err.message || "Failed to send message");
    }
  }

  // Manual refresh
  async function handleRefresh() {
    if (!receptionistId) return;
    await loadMessages(receptionistId);
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
          <h2 className="font-semibold mb-2">Create AI Receptionist</h2>

          <label className="block text-xs mt-2">Receptionist Name</label>
          <input className="w-full border rounded p-2" value={receptionist.name || ""} onChange={(e) => onFieldChange("name", e.target.value)} />

          <label className="block text-xs mt-2">Business Name</label>
          <input className="w-full border rounded p-2" value={receptionist.business_name || ""} onChange={(e) => onFieldChange("business_name", e.target.value)} />

          <label className="block text-xs mt-2">Business Type</label>
          <input className="w-full border rounded p-2" value={receptionist.business_type || ""} onChange={(e) => onFieldChange("business_type", e.target.value)} />

          <label className="block text-xs mt-2">Business Phone</label>
          <input className="w-full border rounded p-2" value={receptionist.phone || ""} onChange={(e) => onFieldChange("phone", e.target.value)} />

          <label className="block text-xs mt-2">Tone of Voice</label>
          <select className="w-full border rounded p-2" value={receptionist.tone} onChange={(e) => onFieldChange("tone", e.target.value)}>
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
            <option value="playful">Playful</option>
          </select>

          <label className="block text-xs mt-2">Greeting Message</label>
          <textarea className="w-full border rounded p-2" rows={2} value={receptionist.greeting_message || ""} onChange={(e) => onFieldChange("greeting_message", e.target.value)} />

          <label className="block text-xs mt-2">Default Response</label>
          <textarea className="w-full border rounded p-2" rows={2} value={receptionist.default_response || ""} onChange={(e) => onFieldChange("default_response", e.target.value)} />

          <label className="block text-xs mt-2">Knowledge Base (short)</label>
          <textarea className="w-full border rounded p-2" rows={4} value={receptionist.knowledge_base || ""} onChange={(e) => onFieldChange("knowledge_base", e.target.value)} />

          <label className="block text-xs mt-2">System Prompt (optional)</label>
          <textarea className="w-full border rounded p-2" rows={4} value={receptionist.system_prompt || ""} onChange={(e) => onFieldChange("system_prompt", e.target.value)} />

          <div className="flex gap-2 mt-4">
            <button className="px-4 py-2 bg-yellow-500 text-white rounded" onClick={saveReceptionist} disabled={saving}>
              {saving ? "Saving..." : receptionistId ? "Save & Update" : "Save & Generate AI Receptionist"}
            </button>
            <button className="px-4 py-2 border rounded" onClick={() => { setReceptionistId(undefined); setReceptionist({ name: "", business_name: "", business_type: "", phone: "", tone: "friendly", greeting_message: "", default_response: "I'm sorry — I don't have that info yet.", knowledge_base: "", system_prompt: "", temperature: 0.7, language: "English", goal: "" }); navigate("/builder"); }}>
              New Receptionist
            </button>
          </div>

          {error && <div className="mt-3 text-red-600">{error}</div>}
          <div className="mt-4 text-xs text-gray-500">Tip: Save the receptionist before testing voice or live calls.</div>
          </div>
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
