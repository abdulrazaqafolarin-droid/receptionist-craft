import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShoppingBag, RefreshCw, Eye, Check, X, Clock, Package, DollarSign, User, Phone, Mail, Truck } from "lucide-react";
import { FloatingBackground } from "@/components/FloatingBackground";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number | null;
}

type ReceptionistData = {
  id: string;
  name: string | null;
  business_name: string | null;
  greeting_message: string | null;
  timezone: string | null;
  tone: string | null;
};

interface Order {
  id: string;
  receptionist_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  status: string;
  total_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { label: "Pending", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20", icon: Clock },
  confirmed: { label: "Confirmed", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Check },
  processing: { label: "Processing", color: "bg-purple-500/10 text-purple-600 border-purple-500/20", icon: Package },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-600 border-green-500/20", icon: Check },
  cancelled: { label: "Cancelled", color: "bg-red-500/10 text-red-600 border-red-500/20", icon: X },
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [receptionists, setReceptionists] = useState<ReceptionistData[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updating, setUpdating] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<Order | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedReceptionist) {
      loadOrders();
    }
  }, [selectedReceptionist, statusFilter]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("receptionists")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("Error loading receptionists:", error);
      return;
    }

    setReceptionists(data || []);
    if (data && data.length > 0) {
      setSelectedReceptionist(data[0].id);
    }
  }

  async function loadOrders() {
    if (!selectedReceptionist) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select("*")
        .eq("receptionist_id", selectedReceptionist)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data: ordersData, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      // Load order items for each order
      const ordersWithItems = await Promise.all(
        (ordersData || []).map(async (order) => {
          const { data: items } = await supabase
            .from("order_items")
            .select("*")
            .eq("order_id", order.id);
          return { ...order, items: items || [] };
        })
      );

      setOrders(ordersWithItems);
    } catch (err) {
      console.error("loadOrders error", err);
      toast({ title: "Error", description: "Failed to load orders", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    setUpdating(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;

      toast({ title: "Success", description: `Order ${newStatus}` });
      loadOrders();
    } catch (err) {
      console.error("updateOrderStatus error", err);
      toast({ title: "Error", description: err.message || "Failed to update order", variant: "destructive" });
    } finally {
      setUpdating(null);
      setCancelConfirm(null);
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === "pending").length,
    processing: orders.filter(o => o.status === "processing").length,
    completed: orders.filter(o => o.status === "completed").length,
    revenue: orders.filter(o => o.status === "completed").reduce((sum, o) => sum + (o.total_amount || 0), 0),
  };

  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-4 lg:p-8 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Orders</h1>
              <p className="text-muted-foreground">Manage product orders from your AI receptionist</p>
            </div>
          </div>
          <Button onClick={() => loadOrders()} disabled={loading} variant="outline" className="h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Receptionist Selector */}
        {receptionists.length > 0 && (
          <Card className="mb-6 border-2 border-border/50 liquid-glass">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Select Receptionist</CardTitle>
              <CardDescription>View orders for a specific receptionist</CardDescription>
            </CardHeader>
            <CardContent>
              <select 
                className="w-full p-3 border-2 border-border rounded-xl bg-background font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                value={selectedReceptionist} 
                onChange={(e) => setSelectedReceptionist(e.target.value)}
              >
                {receptionists.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} - {r.business_name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>
        )}

        {!selectedReceptionist && (
          <Card className="mb-6 border-2 border-border/50 liquid-glass">
            <CardContent className="py-16 text-center">
              <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <ShoppingBag className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Create a receptionist first</h3>
              <p className="text-muted-foreground mb-6">You need to create a receptionist to view orders.</p>
              <Button onClick={() => window.location.href = '/onboarding'}>
                Create Receptionist
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedReceptionist && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card className="border-2 border-border/50 liquid-glass">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-sm text-muted-foreground">Total Orders</div>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 liquid-glass">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 liquid-glass">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{stats.processing}</div>
                  <div className="text-sm text-muted-foreground">Processing</div>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 liquid-glass">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                  <div className="text-sm text-muted-foreground">Completed</div>
                </CardContent>
              </Card>
              <Card className="border-2 border-border/50 col-span-2 lg:col-span-1">
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-primary">{formatCurrency(stats.revenue)}</div>
                  <div className="text-sm text-muted-foreground">Revenue</div>
                </CardContent>
              </Card>
            </div>

            {/* Filter */}
            <Card className="mb-6 border-2 border-border/50 liquid-glass">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium">Filter by status:</span>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Orders List */}
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="border-2 border-border/50 liquid-glass">
                    <CardContent className="p-6">
                      <Skeleton className="h-6 w-48 mb-4" />
                      <Skeleton className="h-4 w-full mb-2" />
                      <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="No orders yet"
                description="Orders from your AI receptionist will appear here"
              />
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <Card key={order.id} className="border-2 border-border/50 hover:border-primary/20 hover:shadow-lg transition-all liquid-glass">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{order.customer_name}</h3>
                            {getStatusBadge(order.status)}
                            {order.total_amount && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                {formatCurrency(order.total_amount)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-2">
                            {order.customer_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-4 w-4" />
                                {order.customer_email}
                              </span>
                            )}
                            {order.customer_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-4 w-4" />
                                {order.customer_phone}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {formatDate(order.created_at)}
                            </span>
                          </div>
                          {order.items && order.items.length > 0 && (
                            <div className="text-sm text-muted-foreground">
                              {order.items.length} item(s): {order.items.map(i => `${i.product_name} x${i.quantity}`).join(", ")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedOrder(order)}
                            className="h-9"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {order.status === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, "confirmed")}
                              disabled={updating === order.id}
                              className="h-9"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Confirm
                            </Button>
                          )}
                          {order.status === "confirmed" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => updateOrderStatus(order.id, "processing")}
                              disabled={updating === order.id}
                              className="h-9"
                            >
                              <Truck className="h-4 w-4 mr-1" />
                              Process
                            </Button>
                          )}
                          {order.status === "processing" && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => updateOrderStatus(order.id, "completed")}
                              disabled={updating === order.id}
                              className="h-9 bg-green-600 hover:bg-green-700"
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Complete
                            </Button>
                          )}
                          {(order.status === "pending" || order.status === "confirmed") && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setCancelConfirm(order)}
                              disabled={updating === order.id}
                              className="h-9"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Order Details Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>
                Order placed on {selectedOrder && formatDate(selectedOrder.created_at)}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Status:</span>
                  {getStatusBadge(selectedOrder.status)}
                </div>

                <div className="border rounded-xl p-4 space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Customer Info
                  </h4>
                  <p className="text-sm">{selectedOrder.customer_name}</p>
                  {selectedOrder.customer_email && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.customer_email}</p>
                  )}
                  {selectedOrder.customer_phone && (
                    <p className="text-sm text-muted-foreground">{selectedOrder.customer_phone}</p>
                  )}
                </div>

                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <div className="border rounded-xl p-4 space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Order Items
                    </h4>
                    {selectedOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span>{item.product_name} x{item.quantity}</span>
                        {item.unit_price && (
                          <span className="text-muted-foreground">{formatCurrency(item.unit_price * item.quantity)}</span>
                        )}
                      </div>
                    ))}
                    {selectedOrder.total_amount && (
                      <div className="flex justify-between font-medium pt-2 border-t">
                        <span>Total</span>
                        <span>{formatCurrency(selectedOrder.total_amount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedOrder.notes && (
                  <div className="border rounded-xl p-4">
                    <h4 className="font-medium mb-2">Notes</h4>
                    <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel Confirmation Dialog */}
        <AlertDialog open={!!cancelConfirm} onOpenChange={() => setCancelConfirm(null)}>
          <AlertDialogContent className="border-2 liquid-glass">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel this order for <strong>{cancelConfirm?.customer_name}</strong>?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!updating}>Keep Order</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => cancelConfirm && updateOrderStatus(cancelConfirm.id, "cancelled")} 
                disabled={!!updating}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {updating ? "Cancelling..." : "Cancel Order"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
