import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingBag, DollarSign, Minus, Plus, ShoppingCart, AlertTriangle, Package, XCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  name: string;
  price?: number;
  description?: string;
  stock_quantity?: number | null;
  low_stock_threshold?: number | null;
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
  initialLimit?: number;
}

// Stock status helper
function getStockStatus(product: Product): { status: 'in_stock' | 'low_stock' | 'out_of_stock'; label: string; maxQty: number } {
  const stock = product.stock_quantity;
  const threshold = product.low_stock_threshold ?? 5;
  
  if (stock === null || stock === undefined) {
    return { status: 'in_stock', label: 'In Stock', maxQty: 99 };
  }
  if (stock === 0) {
    return { status: 'out_of_stock', label: 'Out of Stock', maxQty: 0 };
  }
  if (stock <= threshold) {
    return { status: 'low_stock', label: `Only ${stock} left`, maxQty: stock };
  }
  return { status: 'in_stock', label: 'In Stock', maxQty: stock };
}

export function ProductSelectorEnhanced({ products, onConfirm, disabled, initialLimit = 10 }: ProductSelectorEnhancedProps) {
  const [selectedProducts, setSelectedProducts] = useState<Map<string, SelectedProduct>>(new Map());
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayedProducts = showAll ? products : products.slice(0, initialLimit);
  const hasMore = products.length > initialLimit;
  const remainingCount = products.length - initialLimit;

  const toggleProductSelection = (product: Product) => {
    if (disabled) return;
    
    const stockInfo = getStockStatus(product);
    if (stockInfo.status === 'out_of_stock') return;
    
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

  const updateQuantity = (productId: string, product: Product, delta: number) => {
    const newSelected = new Map(selectedProducts);
    const item = newSelected.get(productId);
    const stockInfo = getStockStatus(product);
    
    if (item) {
      const newQuantity = Math.max(1, Math.min(stockInfo.maxQty, item.quantity + delta));
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
    <div className="space-y-2 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="text-xs text-muted-foreground font-medium mb-2">Select product(s) and quantity:</p>
      
      {displayedProducts.map((product, idx) => {
        const isSelected = selectedProducts.has(product.id);
        const selectedItem = selectedProducts.get(product.id);
        const stockInfo = getStockStatus(product);
        const isOutOfStock = stockInfo.status === 'out_of_stock';
        
        return (
          <Card
            key={product.id}
            className={cn(
              "p-3 transition-all duration-200",
              disabled || isOutOfStock ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
              isSelected ? "border-primary ring-1 ring-primary/20 bg-primary/5" : "hover:border-primary/50 hover:shadow-md",
              isOutOfStock && "bg-muted/50"
            )}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex items-start gap-3">
              {/* Checkbox */}
              <div 
                className="pt-0.5"
                onClick={() => !isOutOfStock && toggleProductSelection(product)}
              >
                {isOutOfStock ? (
                  <div className="h-5 w-5 rounded-sm border border-muted-foreground/30 flex items-center justify-center">
                    <XCircle className="h-3 w-3 text-muted-foreground" />
                  </div>
                ) : (
                  <Checkbox 
                    checked={isSelected}
                    disabled={disabled}
                    className="h-5 w-5"
                  />
                )}
              </div>

              {/* Product Info */}
              <div 
                className="flex-1 min-w-0"
                onClick={() => !isOutOfStock && toggleProductSelection(product)}
              >
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    isOutOfStock ? "bg-muted" : "bg-primary/10"
                  )}>
                    {isOutOfStock ? (
                      <Package className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ShoppingBag className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={cn(
                      "font-medium text-sm truncate",
                      isOutOfStock && "text-muted-foreground"
                    )}>{product.name}</h4>
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                    )}
                    {/* Stock status badge */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {stockInfo.status === 'low_stock' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                          {stockInfo.label}
                        </Badge>
                      )}
                      {stockInfo.status === 'out_of_stock' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                          Out of Stock
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Badge */}
              {product.price !== null && product.price !== undefined && (
                <Badge variant={isOutOfStock ? "secondary" : "outline"} className={cn(
                  "flex items-center gap-1 shrink-0",
                  !isOutOfStock && "text-primary border-primary/30"
                )}>
                  <DollarSign className="h-3 w-3" />
                  {product.price.toFixed(0)}
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
                    onClick={() => updateQuantity(product.id, product, -1)}
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
                    onClick={() => updateQuantity(product.id, product, 1)}
                    disabled={disabled || (selectedItem?.quantity || 1) >= stockInfo.maxQty}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {/* Show More / Show Less Button */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-primary mt-2"
          onClick={() => setShowAll(!showAll)}
          disabled={disabled}
        >
          {showAll ? (
            <>
              Show Less
              <ChevronDown className="h-4 w-4 ml-1 rotate-180" />
            </>
          ) : (
            <>
              Show More ({remainingCount} more)
              <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      )}

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