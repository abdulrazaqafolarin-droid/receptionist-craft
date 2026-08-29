import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle } from "lucide-react";

export type ChatTheme = "responder" | "configurator" | "test";

export interface ChatShellMessage {
  id?: string | number;
  role: string;
  content: string;
  timestamp?: Date | string;
}

export interface ChatShellRenderProps<T extends ChatShellMessage> {
  message: T;
  isUser: boolean;
  loading: boolean;
}

export interface ChatShellProps<T extends ChatShellMessage> {
  theme: ChatTheme;
  messages: T[];
  isUser: (msg: T) => boolean;
  loading: boolean;
  scrollRef: React.Ref<HTMLDivElement>;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Content rendered inside each AI/user bubble (style applied by the shell). */
  renderMessage?: (props: ChatShellRenderProps<T>) => React.ReactNode;
  /** Optional quick-replies row rendered under a message. */
  renderQuickReplies?: (msg: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  /** Controls rendered to the left of the input. */
  footerBefore?: React.ReactNode;
  /** Panel rendered between the message list and the input (e.g. interactive selectors). */
  betweenPanel?: React.ReactNode;
  /** Controls rendered inside the input row after the text box. */
  inputAfter?: React.ReactNode;
  /** Custom send button icon (default: Send arrow). */
  sendIcon?: React.ReactNode;
  /** Controls rendered below the input row. */
  footerAfter?: React.ReactNode;
  typingIndicator?: React.ReactNode;
  multiline?: boolean;
  autoFocus?: boolean;
  /** For responder theme: gradient stops for avatars / send button. */
  accentGradient?: string;
  /** Whether to render a sender avatar next to AI bubbles (responder theme). */
  showAvatar?: boolean;
  showTimestamp?: boolean;
  containerClassName?: string;
  listClassName?: string;
  /** Small label pill at the top of the chat that orients the user to context
   *  (e.g. "Configurator · editing your operator"). Distinct per context. */
  contextLabel?: string;
}

function BubbleContent<T extends ChatShellMessage>({
  message,
  isUser,
  loading,
  renderMessage,
}: {
  message: T;
  isUser: boolean;
  loading: boolean;
  renderMessage?: (props: ChatShellRenderProps<T>) => React.ReactNode;
}) {
  if (renderMessage) {
    return <>{renderMessage({ message, isUser, loading })}</>;
  }
  return <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{message.content}</p>;
}

export function ChatShell<T extends ChatShellMessage>({
  theme,
  messages,
  isUser,
  loading,
  scrollRef,
  inputValue,
  onInputChange,
  onSend,
  onKeyDown,
  disabled,
  placeholder = "Type your message...",
  renderMessage,
  renderQuickReplies,
  emptyState,
  footerBefore,
  betweenPanel,
  inputAfter,
  sendIcon,
  footerAfter,
  typingIndicator,
  multiline = false,
  autoFocus = false,
  accentGradient,
  showAvatar = false,
  showTimestamp = false,
  containerClassName,
  listClassName,
  contextLabel,
}: ChatShellProps<T>) {
  useEffect(() => {
    if (scrollRef && "current" in scrollRef) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading, scrollRef]);

  const userBubble =
    theme === "responder"
      ? "bg-primary text-primary-foreground rounded-br-md"
      : "bg-primary text-primary-foreground rounded-br-md";
  const aiBubble =
    theme === "responder"
      ? "bg-card border border-border/50 rounded-bl-md"
      : "bg-card border border-border shadow-sm rounded-bl-md";

  return (
    <div className={cn("flex flex-col h-full", containerClassName)}>
      <div className={cn("flex-1 overflow-auto space-y-4", listClassName)}>
        {contextLabel && (
          <div className="flex justify-center pb-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              {contextLabel}
            </span>
          </div>
        )}
        {messages.length === 0 && emptyState}
        {messages.map((msg, idx) => {
          const isUserMsg = isUser(msg);
          const rawTs = showTimestamp && msg.timestamp ? msg.timestamp : null;
          const timestamp = rawTs instanceof Date
            ? rawTs.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : rawTs;
          return (
            <div key={msg.id ?? idx} className="space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div className={cn("flex gap-2", isUserMsg ? "justify-end" : "justify-start")}>
                {!isUserMsg && showAvatar && (
                  <div
                    className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1"
                    style={theme === "responder" && accentGradient
                      ? { background: accentGradient }
                      : undefined}
                  >
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className={cn("max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md", isUserMsg ? userBubble : aiBubble)}>
                  <BubbleContent message={msg} isUser={isUserMsg} loading={loading} renderMessage={renderMessage} />
                  {timestamp && <p className="text-xs opacity-60 mt-2 flex items-center gap-1">{timestamp}</p>}
                </div>
              </div>
              {renderQuickReplies && renderQuickReplies(msg)}
            </div>
          );
        })}

        {loading && !typingIndicator && (
          <div className="flex gap-2 justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
            {showAvatar && (
              <div
                className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={theme === "responder" && accentGradient ? { background: accentGradient } : undefined}
              >
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
            )}
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          </div>
        )}
        {typingIndicator}
        <div ref={scrollRef} />
      </div>

      {betweenPanel}

      <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm">
        <div className={cn("flex gap-2", multiline ? "items-start" : "items-end")}>
          {footerBefore}
          {multiline ? (
            <textarea
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              rows={2}
              className="resize-none flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          ) : (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              autoFocus={autoFocus}
              className="flex-1 min-h-[44px] text-base rounded-xl border border-border/50 bg-input/30 px-4 py-2 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
          {inputAfter}
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !inputValue.trim()}
            className="h-11 w-11 rounded-xl bg-primary text-primary-foreground shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
            style={theme === "responder" && accentGradient && inputValue.trim() ? { background: accentGradient } : undefined}
            aria-label="Send"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : sendIcon}
          </button>
        </div>
        {footerAfter}
      </div>
    </div>
  );
}
