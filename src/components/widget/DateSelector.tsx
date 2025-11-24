import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateSelectorProps {
  onSelect: (date: Date) => void;
  disabled?: boolean;
  minDate?: Date;
}

export function DateSelector({ onSelect, disabled, minDate }: DateSelectorProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const handleSelect = (date: Date | undefined) => {
    if (!date || disabled) return;
    setSelectedDate(date);
  };

  const handleConfirm = () => {
    if (selectedDate && !disabled) {
      onSelect(selectedDate);
    }
  };

  return (
    <Card className="p-4 mt-2">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={handleSelect}
        disabled={(date) => date < (minDate || new Date())}
        initialFocus
        className={cn("pointer-events-auto")}
      />
      {selectedDate && (
        <div className="mt-4 flex items-center justify-between border-t pt-3">
          <p className="text-sm">
            Selected: <span className="font-medium">{format(selectedDate, "PPP")}</span>
          </p>
          <Button onClick={handleConfirm} disabled={disabled} size="sm">
            Confirm
          </Button>
        </div>
      )}
    </Card>
  );
}
