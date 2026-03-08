import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Clock, Calendar, Globe } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIMEZONE_OPTIONS, detectBrowserTimezone, findClosestTimezone } from "@/lib/timezones";

const DAYS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const QUICK_PRESETS = [
  { name: "Mon-Fri 9am-5pm", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
  { name: "Mon-Sat 10am-6pm", days: [1, 2, 3, 4, 5, 6], start: "10:00", end: "18:00" },
  { name: "Tue-Sat 9am-6pm", days: [2, 3, 4, 5, 6], start: "09:00", end: "18:00" },
  { name: "Open 7 Days 9am-9pm", days: [0, 1, 2, 3, 4, 5, 6], start: "09:00", end: "21:00" },
];

export default function Step3Availability() {
  const { availabilityRules, setAvailabilityRules, setStep, receptionistId } = useOnboardingStore();
  const [mode, setMode] = useState<"quick" | "advanced">("quick");
  // Auto-detect the business owner's browser timezone — never hardcode
  const [timezone, setTimezone] = useState(() => findClosestTimezone(detectBrowserTimezone()));
  const [loading, setLoading] = useState(false);

  // Advanced mode
  const [newDay, setNewDay] = useState(1);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");

  const handleQuickPreset = (preset: typeof QUICK_PRESETS[0]) => {
    const rules = preset.days.map((day) => ({
      day_of_week: day,
      start_time: preset.start,
      end_time: preset.end,
      timezone,
    }));
    setAvailabilityRules(rules);
    toast.success(`${preset.name} schedule applied`);
  };

  const handleAddRule = () => {
    const newRule = {
      day_of_week: newDay,
      start_time: newStart,
      end_time: newEnd,
      timezone,
    };
    setAvailabilityRules([...availabilityRules, newRule]);
    toast.success("Availability rule added");
  };

  const handleContinue = async () => {
    if (availabilityRules.length === 0) {
      toast.error("Please set at least one availability rule");
      return;
    }

    setLoading(true);
    try {
      const rulesToInsert = availabilityRules.map((rule) => ({
        receptionist_id: receptionistId,
        day_of_week: rule.day_of_week,
        start_time: rule.start_time,
        end_time: rule.end_time,
        timezone: rule.timezone || timezone,
      }));

      const { error } = await supabase.from("availability_rules").insert(rulesToInsert);
      if (error) throw error;

      // Propagate timezone to receptionist record so check-availability uses it
      if (receptionistId) {
        await supabase.from("receptionists").update({ timezone }).eq("id", receptionistId);
      }

      // Also propagate to owner profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ timezone }).eq("id", user.id);
      }

      toast.success("Availability saved!");
      setStep(4);
    } catch (error: any) {
      toast.error(error.message || "Failed to save availability");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <CardTitle>Set Your Availability</CardTitle>
        </div>
        <CardDescription>
          Define when your AI receptionist can book appointments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Timezone Selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Your Business Timezone
          </Label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue placeholder="Select your timezone" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {TIMEZONE_OPTIONS.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Auto-detected from your browser. Change it if your business operates in a different timezone.
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "quick" ? "default" : "outline"}
            onClick={() => setMode("quick")}
            size="sm"
          >
            Quick Setup
          </Button>
          <Button
            variant={mode === "advanced" ? "default" : "outline"}
            onClick={() => setMode("advanced")}
            size="sm"
          >
            Advanced Setup
          </Button>
        </div>

        {mode === "quick" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose a preset schedule that fits your business hours
            </p>
            <div className="grid gap-3">
              {QUICK_PRESETS.map((preset, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="h-auto p-4 justify-start"
                  onClick={() => handleQuickPreset(preset)}
                >
                  <div className="flex-1 text-left">
                    <div className="font-medium">{preset.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {preset.days.map((d) => DAYS.find((day) => day.value === d)?.label.slice(0, 3)).join(", ")} •{" "}
                      {preset.start} - {preset.end}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
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
                <Label>Start</Label>
                <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              </div>
              <div>
                <Label>End</Label>
                <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleAddRule} variant="outline" className="w-full">
              Add Rule
            </Button>
          </div>
        )}

        {/* Current Rules */}
        {availabilityRules.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Your Schedule ({availabilityRules.length} rules)</h4>
            <div className="space-y-1">
              {availabilityRules.map((rule, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 border rounded text-sm">
                  <Badge variant="outline">
                    {DAYS.find((d) => d.value === rule.day_of_week)?.label}
                  </Badge>
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span>
                    {rule.start_time} - {rule.end_time}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {rule.timezone || timezone}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep(2)} size="lg">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={loading || availabilityRules.length === 0}
            className="flex-1"
            size="lg"
          >
            {loading ? "Saving..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
