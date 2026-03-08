import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "@/components/appointments/AppointmentCalendar";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { AppointmentFilters, type FilterState } from "@/components/appointments/AppointmentFilters";
import type { Appointment } from "@/types/appointments";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Plus, Download, Calendar, Sparkles, ShoppingBag, Package } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import { FloatingBackground } from "@/components/FloatingBackground";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";

interface Order {
  id: string;
  receptionist_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  status: string;
  total_amount?: number | null;
  notes?: string | null;
  metadata?: any;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price?: number | null;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filteredAppointments, setFilteredAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<string>("appointments");
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
    loadOrders();
  }, []);

  useEffect(() => {
    loadAppointments();
    loadOrders();
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

  async function loadOrders() {
    try {
      let query = supabase
        .from("orders")
        .select(`
          *,
          items:order_items(*)
        `)
        .order("created_at", { ascending: false });

      if (selectedReceptionist !== "all") {
        query = query.eq('receptionist_id', selectedReceptionist);
      }

      const { data, error } = await query;

      if (error) throw error;
      setOrders((data || []) as Order[]);
    } catch (err) {
      console.error("loadOrders error", err);
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

  async function updateOrderStatus(orderId: string, newStatus: string) {
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;
      toast.success(`Order status updated to ${newStatus}`);
      loadOrders();
    } catch (err) {
      console.error("updateOrderStatus error", err);
      toast.error("Failed to update order status");
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      case 'confirmed': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Count new items (created in last 24 hours)
  const recentAppointments = appointments.filter(a => 
    new Date(a.created_at || a.start_time).getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;
  const recentOrders = orders.filter(o => 
    new Date(o.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;

  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-4 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold">Orders & Appointments</h1>
                <p className="text-muted-foreground text-sm lg:text-base">Manage all bookings and orders from your AI receptionist</p>
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
            <Button onClick={() => { loadAppointments(); loadOrders(); }} disabled={loading} variant="outline" className="h-11">
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
              Appointments and orders are created automatically when customers chat with your AI receptionist. 
              Go to the Builder page to test the booking and ordering flow.
            </AlertDescription>
          </div>
        </Alert>

        {/* Tabs for switching between Appointments and Orders */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Appointments
              {recentAppointments > 0 && (
                <Badge variant="secondary" className="ml-1 bg-primary text-primary-foreground">
                  {recentAppointments} new
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Orders
              {recentOrders > 0 && (
                <Badge variant="secondary" className="ml-1 bg-primary text-primary-foreground">
                  {recentOrders} new
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Appointments Tab */}
          <TabsContent value="appointments" className="space-y-6">
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
              <AppointmentCalendar 
                appointments={filteredAppointments} 
                onEdit={(apt) => setEditingAppointment(apt)}
                onRefresh={loadAppointments}
              />
            )}
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="space-y-6">
            {loading && orders.length === 0 ? (
              <LoadingState message="Loading orders..." />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="Orders placed through your AI receptionist will appear here. Test your widget to create your first order!"
              />
            ) : (
              <div className="grid gap-4">
                {orders.map((order) => (
                  <Card key={order.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Package className="h-5 w-5 text-primary" />
                            Order #{order.id.slice(0, 8)}
                          </CardTitle>
                          <CardDescription>
                            {format(new Date(order.created_at), "MMM d, yyyy 'at' h:mm a")}
                          </CardDescription>
                        </div>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Customer:</span>
                          <p className="font-medium">{order.customer_name}</p>
                        </div>
                        {order.customer_email && (
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <p className="font-medium">{order.customer_email}</p>
                          </div>
                        )}
                        {order.customer_phone && (
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <p className="font-medium">{order.customer_phone}</p>
                          </div>
                        )}
                      </div>

                      {/* Delivery Address if present */}
                      {order.metadata?.delivery_address && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Delivery Address:</span>
                          <p className="font-medium">{order.metadata.delivery_address}</p>
                        </div>
                      )}

                      {/* Order Items */}
                      {order.items && order.items.length > 0 && (
                        <div className="border-t pt-3">
                          <p className="text-sm text-muted-foreground mb-2">Items:</p>
                          <div className="space-y-1">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span>{item.quantity}x {item.product_name}</span>
                                {item.unit_price && (
                                  <span className="text-muted-foreground">
                                    ₦{(item.unit_price * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {order.total_amount && (
                            <div className="flex justify-between font-medium mt-2 pt-2 border-t">
                              <span>Total:</span>
                              <span>₦{order.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status Actions */}
                      <div className="flex gap-2 pt-2">
                        {order.status === 'pending' && (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => updateOrderStatus(order.id, 'confirmed')}
                            >
                              Confirm Order
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => updateOrderStatus(order.id, 'cancelled')}
                            >
                              Cancel
                            </Button>
                          </>
                        )}
                        {order.status === 'confirmed' && (
                          <Button 
                            size="sm" 
                            onClick={() => updateOrderStatus(order.id, 'completed')}
                          >
                            Mark Completed
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <AppointmentModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onSuccess={loadAppointments}
          receptionistId={selectedReceptionist !== "all" ? selectedReceptionist : undefined}
        />

        {/* Edit Modal */}
        <AppointmentModal
          open={!!editingAppointment}
          onOpenChange={(open) => !open && setEditingAppointment(null)}
          onSuccess={loadAppointments}
          appointment={editingAppointment}
        />
      </div>
    </div>
  );
}