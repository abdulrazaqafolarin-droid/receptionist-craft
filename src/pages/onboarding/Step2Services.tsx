import { useState } from "react";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, Plus, Trash2, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

const SERVICE_TEMPLATES = {
  "Dental Clinic": [
    { name: "Dental Cleaning", duration_minutes: 60, description: "Regular teeth cleaning and checkup" },
    { name: "Dental Exam", duration_minutes: 30, description: "Comprehensive dental examination" },
    { name: "Teeth Whitening", duration_minutes: 90, description: "Professional teeth whitening treatment" },
  ],
  "Spa & Wellness": [
    { name: "Swedish Massage", duration_minutes: 60, description: "Relaxing full-body massage" },
    { name: "Facial Treatment", duration_minutes: 60, description: "Deep cleansing facial" },
    { name: "Manicure & Pedicure", duration_minutes: 90, description: "Complete nail care service" },
  ],
  "Barber Shop": [
    { name: "Men's Haircut", duration_minutes: 30, description: "Classic men's haircut and styling" },
    { name: "Beard Trim", duration_minutes: 15, description: "Professional beard trimming and shaping" },
    { name: "Hot Towel Shave", duration_minutes: 30, description: "Traditional hot towel shave" },
  ],
  "Hair Salon": [
    { name: "Women's Cut & Style", duration_minutes: 60, description: "Haircut with wash and styling" },
    { name: "Hair Coloring", duration_minutes: 120, description: "Professional hair coloring service" },
    { name: "Blowout", duration_minutes: 45, description: "Professional hair blowout" },
  ],
  "Gym & Fitness": [
    { name: "Personal Training Session", duration_minutes: 60, description: "One-on-one fitness training" },
    { name: "Group Fitness Class", duration_minutes: 45, description: "Group workout session" },
    { name: "Nutrition Consultation", duration_minutes: 30, description: "Personalized nutrition planning" },
  ],
};

export default function Step2Services() {
  const { receptionist, services, addService, removeService, setServices, setStep, receptionistId } = useOnboardingStore();
  const [showTemplates, setShowTemplates] = useState(true);
  const [newService, setNewService] = useState({
    name: "",
    duration_minutes: 60,
    description: "",
  });
  const [loading, setLoading] = useState(false);

  const templateServices = SERVICE_TEMPLATES[receptionist.business_type as keyof typeof SERVICE_TEMPLATES] || [];

  const handleImportTemplate = () => {
    const servicesWithActive = templateServices.map(s => ({ ...s, active: true }));
    setServices([...services, ...servicesWithActive]);
    toast.success(`${templateServices.length} template services added`);
    setShowTemplates(false);
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
        {showTemplates && templateServices.length > 0 && (
          <div className="p-4 border rounded-lg bg-primary/5">
            <h4 className="font-semibold mb-2">Quick Start: Import Template Services</h4>
            <p className="text-sm text-muted-foreground mb-4">
              We've prepared {templateServices.length} common services for {receptionist.business_type}
            </p>
            <div className="space-y-2 mb-4">
              {templateServices.map((service, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-background rounded">
                  <span className="text-sm font-medium">{service.name}</span>
                  <Badge variant="secondary">
                    <Clock className="h-3 w-3 mr-1" />
                    {service.duration_minutes}min
                  </Badge>
                </div>
              ))}
            </div>
            <Button onClick={handleImportTemplate} variant="default">
              Import All Template Services
            </Button>
          </div>
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
      </CardContent>
    </Card>
  );
}
