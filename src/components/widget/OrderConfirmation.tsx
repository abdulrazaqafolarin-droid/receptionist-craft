import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag, User, Phone, Mail, CheckCircle, Hash } from "lucide-react";

interface OrderConfirmationProps {
  productName: string;
  quantity: number;
  customerName: string;
  contactInfo: string;
  orderId?: string;
}

export function OrderConfirmation({
  productName,
  quantity,
  customerName,
  contactInfo,
  orderId,
}: OrderConfirmationProps) {
  const isEmail = contactInfo.includes('@');

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

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              <span>{productName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span>Quantity: {quantity}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{customerName}</span>
            </div>
            <div className="flex items-center gap-2">
              {isEmail ? (
                <Mail className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Phone className="h-4 w-4 text-muted-foreground" />
              )}
              <span>{contactInfo}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            We'll contact you shortly to confirm your order details.
          </p>
        </div>
      </div>
    </Card>
  );
}