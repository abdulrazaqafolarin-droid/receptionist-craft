import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, isSameDay } from "date-fns";
import type { Appointment } from "@/types/appointments";
import { Phone, Mail, Clock, Calendar as CalendarIcon, Pencil, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
} from "@/components/ui/alert-dialog";

interface AppointmentCalendarProps {
  appointments: Appointment[];
  onEdit?: (appointment: Appointment) => void;
  onRefresh?: () => void;
}

export function AppointmentCalendar({ appointments, onEdit, onRefresh }: AppointmentCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Appointment | null>(null);

  // Get appointments for selected date
  const selectedDateAppointments = appointments.filter(apt => 
    selectedDate && isSameDay(new Date(apt.start_time), selectedDate)
  );

  // Get dates that have appointments
  const datesWithAppointments = appointments.map(apt => new Date(apt.start_time));

  const handleCancel = async (apt: Appointment) => {
    if (!apt.id) return;
    setCancellingId(apt.id);
    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", apt.id);

      if (error) throw error;
      toast.success("Appointment cancelled successfully");
      onRefresh?.();
    } catch (err) {
      console.error("Cancel error:", err);
      const message = err instanceof Error ? err.message : "Failed to cancel appointment";
      toast.error(message);
    } finally {
      setCancellingId(null);
      setConfirmCancel(null);
    }
  };

  return (
    <div className="grid lg:grid-cols-[350px_1fr] gap-6">
      {/* Calendar */}
      <Card className="border-2 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Select Date</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            className="rounded-xl border-2 pointer-events-auto"
            modifiers={{
              booked: datesWithAppointments
            }}
            modifiersStyles={{
              booked: {
                fontWeight: 'bold',
                backgroundColor: 'hsl(var(--primary) / 0.1)',
                color: 'hsl(var(--primary))'
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Day View */}
      <Card className="border-2 border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : "Select a date"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedDateAppointments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No appointments scheduled for this date</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateAppointments
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .map(apt => (
                  <Card key={apt.id} className={`border-l-4 ${apt.status === 'cancelled' ? 'border-l-muted opacity-60' : 'border-l-primary'} hover:shadow-lg transition-all`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-semibold text-lg">{apt.customer_name}</h4>
                          <p className="text-sm text-muted-foreground">{apt.service || "Service"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            apt.status === 'booked' ? 'default' : 
                            apt.status === 'confirmed' ? 'secondary' :
                            apt.status === 'completed' ? 'secondary' : 
                            'outline'
                          }>
                            {apt.status}
                          </Badge>
                          {apt.status === 'booked' && (
                            <>
                              {onEdit && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onEdit(apt)}
                                  aria-label="Edit appointment"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setConfirmCancel(apt)}
                                disabled={cancellingId === apt.id}
                                aria-label="Cancel appointment"
                              >
                                {cancellingId === apt.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <X className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {/* Confirmation ID */}
                        {apt.id && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono bg-muted px-1.5 py-0.5 rounded">#{apt.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {format(new Date(apt.start_time), "h:mm a")} - {format(new Date(apt.end_time), "h:mm a")}
                          </span>
                          {/* Duration */}
                          <span className="text-xs text-muted-foreground">
                            ({Math.round((new Date(apt.end_time).getTime() - new Date(apt.start_time).getTime()) / 60000)} min)
                          </span>
                        </div>
                        
                        {apt.customer_phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${apt.customer_phone}`} className="hover:underline">{apt.customer_phone}</a>
                          </div>
                        )}
                        
                        {apt.customer_email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${apt.customer_email}`} className="hover:underline">{apt.customer_email}</a>
                          </div>
                        )}

                        {/* Booking source */}
                        {apt.booking_source && (
                          <Badge variant="outline" className="text-xs">
                            {apt.booking_source === 'ai_receptionist' ? 'Booked via AI Chat' : apt.booking_source}
                          </Badge>
                        )}
                      </div>

                      {apt.notes && (
                        <p className="mt-3 text-sm text-muted-foreground border-t pt-3">
                          {apt.notes}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!confirmCancel} onOpenChange={() => setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the appointment for <strong>{confirmCancel?.customer_name}</strong> on{" "}
              {confirmCancel && format(new Date(confirmCancel.start_time), "MMMM d, yyyy 'at' h:mm a")}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmCancel && handleCancel(confirmCancel)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
