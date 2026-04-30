import { useEffect, useState } from "react";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";
import { LeadCaptureForm } from "@/components/widget/LeadCaptureForm";
import { IntentSwitchPrompt } from "@/components/widget/IntentSwitchPrompt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layers3, Minimize2, Sparkles, X } from "lucide-react";
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
  onDismiss: () => void;
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
  onDismiss,
  leadDefaults,
}: Props) {
  const [visible, setVisible] = useState<UISignal | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    setVisible(signal);
    setIsPanelOpen(false);
  }, [signal]);

  if (!visible?.activeComponent) return null;

  const launcherLabel: Record<Exclude<UISignal["activeComponent"], null>, string> = {
    service_selector: "Open Services",
    product_selector: "Open Products",
    date_picker: "Open Calendar",
    time_picker: "Open Time Slots",
    booking_confirmation: "View Booking",
    order_summary: "View Order Summary",
    lead_form: "Open Contact Form",
    switch_confirmation: "Review Topic Switch",
  };

  return (
    <div className="px-4 sm:px-6 pb-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <div className="max-w-[85%] sm:max-w-[75%]">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl border-primary/30 bg-primary/5 backdrop-blur-sm hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow"
          onClick={() => setIsPanelOpen((prev) => !prev)}
          disabled={loading}
        >
          <Layers3 className="h-4 w-4 text-primary" />
          {launcherLabel[visible.activeComponent]}
        </Button>

        {isPanelOpen && (
          <Card className="mt-2 rounded-xl border border-primary/15 bg-background/80 backdrop-blur-md p-3 shadow-md shadow-primary/5 animate-in zoom-in-95 fade-in-0 duration-200">
            <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Interactive Panel
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsPanelOpen(false)}
                  aria-label="Minimize panel"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setIsPanelOpen(false);
                    onDismiss();
                  }}
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {visible.activeComponent === "service_selector" && services.length > 0 && (
              <div className="max-h-[320px] overflow-y-auto pr-1">
                <ServiceSelector services={services} onSelect={onServiceSelect} disabled={loading} />
              </div>
            )}

            {visible.activeComponent === "product_selector" && products.length > 0 && (
              <div className="max-h-[360px] overflow-y-auto pr-1">
                <ProductSelectorEnhanced products={products} onConfirm={onProductsConfirm} disabled={loading} />
              </div>
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
          </Card>
        )}
      </div>
    </div>
  );
}
