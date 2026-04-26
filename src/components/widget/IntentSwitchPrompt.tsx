import { Button } from "@/components/ui/button";

interface Props {
  prompt?: string;
  disabled?: boolean;
  onDecide: (decision: "continue" | "switch") => void;
}

export function IntentSwitchPrompt({ prompt, disabled, onDecide }: Props) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3 bg-card">
      <p className="text-sm text-muted-foreground">
        {prompt || "Do you want to switch topics now or continue where we are?"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={disabled} onClick={() => onDecide("continue")}>
          Continue here
        </Button>
        <Button disabled={disabled} onClick={() => onDecide("switch")}>
          Switch topic
        </Button>
      </div>
    </div>
  );
}
