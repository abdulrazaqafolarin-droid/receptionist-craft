import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag, User, Phone, Mail, CheckCircle, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/currency";

interface OrderProduct {
  name: string;
  quantity: number;
  price?: number | null;
}

interface OrderConfirmationProps {
  /** Single product (legacy) */
  productName?: string;
  quantity?: number;
  /** Multi-product array (preferred) */
  products?: OrderProduct[];
  customerName: string;
  contactInfo: string;
  orderId?: string;
  totalAmount?: number;
  deliveryAddress?: string;
  currency?: string;
  onEdit?: () => void;
  onCancel?: () => void;
}

export function OrderConfirmation({
  productName,
  quantity,
  products,
  customerName,
  contactInfo,
  orderId,
  totalAmount,
  deliveryAddress,
  currency,
  onEdit,
  onCancel,
}: OrderConfirmationProps) {
  const isEmail = contactInfo?.includes('@');

  // Normalize to products array — support both legacy single-product and new multi-product
  const resolvedProducts: OrderProduct[] =
    products && products.length > 0
      ? products
      : productName
        ? [{ name: productName, quantity: quantity ?? 1 }]
        : [];

  // Calculate total from items if not provided
  const calculatedTotal = resolvedProducts.reduce(
    (sum, p) => sum + (p.price ?? 0) * p.quantity,
    0
  );
  const displayTotal = totalAmount != null && totalAmount > 0 ? totalAmount : calculatedTotal;

  return (
    <Card className="p-4 mt-2 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 overflow-hidden">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <h4 className="font-semibold text-sm text-green-800 dark:text-green-200">Order Confirmed!</h4>
            {orderId && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Order #{orderId.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>

          {/* Product line items */}
          <div className="space-y-2 text-sm">
            {resolvedProducts.length > 0 ? (
              resolvedProducts.map((product, idx) => (
                <div key={idx} className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="break-words block leading-snug">{product.name}</span>
                      <span className="text-muted-foreground text-xs">Qty: {product.quantity}</span>
                    </div>
                  </div>
                  {product.price != null && product.price > 0 && (
                    <span className="text-muted-foreground flex-shrink-0 whitespace-nowrap font-medium">
                      {formatCurrency(product.price * product.quantity, currency)}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground italic">Order items confirmed</span>
              </div>
            )}

            {/* Total */}
            {displayTotal > 0 && (
              <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-green-200 dark:border-green-800 font-semibold">
                <span>Total</span>
                <span>{formatCurrency(displayTotal, currency)}</span>
              </div>
            )}

            {/* Customer info */}
            <div className="pt-2 mt-1 border-t border-green-200/50 dark:border-green-800/50 space-y-1.5">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="break-words">{customerName}</span>
              </div>
              {contactInfo && (
                <div className="flex items-center gap-2">
                  {isEmail ? (
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="break-words">{contactInfo}</span>
                </div>
              )}
              {deliveryAddress && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="break-words">{deliveryAddress}</span>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            We'll contact you shortly to confirm your order details.
          </p>

          <div className="flex gap-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="flex-1 text-xs"
              >
                Edit Details
              </Button>
            )}
            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
              >
                Cancel Order
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
