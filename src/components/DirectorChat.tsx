/**
 * DirectorChat — talk to the Director.
 *
 * Emulates the talk-it-through chat it was asked to mirror: welcome message,
 * suggestion chips, message bubbles, input row, and conversation history tabs
 * (new / resume / delete) backed by director_threads. Replies come from the
 * director-chat edge function (live platform context + Director actions);
 * actions execute through the same executors as the Build tab, with the
 * cursor riding along visibly. Approval stays human — drafts link to the
 * Builder.
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Plus, Trash2, History, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChatShell } from "@/components/widget/ChatShell";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { useBuildThreads } from "@/hooks/useBuildThreads";
import { speakDirectorText, stopSpeaking, type DirectorVoiceProvider } from "@/utils/textToSpeech";
import type { GrantScope } from "@/lib/directorGrantRules";
import { retryDirectorJob, adjustDirectorOperator, draftDirectorHelper } from "@/lib/directorExecutors";
import type { DirectorAction } from "../../supabase/functions/_shared/config/directorPrompt";
import { OWNER_PAGES } from "../../supabase/functions/_shared/config/surfaceManifest";

interface ChatMessage {
  role: "owner" | "ai";
  content: string;
  timestamp: string;
  suggestions?: string[];
  actions?: DirectorAction[];
}

const WELCOME_SUGGESTIONS = ["What needs me right now?", "What should I build next?", "Review my operators"];

export function DirectorChat({
  userId,
  check,
  onNeedGrant,
}: {
  userId: string | undefined;
  check: (scope: string) => boolean;
  onNeedGrant: (scope: GrantScope) => void;
}) {
  const navigate = useNavigate();
  const ride = useActorHost();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  // Director voice: off until the owner asks to hear it. Provider cycles
  // auto (cheapest first) -> local (gateway Voicebox, free) -> cloud.
  const [voiceOn, setVoiceOn] = useState(() => {
    try {
      return localStorage.getItem("rutex-director-voice") === "1";
    } catch {
      return false;
    }
  });
  const [voiceProvider, setVoiceProvider] = useState<DirectorVoiceProvider>(() => {
    try {
      const v = localStorage.getItem("rutex-director-voice-provider");
      return v === "local" || v === "cloud" ? v : "auto";
    } catch {
      return "auto";
    }
  });
  const toggleVoice = () => {
    setVoiceOn((v) => {
      const next = !v;
      try {
        localStorage.setItem("rutex-director-voice", next ? "1" : "0");
      } catch {
        // preference best-effort
      }
      if (!next) {
        stopSpeaking();
        try {
          if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
        } catch {
          // already quiet
        }
      }
      return next;
    });
  };
  const cycleProvider = () => {
    setVoiceProvider((p) => {
      const next: DirectorVoiceProvider = p === "auto" ? "local" : p === "local" ? "cloud" : "auto";
      try {
        localStorage.setItem("rutex-director-voice-provider", next);
      } catch {
        // preference best-effort
      }
      return next;
    });
  };
  const threadIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    threads, ensureThread, saveMsg, remove,
    loadMessages,
  } = useBuildThreads(null, { threads: "director_threads", messages: "director_messages" });

  const gate = (scope: GrantScope): boolean => {
    if (!check(scope)) {
      toast.message("Grant needed — enable it first.");
      onNeedGrant(scope);
      return false;
    }
    return true;
  };

  async function runAction(action: DirectorAction, msgIdx: number) {
    if (action.type === "navigate") {
      const receipts = await ride.start(
        [{ type: "goto", route: action.path }],
        { tour: "director-ride", userId },
      );
      if (!receipts[0]?.ok) {
        // The ride refused: the requested page is not a real manifest
        // route. Never push a dead route into the router — say so openly
        // and name where the owner CAN go.
        const want = action.path.replace(/^\//, "").toLowerCase();
        const words = want.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
        const scored = OWNER_PAGES.map((p) => {
          const hay = `${p.key} ${p.label} ${p.route}`.toLowerCase();
          return { p, hits: words.filter((w) => hay.includes(w)).length };
        }).filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits).slice(0, 3);
        const options = (scored.length > 0 ? scored : OWNER_PAGES.slice(0, 3).map((p) => ({ p, hits: 0 })))
          .map((s) => s.p.label).join(", ");
        toast.message(`There's no ${action.path} page — I can take you to ${options} instead. Just say which.`, { duration: 6000 });
      }
      return;
    }
    if (action.type === "open_builder") {
      navigate(`/builder/${action.operator_id}`);
      return;
    }
    if (action.type === "open_grants") {
      onNeedGrant("build_helpers");
      return;
    }
    if (!userId) return;
    if (action.type === "retry_job") {
      if (!gate("fix_small")) return;
      setExecuting(`retry-${msgIdx}`);
      const res = await retryDirectorJob(action.job_id);
      toast[res.ok ? "success" : "error"](res.ok ? "Job re-queued." : res.error || "Requeue failed.");
      setExecuting(null);
      return;
    }
    if (action.type === "adjust_operator") {
      if (!gate("fix_small")) return;
      setExecuting(`adjust-${msgIdx}`);
      const res = await adjustDirectorOperator(userId, action.operator_id, action.note, (s) =>
        toast.message(s, { duration: 3000 }),
      );
      if (res.ok) navigate(`/builder/${action.operator_id}`);
      else toast.error(res.error || "Change failed.");
      setExecuting(null);
      return;
    }
    if (action.type === "draft_helper") {
      if (!gate("build_helpers")) return;
      setExecuting(`draft-${msgIdx}`);
      const res = await draftDirectorHelper(userId, action.name || "", action.description, (s) =>
        toast.message(s, { duration: 4000 }),
      );
      if (res.ok && res.receptionistId) navigate(`/builder/${res.receptionistId}`);
      else toast.error(res.error || "Draft failed.");
      setExecuting(null);
    }
  }

  async function sendText(text: string) {
    const content = text.trim();
    if (!content || loading || !userId) return;
    setInput("");
    const ownerMsg: ChatMessage = { role: "owner", content, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, ownerMsg]);
    setLoading(true);
    const tid = await ensureThread(content);
    if (tid) {
      threadIdRef.current = tid;
      void saveMsg(tid, "user", content);
    }
    try {
      const history = [...messages, ownerMsg].slice(-10).map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.content,
      }));
      const { data, error } = await supabase.functions.invoke("director-chat", {
        body: { user_id: userId, message: content, history, thread_id: tid || undefined },
      });
      if (error) throw error;
      const d = (data || {}) as { ok?: boolean; error?: string; reply?: string; suggestions?: string[]; actions?: DirectorAction[] };
      if (!d?.ok) throw new Error(d?.error || "Director unreachable");
      const aiMsg: ChatMessage = {
        role: "ai",
        content: d.reply || "…",
        timestamp: new Date().toISOString(),
        suggestions: (d.suggestions || []).filter((s): s is string => typeof s === "string"),
        actions: (d.actions || []).filter((a): a is DirectorAction => !!a && typeof a === "object"),
      };
      setMessages((prev) => [...prev, aiMsg]);
      if (tid) {
        void saveMsg(tid, "assistant", d.reply || "…", {
          suggestions: aiMsg.suggestions || [],
          actions: aiMsg.actions || [],
        });
      }
      if (voiceOn && d.reply && d.reply !== "…") {
        void speakDirectorText(d.reply, voiceProvider).catch(() => {
          // voice is a courtesy — a failed lane never breaks the chat
        });
      }
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "ai",
        content: `I could not reach my brain just now (${e instanceof Error ? e.message : "unknown error"}). Your operators are untouched — try again in a moment.`,
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function openThread(id: string) {
    try {
      const loaded = await loadMessages(id);
      threadIdRef.current = id;
      setMessages(loaded.map((m) => {
        const meta = m.metadata || {};
        const suggestions = Array.isArray(meta.suggestions)
          ? meta.suggestions.filter((s): s is string => typeof s === "string")
          : undefined;
        const actions = Array.isArray(meta.actions)
          ? (meta.actions as DirectorAction[]).filter((a) => !!a && typeof a === "object")
          : undefined;
        return {
          role: (m.role === "assistant" ? "ai" : "owner") as ChatMessage["role"],
          content: m.content,
          timestamp: m.created_at,
          ...(suggestions && suggestions.length > 0 ? { suggestions } : {}),
          ...(actions && actions.length > 0 ? { actions } : {}),
        };
      }));
      setShowHistory(false);
    } catch {
      toast.error("Could not open that conversation");
    }
  }

  function newChat() {
    threadIdRef.current = null;
    setMessages([]);
    setShowHistory(false);
  }

  async function deleteThread(id: string) {
    await remove(id);
    if (threadIdRef.current === id) {
      threadIdRef.current = null;
      setMessages([]);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Talk to your Director — it knows every operator.</p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleVoice}
            aria-label={voiceOn ? "Mute the Director's voice" : "Hear the Director's voice"}
            title={voiceOn ? "Voice on — tap to mute" : "Voice off — tap to hear replies"}
          >
            {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          {voiceOn && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cycleProvider}
              aria-label={`Voice provider: ${voiceProvider}. Tap to change.`}
              title="Voice lane: auto tries free local first, then cloud"
              className="px-2 text-[11px] text-muted-foreground"
            >
              {voiceProvider}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowHistory((v) => !v)} aria-label="Conversation history">
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={newChat} aria-label="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showHistory && (
        <div className="mb-2 max-h-40 overflow-y-auto rounded-xl border border-border bg-card p-2">
          {threads.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted-foreground">No past Director chats yet.</p>
          )}
          {threads.map((t) => (
            <div key={t.id} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { void openThread(t.id); }}>
                {t.title}
              </button>
              <button
                aria-label={`Delete: ${t.title}`}
                onClick={() => { void deleteThread(t.id); }}
                className="shrink-0 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ChatShell
          theme="configurator"
          messages={messages}
          isUser={(m) => m.role === "owner"}
          loading={loading}
          scrollRef={scrollRef}
          contextLabel="Director · knows every operator"
          inputValue={input}
          onInputChange={setInput}
          onSend={() => { void sendText(input); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendText(input);
            }
          }}
          disabled={loading}
          placeholder="Ask your Director anything…"
          multiline
          sendIcon={<Send className="h-4 w-4" />}
          emptyState={
            <div className="py-6 text-center">
              <p className="text-sm font-medium">Good to see you. I watch every operator you own.</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                Ask what needs you, what to build next, or how any operator is doing — I answer from live records.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {WELCOME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { void sendText(s); }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          }
          renderMessage={({ message }) => (
            <>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              {message.role === "ai" && message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { void sendText(s); }}
                      className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {message.role === "ai" && message.actions && message.actions.some((a) => a.type !== "research_need") && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.actions.filter((a) => a.type !== "research_need").map((a, i) => (
                    <button
                      key={i}
                      disabled={executing !== null}
                      onClick={() => { void runAction(a, i); }}
                      className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {executing ? "Working…" : actionLabel(a)}
                    </button>
                  ))}
                </div>
              )}
              {message.role === "ai" && message.actions && message.actions.some((a) => a.type === "research_need" && (a as { result?: unknown }).result) && (
                <div className="mt-2 space-y-2">
                  {(message.actions.filter((a) => a.type === "research_need") as Array<{ need?: string; result?: {
                    success: boolean; best_interface: string; fallbacks: string[]; verification: string;
                    errors: string[]; candidates: Array<{ name: string; url: string; verification: string; evidence: string[] }>;
                  } }>).map((a, i) => a.result && (
                    <div key={i} className="rounded-xl border border-border bg-card p-2.5">
                      <p className="text-xs font-medium">
                        {a.result.success ? `Connects via ${a.result.best_interface}` : "No verified option yet"}
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{a.result.verification}</span>
                      </p>
                      {a.result.candidates.slice(0, 2).map((c, j) => (
                        <a key={j} href={c.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-primary hover:underline">
                          {c.name}
                        </a>
                      ))}
                      {a.result.errors.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">{a.result.errors[0]}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        />
      </div>
      <ActorCursor point={ride.point} swallow={ride.swallow} arriving={ride.arriving} size={48} />
      <ActorOverlay
        ring={ride.ring}
        bubble={ride.bubble}
        showcase={ride.showcase}
        running={ride.running}
        onStop={ride.stop}
        onDismissBubble={ride.dismissBubble}
        onDismissShowcase={ride.dismissShowcase}
      />
    </div>
  );
}

function actionLabel(a: DirectorAction): string {
  switch (a.type) {
    case "navigate": return "Take me there";
    case "retry_job": return "Retry job";
    case "draft_helper": return `Draft helper`;
    case "adjust_operator": return "Plan change";
    case "open_builder": return "Open in Builder";
    case "open_grants": return "Review grants";
    case "research_need": return "Research it";
  }
}
