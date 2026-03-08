import { useMemo } from "react";
import { format, startOfWeek, addDays, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./types";

interface WeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am–8pm

export function WeekView({ currentDate, events, onEventClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getEventsForDayHour = (day: Date, hour: number) => {
    return events.filter((e) => {
      if (!isSameDay(e.start, day)) return false;
      const eventHour = e.start.getHours();
      return eventHour === hour;
    });
  };

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="p-2 text-xs text-muted-foreground border-r" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "p-2 text-center border-r last:border-r-0",
              isToday(day) && "bg-primary/5"
            )}
          >
            <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
            <div
              className={cn(
                "text-sm font-semibold mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full",
                isToday(day) && "bg-primary text-primary-foreground"
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0 min-h-[52px]">
            <div className="p-1 text-xs text-muted-foreground text-right pr-2 border-r pt-1">
              {format(new Date().setHours(hour, 0), "h a")}
            </div>
            {days.map((day) => {
              const cellEvents = getEventsForDayHour(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className={cn(
                    "border-r last:border-r-0 p-0.5 relative",
                    isToday(day) && "bg-primary/[0.02]"
                  )}
                >
                  {cellEvents.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => onEventClick(ev)}
                      className={cn(
                        "w-full text-left text-[10px] leading-tight p-1 rounded cursor-pointer truncate block mb-0.5 transition-colors",
                        ev.type === "appointment" &&
                          "bg-primary/15 text-primary hover:bg-primary/25 border-l-2 border-primary",
                        ev.type === "available" &&
                          "bg-success/10 text-success hover:bg-success/20 border-l-2 border-success",
                        ev.type === "blocked" &&
                          "bg-destructive/10 text-destructive hover:bg-destructive/20 border-l-2 border-destructive line-through"
                      )}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
