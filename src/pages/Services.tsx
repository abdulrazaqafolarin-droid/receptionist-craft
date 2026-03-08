import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, Package, Clock, ShoppingBag, DollarSign, Edit2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FloatingBackground } from "@/components/FloatingBackground";
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

interface ServiceOrProduct {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  active: boolean;
  receptionist_id: string | null;
  price: number | null;
  is_product: boolean;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
}

export default function Services() {
  const [items, setItems] = useState<ServiceOrProduct[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ServiceOrProduct | null>(null);
  const [activeTab, setActiveTab] = useState<'services' | 'products'>('services');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ServiceOrProduct>>({});
  const { toast } = useToast();

  const [newItem, setNewItem] = useState({
    name: "",
    description: "",
    duration_minutes: 30,
    buffer_before_minutes: 5,
    buffer_after_minutes: 5,
    price: 0,
    stock_quantity: null as number | null,
  });

  // Separate services and products
  const services = items.filter(item => !item.is_product);
  const products = items.filter(item => item.is_product);

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedReceptionist) {
      loadItems();
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

  async function loadItems() {
    if (!selectedReceptionist) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("receptionist_id", selectedReceptionist)
        .order("name");

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error("loadItems error", err);
      toast({ title: "Error", description: "Failed to load items", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function createItem() {
    if (!selectedReceptionist) {
      toast({ title: "Error", description: "Please select a receptionist first", variant: "destructive" });
      return;
    }
    
    if (!newItem.name.trim()) {
      toast({ title: "Error", description: `${activeTab === 'services' ? 'Service' : 'Product'} name is required`, variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("services").insert({
        user_id: user.id,
        receptionist_id: selectedReceptionist,
        name: newItem.name.trim(),
        description: newItem.description.trim() || null,
        duration_minutes: activeTab === 'services' ? newItem.duration_minutes : 0,
        buffer_before_minutes: activeTab === 'services' ? newItem.buffer_before_minutes : 0,
        buffer_after_minutes: activeTab === 'services' ? newItem.buffer_after_minutes : 0,
        price: newItem.price || null,
        is_product: activeTab === 'products',
        stock_quantity: activeTab === 'products' ? newItem.stock_quantity : null,
        active: true,
      });

      if (error) throw error;

      toast({ title: "Success", description: `${activeTab === 'services' ? 'Service' : 'Product'} created successfully` });
      setNewItem({
        name: "",
        description: "",
        duration_minutes: 30,
        buffer_before_minutes: 5,
        buffer_after_minutes: 5,
        price: 0,
        stock_quantity: null,
      });
      loadItems();
    } catch (err: any) {
      console.error("createItem error", err);
      toast({ title: "Error", description: err.message || "Failed to create item", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function updateItem(id: string) {
    try {
      const { error } = await supabase
        .from("services")
        .update({
          name: editForm.name,
          description: editForm.description,
          duration_minutes: editForm.duration_minutes,
          price: editForm.price,
          stock_quantity: editForm.stock_quantity,
        })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Item updated successfully" });
      setEditingItem(null);
      setEditForm({});
      loadItems();
    } catch (err: any) {
      console.error("updateItem error", err);
      toast({ title: "Error", description: err.message || "Failed to update item", variant: "destructive" });
    }
  }

  async function deleteItem(item: ServiceOrProduct) {
    setDeleting(item.id);
    try {
      const { error } = await supabase.from("services").delete().eq("id", item.id);
      if (error) throw error;

      toast({ title: "Success", description: `${item.duration_minutes > 0 ? 'Service' : 'Product'} deleted` });
      loadItems();
    } catch (err: any) {
      console.error("deleteItem error", err);
      toast({ title: "Error", description: err.message || "Failed to delete item", variant: "destructive" });
    } finally {
      setDeleting(null);
      setDeleteConfirm(null);
    }
  }

  async function toggleItemActive(id: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from("services")
        .update({ active: !currentActive })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: `Item ${!currentActive ? "activated" : "deactivated"}` });
      loadItems();
    } catch (err: any) {
      console.error("toggleItemActive error", err);
      toast({ title: "Error", description: err.message || "Failed to update item", variant: "destructive" });
    }
  }

  const startEditing = (item: ServiceOrProduct) => {
    setEditingItem(item.id);
    setEditForm({
      name: item.name,
      description: item.description || "",
      duration_minutes: item.duration_minutes,
      price: item.price || 0,
      stock_quantity: item.stock_quantity,
    });
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setEditForm({});
  };

  const renderItemCard = (item: ServiceOrProduct, isService: boolean) => {
    const isEditing = editingItem === item.id;

    return (
      <Card key={item.id} className="border-2 border-border/50 hover:border-primary/20 hover:shadow-lg transition-all">
        <CardContent className="p-6">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="h-10"
                />
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                {isService && (
                  <div>
                    <Label>Duration (minutes)</Label>
                    <Input
                      type="number"
                      value={editForm.duration_minutes || 30}
                      onChange={(e) => setEditForm({ ...editForm, duration_minutes: parseInt(e.target.value) || 30 })}
                      className="h-10"
                    />
                  </div>
                )}
                <div>
                  <Label>Price (₦)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.price || 0}
                    onChange={(e) => setEditForm({ ...editForm, price: parseFloat(e.target.value) || 0 })}
                    className="h-10"
                  />
                </div>
                {!isService && (
                  <div>
                    <Label>Stock Quantity</Label>
                    <Input
                      type="number"
                      placeholder="Leave empty for unlimited"
                      value={editForm.stock_quantity ?? ""}
                      onChange={(e) => setEditForm({ ...editForm, stock_quantity: e.target.value ? parseInt(e.target.value) : null })}
                      className="h-10"
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => updateItem(item.id)} size="sm" className="h-9">
                  <Check className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button onClick={cancelEditing} variant="outline" size="sm" className="h-9">
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{item.name}</h3>
                  <Badge variant={item.active ? "default" : "secondary"}>
                    {item.active ? "Active" : "Inactive"}
                  </Badge>
                  {item.price && item.price > 0 && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {item.price.toFixed(2)}
                    </Badge>
                  )}
                  {/* Stock status for products */}
                  {!isService && item.stock_quantity !== null && (
                    <Badge 
                      variant={item.stock_quantity === 0 ? "destructive" : item.stock_quantity <= (item.low_stock_threshold || 5) ? "secondary" : "outline"}
                      className="flex items-center gap-1"
                    >
                      {item.stock_quantity === 0 ? "Out of Stock" : 
                       item.stock_quantity <= (item.low_stock_threshold || 5) ? `Low: ${item.stock_quantity} left` : 
                       `Stock: ${item.stock_quantity}`}
                    </Badge>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                )}
                {isService && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Duration: {item.duration_minutes}min</span>
                    <span className="text-border">•</span>
                    <span>Buffer: {item.buffer_before_minutes}min / {item.buffer_after_minutes}min</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => startEditing(item)}
                  className="h-10 w-10"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toggleItemActive(item.id, item.active)}
                  className="h-10"
                >
                  {item.active ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setDeleteConfirm(item)}
                  disabled={deleting === item.id}
                  className="h-10 w-10"
                >
                  {deleting === item.id ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-4 lg:p-8 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Products & Services</h1>
              <p className="text-muted-foreground">Manage products and services for your AI receptionist</p>
            </div>
          </div>
          <Button onClick={() => loadItems()} disabled={loading} variant="outline" className="h-11">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Receptionist Selector */}
        {receptionists.length > 0 && (
          <Card className="mb-6 border-2 border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Select Receptionist</CardTitle>
              <CardDescription>Manage services and products for a specific receptionist</CardDescription>
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
              <p className="text-muted-foreground mb-6">You need to create a receptionist before managing services and products.</p>
              <Button onClick={() => window.location.href = '/onboarding'}>
                Create Receptionist
              </Button>
            </CardContent>
          </Card>
        )}

        {selectedReceptionist && (
          <>
            {/* Tabs for Services / Products */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'services' | 'products')} className="mb-6">
              <TabsList className="grid w-full grid-cols-2 h-12">
                <TabsTrigger value="services" className="flex items-center gap-2 h-10">
                  <Clock className="h-4 w-4" />
                  Services ({services.length})
                </TabsTrigger>
                <TabsTrigger value="products" className="flex items-center gap-2 h-10">
                  <ShoppingBag className="h-4 w-4" />
                  Products ({products.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="services" className="space-y-6 mt-6">
                {/* Create Service Form */}
                <Card className="border-2 border-border/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Plus className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Create New Service</CardTitle>
                        <CardDescription>Add a service that customers can book</CardDescription>
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
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={newItem.duration_minutes}
                          onChange={(e) => setNewItem({ ...newItem, duration_minutes: parseInt(e.target.value) || 30 })}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="description">Description (Optional)</Label>
                        <Input
                          id="description"
                          placeholder="Brief description of the service"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="price">Price ($)</Label>
                        <Input
                          id="price"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={newItem.price || ""}
                          onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <Button onClick={createItem} disabled={creating} className="h-11">
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
                          <Clock className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground">No services yet. Create your first service above.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    services.map((service) => renderItemCard(service, true))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="products" className="space-y-6 mt-6">
                {/* Create Product Form */}
                <Card className="border-2 border-border/50">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Create New Product</CardTitle>
                        <CardDescription>Add a product that customers can order</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="product-name">Product Name *</Label>
                        <Input
                          id="product-name"
                          placeholder="e.g., Shampoo, Gift Card, Supplement"
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-price">Price ($) *</Label>
                        <Input
                          id="product-price"
                          type="number"
                          step="0.01"
                          placeholder="29.99"
                          value={newItem.price || ""}
                          onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })}
                          className="h-11"
                        />
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="product-description">Description (Optional)</Label>
                        <Input
                          id="product-description"
                          placeholder="Brief description of the product"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="product-stock">Stock Quantity (Optional)</Label>
                        <Input
                          id="product-stock"
                          type="number"
                          placeholder="Leave empty for unlimited"
                          value={newItem.stock_quantity ?? ""}
                          onChange={(e) => setNewItem({ ...newItem, stock_quantity: e.target.value ? parseInt(e.target.value) : null })}
                          className="h-11"
                        />
                        <p className="text-xs text-muted-foreground">Leave empty if you don't track inventory</p>
                      </div>
                    </div>

                    <Button onClick={createItem} disabled={creating} className="h-11">
                      <Plus className="mr-2 h-4 w-4" />
                      {creating ? "Creating..." : "Create Product"}
                    </Button>
                  </CardContent>
                </Card>

                {/* Products List */}
                <div className="space-y-4">
                  {products.length === 0 ? (
                    <Card className="border-2 border-border/50">
                      <CardContent className="py-16 text-center">
                        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-muted-foreground">No products yet. Create your first product above.</p>
                      </CardContent>
                    </Card>
                  ) : (
                    products.map((product) => renderItemCard(product, false))
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
              <AlertDialogContent className="border-2">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {deleteConfirm?.duration_minutes ? 'Service' : 'Product'}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={!!deleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => deleteConfirm && deleteItem(deleteConfirm)} 
                    disabled={!!deleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
