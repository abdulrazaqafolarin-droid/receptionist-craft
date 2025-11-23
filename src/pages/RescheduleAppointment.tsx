import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CheckAvailabilityResult } from "@/types/appointments";

export default function RescheduleAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [rescheduling, setRescheduling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<any>(null);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadAppointment();
    } else {
      setError("Invalid reschedule link");
      setLoading(false);
    }
  }, [token]);

  async function loadAppointment() {
    try {
      const { data, error: fetchErr } = await supabase
        .from("appointments")
        .select("*, services(*), receptionists(*)")
        .eq("metadata->>confirmation_token", token)
        .maybeSingle();

      if (fetchErr || !data) {
        setError("Appointment not found");
        return;
      }

      if (data.status === "cancelled") {
        setError("Cannot reschedule cancelled appointment");
        return;
      }

      setAppointment(data);
      loadAvailableSlots(data);
    } catch (err: any) {
      setError("Failed to load appointment");
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableSlots(appt: any) {
    setLoadingSlots(true);
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + 14); // Next 2 weeks

      const { data, error: slotsErr } = await supabase.functions.invoke("check-availability", {
        body: {
          receptionist_id: appt.receptionist_id,
          service_id: appt.service_id,
          startDate: today.toISOString(),
          endDate: endDate.toISOString(),
          max_slots: 20,
        },
      });

      if (slotsErr) throw slotsErr;

      const result = data as CheckAvailabilityResult;
      setAvailableSlots(result.slots || []);
    } catch (err: any) {
      console.error("Load slots error:", err);
      toast({ title: "Error", description: "Failed to load available slots", variant: "destructive" });
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleReschedule() {
    if (!selectedSlot || !appointment) return;
    
    setRescheduling(true);
    try {
      const { data, error: rescheduleErr } = await supabase.functions.invoke("reschedule-appointment", {
        body: {
          appointmentId: appointment.id,
          token,
          newStartTime: selectedSlot,
        },
      });

      if (rescheduleErr) throw rescheduleErr;
      if (!data?.success) throw new Error(data?.error || "Failed to reschedule");

      setSuccess(true);
      toast({ title: "Success", description: "Appointment rescheduled successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to reschedule", variant: "destructive" });
    } finally {
      setRescheduling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <CardTitle>Rescheduled Successfully!</CardTitle>
            </div>
            <CardDescription>Your appointment has been updated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p><strong>Service:</strong> {appointment.service}</p>
              <p><strong>New Date:</strong> {new Date(selectedSlot!).toLocaleDateString()}</p>
              <p><strong>New Time:</strong> {new Date(selectedSlot!).toLocaleTimeString()}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              You will receive a confirmation email shortly.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-6 w-6 text-primary" />
              <CardTitle>Reschedule Appointment</CardTitle>
            </div>
            <CardDescription>Select a new time for your appointment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Appointment */}
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-semibold mb-3">Current Appointment</h3>
              <p className="text-sm"><strong>Service:</strong> {appointment.service}</p>
              <p className="text-sm"><strong>Date:</strong> {new Date(appointment.start_time).toLocaleDateString()}</p>
              <p className="text-sm"><strong>Time:</strong> {new Date(appointment.start_time).toLocaleTimeString()}</p>
            </div>

            {/* Available Slots */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Available Time Slots
              </h3>
              
              {loadingSlots ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No available slots found. Please contact us directly.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[400px] overflow-y-auto">
                  {availableSlots.map((slot) => (
                    <Button
                      key={slot.start}
                      variant={selectedSlot === slot.start ? "default" : "outline"}
                      className="h-auto py-3 flex flex-col items-start"
                      onClick={() => setSelectedSlot(slot.start)}
                    >
                      <span className="font-semibold">
                        {new Date(slot.start).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </span>
                      <span className="text-sm">
                        {new Date(slot.start).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={handleReschedule}
                disabled={!selectedSlot || rescheduling}
                className="flex-1"
                size="lg"
              >
                {rescheduling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rescheduling...
                  </>
                ) : (
                  "Confirm New Time"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                disabled={rescheduling}
                size="lg"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
