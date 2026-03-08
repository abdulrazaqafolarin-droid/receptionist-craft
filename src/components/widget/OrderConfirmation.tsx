import { Card } from "@/components/ui/card";
import { ShoppingBag, User, Phone, Mail, CheckCircle, Hash, MapPin, DollarSign } from "lucide-react";

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
  const displayTotal =
    totalAmount ??
    resolvedProducts.reduce((sum, p) => sum + (p.price ?? 0) * p.quantity, 0);

  return (
    <Card className="p-4 mt-2 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="font-semibold text-sm text-green-800 dark:text-green-200">Order Confirmed!</h4>
            {orderId && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                Order ID: {orderId.slice(0, 8)}
              </p>
            )}
          </div>

          {/* Product line items */}
          <div className="space-y-2 text-sm">
            {resolvedProducts.length > 0 ? (
              resolvedProducts.map((product, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{product.name}</span>
                    <span className="text-muted-foreground flex-shrink-0">×{product.quantity}</span>
                  </div>
                  {product.price != null && product.price > 0 && (
                    <span className="text-muted-foreground flex-shrink-0 whitespace-nowrap">
                      ₦{(product.price * product.quantity).toLocaleString()}
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
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-green-200 dark:border-green-800 font-medium">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>Total</span>
                </div>
                <span>₦{displayTotal.toLocaleString()}</span>
              </div>
            )}

            {/* Customer info */}
            <div className="flex items-center gap-2 pt-1">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{customerName}</span>
            </div>
            {contactInfo && (
              <div className="flex items-center gap-2">
                {isEmail ? (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Phone className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{contactInfo}</span>
              </div>
            )}
            {deliveryAddress && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{deliveryAddress}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            We'll contact you shortly to confirm your order details.
          </p>
        </div>
      </div>
    </Card>
  );
}
