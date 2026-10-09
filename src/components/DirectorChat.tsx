/**
 * DirectorChat — talk to the Director.
 *
 * Emulates the talk-it-through chat it was asked to mirror: welcome message,
 * suggestion chips, message bubbles, input row, and conversation history tabs
 * (new / resume / delete) backed by director_threads. Replies come from the
 * director-chat edge function (live platform context + strict action
 * contract); actions execute through the same grant-gated executors as the
 * Build tab. Approval stays human — drafts link to the Builder.
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Loader2, Plus, Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChatShell } from "@/components/widget/ChatShell";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { useBuildThreads } from "@/hooks/useBuildThreads";
import { actionDef } from "@/lib/directorActionDefs";
import type { GrantScope } from "@/lib/directorGrantRules";
import { retryDirectorJob, adjustDirectorOperator, draftDirectorHelper } from "@/lib/directorExecutors";
import type { DirectorAction } from "../../supabase/functions/_shared/config/directorPrompt";

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
      // Ride there like a human: black-hole through the nav element when
      // one exists, emerge at the destination. Falls back to instant
      // navigation if the ride cannot stage — arrival either way.
      const receipts = await ride.start(
        [{ type: "goto", route: action.path }],
        { tour: "director-ride", userId },
      );
      if (!receipts[0]?.ok) navigate(action.path);
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
      if (tid) void saveMsg(tid, "assistant", d.reply || "…");
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
      setMessages(loaded.map((m) => ({
        role: (m.role === "assistant" ? "ai" : "owner") as ChatMessage["role"],
        content: m.content,
        timestamp: m.created_at,
      })));
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
        confirmAsk={ride.confirmAsk}
        running={ride.running}
        onStop={ride.stop}
        onDismissBubble={ride.dismissBubble}
        onDismissShowcase={ride.dismissShowcase}
        onAnswerConfirm={ride.answerConfirm}
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
