import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, DollarSign } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price?: number;
  description?: string;
}

interface ProductSelectorProps {
  products: Product[];
  onSelect: (productId: string, productName: string) => void;
  disabled?: boolean;
}

export function ProductSelector({ products, onSelect, disabled }: ProductSelectorProps) {
  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-muted-foreground mb-2">Select a product:</p>
      {products.map((product) => (
        <Card
          key={product.id}
          className={`p-3 cursor-pointer transition-all hover:border-primary hover:shadow-md ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => !disabled && onSelect(product.id, product.name)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShoppingBag className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm">{product.name}</h4>
                {product.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                )}
              </div>
            </div>
            {product.price !== null && product.price !== undefined && (
              <Badge variant="secondary" className="ml-2 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {product.price.toFixed(2)}
              </Badge>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}