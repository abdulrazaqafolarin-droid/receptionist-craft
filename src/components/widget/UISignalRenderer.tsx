import { useEffect, useState } from "react";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";

export type IntentType =
  | "browsing"
  | "service_enquiry"
  | "product_enquiry"
  | "booking"
  | "ordering"
  | "pricing"
  | "availability"
  | "booking_modification"
  | "support"
  | "lead_capture"
  | "confirmation"
  | "closing";

export type UIComponentType =
  | "service_selector"
  | "product_selector"
  | "date_picker"
  | "time_picker"
  | "booking_confirmation"
  | "order_summary"
  | "lead_form"
  | "switch_confirmation"
  | null;

export interface UISignal {
  version: "1.0";
  intent: IntentType;
  activeComponent: UIComponentType;
  componentData: Record<string, any>;
  dismissPrevious: boolean;
  reason: "intent_switch" | "step_progression" | "task_complete" | "user_cancel" | "no_ui_needed";
  flow: {
    activeFlow: "booking" | "ordering" | "support" | null;
    step: string | null;
    blocking: boolean;
  };
  conversationCanContinue: boolean;
}

interface Props {
  signal: UISignal | null;
  services: any[];
  products: any[];
  loading: boolean;
  onServiceSelect: (serviceId: string, serviceName: string) => void;
  onProductsConfirm: (selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void;
  onDateSelect: (date: Date) => void;
  onTimeSlotSelect: (slot: any) => void;
}

export function UISignalRenderer({
  signal,
  services,
  products,
  loading,
  onServiceSelect,
  onProductsConfirm,
  onDateSelect,
  onTimeSlotSelect,
}: Props) {
  const [visible, setVisible] = useState<UISignal | null>(null);

  useEffect(() => {
    setVisible(signal);
  }, [signal]);

  if (!visible?.activeComponent) return null;

  return (
    <div className="px-4 sm:px-6 pb-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      {visible.activeComponent === "service_selector" && services.length > 0 && (
        <ServiceSelector services={services} onSelect={onServiceSelect} disabled={loading} />
      )}

      {visible.activeComponent === "product_selector" && products.length > 0 && (
        <ProductSelectorEnhanced products={products} onConfirm={onProductsConfirm} disabled={loading} />
      )}

      {visible.activeComponent === "date_picker" && (
        <DateSelector onSelect={onDateSelect} disabled={loading} minDate={new Date()} />
      )}

      {visible.activeComponent === "time_picker" && (
        <TimeSlotSelector
          slots={visible.componentData?.slots || []}
          onSelect={onTimeSlotSelect}
          disabled={loading}
          showMore={false}
        />
      )}

      {visible.activeComponent === "booking_confirmation" && visible.componentData && (
        <BookingConfirmation {...visible.componentData} />
      )}

      {visible.activeComponent === "order_summary" && visible.componentData && (
        <OrderConfirmation {...visible.componentData} />
      )}
    </div>
  );
}
