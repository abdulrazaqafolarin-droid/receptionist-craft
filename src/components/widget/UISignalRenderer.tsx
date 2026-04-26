import { useEffect, useState } from "react";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";
import { LeadCaptureForm } from "@/components/widget/LeadCaptureForm";
import { IntentSwitchPrompt } from "@/components/widget/IntentSwitchPrompt";
import type { UISignal } from "@/shared/uiSignal";

interface Props {
  signal: UISignal | null;
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>;
  products: Array<{ id: string; name: string; price?: number }>;
  loading: boolean;
  onServiceSelect: (serviceId: string, serviceName: string) => void;
  onProductsConfirm: (selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void;
  onDateSelect: (date: Date) => void;
  onTimeSlotSelect: (slot: unknown) => void;
  onLeadSubmit: (payload: { name: string; contact: string }) => void;
  onSwitchDecision: (decision: "continue" | "switch") => void;
  leadDefaults?: { name?: string; contact?: string };
}

type TimeSlotItem = {
  start?: string;
  startTime?: string;
  end?: string;
  endTime?: string;
  display?: string;
};

export function UISignalRenderer({
  signal,
  services,
  products,
  loading,
  onServiceSelect,
  onProductsConfirm,
  onDateSelect,
  onTimeSlotSelect,
  onLeadSubmit,
  onSwitchDecision,
  leadDefaults,
}: Props) {
  const [visible, setVisible] = useState<UISignal | null>(null);

  useEffect(() => {
    setVisible(signal);
  }, [signal]);

  if (!visible?.activeComponent) return null;

  return (
    <div className="px-4 sm:px-6 pb-3">
      <div className="max-w-[85%] sm:max-w-[75%] animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
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
            slots={Array.isArray(visible.componentData?.slots) ? (visible.componentData.slots as TimeSlotItem[]) : []}
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

        {visible.activeComponent === "lead_form" && (
          <LeadCaptureForm
            initialName={leadDefaults?.name}
            initialContact={leadDefaults?.contact}
            disabled={loading}
            onSubmit={onLeadSubmit}
          />
        )}

        {visible.activeComponent === "switch_confirmation" && (
          <IntentSwitchPrompt
            prompt={typeof visible.componentData?.prompt === "string" ? visible.componentData.prompt : undefined}
            disabled={loading}
            onDecide={onSwitchDecision}
          />
        )}
      </div>
    </div>
  );
}
