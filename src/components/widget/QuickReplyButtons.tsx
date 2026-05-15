import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickReplyButton {
  label: string;
  value: string;
}

interface QuickReplyButtonsProps {
  buttons: QuickReplyButton[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function QuickReplyButtons({ buttons, onSelect, disabled }: QuickReplyButtonsProps) {
  if (buttons.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {buttons.map((button, idx) => (
        <Button
          key={button.value}
          variant="outline"
          size="sm"
          onClick={() => onSelect(button.value)}
          disabled={disabled}
          className={cn(
            "text-xs sm:text-sm px-3 py-2 h-auto pressable",
            "border-primary/30 hover:border-primary hover:bg-primary/5",
            "transition-all duration-200 hover:scale-[1.02] hover:shadow-md",
            "rounded-full truncate max-w-[200px]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{
            animationDelay: `${idx * 50}ms`
          }}
        >
          {button.label}
        </Button>
      ))}
    </div>
  );
}
