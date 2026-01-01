import { useState } from "react";
import { useOnboardingStore, ItemType } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ArrowRight, Plus, Trash2, Clock, ShoppingBag, DollarSign, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { AIServiceParser } from "@/components/onboarding/AIServiceParser";

export default function Step2Services() {
  const { receptionist, services, addService, removeService, setStep, receptionistId, setReceptionist } = useOnboardingStore();
  const [newService, setNewService] = useState({
    name: "",
    duration_minutes: 60,
    description: "",
    noTime: false,
    price: 0,
  });
  const [newProduct, setNewProduct] = useState({
    name: "",
    price: 0,
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);

  const servicesCount = services.filter(s => s.type === 'service').length;
  const productsCount = services.filter(s => s.type === 'product').length;

  const handleAddCustomService = () => {
    if (!newService.name.trim()) {
      toast.error("Please enter a valid service name");
      return;
    }
    
    if (!newService.noTime && newService.duration_minutes <= 0) {
      toast.error("Please enter a valid duration for the service");
      return;
    }

    addService({ 
      name: newService.name,
      duration_minutes: newService.noTime ? 0 : newService.duration_minutes,
      description: newService.description,
      type: 'service',
      price: newService.price > 0 ? newService.price : undefined,
      active: true,
    });
    setNewService({ name: "", duration_minutes: 60, description: "", noTime: false, price: 0 });
    setShowServiceForm(false);
    toast.success("Service added");
  };

  const handleAddCustomProduct = () => {
    if (!newProduct.name.trim()) {
      toast.error("Please enter a valid product name");
      return;
    }

    addService({ 
      name: newProduct.name,
      duration_minutes: 0,
      description: newProduct.description,
      type: 'product',
      price: newProduct.price,
      active: true,
    });
    setNewProduct({ name: "", price: 0, description: "" });
    setShowProductForm(false);
    toast.success("Product added");
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
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("You must be logged in to save services");
      }

      const servicesToInsert = services.map((service) => ({
        receptionist_id: receptionistId,
        user_id: user.id,
        name: service.name,
        duration_minutes: service.duration_minutes,
        description: service.description || null,
        price: service.price || null, // Save price to DB
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

  return (
    <Card>
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <Briefcase className="h-5 w-5" />
          Add Your Services & Products
        </CardTitle>
        <CardDescription className="text-sm">
          Use AI to quickly add all your offerings, or add them manually
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-4 sm:px-6">
        {/* AI Quick Add */}
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

        {/* Manual Add Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setShowServiceForm(!showServiceForm);
              setShowProductForm(false);
            }}
            className={`h-auto py-4 flex flex-col items-center gap-2 ${showServiceForm ? 'ring-2 ring-primary' : ''}`}
          >
            <Clock className="h-5 w-5" />
            <span className="font-medium">Add Custom Service</span>
            <span className="text-xs text-muted-foreground">Time-based offerings</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setShowProductForm(!showProductForm);
              setShowServiceForm(false);
            }}
            className={`h-auto py-4 flex flex-col items-center gap-2 ${showProductForm ? 'ring-2 ring-primary' : ''}`}
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="font-medium">Add Custom Product</span>
            <span className="text-xs text-muted-foreground">Physical or digital items</span>
          </Button>
        </div>

        {/* Add Service Form */}
        {showServiceForm && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30 animate-in slide-in-from-top-2">
            <h4 className="font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Add Custom Service
            </h4>
            <div className="space-y-3">
              <div>
                <Label htmlFor="service_name">Service Name *</Label>
                <Input
                  id="service_name"
                  placeholder="e.g., Haircut & Style"
                  value={newService.name}
                  onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="no_time"
                  checked={newService.noTime}
                  onCheckedChange={(checked) => setNewService({ ...newService, noTime: checked })}
                />
                <Label htmlFor="no_time" className="cursor-pointer">No specific duration</Label>
              </div>
              {!newService.noTime && (
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
              )}
              <div>
                <Label htmlFor="service_price">Price ($ - Optional)</Label>
                <Input
                  id="service_price"
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={newService.price}
                  onChange={(e) =>
                    setNewService({ ...newService, price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="service_description">Description (Optional)</Label>
                <Textarea
                  id="service_description"
                  placeholder="Brief description of the service"
                  value={newService.description}
                  onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowServiceForm(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddCustomService} className="flex-1">
                  <Plus className="mr-2 h-4 w-4" /> Add Service
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Add Product Form */}
        {showProductForm && (
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30 animate-in slide-in-from-top-2">
            <h4 className="font-semibold flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Add Custom Product
            </h4>
            <div className="space-y-3">
              <div>
                <Label htmlFor="product_name">Product Name *</Label>
                <Input
                  id="product_name"
                  placeholder="e.g., Premium T-Shirt"
                  value={newProduct.name}
                  onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="29.99"
                  step="0.01"
                  value={newProduct.price}
                  onChange={(e) =>
                    setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label htmlFor="product_description">Description (Optional)</Label>
                <Textarea
                  id="product_description"
                  placeholder="Brief description of the product"
                  value={newProduct.description}
                  onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowProductForm(false)} className="flex-1">
                  Cancel
                </Button>
                <Button onClick={handleAddCustomProduct} className="flex-1">
                  <Plus className="mr-2 h-4 w-4" /> Add Product
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Current Items List */}
        {services.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-semibold flex items-center gap-2">
              Your Items
              <Badge variant="secondary" className="ml-auto">
                {servicesCount > 0 && `${servicesCount} services`}
                {servicesCount > 0 && productsCount > 0 && ', '}
                {productsCount > 0 && `${productsCount} products`}
              </Badge>
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {services.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg bg-background">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.type === 'product' ? (
                        <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-sm sm:text-base truncate">{item.name}</span>
                      <Badge variant={item.type === 'product' ? 'secondary' : 'outline'} className="text-xs shrink-0">
                        {item.type === 'product' ? 'Product' : 'Service'}
                      </Badge>
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground ml-6 truncate">{item.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {/* Duration badge for services */}
                    {item.type === 'service' && (
                      item.duration_minutes === 0 ? (
                        <Badge variant="outline" className="text-xs">
                          No set time
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {item.duration_minutes}m
                        </Badge>
                      )
                    )}
                    {/* Price badge - for both services and products */}
                    {item.price && item.price > 0 ? (
                      <Badge variant="outline" className="flex items-center gap-1 text-xs">
                        <DollarSign className="h-3 w-3" />
                        {item.price}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        No price
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => removeService(idx)} className="h-8 w-8 p-0">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="outline" onClick={() => setStep(1)} size="lg" className="sm:w-auto">
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
