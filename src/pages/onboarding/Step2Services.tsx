import { useState } from "react";
import { useOnboardingStore, ItemType } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ArrowRight, Plus, Trash2, Clock, Package, ShoppingBag, DollarSign, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_TEMPLATES, getServiceTemplates, getProductTemplates } from "@/data/serviceTemplates";
import { ServiceTemplateCard } from "@/components/services/ServiceTemplateCard";
import { AIServiceParser } from "@/components/onboarding/AIServiceParser";
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
  const { receptionist, services, addService, removeService, setServices, setStep, receptionistId, setReceptionist } = useOnboardingStore();
  const [showTemplates, setShowTemplates] = useState(true);
  const [newItem, setNewItem] = useState({
    name: "",
    duration_minutes: 60,
    description: "",
    type: "service" as ItemType,
    price: 0,
  });
  const [loading, setLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'services' | 'products'>(
    receptionist.business_model === 'products' ? 'products' : 'services'
  );

  const serviceTemplates = getServiceTemplates();
  const productTemplates = getProductTemplates();

  const servicesCount = services.filter(s => s.type === 'service').length;
  const productsCount = services.filter(s => s.type === 'product').length;

  const handleImportTemplate = (templateKey: string) => {
    const template = SERVICE_TEMPLATES[templateKey];
    if (!template) return;
    
    setSelectedTemplate(templateKey);
    setShowImportDialog(true);
  };

  const confirmImportTemplate = () => {
    if (!selectedTemplate) return;
    
    const template = SERVICE_TEMPLATES[selectedTemplate];
    const itemsWithActive = template.services.map(s => ({ 
      ...s, 
      active: true,
      type: s.type || 'service' as ItemType,
    }));
    setServices([...services, ...itemsWithActive]);
    toast.success(`Successfully imported ${template.services.length} items from ${template.name}`);
    setShowImportDialog(false);
    setSelectedTemplate(null);
  };

  const handleAddCustomItem = () => {
    const isProduct = newItem.type === 'product';
    
    if (!newItem.name) {
      toast.error(`Please enter a valid ${isProduct ? 'product' : 'service'} name`);
      return;
    }
    
    if (!isProduct && newItem.duration_minutes <= 0) {
      toast.error("Please enter a valid duration for the service");
      return;
    }

    addService({ 
      ...newItem, 
      active: true,
      duration_minutes: isProduct ? 0 : newItem.duration_minutes,
    });
    setNewItem({ name: "", duration_minutes: 60, description: "", type: activeTab === 'products' ? 'product' : 'service', price: 0 });
    toast.success(`${isProduct ? 'Product' : 'Service'} added`);
  };

  const handleContinue = async () => {
    if (services.length === 0) {
      toast.error("Please add at least one service or product");
      return;
    }

    // Update business model based on what was added
    const hasServices = services.some(s => s.type === 'service');
    const hasProducts = services.some(s => s.type === 'product');
    const businessModel = hasServices && hasProducts ? 'both' : hasProducts ? 'products' : 'services';
    setReceptionist({ business_model: businessModel });

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

      toast.success("Services & products saved successfully!");
      setStep(3);
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'services' | 'products');
    setNewItem(prev => ({ 
      ...prev, 
      type: value === 'products' ? 'product' : 'service',
      duration_minutes: value === 'products' ? 0 : 60,
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Add Your Services & Products
        </CardTitle>
        <CardDescription>
          Import from templates or create custom services and products for your business
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* AI Quick Add - Always visible at top */}
        <AIServiceParser
          businessType={receptionist.business_type}
          onAddItems={(items) => {
            items.forEach((item) => addService(item));
          }}
          disabled={loading}
        />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or add manually</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="services" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Services {servicesCount > 0 && `(${servicesCount})`}
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Products {productsCount > 0 && `(${productsCount})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="space-y-6 mt-4">
            {/* Service Templates */}
            {showTemplates && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Service Templates
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quick-start with pre-built service packages
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
                    Hide
                  </Button>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {serviceTemplates.map((template) => (
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

            {/* Add Custom Service */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold">Add Custom Service</h4>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="service_name">Service Name</Label>
                  <Input
                    id="service_name"
                    placeholder="e.g., Haircut & Style"
                    value={newItem.type === 'service' ? newItem.name : ''}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value, type: 'service' })}
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="60"
                    value={newItem.type === 'service' ? newItem.duration_minutes : 60}
                    onChange={(e) =>
                      setNewItem({ ...newItem, duration_minutes: parseInt(e.target.value) || 0, type: 'service' })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="service_description">Description (Optional)</Label>
                  <Textarea
                    id="service_description"
                    placeholder="Brief description of the service"
                    value={newItem.type === 'service' ? newItem.description : ''}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value, type: 'service' })}
                    rows={2}
                  />
                </div>
                <Button onClick={handleAddCustomItem} variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Service
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6 mt-4">
            {/* Product Templates */}
            {showTemplates && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <ShoppingBag className="h-5 w-5" />
                      Product Templates
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quick-start with pre-built product catalogs
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
                    Hide
                  </Button>
                </div>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {productTemplates.map((template) => (
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
                <ShoppingBag className="mr-2 h-4 w-4" />
                Show Product Templates
              </Button>
            )}

            {/* Add Custom Product */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h4 className="font-semibold">Add Custom Product</h4>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="product_name">Product Name</Label>
                  <Input
                    id="product_name"
                    placeholder="e.g., Premium T-Shirt"
                    value={newItem.type === 'product' ? newItem.name : ''}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value, type: 'product' })}
                  />
                </div>
                <div>
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="29.99"
                    value={newItem.type === 'product' ? newItem.price : 0}
                    onChange={(e) =>
                      setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0, type: 'product' })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="product_description">Description (Optional)</Label>
                  <Textarea
                    id="product_description"
                    placeholder="Brief description of the product"
                    value={newItem.type === 'product' ? newItem.description : ''}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value, type: 'product' })}
                    rows={2}
                  />
                </div>
                <Button onClick={handleAddCustomItem} variant="outline" className="w-full">
                  <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Current Items List */}
        {services.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold">Your Items ({services.length})</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {services.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {item.type === 'product' ? (
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{item.name}</span>
                      <Badge variant={item.type === 'product' ? 'secondary' : 'outline'} className="text-xs">
                        {item.type === 'product' ? 'Product' : 'Service'}
                      </Badge>
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground ml-6">{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.type === 'product' && item.price ? (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {item.price}
                      </Badge>
                    ) : item.type === 'service' ? (
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {item.duration_minutes}m
                      </Badge>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => removeService(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <AlertDialogTitle>Import Template?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedTemplate && (
                  <>
                    This will import <strong>{SERVICE_TEMPLATES[selectedTemplate].services.length} items</strong> from the{" "}
                    <strong>{SERVICE_TEMPLATES[selectedTemplate].name}</strong> template.
                    <div className="mt-4 p-3 bg-muted rounded-md space-y-1 max-h-48 overflow-y-auto">
                      {SERVICE_TEMPLATES[selectedTemplate].services.map((item, idx) => (
                        <div key={idx} className="text-sm flex items-center gap-2">
                          {item.type === 'product' ? (
                            <>
                              <ShoppingBag className="h-3 w-3" />
                              {item.name} {item.price && `($${item.price})`}
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" />
                              {item.name} ({item.duration_minutes}min)
                            </>
                          )}
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
                Import Items
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
