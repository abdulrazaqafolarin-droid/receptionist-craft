import { MessageSquare, RefreshCcw, ArrowRight, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect } from "react";

interface ChatSessionOverlayProps {
  hasExistingSession: boolean;
  onContinue: () => void;
  onNewChat: () => void;
  onDismiss?: () => void;
  businessName?: string;
  disabled?: boolean;
}

export function ChatSessionOverlay({
  hasExistingSession,
  onContinue,
  onNewChat,
  onDismiss,
  businessName = "our team",
  disabled
}: ChatSessionOverlayProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && onDismiss) onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!hasExistingSession) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onDismiss} />
      
      {/* Content */}
      <div
        className="relative z-10 p-6 max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        role="alertdialog"
        aria-label="Session restoration"
      >
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pressable"
            aria-label="Close"
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="text-center space-y-4">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          
          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Welcome back!
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              You have a recent conversation with {businessName}. Would you like to pick up where you left off?
            </p>
          </div>
          
          {/* Options */}
          <div className="space-y-3 pt-2">
            <Button
              onClick={onContinue}
              className="w-full gap-2 h-12 pressable"
              variant="default"
              disabled={disabled}
            >
              {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {disabled ? "Restoring..." : "Continue our conversation"}
            </Button>
            
            <Button
              onClick={onNewChat}
              className="w-full gap-2 h-12 pressable"
              variant="outline"
              disabled={disabled}
            >
              <RefreshCcw className="w-4 h-4" />
              Start fresh
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground">
            Starting fresh will begin a new conversation
          </p>
        </div>
      </div>
    </div>
  );
}
