import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import type { Appointment } from "@/types/appointments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, RefreshCw } from "lucide-react";

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAppointments();
  }, []);

  async function loadAppointments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("start_time", { ascending: true });

      if (error) throw error;
      setAppointments((data || []) as Appointment[]);
    } catch (err) {
      console.error("loadAppointments error", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Appointments Calendar</h1>
            <p className="text-muted-foreground">View all appointments booked via AI chat</p>
          </div>
          <Button onClick={() => loadAppointments()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Alert className="mb-6 border-primary/20 bg-primary/5">
          <MessageCircle className="h-4 w-4" />
          <AlertDescription>
            Appointments are booked automatically when customers chat with your AI receptionist. 
            Go to the Builder page to test the booking flow.
          </AlertDescription>
        </Alert>

        {loading && appointments.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Loading appointments...</p>
            </div>
          </div>
        ) : (
          <AppointmentCalendar appointments={appointments} />
        )}
      </div>
    </>
  );
}
