import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import type { Appointment } from "@/types/appointments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, RefreshCw, Plus } from "lucide-react";

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useEffect(() => {
    loadReceptionists();
    loadAppointments();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [selectedReceptionist]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id);

    setReceptionists(data || []);
  }

  async function loadAppointments() {
    setLoading(true);
    try {
      let query = supabase
        .from("appointments")
        .select("*")
        .order("start_time", { ascending: true });

      if (selectedReceptionist !== "all") {
        query = query.eq('receptionist_id', selectedReceptionist);
      }

      const { data, error } = await query;

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
          <div className="flex gap-2 items-center">
            {receptionists.length > 0 && (
              <select 
                className="px-4 py-2 border rounded-md bg-background"
                value={selectedReceptionist} 
                onChange={(e) => setSelectedReceptionist(e.target.value)}
              >
                <option value="all">All Receptionists</option>
                {receptionists.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - {r.business_name}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={() => setCreateModalOpen(true)} variant="default">
              <Plus className="mr-2 h-4 w-4" />
              Create Appointment
            </Button>
            <Button onClick={() => loadAppointments()} disabled={loading} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
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

        <AppointmentModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onSuccess={loadAppointments}
          receptionistId={selectedReceptionist !== "all" ? selectedReceptionist : undefined}
        />
      </div>
    </>
  );
}
