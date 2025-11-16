// src/pages/Builder.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams, useNavigate } from "react-router-dom";

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
 * Notes:
 * - Replace CHAT_FUNCTION_PATH if your Lovable function route differs.
 * - This file assumes VITE_SUPABASE_URL & VITE_SUPABASE_PUBLISHABLE_KEY are set.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const CHAT_FUNCTION_PATH = "/functions/v1/chat"; // <-- change if your functions route differs

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
    tone: "Friendly",
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
        } = await supabase.auth.getUser();
        if (!mounted) return;
        setCurrentUserId(user?.id ?? null);
      } catch (err) {
        console.warn("Failed to get supabase user", err);
        setCurrentUserId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      setMessages(data || []);
    } catch (err: any) {
      console.error("loadMessages error", err);
      setError(err.message || String(err));
    }
  }

  // Save or update receptionist
  async function saveReceptionist() {
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
        }).eq("id", receptionistId);

        if (error) throw error;
      } else {
        // insert new
        const { data, error } = await supabase.from("receptionists").insert({
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
        }).select().single();

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

  // call the chat Edge Function — server will call AI and log messages
  async function callChatFunction(payload: { receptionist_id: string; user_message: string; user_id?: string }) {
    // Change the endpoint path here if your Lovable deploy uses a different functions path
    const url = CHAT_FUNCTION_PATH;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receptionistId: payload.receptionist_id,
        userId: payload.user_id,
        messages: [
          // Provide last messages minimal context; server will fetch authoritative history
          { role: "user", content: payload.user_message },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Chat function error ${res.status}: ${text}`);
    }
    return res.json();
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

    try {
      const result = await callChatFunction({
        receptionist_id: receptionistId,
        user_message: text,
        user_id: currentUserId ?? undefined,
      });

      // result expected: { reply: "..." }
      const aiReply = (result?.reply as string) ?? (result?.reply?.toString() ?? "No reply");
      const botMsg: ChatMessage = { sender: "bot", message: aiReply, created_at: new Date().toISOString() };

      setMessages((m) => [...m, botMsg]);
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Rutex FrontDesk Builder</h1>
        <p className="text-sm text-gray-600">Create an AI receptionist and preview how it will talk to your customers.</p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left panel: form */}
        <section className="md:col-span-1 bg-white rounded-lg shadow-sm p-4">
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
            <option>Friendly</option>
            <option>Professional</option>
            <option>Energetic</option>
            <option>Calm</option>
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
            <button className="px-4 py-2 border rounded" onClick={() => { setReceptionistId(undefined); setReceptionist({ name: "", business_name: "", business_type: "", phone: "", tone: "Friendly", greeting_message: "", default_response: "I'm sorry — I don't have that info yet.", knowledge_base: "", system_prompt: "", temperature: 0.7, language: "English", goal: "" }); navigate("/builder"); }}>
              New Receptionist
            </button>
          </div>

          {error && <div className="mt-3 text-red-600">{error}</div>}
          <div className="mt-4 text-xs text-gray-500">Tip: Save the receptionist before testing voice or live calls.</div>
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
