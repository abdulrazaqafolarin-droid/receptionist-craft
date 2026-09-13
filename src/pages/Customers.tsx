import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ArrowLeft, Calendar, ShoppingBag, Clock, Mail, Phone, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
  receptionist_id: string;
}

interface Appointment {
  id: string;
  service: string;
  start_time: string;
  status: string;
}

interface Order {
  id: string;
  total_amount: number | null;
  status: string;
  created_at: string;
}

export default function Customers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's receptionist IDs
    const { data: recs } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true);

    const recIds = (recs ?? []).map((r) => r.id);
    if (recIds.length === 0) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("customers")
      .select("*")
      .in("receptionist_id", recIds)
      .order("last_visit_at", { ascending: false });

    setCustomers(data ?? []);
    setLoading(false);
  }

  async function loadCustomerDetail(customer: Customer) {
    setSelectedCustomer(customer);
    setDetailLoading(true);

    const [{ data: appts }, { data: ords }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, service, start_time, status")
        .eq("customer_id", customer.id)
        .order("start_time", { ascending: false })
        .limit(10),
      supabase
        .from("orders")
        .select("id, total_amount, status, created_at")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    setAppointments((appts ?? []) as Appointment[]);
    setOrders(ords ?? []);
    setDetailLoading(false);
  }

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search),
  );

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">
            {customers.length} customer{customers.length !== 1 ? "s" : ""} across all receptionists
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Customer List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="liquid-glass">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {customers.length === 0
                ? "No customers yet. They'll appear here after bookings or orders."
                : "No customers match your search."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => (
            <Card
              key={customer.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors liquid-glass"
              onClick={() => loadCustomerDetail(customer)}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {customer.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{customer.name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {customer.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {customer.email}
                        </span>
                      )}
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={customer.visit_count > 1 ? "default" : "secondary"}>
                    {customer.visit_count} visit{customer.visit_count !== 1 ? "s" : ""}
                  </Badge>
                  {customer.last_visit_at && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(customer.last_visit_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto liquid-glass">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
                  {selectedCustomer?.name.charAt(0).toUpperCase()}
                </span>
              </div>
              {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-4 mt-2">
              {/* Contact Info */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {selectedCustomer.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {selectedCustomer.email}
                  </span>
                )}
                {selectedCustomer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {selectedCustomer.phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> First visit:{" "}
                  {new Date(selectedCustomer.created_at).toLocaleDateString()}
                </span>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
                  {/* Appointments */}
                  {appointments.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4" /> Appointments ({appointments.length})
                      </h3>
                      <div className="space-y-1">
                        {appointments.map((a) => (
                          <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                            <div>
                              <span className="font-medium">{a.service}</span>
                              <span className="text-muted-foreground ml-2">
                                {new Date(a.start_time).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <Badge variant={a.status === "confirmed" ? "default" : a.status === "cancelled" ? "destructive" : "secondary"} className="text-xs">
                              {a.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Orders */}
                  {orders.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                        <ShoppingBag className="h-4 w-4" /> Orders ({orders.length})
                      </h3>
                      <div className="space-y-1">
                        {orders.map((o) => (
                          <div key={o.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                            <div>
                              <span className="text-muted-foreground">
                                {new Date(o.created_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {o.total_amount != null && (
                                <span className="font-medium">${o.total_amount}</span>
                              )}
                              <Badge variant={o.status === "completed" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"} className="text-xs">
                                {o.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {appointments.length === 0 && orders.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No appointments or orders on record yet.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
