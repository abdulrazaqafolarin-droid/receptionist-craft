import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Clock } from "lucide-react";

interface TimeSlot {
  start: string;
  end: string;
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
  const formatTime = (isoString: string) => {
    try {
      return format(new Date(isoString), "h:mm a");
    } catch {
      return isoString;
    }
  };

  if (slots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded-lg">
        No available time slots for this date.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {slots.map((slot, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            onClick={() => !disabled && onSelect(slot)}
            disabled={disabled}
            className="flex items-center gap-2 justify-start"
          >
            <Clock className="h-3 w-3" />
            {slot.display || formatTime(slot.start)}
          </Button>
        ))}
      </div>
      {showMore && onShowMore && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowMore}
          disabled={disabled}
          className="w-full"
        >
          See More Times
        </Button>
      )}
    </div>
  );
}
