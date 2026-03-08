import { FloatingBackground } from "@/components/FloatingBackground";
import { OwnerCalendar } from "@/components/calendar/OwnerCalendar";
import { CalendarDays } from "lucide-react";

export default function CalendarView() {
  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-4 lg:p-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground text-sm">
              View appointments, available slots, and manage your schedule
            </p>
          </div>
        </div>

        <OwnerCalendar />
      </div>
    </div>
  );
}
