import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  fullPage?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message = "We couldn't load this data. Please try again.",
  onRetry,
  fullPage = false,
}: ErrorStateProps) {
  return (
    <div className={fullPage ? "flex items-center justify-center min-h-[60vh]" : "py-8"}>
      <Card className="p-8 text-center max-w-md mx-auto border-destructive/20 bg-destructive/5">
        <div className="h-14 w-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="default" className="gap-2 pressable">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </Card>
    </div>
  );
}
