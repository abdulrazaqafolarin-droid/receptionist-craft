import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, X } from "lucide-react";

interface SwitchConfirmationProps {
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  componentData?: {
    message?: string;
    fromFlow?: string;
    toFlow?: string;
  };
}

export function SwitchConfirmation({ onConfirm, onCancel, disabled, componentData }: SwitchConfirmationProps) {
  const message = componentData?.message ?? "You're currently in the middle of something. Do you want to switch?";
  const fromLabel = componentData?.fromFlow ?? "current task";
  const toLabel = componentData?.toFlow ?? "new task";
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <Card
      className="p-4 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 border-amber-200/50 bg-amber-50/30"
      role="alertdialog"
      aria-label="Switch task confirmation"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold mb-1">Switch Task</p>
          <p className="text-sm text-muted-foreground mb-3">{message}</p>
          <p className="text-xs text-muted-foreground mb-3">
            This will pause your <span className="font-medium">{fromLabel}</span> and start a <span className="font-medium">{toLabel}</span>. You can come back to your {fromLabel} later.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={onConfirm}
              disabled={disabled}
              size="sm"
              variant="default"
              className="gap-1.5 rounded-lg pressable"
              aria-label={`Switch to ${toLabel}`}
            >
              <ArrowRight className="h-4 w-4" />
              Switch to {toLabel}
            </Button>
            <Button
              ref={cancelRef}
              onClick={onCancel}
              disabled={disabled}
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-lg pressable"
            >
              <X className="h-4 w-4" />
              Stay
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
