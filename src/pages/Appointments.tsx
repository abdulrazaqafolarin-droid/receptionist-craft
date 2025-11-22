import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import type { Appointment } from "@/types/appointments";

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

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

  function openAppointment(a: Appointment) {
    setSelectedAppointment(a);
    setModalOpen(true);
  }

  function openNewAppointment() {
    setSelectedAppointment(null);
    setModalOpen(true);
  }

  function handleModalSuccess() {
    loadAppointments();
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Appointments</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => loadAppointments()}>Refresh</Button>
            <Button onClick={openNewAppointment}>+ New Appointment</Button>
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
                  <Button variant="ghost" onClick={() => openAppointment(a)}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <AppointmentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          appointment={selectedAppointment}
          onSuccess={handleModalSuccess}
        />
      </div>
    </>
  );
}
