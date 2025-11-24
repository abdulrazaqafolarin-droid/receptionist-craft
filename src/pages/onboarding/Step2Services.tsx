import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Plus, Trash2, Clock, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_TEMPLATES, getTemplateByBusinessType } from "@/data/serviceTemplates";
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

export default function Step2Services() {
  const { receptionist, services, addService, removeService, setServices, setStep, receptionistId } = useOnboardingStore();
  const [showTemplates, setShowTemplates] = useState(true);
  const [newService, setNewService] = useState({
    name: "",
    duration_minutes: 60,
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const handleImportTemplate = (templateKey: string) => {
    const template = SERVICE_TEMPLATES[templateKey];
    if (!template) return;
    
    setSelectedTemplate(templateKey);
    setShowImportDialog(true);
  };

  const confirmImportTemplate = () => {
    if (!selectedTemplate) return;
    
    const template = SERVICE_TEMPLATES[selectedTemplate];
    const servicesWithActive = template.services.map(s => ({ ...s, active: true }));
    setServices([...services, ...servicesWithActive]);
    toast.success(`Successfully imported ${template.services.length} services from ${template.name}`);
    setShowImportDialog(false);
    setSelectedTemplate(null);
  };

  const handleAddCustomService = () => {
    if (!newService.name || newService.duration_minutes <= 0) {
      toast.error("Please enter a valid service name and duration");
      return;
    }
    addService({ ...newService, active: true });
    setNewService({ name: "", duration_minutes: 60, description: "" });
    toast.success("Service added");
  };

  const handleContinue = async () => {
    if (services.length === 0) {
      toast.error("Please add at least one service");
      return;
    }

    setLoading(true);
    try {
      const servicesToInsert = services.map((service) => ({
        receptionist_id: receptionistId,
        name: service.name,
        duration_minutes: service.duration_minutes,
        description: service.description || null,
        active: service.active,
      }));

      const { error } = await supabase.from("services").insert(servicesToInsert);
      if (error) throw error;

      toast.success("Services saved successfully!");
      setStep(3);
    } catch (error: any) {
      toast.error(error.message || "Failed to save services");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Your Services</CardTitle>
        <CardDescription>
          Import from templates or create custom services for your business
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template Import */}
        {showTemplates && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Import Ready-Made Templates
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose from pre-built service packages or add your own
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
                Hide Templates
              </Button>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(SERVICE_TEMPLATES).map((template) => (
                <ServiceTemplateCard
                  key={template.key}
                  template={template}
                  onImport={() => handleImportTemplate(template.key)}
                  disabled={loading}
                />
              ))}
            </div>
          </div>
        )}

        {!showTemplates && (
          <Button variant="outline" onClick={() => setShowTemplates(true)} className="w-full">
            <Package className="mr-2 h-4 w-4" />
            Show Service Templates
          </Button>
        )}

        {/* Current Services */}
        {services.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Your Services ({services.length})</h4>
            {services.map((service, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{service.name}</div>
                  {service.description && (
                    <div className="text-xs text-muted-foreground">{service.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    <Clock className="h-3 w-3 mr-1" />
                    {service.duration_minutes}m
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => removeService(idx)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Custom Service */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h4 className="font-semibold">Add Custom Service</h4>
          <div className="space-y-3">
            <div>
              <Label htmlFor="service_name">Service Name</Label>
              <Input
                id="service_name"
                placeholder="e.g., Haircut & Style"
                value={newService.name}
                onChange={(e) => setNewService({ ...newService, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                placeholder="60"
                value={newService.duration_minutes}
                onChange={(e) =>
                  setNewService({ ...newService, duration_minutes: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Brief description of the service"
                value={newService.description}
                onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                rows={2}
              />
            </div>
            <Button onClick={handleAddCustomService} variant="outline" className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Service
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep(1)} size="lg">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button onClick={handleContinue} disabled={loading || services.length === 0} className="flex-1" size="lg">
            {loading ? "Saving..." : "Continue"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>

        {/* Import Confirmation Dialog */}
        <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import Template Services?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedTemplate && (
                  <>
                    This will import <strong>{SERVICE_TEMPLATES[selectedTemplate].services.length} services</strong> from the{" "}
                    <strong>{SERVICE_TEMPLATES[selectedTemplate].name}</strong> template.
                    <div className="mt-4 p-3 bg-muted rounded-md space-y-1">
                      {SERVICE_TEMPLATES[selectedTemplate].services.map((service, idx) => (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {service.name} ({service.duration_minutes}min)
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmImportTemplate}>
                Import Services
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
