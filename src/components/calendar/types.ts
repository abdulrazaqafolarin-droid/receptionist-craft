import type { Appointment } from "@/types/appointments";

export type CalendarEventType = "appointment" | "available" | "blocked";

export interface CalendarEvent {
  id: string;
  start: Date;
  end: Date;
  type: CalendarEventType;
  title: string;
  appointment?: Appointment;
  reason?: string; // for blocked slots
}

export type CalendarViewMode = "month" | "week";
