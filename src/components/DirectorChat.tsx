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

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Plus, Trash2, History, Volume2, VolumeX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { useBuildThreads } from "@/hooks/useBuildThreads";
import { speakDirectorText, stopSpeaking, type DirectorVoiceProvider } from "@/utils/textToSpeech";
import { parseLocalCommand, extractClickPhrase, extractMovementTarget, matchAnchorOrRoute } from "@/lib/directorLocalCommands";
import { lookAtPage } from "@/components/DirectorHands";
import { parseLiveTable, pickLiveCandidate } from "@/lib/actorGuard";
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
  const [railOpen, setRailOpen] = useState(false);
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

  // Auto-scroll the message list like the Builder chat does.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // Park the cursor on its perch when the Director chat opens, so the
  // owner sees where it lives before the first job runs.
  useEffect(() => {
    if (homedRef.current) return;
    homedRef.current = true;
    try {
      ride.setVisible(true);
    } catch {
      // visibility preference best-effort
    }
    try {
      ride.goHome();
    } catch {
      // home positioning best-effort
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const homedRef = useRef(false);
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
    if (action.type === "connect_start") {
      const key = action.connector_key.trim().slice(0, 60);
      if (key) navigate(`/connections?connect=${encodeURIComponent(key)}`);
      else toast.error("No connector named.");
      return;
    }
    if (action.type === "hands") {
      // Reply-embedded cursor work: needs no second call, no extra key —
      // it rides the moment the owner taps. Same guard, receipts, stop.
      const steps = (Array.isArray(action.steps) ? action.steps : []).slice(0, 3);
      const actorSteps = steps.flatMap((s) => {
        switch (s.op) {
          case "click": return s.target ? [{ type: "click" as const, target: s.target }] : [];
          case "point": return s.target ? [{ type: "point" as const, target: s.target }] : [];
          case "goto": return s.route ? [{ type: "goto" as const, route: s.route }] : [];
          case "type": return s.target && typeof s.text === "string" ? [{ type: "type" as const, target: s.target, text: s.text.slice(0, 500) }] : [];
          case "highlight": return s.target ? [{ type: "highlight" as const, target: s.target }] : [];
          case "drag": return s.from && s.to ? [{ type: "drag" as const, from: s.from, to: s.to }] : [];
          default: return [];
        }
      });
      if (actorSteps.length === 0) {
        toast.error("Nothing runnable in that move.");
        return;
      }
      setExecuting(`hands-${msgIdx}`);
      const receipts = await ride.start(actorSteps, { tour: "director-hands-reply", userId });
      setExecuting(null);
      const failed = receipts.find((r) => !r.ok);
      toast[failed ? "error" : "success"](failed ? `Stopped: ${failed.detail}` : "Done.");
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

  // Transient open-world click: observe the current page, decide on one
  // unambiguous visible label at runtime, act through the normal live path,
  // then discard the snapshot. No registry entry is added or needed.
  async function tryTransientClick(content: string): Promise<string | null> {
    const phrase = extractClickPhrase(content);
    if (!phrase) return null;
    return executeTransientPhrase(phrase);
  }

  async function executeTransientPhrase(phrase: string): Promise<string | null> {
    if (!phrase || !userId) return null;
    let rows: unknown = null;
    try {
      const snapshot = lookAtPage();
      rows = (snapshot as { elements?: unknown }).elements;
    } catch {
      return null;
    }
    const candidate = pickLiveCandidate(phrase, parseLiveTable(rows));
    if (!candidate) return null;
    setExecuting("hands-transient");
    try {
      // Point first, then click: the owner watches the cursor glide onto
      // the target (a beat between steps) before it lands the click.
      const receipts = await ride.start(
        [
          { type: "live_point" as const, index: candidate.index, expect: candidate.label },
          { type: "live_click" as const, index: candidate.index, expect: candidate.label },
        ],
        { tour: "director-transient-click", userId },
      );
      const failed = receipts.find((r) => !r.ok);
      const detail = failed?.detail || "unknown";
      if (!failed) return `Done — clicked ${candidate.label}.`;
      if (detail.startsWith("refused-live-label") || detail.startsWith("stale-expect")) {
        return `I found ${candidate.label}, but I won't touch it (${detail}).`;
      }
      return null;
    } catch {
      return null;
    } finally {
      setExecuting(null);
      try {
        document.querySelectorAll("[data-live-idx]").forEach((el) => el.removeAttribute("data-live-idx"));
      } catch {
        // snapshot cleanup best-effort
      }
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
    // Strict lanes first (fed commands), then the understanding lane:
    // a movement verb ANYWHERE resolves through the same snapshot,
    // anchors, and routes — natural phrasing moves the cursor too.
    let transient = await tryTransientClick(content);
    let local = parseLocalCommand(content);
    if (!transient && !local) {
      const target = extractMovementTarget(content);
      if (target) {
        transient = await executeTransientPhrase(target);
        if (!transient) local = matchAnchorOrRoute(target, true);
      }
    }
    if (transient) {
      setMessages((prev) => [...prev, {
        role: "ai",
        content: transient,
        timestamp: new Date().toISOString(),
      }]);
      if (tid) void saveMsg(tid, "assistant", transient);
      if (voiceOn) {
        void speakDirectorText(transient, voiceProvider).catch(() => {
          // voice is a courtesy — a failed lane never breaks the chat
        });
      }
      setLoading(false);
      return;
    }
    // Bluey's lesson: obvious movement never waits on the network. A
    // strict imperative matching a real anchor or route executes right
    // here through the local ride — no gateway round-trip, no quota,
    // and it still works when the brain is unreachable.
    if (local) {
      try {
        let reply: string;
        if (local.kind === "goto") {
          await runAction({ type: "navigate", path: local.route }, -1);
          reply = `On ${local.label} now.`;
        } else {
          const receipts = await ride.start(
            [{ type: "click", target: local.target }],
            { tour: "director-local", userId },
          );
          reply = receipts[0]?.ok
            ? `Done — clicked ${local.label}.`
            : `I found ${local.label} but the click didn't land (${receipts[0]?.detail || "unknown"}). It's still there if you want to tap it yourself.`;
        }
        setMessages((prev) => [...prev, {
          role: "ai",
          content: reply,
          timestamp: new Date().toISOString(),
        }]);
        if (tid) void saveMsg(tid, "assistant", reply);
        if (voiceOn) {
          void speakDirectorText(reply, voiceProvider).catch(() => {
            // voice is a courtesy — a failed lane never breaks the chat
          });
        }
      } finally {
        setLoading(false);
      }
      return;
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
      // Name the failure honestly: an expired session is a re-login, a
      // live function with a dead gateway is a wait-and-retry. A ping
      // (no gateway call) tells the two apart instead of one mystery —
      // and when the edge named the failure, quote its name verbatim so
      // the next fix targets the right half.
      let detail = "I could not reach my brain just now. Your operators are untouched — try again in a moment.";
      try {
        const status = (e as { context?: { status?: number }; status?: number })?.context?.status
          ?? (e as { status?: number })?.status;
        let edgeError = "";
        try {
          const ctx = (e as { context?: unknown })?.context;
          const body = ctx && typeof (ctx as { json?: unknown }).json === "function"
            ? await Promise.race([
              ((ctx as { json: () => Promise<unknown> }).json()),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
            ])
            : null;
          const err = (body as { error?: unknown } | null)?.error;
          if (typeof err === "string" && err) edgeError = err.slice(0, 60);
        } catch {
          // body unreadable — fall through to ping diagnosis
        }
        if (status === 401) {
          detail = "You look signed out — sign in again and retry. Nothing was touched.";
        } else if (edgeError.startsWith("gateway_timeout")) {
          detail = "My brain started answering but ran out of time — likely waking up. Try again in a moment; second attempts usually land.";
        } else if (edgeError.startsWith("gateway_unreachable") || edgeError.startsWith("gateway_auth") || edgeError.startsWith("gateway_protocol")) {
          detail = `My brain's line is down from this end (${edgeError}). The chat line works — the thinking service or its tunnel needs a restart on its host.`;
        } else if (status !== undefined && status !== 401) {
          const ping = await Promise.race([
            supabase.functions.invoke("director-chat", { body: { action: "ping" } }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
          ]);
          const pong = (ping as { data?: { ok?: boolean; gateway_configured?: boolean } } | null)?.data;
          if (pong?.ok === true && pong?.gateway_configured === false) {
            detail = "My thinking service isn't configured right now — the chat line works, the brain doesn't. Tell the owner to check the gateway setup.";
          } else if (pong?.ok === true) {
            detail = "My brain didn't answer just now (its line dropped). The chat line itself is fine — try again in a moment.";
          } else {
            detail = "The chat service itself stumbled just now — not the brain, the line. Try again in a moment.";
          }
        }
      } catch {
        // diagnosis best-effort; the generic line below still stands
      }
      setMessages((prev) => [...prev, {
        role: "ai",
        content: detail,
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
      setRailOpen(false);
    } catch {
      toast.error("Could not open that conversation");
    }
  }

  function newChat() {
    threadIdRef.current = null;
    setMessages([]);
    setRailOpen(false);
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRailOpen((v) => !v)}
            aria-label="Director history"
            title="Past Director conversations"
            data-actor="director-history"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={newChat} aria-label="New conversation">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 gap-3">
        {/* Desktop: history rail beside the chat, like the Builder */}
        {railOpen && (
          <aside className="hidden w-52 shrink-0 flex-col gap-1 overflow-y-auto md:flex" aria-label="Director history">
            <div className="px-2 text-xs font-medium text-muted-foreground">History</div>
            {threads.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">No past Director chats yet.</p>
            )}
            {threads.map((t) => (
              <div key={t.id} className={`group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/50 ${t.id === threadIdRef.current ? "bg-muted" : ""}`}>
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => { void openThread(t.id); }}>
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
          </aside>
        )}
        {/* Mobile: history drawer */}
        {railOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-label="Director history">
            <div className="absolute inset-0 bg-background/80" onClick={() => setRailOpen(false)} aria-hidden="true" />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-2 overflow-y-auto bg-background p-4 shadow-xl">
              <div className="px-2 text-sm font-medium">History</div>
              {threads.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted-foreground">No past Director chats yet.</p>
              )}
              {threads.map((t) => (
                <div key={t.id} className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/50">
                  <button className="min-w-0 flex-1 truncate text-left" onClick={() => { void openThread(t.id); }}>
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
            </aside>
          </div>
        )}

        {/* Chat column: Builder bubbles, timestamps, Builder input */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted/30 p-4">
            {messages.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm font-medium">Good to see you. I watch every operator you own.</p>
                <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                  Ask what needs you, what to build next, or how any operator is doing — I answer from live records.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {WELCOME_SUGGESTIONS.map((sug) => (
                    <button
                      key={sug}
                      onClick={() => { void sendText(sug); }}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-sm hover:bg-muted"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`mb-4 max-w-[85%] ${m.role === "owner" ? "ml-auto" : "mr-auto"}`}>
                <div className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "owner"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-card border border-border shadow-sm rounded-bl-md"
                }`}>
                  {m.content}
                </div>
                <div className={`mt-1 text-xs text-muted-foreground ${m.role === "owner" ? "text-right" : ""}`}>
                  {m.role === "owner" ? "You" : "Director"} · {new Date(m.timestamp).toLocaleTimeString()}
                </div>
                {m.role === "ai" && m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => { void sendText(sug); }}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-sm hover:bg-muted"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
                {m.role === "ai" && m.actions && m.actions.some((a) => a.type !== "research_need") && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.actions.filter((a) => a.type !== "research_need").map((a, i) => (
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
                {m.role === "ai" && m.actions && m.actions.some((a) => a.type === "research_need" && (a as { result?: unknown }).result) && (
                  <div className="mt-2 space-y-2">
                    {(m.actions.filter((a) => a.type === "research_need") as Array<{ need?: string; result?: {
                      success: boolean; best_interface: string; fallbacks: string[]; verification: string;
                      errors: string[]; candidates: Array<{ name: string; url: string; verification: string; evidence: string[] }>;
                    } }>).map((a, i) => a.result && (
                      <div key={i} className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
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
              </div>
            ))}
            {loading && (
              <div className="mb-4 mr-auto max-w-[85%]">
                <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm" aria-label="Director is thinking">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendText(input);
                }
              }}
              disabled={loading}
              placeholder="Ask your Director anything…"
              aria-label="Message the Director"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm transition-all focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
            <Button
              onClick={() => { void sendText(input); }}
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="h-[46px] w-[46px] shrink-0 rounded-xl p-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
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
    case "connect_start": return "Connect it";
    case "hands": return "Do it";
    case "research_need": return "Research it";
  }
}
