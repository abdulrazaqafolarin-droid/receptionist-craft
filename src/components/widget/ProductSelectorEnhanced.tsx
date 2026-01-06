import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingBag, DollarSign, Minus, Plus, Check, ShoppingCart } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price?: number;
  description?: string;
}

interface SelectedProduct {
  productId: string;
  productName: string;
  quantity: number;
  price?: number;
}

interface ProductSelectorEnhancedProps {
  products: Product[];
  onConfirm: (selectedProducts: SelectedProduct[]) => void;
  disabled?: boolean;
}

export function ProductSelectorEnhanced({ products, onConfirm, disabled }: ProductSelectorEnhancedProps) {
  const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct>>(new Map());
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const toggleProductSelection = (product: Product) => {
    if (disabled) return;
    
    const newSelected = new Map(selectedProducts);
    
    if (newSelected.has(product.id)) {
      newSelected.delete(product.id);
      if (expandedProductId === product.id) {
        setExpandedProductId(null);
      }
    } else {
      newSelected.set(product.id, {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        price: product.price
      });
      setExpandedProductId(product.id);
    }
    
    setSelectedProducts(newSelected);
  };

  const updateQuantity = (productId: string, delta: number) => {
    const newSelected = new Map(selectedProducts);
    const item = newSelected.get(productId);
    if (item) {
      const newQuantity = Math.max(1, item.quantity + delta);
      newSelected.set(productId, { ...item, quantity: newQuantity });
      setSelectedProducts(newSelected);
    }
  };

  const handleConfirm = () => {
    if (selectedProducts.size === 0) return;
    onConfirm(Array.from(selectedProducts.values()));
  };

  const totalItems = Array.from(selectedProducts.values()).reduce((sum, p) => sum + p.quantity, 0);
  const totalPrice = Array.from(selectedProducts.values()).reduce((sum, p) => sum + (p.price || 0) * p.quantity, 0);

  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-muted-foreground mb-2">Select product(s) and quantity:</p>
      
      {products.map((product) => {
        const isSelected = selectedProducts.has(product.id);
        const selectedItem = selectedProducts.get(product.id);
        const isExpanded = expandedProductId === product.id && isSelected;
        
        return (
          <Card
            key={product.id}
            className={`p-3 transition-all ${
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
            } ${isSelected ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "hover:border-primary/50"}`}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div 
                className="pt-0.5"
                onClick={() => toggleProductSelection(product)}
              >
                <Checkbox 
                  checked={isSelected}
                  disabled={disabled}
                  className="h-5 w-5"
                />
              </div>

              {/* Product Info */}
              <div 
                className="flex-1 min-w-0"
                onClick={() => toggleProductSelection(product)}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{product.name}</h4>
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Price Badge */}
              {product.price !== null && product.price !== undefined && (
                <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                  <DollarSign className="h-3 w-3" />
                  {product.price.toFixed(2)}
                </Badge>
              )}

              {/* Quantity Controls - Show when selected */}
              {isSelected && (
                <div 
                  className="flex items-center gap-1 bg-background border rounded-lg px-1 py-0.5 shrink-0 animate-in slide-in-from-right-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => updateQuantity(product.id, -1)}
                    disabled={disabled || (selectedItem?.quantity || 1) <= 1}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">
                    {selectedItem?.quantity || 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => updateQuantity(product.id, 1)}
                    disabled={disabled}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {/* Confirm Selection Button */}
      {selectedProducts.size > 0 && (
        <div className="pt-2 animate-in slide-in-from-bottom-2">
          <Button 
            onClick={handleConfirm}
            disabled={disabled}
            className="w-full gap-2"
          >
            <ShoppingCart className="h-4 w-4" />
            Confirm Selection
            <Badge variant="secondary" className="ml-1 bg-primary-foreground/20">
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {totalPrice > 0 && ` • $${totalPrice.toFixed(2)}`}
            </Badge>
          </Button>
        </div>
      )}
    </div>
  );
}
