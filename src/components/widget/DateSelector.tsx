import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { CalendarDays, Check } from "lucide-react";

interface DateSelectorProps {
  onSelect: (date: Date) => void;
  disabled?: boolean;
  minDate?: Date;
}

export function DateSelector({ onSelect, disabled, minDate }: DateSelectorProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const today = new Date();
  const quickDates = [
    { label: "Today", date: today },
    { label: "Tomorrow", date: addDays(today, 1) },
    { label: format(addDays(today, 2), "EEE"), date: addDays(today, 2) },
    { label: format(addDays(today, 3), "EEE"), date: addDays(today, 3) },
  ];

  const handleSelect = (date: Date | undefined) => {
    if (!date || disabled) return;
    setSelectedDate(date);
  };

  const handleQuickSelect = (date: Date) => {
    if (disabled) return;
    setSelectedDate(date);
    onSelect(date);
  };

  const handleConfirm = () => {
    if (selectedDate && !disabled) {
      onSelect(selectedDate);
    }
  };

  return (
    <Card className="p-4 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      {/* Quick date buttons */}
      <div className="mb-4">
        <p className="text-xs text-muted-foreground font-medium mb-2">Quick select:</p>
        <div className="grid grid-cols-4 gap-2">
          {quickDates.map((qd, idx) => (
            <Button
              key={idx}
              variant="outline"
              size="sm"
              onClick={() => handleQuickSelect(qd.date)}
              disabled={disabled}
              className={cn(
                "text-xs h-9 rounded-lg transition-all",
                "hover:border-primary hover:bg-primary/5",
                selectedDate?.toDateString() === qd.date.toDateString() && "border-primary bg-primary/10"
              )}
            >
              {qd.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Or pick a date:
        </p>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          disabled={(date) => date < (minDate || new Date())}
          className={cn("pointer-events-auto rounded-lg border-0")}
        />
      </div>
      
      {selectedDate && (
        <div className="mt-4 flex items-center justify-between border-t pt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
          <p className="text-sm text-muted-foreground">
            Selected: <span className="font-semibold text-foreground">{format(selectedDate, "EEEE, MMMM d")}</span>
          </p>
          <Button 
            onClick={handleConfirm} 
            disabled={disabled} 
            size="sm"
            className="gap-1.5 rounded-lg"
          >
            <Check className="h-4 w-4" />
            Confirm
          </Button>
        </div>
      )}
    </Card>
  );
}
