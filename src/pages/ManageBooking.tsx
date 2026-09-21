import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Phone, Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AppointmentData {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  service: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  cancellation_token: string;
  services?: { name: string; description?: string; duration_minutes: number };
  receptionists?: { business_name: string; business_phone?: string; name: string };
  [key: string]: unknown;
}

export default function ManageBooking() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadAppointment();
  }, [id]);

  async function loadAppointment() {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          services (name, description, duration_minutes),
          receptionists (business_name, business_phone, name)
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      setAppointment(data as AppointmentData | null);
    } catch (err) {
      console.error("Error loading appointment:", err);
      const message = err instanceof Error ? err.message : "Failed to load appointment details";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelBooking() {
    if (!appointment || !confirm("Are you sure you want to cancel this appointment?")) return;

    setCancelling(true);
    try {
      const { error } = await supabase.functions.invoke("appointment-action", {
        body: {
          action: "cancel",
          appointmentId: appointment.id,
          token: appointment.cancellation_token,
          reason: "Customer cancelled via booking portal",
        },
      });

      if (error) throw error;

      toast({
        title: "Appointment Cancelled",
        description: "Your appointment has been successfully cancelled.",
      });

      loadAppointment();
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      const message = err instanceof Error ? err.message : "Failed to cancel appointment";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  function downloadICS() {
    if (!appointment) return;

    const startDate = new Date(appointment.start_time);
    const endDate = new Date(appointment.end_time);

    const formatICSDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AI Receptionist//Booking//EN
BEGIN:VEVENT
UID:${appointment.id}@aireceptionist.com
DTSTAMP:${formatICSDate(new Date())}
DTSTART:${formatICSDate(startDate)}
DTEND:${formatICSDate(endDate)}
SUMMARY:${appointment.services?.name || appointment.service}
DESCRIPTION:Appointment with ${appointment.receptionists?.business_name || 'Business'}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'appointment.ics';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Calendar File Downloaded",
      description: "Open the file to add this appointment to your calendar",
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Appointment Not Found</CardTitle>
            <CardDescription>We couldn't find the appointment you're looking for.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const startDate = new Date(appointment.start_time);
  const endDate = new Date(appointment.end_time);
  const isCancelled = appointment.status === "cancelled";
  const isPast = endDate < new Date();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl mb-2">
                  {isCancelled ? "Cancelled Appointment" : "Your Appointment"}
                </CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  {appointment.receptionists?.business_name || "Business"}
                </CardDescription>
              </div>
              <Badge
                variant={isCancelled ? "destructive" : isPast ? "secondary" : "default"}
                className="text-lg px-4 py-2"
              >
                {isCancelled ? <XCircle className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                {isCancelled ? "Cancelled" : isPast ? "Completed" : "Confirmed"}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="p-8 space-y-6">
            {isCancelled && (
              <Alert className="border-destructive/50 bg-destructive/10">
                <XCircle className="h-4 w-4 text-destructive" />
                <AlertDescription>
                  This appointment has been cancelled. If you'd like to book a new appointment,
                  please contact the business or visit their booking page.
                </AlertDescription>
              </Alert>
            )}

            {/* Appointment Details */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Appointment Details</h3>

              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <div className="font-medium">
                      {startDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-sm text-muted-foreground">Date</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <div className="font-medium">
                      {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} -{' '}
                      {endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {appointment.services?.duration_minutes || 30} minutes
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <div className="font-medium">{appointment.services?.name || appointment.service}</div>
                    <div className="text-sm text-muted-foreground">Service</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg border-b pb-2">Your Information</h3>

              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary font-semibold">
                      {appointment.customer_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="font-medium">{appointment.customer_name}</div>
                    <div className="text-sm text-muted-foreground">Name</div>
                  </div>
                </div>

                {appointment.customer_email && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <div className="font-medium">{appointment.customer_email}</div>
                      <div className="text-sm text-muted-foreground">Email</div>
                    </div>
                  </div>
                )}

                {appointment.customer_phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-primary mt-1" />
                    <div>
                      <div className="font-medium">{appointment.customer_phone}</div>
                      <div className="text-sm text-muted-foreground">Phone</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {!isCancelled && !isPast && (
              <div className="flex gap-3 pt-4">
                <Button onClick={downloadICS} className="flex-1" variant="outline">
                  <Calendar className="mr-2 h-4 w-4" />
                  Add to Calendar
                </Button>
                <Button
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  variant="destructive"
                  className="flex-1"
                >
                  {cancelling ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Cancel Appointment
                </Button>
              </div>
            )}

            {!isCancelled && !isPast && (
              <Alert className="bg-primary/5 border-primary/20">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription>
                  Need to reschedule? Cancel this appointment and book a new time that works better for you.
                </AlertDescription>
              </Alert>
            )}

            {appointment.receptionists?.business_phone && (
              <div className="text-center pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Questions about your appointment?</p>
                <p className="font-medium">{appointment.receptionists.business_phone}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
