import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/types/appointments";

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
        .order("start_time", { ascending: true })
        .limit(200);

      if (error) throw error;
      setAppointments((data || []) as Appointment[]);
    } catch (err) {
      console.error("loadAppointments error", err);
    } finally {
      setLoading(false);
    }
  }

  async function openAppointment(a: Appointment) {
    // Open a drawer or navigate to detail (simple alert for now)
    alert(`Appointment for ${a.customer_name} at ${new Date(a.start_time).toLocaleString()}`);
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Appointments</h1>
          <div className="flex gap-2">
            <Button onClick={() => loadAppointments()}>Refresh</Button>
          </div>
        </div>

        {loading ? <div>Loading...</div> : (
          <div className="space-y-3">
            {appointments.map(a => (
              <div key={a.id} className="p-4 border rounded flex justify-between items-center">
                <div>
                  <div className="font-semibold">{a.customer_name || "Guest"}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(a.start_time).toLocaleString()} — {a.service_id || "Service"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => openAppointment(a)}>Open</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
