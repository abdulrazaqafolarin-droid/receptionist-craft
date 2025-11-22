import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, Phone, Mail, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Appointment {
  id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  start_time: string;
  end_time: string;
  status: string;
  service_id?: string;
  booking_source?: string;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

export default function Appointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "upcoming" | "past">("upcoming");
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [filter]);

  async function loadData() {
    try {
      setLoading(true);

      // Load services
      const { data: srvData } = await supabase
        .from("services")
        .select("id, name, duration_minutes")
        .eq("active", true);
      
      if (srvData) setServices(srvData);

      // Load appointments based on filter
      let query = supabase
        .from("appointments")
        .select("*")
        .order("start_time", { ascending: true });

      const now = new Date().toISOString();
      
      if (filter === "upcoming") {
        query = query.gte("start_time", now).neq("status", "cancelled");
      } else if (filter === "past") {
        query = query.lt("start_time", now);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAppointments(data || []);
    } catch (error: any) {
      console.error("Error loading appointments:", error);
      toast({
        title: "Error",
        description: "Failed to load appointments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const getServiceName = (serviceId?: string) => {
    if (!serviceId) return "No service";
    const service = services.find((s) => s.id === serviceId);
    return service?.name || "Unknown service";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      booked: "default",
      confirmed: "secondary",
      cancelled: "destructive",
      completed: "secondary",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Appointments</h1>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "upcoming" ? "default" : "outline"}
            onClick={() => setFilter("upcoming")}
          >
            Upcoming
          </Button>
          <Button
            variant={filter === "past" ? "default" : "outline"}
            onClick={() => setFilter("past")}
          >
            Past
          </Button>
        </div>

        {loading ? (
          <Card className="p-8">
            <p className="text-center text-muted-foreground">Loading appointments...</p>
          </Card>
        ) : appointments.length === 0 ? (
          <Card className="p-8">
            <p className="text-center text-muted-foreground">
              No appointments found
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {appointments.map((appt) => (
              <Card key={appt.id} className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-3 flex-1">
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <span className="font-semibold text-lg">
                        {appt.customer_name}
                      </span>
                      {getStatusBadge(appt.status)}
                    </div>

                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(appt.start_time)}</span>
                    </div>

                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>
                        {formatTime(appt.start_time)} - {formatTime(appt.end_time)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span className="font-medium">
                        {getServiceName(appt.service_id)}
                      </span>
                    </div>

                    {appt.customer_email && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span>{appt.customer_email}</span>
                      </div>
                    )}

                    {appt.customer_phone && (
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <span>{appt.customer_phone}</span>
                      </div>
                    )}

                    {appt.booking_source && (
                      <div className="text-xs text-muted-foreground">
                        Booked via: {appt.booking_source}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                    {appt.status === "booked" && (
                      <Button variant="destructive" size="sm">
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
