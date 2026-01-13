import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeSlot {
  start?: string;
  startTime?: string;
  end?: string;
  endTime?: string;
  display?: string;
}

interface TimeSlotSelectorProps {
  slots: TimeSlot[];
  onSelect: (slot: TimeSlot) => void;
  disabled?: boolean;
  showMore?: boolean;
  onShowMore?: () => void;
}

export function TimeSlotSelector({ slots, onSelect, disabled, showMore, onShowMore }: TimeSlotSelectorProps) {
  const formatTime = (slot: TimeSlot) => {
    const timeStr = slot.startTime || slot.start;
    if (!timeStr) return slot.display || "Unknown";
    try {
      return format(new Date(timeStr), "h:mm a");
    } catch {
      return slot.display || timeStr;
    }
  };

  if (slots.length === 0) {
    return (
      <div className="mt-3 p-4 bg-muted/50 rounded-xl border border-border/50 flex items-center gap-3 animate-in fade-in-0 duration-300">
        <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium">No available slots</p>
          <p className="text-xs text-muted-foreground">Please try another date</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="text-xs text-muted-foreground font-medium">Available times:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((slot, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            onClick={() => !disabled && onSelect(slot)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 justify-center h-10",
              "border-primary/20 hover:border-primary hover:bg-primary/5",
              "transition-all duration-200 hover:scale-[1.02] hover:shadow-md",
              "rounded-xl font-medium",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{formatTime(slot)}</span>
          </Button>
        ))}
      </div>
      {showMore && onShowMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowMore}
          disabled={disabled}
          className="w-full text-primary hover:text-primary hover:bg-primary/5"
        >
          Show more times
        </Button>
      )}
    </div>
  );
}
