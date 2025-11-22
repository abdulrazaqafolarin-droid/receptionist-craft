import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2, Calendar, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

const TIMEZONES = [
  "Africa/Lagos",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Dubai",
  "Asia/Tokyo",
  "UTC"
];

export default function Availability() {
  const { toast } = useToast();
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [loading, setLoading] = useState(false);

  // New rule form
  const [newDay, setNewDay] = useState<number>(1);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [timezone, setTimezone] = useState("Africa/Lagos");

  // New exception form
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
      // Load rules
      const { data: rulesData, error: rulesError } = await supabase
        .from("availability_rules")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });

      if (rulesError) throw rulesError;
      setRules(rulesData || []);

      // Load exceptions
      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from("availability_exceptions")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .order("start_timestamptz", { ascending: true });

      if (exceptionsError) throw exceptionsError;
      setExceptions(exceptionsData || []);

      // Get timezone from first rule or use default
      if (rulesData && rulesData.length > 0) {
        setTimezone(rulesData[0].timezone || "Africa/Lagos");
      }
    } catch (err: any) {
      console.error("Error loading availability:", err);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
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
    loadAvailability(selectedReceptionist);
  }

  async function deleteRule(id: string) {
    const { error } = await supabase.from("availability_rules").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Rule deleted" });
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
    loadAvailability(selectedReceptionist);
  }

  async function deleteException(id: string) {
    const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Success", description: "Exception deleted" });
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
    loadAvailability(selectedReceptionist);
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Business Hours & Availability</h1>
          <p className="text-muted-foreground">
            Set when your AI receptionist can book appointments
          </p>
        </div>

        {/* Receptionist Selector */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Select Receptionist</CardTitle>
            <CardDescription>Choose which receptionist to configure</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist}>
              <SelectTrigger>
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
              <Card className="mb-6 border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Quick Setup
                  </CardTitle>
                  <CardDescription>
                    No availability rules set. Start with default business hours?
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={setDefaultHours}>
                    Set Default Hours (Mon-Fri, 9am-5pm)
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Current Rules */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Weekly Schedule
                </CardTitle>
                <CardDescription>Define your regular business hours</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : rules.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center">
                    No availability rules set. Add your first rule below.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className="min-w-[100px]">
                            {DAYS.find((d) => d.value === rule.day_of_week)?.label}
                          </Badge>
                          <div className="text-sm">
                            <span className="font-medium">{rule.start_time}</span>
                            <span className="text-muted-foreground"> - </span>
                            <span className="font-medium">{rule.end_time}</span>
                          </div>
                          <Badge variant="secondary">{rule.timezone}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => rule.id && deleteRule(rule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Rule Form */}
                <div className="mt-6 pt-6 border-t space-y-4">
                  <h4 className="font-semibold">Add New Rule</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Day</Label>
                      <Select value={newDay.toString()} onValueChange={(v) => setNewDay(parseInt(v))}>
                        <SelectTrigger>
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
                    <div>
                      <Label>Start Time</Label>
                      <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                    </div>
                    <div>
                      <Label>End Time</Label>
                      <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                    </div>
                    <div>
                      <Label>Timezone</Label>
                      <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={addRule}>
                    <Plus className="mr-2 h-4 w-4" /> Add Rule
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Exceptions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Time-Off & Exceptions
                </CardTitle>
                <CardDescription>
                  Block specific dates/times (holidays, vacations, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {exceptions.length === 0 ? (
                  <p className="text-muted-foreground py-4 text-center">
                    No exceptions set
                  </p>
                ) : (
                  <div className="space-y-2 mb-6">
                    {exceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div>
                          <div className="font-medium">
                            {new Date(exc.start_timestamptz).toLocaleString()} -{" "}
                            {new Date(exc.end_timestamptz).toLocaleString()}
                          </div>
                          {exc.reason && (
                            <div className="text-sm text-muted-foreground">{exc.reason}</div>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => exc.id && deleteException(exc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Exception Form */}
                <div className="pt-6 border-t space-y-4">
                  <h4 className="font-semibold">Add Exception</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Start Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={exceptionStart}
                        onChange={(e) => setExceptionStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>End Date & Time</Label>
                      <Input
                        type="datetime-local"
                        value={exceptionEnd}
                        onChange={(e) => setExceptionEnd(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Reason (Optional)</Label>
                      <Input
                        placeholder="Holiday, vacation, etc."
                        value={exceptionReason}
                        onChange={(e) => setExceptionReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={addException}>
                    <Plus className="mr-2 h-4 w-4" /> Add Exception
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
