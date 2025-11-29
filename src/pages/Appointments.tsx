import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { AppointmentFilters, type FilterState } from "@/components/appointments/AppointmentFilters";
import type { Appointment } from "@/types/appointments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, RefreshCw, Plus, Download, Calendar } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: [],
    startDate: "",
    endDate: "",
    service: ""
  });

  useEffect(() => {
    loadReceptionists();
    loadAppointments();
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [selectedReceptionist]);

  useEffect(() => {
    applyFilters();
  }, [appointments, filters]);

  function applyFilters() {
    let filtered = [...appointments];

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(apt =>
        apt.customer_name?.toLowerCase().includes(search) ||
        apt.customer_email?.toLowerCase().includes(search) ||
        apt.service?.toLowerCase().includes(search) ||
        apt.customer_phone?.includes(search)
      );
    }

    // Status filter
    if (filters.status.length > 0) {
      filtered = filtered.filter(apt => filters.status.includes(apt.status || "booked"));
    }

    // Service filter
    if (filters.service) {
      const service = filters.service.toLowerCase();
      filtered = filtered.filter(apt => apt.service?.toLowerCase().includes(service));
    }

    // Date range filter
    if (filters.startDate) {
      filtered = filtered.filter(apt => 
        new Date(apt.start_time) >= new Date(filters.startDate)
      );
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(apt => 
        new Date(apt.start_time) <= endDate
      );
    }

    setFilteredAppointments(filtered);
  }

  function exportToCSV() {
    const headers = ["Date", "Time", "Customer", "Email", "Phone", "Service", "Status"];
    const rows = filteredAppointments.map(apt => [
      new Date(apt.start_time).toLocaleDateString(),
      new Date(apt.start_time).toLocaleTimeString(),
      apt.customer_name,
      apt.customer_email || "",
      apt.customer_phone || "",
      apt.service,
      apt.status || "booked"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointments_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast.success("Appointments exported successfully!");
  }

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
      setSelected({});
    } catch (err) {
      console.error("loadAppointments error", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function selectAll() {
    const map: Record<string, boolean> = {};
    filteredAppointments.forEach((a) => (map[a.id] = true));
    setSelected(map);
  }

  function clearSelection() {
    setSelected({});
  }

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  async function bulkCancel() {
    if (selectedIds.length === 0) return;
    if (!confirm(`Cancel ${selectedIds.length} appointments?`)) return;

    try {
      const { error } = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .in("id", selectedIds);

      if (!error) {
        toast.success(`${selectedIds.length} appointments cancelled`);
        clearSelection();
        loadAppointments();
      } else {
        toast.error("Failed to cancel appointments");
      }
    } catch (e) {
      console.error("bulkCancel failed", e);
      toast.error("Error cancelling appointments");
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
            {selectedIds.length > 0 && (
              <>
                <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
                <Button onClick={clearSelection} variant="ghost" size="sm">Clear</Button>
                <Button onClick={bulkCancel} variant="destructive" size="sm">
                  Cancel Selected
                </Button>
              </>
            )}
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
            <Button onClick={exportToCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
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

        <div className="mb-6">
          <AppointmentFilters
            onFilterChange={setFilters}
            totalCount={appointments.length}
            filteredCount={filteredAppointments.length}
          />
        </div>

        {loading && appointments.length === 0 ? (
          <LoadingState message="Loading appointments..." />
        ) : filteredAppointments.length === 0 && appointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No appointments yet"
            description="Appointments booked through your AI receptionist will appear here. Test your widget to create your first appointment!"
            actionLabel="Create Appointment"
            onAction={() => setCreateModalOpen(true)}
          />
        ) : filteredAppointments.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No appointments match your filters"
            description="Try adjusting your search or filter criteria to see more results."
          />
        ) : (
          <AppointmentCalendar appointments={filteredAppointments} />
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
