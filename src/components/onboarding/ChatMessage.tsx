import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentVisualState =
  | "idle"
  | "watching"
  | "thinking"
  | "acting"
  | "waiting"
  | "completed"
  | "approval"
  | "error";

const STATE_LABEL: Record<AgentVisualState, string> = {
  idle: "Idle",
  watching: "Listening",
  thinking: "Thinking",
  acting: "Working",
  waiting: "Waiting",
  completed: "Done",
  approval: "Needs approval",
  error: "Needs attention",
};

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  agentState?: AgentVisualState;
  typing?: boolean;
}

/**
 * Claude-style message row.
 * Solid content surfaces only (no glass-in-glass) — the thread container
 * owns the Glass 1 material. Lucide icons only.
 */
export function ChatMessage({ role, content, timestamp, agentState = "idle", typing = false }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div
      role="article"
      aria-label={isUser ? "Your message" : "Rutex setup assistant"}
      className={cn("flex w-full gap-3 animate-enter motion-reduce:animate-none", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary shadow-contact" aria-hidden="true">
          <Bot className="h-4 w-4 text-primary-foreground" />
          <span
            className={cn(
              "agent-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
              agentState === "thinking" ? "agent-thinking-halo agent-thinking" : `agent-${agentState}`,
            )}
            style={{ background: "currentColor" }}
          />
        </div>
      )}

      <div className={cn("flex max-w-[85%] flex-col gap-1 sm:max-w-[78%]", isUser && "items-end")}>
        {!isUser && (
          <span className="type-metadata flex items-center gap-1.5">
            Rutex Setup
            <span aria-hidden="true">·</span>
            <span className={cn(`agent-${agentState}`)}>{STATE_LABEL[agentState]}</span>
          </span>
        )}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 type-body",
            isUser
              ? "rounded-br-lg bg-primary text-primary-foreground shadow-contact"
              : "rounded-bl-lg border border-border bg-card text-card-foreground shadow-ambient",
          )}
        >
          {typing ? (
            <span className="flex items-center gap-1.5 py-1" role="status" aria-label="Assistant is typing">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-current opacity-40 status-pulse motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 280}ms` }}
                />
              ))}
            </span>
          ) : (
            <p className="whitespace-pre-wrap break-words">{content}</p>
          )}
        </div>
        {timestamp && !typing && (
          <time className="type-metadata" dateTime={timestamp.toISOString()}>
            {timestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </time>
        )}
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary" aria-hidden="true">
          <User className="h-4 w-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
