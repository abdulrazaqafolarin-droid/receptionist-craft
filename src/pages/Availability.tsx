import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, Calendar, AlertCircle, Zap, Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FloatingBackground } from "@/components/FloatingBackground";
import { TIMEZONE_OPTIONS, detectBrowserTimezone, findClosestTimezone } from "@/lib/timezones";
import { ConfiguratorAffordance } from "@/components/ConfiguratorAffordance";

type AvailabilityRule = {
  id?: string;
  receptionist_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type AvailabilityException = {
  id?: string;
  receptionist_id: string;
  start_timestamptz: string;
  end_timestamptz: string;
  reason: string | null;
};

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

// TIMEZONE_OPTIONS is now imported from @/lib/timezones — never hardcode timezone lists

interface ReceptionistRow {
  id: string;
  name: string;
  business_name: string;
  timezone: string | null;
  active: boolean | null;
  [key: string]: unknown;
}

export default function Availability() {
  const { toast } = useToast();
  const [receptionists, setReceptionists] = useState<ReceptionistRow[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(false);

  const [newDay, setNewDay] = useState<number>(1);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [timezone, setTimezone] = useState(() => findClosestTimezone(detectBrowserTimezone()));

  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedReceptionist) {
      loadAvailability(selectedReceptionist);
    }
  }, [selectedReceptionist]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("receptionists")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true);

    if (error) {
      console.error("Error loading receptionists:", error);
      return;
    }

    setReceptionists(data || []);
    if (data && data.length > 0 && !selectedReceptionist) {
      setSelectedReceptionist(data[0].id);
    }
  }

  async function loadAvailability(receptionistId: string) {
    setLoading(true);
    try {
      const { data: rulesData, error: rulesError } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from("availability_exceptions")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .order("start_timestamptz", { ascending: true });

      if (exceptionsError) throw exceptionsError;
      setExceptions(exceptionsData || []);

      if (rulesData && rulesData.length > 0) {
        setTimezone(rulesData[0].timezone || "Africa/Lagos");
      }
    } catch (err) {
      console.error("Error loading availability:", err);
      const message = err instanceof Error ? err.message : "Error loading availability";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function regenerateSlots(receptionistId: string) {
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await supabase.functions.invoke("generate-slots", {
        body: { receptionistId },
      });
    } catch (e) {
      console.warn("Slot regeneration failed (non-blocking):", e);
    }
  }

  async function addRule() {
    if (!selectedReceptionist) {
      toast({ title: "Error", description: "Please select a receptionist", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("availability_rules").insert([
      {
        receptionist_id: selectedReceptionist,
        day_of_week: newDay,
        start_time: newStart,
        end_time: newEnd,
        timezone: timezone,
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Availability rule added" });
    // Sync timezone to receptionist record
    await supabase.from("receptionists").update({ timezone }).eq("id", selectedReceptionist);
    await regenerateSlots(selectedReceptionist);
    loadAvailability(selectedReceptionist);
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from("availability_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Rule deleted" });
    await regenerateSlots(selectedReceptionist);
    loadAvailability(selectedReceptionist);
  }

  async function addException() {
    if (!selectedReceptionist || !exceptionStart || !exceptionEnd) {
      toast({ title: "Error", description: "Please fill all exception fields", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("availability_exceptions").insert([
      {
        receptionist_id: selectedReceptionist,
        start_timestamptz: new Date(exceptionStart).toISOString(),
        end_timestamptz: new Date(exceptionEnd).toISOString(),
        reason: exceptionReason || null,
      },
    ]);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Exception added" });
    setExceptionStart("");
    setExceptionEnd("");
    setExceptionReason("");
    await regenerateSlots(selectedReceptionist);
    loadAvailability(selectedReceptionist);
  }

  async function deleteException(id: string) {
    const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Exception deleted" });
    await regenerateSlots(selectedReceptionist);
    loadAvailability(selectedReceptionist);
  }

  async function setDefaultHours() {
    if (!selectedReceptionist) return;

    const defaultRules = [
      { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 3, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 4, start_time: "09:00", end_time: "17:00" },
      { day_of_week: 5, start_time: "09:00", end_time: "17:00" },
    ];

    const { error } = await supabase.from("availability_rules").insert(
      defaultRules.map((r) => ({
        receptionist_id: selectedReceptionist,
        ...r,
        timezone: timezone,
      }))
    );

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Default hours set (Mon-Fri, 9am-5pm)" });
    await regenerateSlots(selectedReceptionist);
    loadAvailability(selectedReceptionist);
  }

  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-4 lg:p-8 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-4 flex-1">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-4xl font-bold">Business Hours & Availability</h1>
              <p className="text-muted-foreground">
                Set when your AI receptionist can book appointments
              </p>
            </div>
          </div>
          {selectedReceptionist && (
            <ConfiguratorAffordance
              receptionistId={selectedReceptionist}
              context="Availability"
              title="Change availability"
              className="sm:self-center"
            />
          )}
        </div>

        {/* Receptionist Selector */}
        <Card className="mb-6 glass-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Select Receptionist</CardTitle>
            <CardDescription>Choose which receptionist to configure</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist}>
              <SelectTrigger className="h-12 border-2">
                <SelectValue placeholder="Select a receptionist" />
              </SelectTrigger>
              <SelectContent>
                {receptionists.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} - {r.business_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedReceptionist && (
          <>
            {/* Quick Setup */}
            {rules.length === 0 && (
              <Card className="mb-6 glass-1">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Zap className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Quick Setup</CardTitle>
                      <CardDescription>
                        No availability rules set. Start with default business hours?
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Button onClick={setDefaultHours} className="h-11">
                    Set Default Hours (Mon-Fri, 9am-5pm)
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Current Rules */}
            <Card className="mb-6 glass-1">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Weekly Schedule</CardTitle>
                    <CardDescription>Define your regular business hours</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : rules.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">
                      No availability rules set. Add your first rule below.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-border/50 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all glass-1"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge variant="outline" className="min-w-[100px] justify-center font-medium">
                            {DAYS.find((d) => d.value === rule.day_of_week)?.label}
                          </Badge>
                          <div className="text-sm font-medium">
                            <span>{rule.start_time}</span>
                            <span className="text-muted-foreground mx-2">→</span>
                            <span>{rule.end_time}</span>
                          </div>
                          <Badge variant="secondary" className="text-xs">{rule.timezone}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => rule.id && deleteRule(rule.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Rule Form */}
                <div className="mt-8 pt-6 border-t-2 border-border/50 space-y-5">
                  <h4 className="font-semibold text-lg">Add New Rule</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Day</Label>
                      <Select value={newDay.toString()} onValueChange={(v) => setNewDay(parseInt(v))}>
                        <SelectTrigger className="h-11 border-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAYS.map((day) => (
                            <SelectItem key={day.value} value={day.value.toString()}>
                              {day.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Globe className="h-3 w-3" /> Timezone
                      </Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger className="h-11 border-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={addRule} className="h-11">
                    <Plus className="mr-2 h-4 w-4" /> Add Rule
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Exceptions */}
            <Card className="border-2 border-border/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Time-Off & Exceptions</CardTitle>
                    <CardDescription>
                      Block specific dates/times (holidays, vacations, etc.)
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {exceptions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No exceptions set</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-8">
                    {exceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-2 border-border/50 rounded-xl hover:border-primary/40 hover:bg-muted transition-all glass-1"
                      >
                        <div>
                          <div className="font-medium text-sm">
                            {new Date(exc.start_timestamptz).toLocaleString()} →{" "}
                            {new Date(exc.end_timestamptz).toLocaleString()}
                          </div>
                          {exc.reason && (
                            <div className="text-sm text-muted-foreground mt-1">{exc.reason}</div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exc.id && deleteException(exc.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Exception Form */}
                <div className="pt-6 border-t-2 border-border/50 space-y-5">
                  <h4 className="font-semibold text-lg">Add Exception</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={exceptionStart}
                        onChange={(e) => setExceptionStart(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={exceptionEnd}
                        onChange={(e) => setExceptionEnd(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason (Optional)</Label>
                      <Input
                        placeholder="Holiday, vacation, etc."
                        value={exceptionReason}
                        onChange={(e) => setExceptionReason(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <Button onClick={addException} variant="secondary" className="h-11">
                    <Plus className="mr-2 h-4 w-4" /> Add Exception
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
