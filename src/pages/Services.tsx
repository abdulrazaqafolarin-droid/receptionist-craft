import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Package, Clock, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SERVICE_TEMPLATES } from "@/data/serviceTemplates";
import { ServiceTemplateCard } from "@/components/services/ServiceTemplateCard";
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
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Service | null>(null);
  const { toast } = useToast();

  const [newService, setNewService] = useState({
    name: "",
    description: "",
    duration_minutes: 30,
    buffer_before_minutes: 5,
    buffer_after_minutes: 5,
  });

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedReceptionist) {
      loadServices();
    }
  }, [selectedReceptionist]);

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

  async function loadServices() {
    if (!selectedReceptionist) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("receptionist_id", selectedReceptionist)
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
    if (!selectedReceptionist) {
      toast({ title: "Error", description: "Please select a receptionist first", variant: "destructive" });
      return;
    }
    
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
        receptionist_id: selectedReceptionist,
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

  async function deleteService(service: Service) {
    setDeleting(service.id);
    try {
      const { error } = await supabase.from("services").delete().eq("id", service.id);
      if (error) throw error;

      toast({ title: "Success", description: "Service deleted" });
      loadServices();
    } catch (err: any) {
      console.error("deleteService error", err);
      toast({ title: "Error", description: err.message || "Failed to delete service", variant: "destructive" });
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
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

  const handleImportTemplate = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    setShowImportDialog(true);
  };

  const confirmImportTemplate = async () => {
    if (!selectedTemplate || !selectedReceptionist) return;

    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const template = SERVICE_TEMPLATES[selectedTemplate];
      const servicesToInsert = template.services.map(service => ({
        user_id: user.id,
        receptionist_id: selectedReceptionist,
        name: service.name,
        description: service.description,
        duration_minutes: service.duration_minutes,
        buffer_before_minutes: 5,
        buffer_after_minutes: 5,
        active: true,
      }));

      const { error } = await supabase.from("services").insert(servicesToInsert);
      if (error) throw error;

      toast({ 
        title: "Success", 
        description: `Successfully imported ${template.services.length} services from ${template.name}` 
      });
      
      loadServices();
      setShowImportDialog(false);
      setSelectedTemplate(null);
    } catch (err: any) {
      console.error("importTemplate error", err);
      toast({ 
        title: "Error", 
        description: err.message || "Failed to import services", 
        variant: "destructive" 
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-4 lg:p-8 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Services Management</h1>
              <p className="text-muted-foreground">Define services that customers can book via AI chat</p>
            </div>
          </div>
          <Button onClick={() => loadServices()} disabled={loading} variant="outline" className="h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Receptionist Selector */}
        {receptionists.length > 0 && (
          <Card className="mb-6 border-2 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Select Receptionist</CardTitle>
              <CardDescription>Manage services for a specific receptionist</CardDescription>
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
          <Card className="mb-6 border-2 border-border/50">
            <CardContent className="py-16 text-center">
              <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Package className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Create a receptionist first</h3>
              <p className="text-muted-foreground mb-6">You need to create a receptionist before managing services.</p>
              <Button onClick={() => window.location.href = '/onboarding'}>
                Create Receptionist
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedReceptionist && (
          <>
            {/* Template Import Section */}
            <Card className="mb-6 border-2 border-border/50">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-secondary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Import Service Templates</CardTitle>
                      <CardDescription>
                        Quickly add pre-built service packages for your business
                      </CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="h-11"
                  >
                    {showTemplates ? "Hide Templates" : "Show Templates"}
                  </Button>
                </div>
              </CardHeader>
              {showTemplates && (
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.values(SERVICE_TEMPLATES).map((template) => (
                      <ServiceTemplateCard
                        key={template.key}
                        template={template}
                        onImport={() => handleImportTemplate(template.key)}
                        disabled={importing}
                      />
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Create Service Form */}
            <Card className="mb-6 border-2 border-border/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Create New Service</CardTitle>
                    <CardDescription>Add a service that your AI receptionist can book</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="name">Service Name *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Haircut, Massage, Consultation"
                      value={newService.name}
                      onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={newService.duration_minutes}
                      onChange={(e) => setNewService({ ...newService, duration_minutes: parseInt(e.target.value) || 30 })}
                      className="h-11"
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
                    className="h-11"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="buffer_before">Buffer Before (minutes)</Label>
                    <Input
                      id="buffer_before"
                      type="number"
                      value={newService.buffer_before_minutes}
                      onChange={(e) => setNewService({ ...newService, buffer_before_minutes: parseInt(e.target.value) || 0 })}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="buffer_after">Buffer After (minutes)</Label>
                    <Input
                      id="buffer_after"
                      type="number"
                      value={newService.buffer_after_minutes}
                      onChange={(e) => setNewService({ ...newService, buffer_after_minutes: parseInt(e.target.value) || 0 })}
                      className="h-11"
                    />
                  </div>
                </div>

                <Button onClick={createService} disabled={creating} className="h-11">
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? "Creating..." : "Create Service"}
                </Button>
              </CardContent>
            </Card>

            {/* Services List */}
            <div className="space-y-4">
              {services.length === 0 ? (
                <Card className="border-2 border-border/50">
                  <CardContent className="py-16 text-center">
                    <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <Package className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No services yet. Create your first service above.</p>
                  </CardContent>
                </Card>
              ) : (
                services.map((service) => (
                  <Card key={service.id} className="border-2 border-border/50 hover:border-primary/20 hover:shadow-lg transition-all">
                    <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{service.name}</h3>
                          <Badge variant={service.active ? "default" : "secondary"}>
                            {service.active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        {service.description && (
                          <p className="text-sm text-muted-foreground mb-2">{service.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Duration: {service.duration_minutes}min</span>
                          <span className="text-border">•</span>
                          <span>Buffer: {service.buffer_before_minutes}min / {service.buffer_after_minutes}min</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => toggleServiceActive(service.id, service.active)}
                          className="h-10"
                        >
                          {service.active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setDeleteConfirm(service)}
                          disabled={deleting === service.id}
                          className="h-10 w-10"
                        >
                          {deleting === service.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Import Confirmation Dialog */}
            <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
              <AlertDialogContent className="border-2">
                <AlertDialogHeader>
                  <AlertDialogTitle>Import Template Services?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selectedTemplate && (
                      <>
                        This will import <strong>{SERVICE_TEMPLATES[selectedTemplate].services.length} services</strong> from the{" "}
                        <strong>{SERVICE_TEMPLATES[selectedTemplate].name}</strong> template to your receptionist.
                        <div className="mt-4 p-4 bg-muted/50 rounded-xl max-h-60 overflow-y-auto space-y-2">
                          {SERVICE_TEMPLATES[selectedTemplate].services.map((service, idx) => (
                            <div key={idx} className="text-sm">
                              <div className="font-medium text-foreground">{service.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {service.duration_minutes} minutes - {service.description}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmImportTemplate} disabled={importing}>
                    {importing ? "Importing..." : "Import Services"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
              <AlertDialogContent className="border-2">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Service?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
                    This action cannot be undone. Existing appointments using this service will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={!!deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => deleteConfirm && deleteService(deleteConfirm)} 
                    disabled={!!deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete Service"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </>
  );
}
