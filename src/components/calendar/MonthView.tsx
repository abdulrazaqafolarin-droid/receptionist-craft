import { useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./types";

interface MonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick: (date: Date) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({ currentDate, events, onEventClick, onDayClick }: MonthViewProps) {
  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const result: Date[][] = [];
    let day = calStart;
    let week: Date[] = [];

    while (day <= calEnd) {
      week.push(day);
      if (week.length === 7) {
        result.push(week);
        week = [];
      }
      day = addDays(day, 1);
    }
    return result;
  }, [currentDate]);

  const getEventsForDay = (day: Date) =>
    events.filter((e) => isSameDay(e.start, day));

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-muted/30 border-b">
        {DAY_NAMES.map((name) => (
          <div key={name} className="p-2 text-center text-xs font-medium text-muted-foreground border-r last:border-r-0">
            {name}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day) => {
            const dayEvents = getEventsForDay(day);
            const inMonth = isSameMonth(day, currentDate);
            const appointmentCount = dayEvents.filter((e) => e.type === "appointment").length;
            const availableCount = dayEvents.filter((e) => e.type === "available").length;
            const blockedCount = dayEvents.filter((e) => e.type === "blocked").length;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-[90px] p-1 border-r last:border-r-0 cursor-pointer hover:bg-accent/50 transition-colors",
                  !inMonth && "bg-muted/20 opacity-50",
                  isToday(day) && "bg-primary/[0.04]"
                )}
                onClick={() => onDayClick(day)}
              >
                <div className="flex justify-between items-start">
                  <span
                    className={cn(
                      "text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full",
                      isToday(day) && "bg-primary text-primary-foreground",
                      !isToday(day) && !inMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Event dots / summaries */}
                <div className="mt-0.5 space-y-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <button
                      key={ev.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                      }}
                      className={cn(
                        "w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate block transition-colors",
                        ev.type === "appointment" &&
                          "bg-primary/15 text-primary hover:bg-primary/25",
                        ev.type === "available" &&
                          "bg-success/10 text-success hover:bg-success/20",
                        ev.type === "blocked" &&
                          "bg-destructive/10 text-destructive hover:bg-destructive/20"
                      )}
                    >
                      {ev.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1">
                      +{dayEvents.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
