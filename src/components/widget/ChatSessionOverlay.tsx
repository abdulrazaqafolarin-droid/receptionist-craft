import { MessageSquare, RefreshCcw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatSessionOverlayProps {
  hasExistingSession: boolean;
  onContinue: () => void;
  onNewChat: () => void;
  businessName?: string;
}

export function ChatSessionOverlay({
  hasExistingSession,
  onContinue,
  onNewChat,
  businessName = "our team"
}: ChatSessionOverlayProps) {
  if (!hasExistingSession) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      
      {/* Content */}
      <div className="relative z-10 p-6 max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        <div className="text-center space-y-4">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          
          {/* Title */}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Welcome back! 👋
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              You have a recent conversation with {businessName}. Would you like to pick up where you left off?
            </p>
          </div>
          
          {/* Options */}
          <div className="space-y-3 pt-2">
            <Button
              onClick={onContinue}
              className="w-full gap-2 h-12"
              variant="default"
            >
              <ArrowRight className="w-4 h-4" />
              Continue our conversation
            </Button>
            
            <Button
              onClick={onNewChat}
              className="w-full gap-2 h-12"
              variant="outline"
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
