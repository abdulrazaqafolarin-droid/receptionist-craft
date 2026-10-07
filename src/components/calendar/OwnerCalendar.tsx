import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  isSameDay,
  parseISO,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { SlotDetailDialog } from "./SlotDetailDialog";
import type { CalendarEvent, CalendarViewMode } from "./types";
import type { Appointment } from "@/types/appointments";

interface ReceptionistRow {
  id: string;
  name: string;
  business_name: string;
  timezone: string | null;
  [key: string]: unknown;
}

interface AvailabilityRuleRow {
  id: string;
  receptionist_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  [key: string]: unknown;
}

interface AvailabilityExceptionRow {
  id: string;
  receptionist_id: string;
  start_timestamptz: string;
  end_timestamptz: string;
  reason: string | null;
  [key: string]: unknown;
}

export function OwnerCalendar() {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [receptionists, setReceptionists] = useState<ReceptionistRow[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availabilityRules, setAvailabilityRules] = useState<AvailabilityRuleRow[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Calculate visible date range
  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return { start: startOfWeek(ms), end: endOfWeek(me) };
    }
    const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
    return { start: ws, end: addDays(ws, 6) };
  }, [currentDate, viewMode]);

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedReceptionist, dateRange]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name, timezone")
      .eq("user_id", user.id);
    setReceptionists(data || []);
    if (data && data.length === 1) {
      setSelectedReceptionist(data[0].id);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const recIds =
        selectedReceptionist === "all"
          ? receptionists.map((r) => r.id)
          : [selectedReceptionist];

      if (recIds.length === 0) {
        setLoading(false);
        return;
      }

      const rangeStart = dateRange.start.toISOString();
      const rangeEnd = addDays(dateRange.end, 1).toISOString();

      // Parallel data fetching
      const [aptsRes, rulesRes, exceptionsRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("*")
          .in("receptionist_id", recIds)
          .gte("start_time", rangeStart)
          .lt("start_time", rangeEnd)
          .neq("status", "cancelled")
          .order("start_time"),
        supabase
          .from("availability_rules")
          .select("*")
          .in("receptionist_id", recIds),
        supabase
          .from("availability_exceptions")
          .select("*")
          .in("receptionist_id", recIds)
          .gte("end_timestamptz", rangeStart)
          .lt("start_timestamptz", rangeEnd),
      ]);

      setAppointments((aptsRes.data || []) as Appointment[]);
      setAvailabilityRules(rulesRes.data || []);
      setExceptions(exceptionsRes.data || []);
    } catch (err) {
      console.error("Calendar load error:", err);
    } finally {
      setLoading(false);
    }
  }

  // Build calendar events
  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    // 1. Appointments
    appointments.forEach((apt) => {
      result.push({
        id: `apt-${apt.id}`,
        start: new Date(apt.start_time),
        end: new Date(apt.end_time),
        type: "appointment",
        title: `${apt.customer_name} — ${apt.service || "Appointment"}`,
        appointment: apt,
      });
    });

    // 2. Blocked exceptions
    exceptions.forEach((ex) => {
      result.push({
        id: `block-${ex.id}`,
        start: new Date(ex.start_timestamptz),
        end: new Date(ex.end_timestamptz),
        type: "blocked",
        title: ex.reason || "Blocked",
        reason: ex.reason ?? undefined,
      });
    });

    // 3. Available slots from availability_rules (generate 30-min slots)
    const recIds =
      selectedReceptionist === "all"
        ? receptionists.map((r) => r.id)
        : [selectedReceptionist];

    let day = dateRange.start;
    while (day <= dateRange.end) {
      const dayOfWeek = day.getDay();
      const rulesForDay = availabilityRules.filter(
        (r) => r.day_of_week === dayOfWeek && recIds.includes(r.receptionist_id)
      );

      rulesForDay.forEach((rule) => {
        const [startH, startM] = rule.start_time.split(":").map(Number);
        const [endH, endM] = rule.end_time.split(":").map(Number);

        let slotStart = new Date(day);
        slotStart.setHours(startH, startM, 0, 0);
        const ruleEnd = new Date(day);
        ruleEnd.setHours(endH, endM, 0, 0);

        while (slotStart < ruleEnd) {
          const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
          if (slotEnd > ruleEnd) break;

          // Check if this slot is occupied by an appointment
          const isBooked = appointments.some(
            (apt) =>
              new Date(apt.start_time) < slotEnd &&
              new Date(apt.end_time) > slotStart &&
              (selectedReceptionist === "all" || apt.receptionist_id === selectedReceptionist)
          );

          // Check if blocked by exception
          const isBlocked = exceptions.some(
            (ex) =>
              new Date(ex.start_timestamptz) < slotEnd &&
              new Date(ex.end_timestamptz) > slotStart
          );

          if (!isBooked && !isBlocked) {
            result.push({
              id: `avail-${day.toISOString()}-${startH}-${slotStart.getMinutes()}`,
              start: new Date(slotStart),
              end: new Date(slotEnd),
              type: "available",
              title: format(slotStart, "h:mm a"),
            });
          }

          slotStart = slotEnd;
        }
      });

      day = addDays(day, 1);
    }

    return result;
  }, [appointments, availabilityRules, exceptions, dateRange, selectedReceptionist, receptionists]);

  const handleBlockSlot = async (start: Date, end: Date, reason: string) => {
    const recId =
      selectedReceptionist !== "all"
        ? selectedReceptionist
        : receptionists[0]?.id;

    if (!recId) {
      toast.error("Please select an operator first");
      return;
    }

    try {
      const { error } = await supabase.from("availability_exceptions").insert({
        receptionist_id: recId,
        start_timestamptz: start.toISOString(),
        end_timestamptz: end.toISOString(),
        reason: reason || null,
      });

      if (error) throw error;
      toast.success("Time slot blocked successfully");
      await loadData();
    } catch (err) {
      console.error("Block error:", err);
      const message = err instanceof Error ? err.message : "Failed to block slot";
      toast.error(message);
    }
  };

  const navigate = (dir: "prev" | "next") => {
    if (viewMode === "month") {
      setCurrentDate(dir === "next" ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === "next" ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    }
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setViewMode("week");
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setDialogOpen(true);
  };

  // Stats
  const appointmentCount = events.filter((e) => e.type === "appointment").length;
  const availableCount = events.filter((e) => e.type === "available").length;
  const blockedCount = events.filter((e) => e.type === "blocked").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => navigate("prev")} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate("next")} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <h2 className="text-lg font-semibold ml-2">
                {viewMode === "month"
                  ? format(currentDate, "MMMM yyyy")
                  : `Week of ${format(startOfWeek(currentDate, { weekStartsOn: 0 }), "MMM d, yyyy")}`}
              </h2>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Legend */}
              <div className="hidden sm:flex items-center gap-3 mr-4 text-xs">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  Booked ({appointmentCount})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  Available ({availableCount})
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  Blocked ({blockedCount})
                </span>
              </div>

              {receptionists.length > 1 && (
                <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All operators" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All operators</SelectItem>
                    {receptionists.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <div className="flex border rounded-lg overflow-hidden">
                <Button
                  variant={viewMode === "month" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setViewMode("month")}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Month
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none"
                  onClick={() => setViewMode("week")}
                >
                  <CalendarDays className="h-4 w-4 mr-1" />
                  Week
                </Button>
              </div>

              <Button variant="outline" size="icon" onClick={loadData} aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar view */}
      {viewMode === "month" ? (
        <MonthView
          currentDate={currentDate}
          events={events}
          onEventClick={handleEventClick}
          onDayClick={handleDayClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          events={events}
          onEventClick={handleEventClick}
        />
      )}

      {/* Slot detail dialog */}
      <SlotDetailDialog
        event={selectedEvent}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onBlockSlot={handleBlockSlot}
      />
    </div>
  );
}
