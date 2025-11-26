import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Mail, Phone, X, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ManageBookingPortalProps {
  appointmentId: string;
  token: string;
}

export function ManageBookingPortal({ appointmentId, token }: ManageBookingPortalProps) {
  const { data: appointment, isLoading, error } = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          *,
          services (name, duration_minutes, description),
          receptionists (business_name, business_phone, name)
        `)
        .eq("id", appointmentId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const cancelAppointment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("cancel-appointment", {
        body: { appointmentId, token },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment cancelled successfully");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(`Failed to cancel: ${error.message}`);
    },
  });

  const confirmAppointment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("confirm-appointment", {
        body: { appointmentId, token },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment confirmed!");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(`Failed to confirm: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading appointment...</p>
        </div>
      </div>
    );
  }

  if (error || !appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-destructive">Appointment Not Found</CardTitle>
            <CardDescription>
              We couldn't find this appointment. The link may be invalid or expired.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const startDate = new Date(appointment.start_time);
  const endDate = new Date(appointment.end_time);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Your Appointment</CardTitle>
              <Badge variant={appointment.status === "booked" ? "default" : "secondary"}>
                {appointment.status}
              </Badge>
            </div>
            <CardDescription>
              Booking with {appointment.receptionists?.business_name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Service</p>
                  <p className="text-muted-foreground">{appointment.services?.name || appointment.service}</p>
                  {appointment.services?.description && (
                    <p className="text-sm text-muted-foreground mt-1">{appointment.services.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Date</p>
                  <p className="text-muted-foreground">
                    {format(startDate, "EEEE, MMMM d, yyyy")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Time</p>
                  <p className="text-muted-foreground">
                    {format(startDate, "h:mm a")} - {format(endDate, "h:mm a")}
                  </p>
                  {appointment.services?.duration_minutes && (
                    <p className="text-sm text-muted-foreground">
                      ({appointment.services.duration_minutes} minutes)
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">Customer</p>
                  <p className="text-muted-foreground">{appointment.customer_name}</p>
                </div>
              </div>

              {appointment.customer_email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Email</p>
                    <p className="text-muted-foreground">{appointment.customer_email}</p>
                  </div>
                </div>
              )}

              {appointment.customer_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Phone</p>
                    <p className="text-muted-foreground">{appointment.customer_phone}</p>
                  </div>
                </div>
              )}

              {appointment.notes && (
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">Notes</p>
                    <p className="text-muted-foreground">{appointment.notes}</p>
                  </div>
                </div>
              )}
            </div>

            {appointment.status === "booked" && (
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => confirmAppointment.mutate()}
                  disabled={confirmAppointment.isPending}
                  className="flex-1 gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {confirmAppointment.isPending ? "Confirming..." : "Confirm Appointment"}
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={cancelAppointment.isPending}
                      className="flex-1 gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel this appointment? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelAppointment.mutate()}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Yes, Cancel
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {appointment.receptionists?.business_phone && (
              <p className="text-sm text-muted-foreground text-center pt-4 border-t">
                Questions? Call us at {appointment.receptionists.business_phone}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
