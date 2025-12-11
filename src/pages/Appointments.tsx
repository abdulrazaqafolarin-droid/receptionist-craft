import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { AppointmentFilters, type FilterState } from "@/components/appointments/AppointmentFilters";
import type { Appointment } from "@/types/appointments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, RefreshCw, Plus, Download, Calendar, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";

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

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(apt =>
        apt.customer_name?.toLowerCase().includes(search) ||
        apt.customer_email?.toLowerCase().includes(search) ||
        apt.service?.toLowerCase().includes(search) ||
        apt.customer_phone?.includes(search)
      );
    }

    if (filters.status.length > 0) {
      filtered = filtered.filter(apt => filters.status.includes(apt.status || "booked"));
    }

    if (filters.service) {
      const service = filters.service.toLowerCase();
      filtered = filtered.filter(apt => apt.service?.toLowerCase().includes(service));
    }

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
      <div className="container mx-auto p-4 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold">Appointments Calendar</h1>
                <p className="text-muted-foreground text-sm lg:text-base">View all appointments booked via AI chat</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center">
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2 bg-destructive/10 px-3 py-2 rounded-lg">
                <span className="text-sm font-medium text-destructive">{selectedIds.length} selected</span>
                <Button onClick={clearSelection} variant="ghost" size="sm" className="h-8">Clear</Button>
                <Button onClick={bulkCancel} variant="destructive" size="sm" className="h-8">
                  Cancel Selected
                </Button>
              </div>
            )}
            
            {receptionists.length > 0 && (
              <select 
                className="px-4 py-2.5 border-2 border-border rounded-xl bg-background text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
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
            
            <Button onClick={() => setCreateModalOpen(true)} className="h-11 shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" />
              Create Appointment
            </Button>
            <Button onClick={exportToCSV} variant="outline" className="h-11">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={() => loadAppointments()} disabled={loading} variant="outline" className="h-11">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <Alert className="mb-6 border-2 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <AlertDescription className="text-sm">
              Appointments are booked automatically when customers chat with your AI receptionist. 
              Go to the Builder page to test the booking flow.
            </AlertDescription>
          </div>
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
