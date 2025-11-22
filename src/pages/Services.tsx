import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Service {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  active: boolean;
  receptionist_id: string | null;
}

export default function Services() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const [newService, setNewService] = useState({
    name: "",
    description: "",
    duration_minutes: 30,
    buffer_before_minutes: 5,
    buffer_after_minutes: 5,
  });

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .order("name");

      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error("loadServices error", err);
      toast({ title: "Error", description: "Failed to load services", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createService() {
    if (!newService.name.trim()) {
      toast({ title: "Error", description: "Service name is required", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("services").insert({
        user_id: user.id,
        name: newService.name.trim(),
        description: newService.description.trim() || null,
        duration_minutes: newService.duration_minutes,
        buffer_before_minutes: newService.buffer_before_minutes,
        buffer_after_minutes: newService.buffer_after_minutes,
        active: true,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Service created successfully" });
      setNewService({
        name: "",
        description: "",
        duration_minutes: 30,
        buffer_before_minutes: 5,
        buffer_after_minutes: 5,
      });
      loadServices();
    } catch (err: any) {
      console.error("createService error", err);
      toast({ title: "Error", description: err.message || "Failed to create service", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function deleteService(id: string) {
    if (!confirm("Are you sure you want to delete this service?")) return;

    try {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Success", description: "Service deleted" });
      loadServices();
    } catch (err: any) {
      console.error("deleteService error", err);
      toast({ title: "Error", description: err.message || "Failed to delete service", variant: "destructive" });
    }
  }

  async function toggleServiceActive(id: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from("services")
        .update({ active: !currentActive })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: `Service ${!currentActive ? "activated" : "deactivated"}` });
      loadServices();
    } catch (err: any) {
      console.error("toggleServiceActive error", err);
      toast({ title: "Error", description: err.message || "Failed to update service", variant: "destructive" });
    }
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Services Management</h1>
            <p className="text-muted-foreground">Define services that customers can book via AI chat</p>
          </div>
          <Button onClick={() => loadServices()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Create Service Form */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Service
            </CardTitle>
            <CardDescription>Add a service that your AI receptionist can book</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Service Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Haircut, Massage, Consultation"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={newService.duration_minutes}
                  onChange={(e) => setNewService({ ...newService, duration_minutes: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Brief description of the service"
                value={newService.description}
                onChange={(e) => setNewService({ ...newService, description: e.target.value })}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="buffer_before">Buffer Before (minutes)</Label>
                <Input
                  id="buffer_before"
                  type="number"
                  value={newService.buffer_before_minutes}
                  onChange={(e) => setNewService({ ...newService, buffer_before_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="buffer_after">Buffer After (minutes)</Label>
                <Input
                  id="buffer_after"
                  type="number"
                  value={newService.buffer_after_minutes}
                  onChange={(e) => setNewService({ ...newService, buffer_after_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <Button onClick={createService} disabled={creating}>
              <Plus className="mr-2 h-4 w-4" />
              {creating ? "Creating..." : "Create Service"}
            </Button>
          </CardContent>
        </Card>

        {/* Services List */}
        <div className="space-y-3">
          {services.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No services yet. Create your first service above.</p>
              </CardContent>
            </Card>
          ) : (
            services.map((service) => (
              <Card key={service.id}>
                <CardContent className="flex items-center justify-between p-6">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{service.name}</h3>
                      <Badge variant={service.active ? "default" : "secondary"}>
                        {service.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    {service.description && (
                      <p className="text-sm text-muted-foreground mb-2">{service.description}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Duration: {service.duration_minutes}min • 
                      Buffer: {service.buffer_before_minutes}min before / {service.buffer_after_minutes}min after
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => toggleServiceActive(service.id, service.active)}
                    >
                      {service.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteService(service.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
