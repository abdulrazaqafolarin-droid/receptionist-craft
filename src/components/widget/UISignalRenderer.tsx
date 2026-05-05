import { useEffect, useState } from "react";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Layers3, Minimize2, Sparkles, X } from "lucide-react";

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
  componentData: Record<string, unknown>;
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
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>;
  products: Array<{ id: string; name: string; price?: number; stock_quantity?: number }>;
  loading: boolean;
  onServiceSelect: (serviceId: string, serviceName: string) => void;
  onProductsConfirm: (selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void;
  onDateSelect: (date: Date) => void;
  onTimeSlotSelect: (slot: { startTime: string; endTime?: string }) => void;
  onDismiss?: () => void;
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
  onDismiss,
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
    switch_confirmation: "Review Prompt",
  };

  const renderActiveComponent = () => {
    if (!visible.activeComponent) return null;
    if (visible.activeComponent === "service_selector") {
      const safeServices = services
        .filter((s) => typeof s.duration_minutes === "number")
        .map((s) => ({ id: s.id, name: s.name, duration_minutes: s.duration_minutes as number, price: s.price ?? null }));
      return safeServices.length > 0 ? <ServiceSelector services={safeServices} onSelect={onServiceSelect} disabled={loading} /> : null;
    }
    if (visible.activeComponent === "product_selector") {
      return products.length > 0 ? <ProductSelectorEnhanced products={products} onConfirm={onProductsConfirm} disabled={loading} /> : null;
    }
    if (visible.activeComponent === "date_picker") {
      return <DateSelector onSelect={onDateSelect} disabled={loading} minDate={new Date()} />;
    }
    if (visible.activeComponent === "time_picker") {
      const slots = Array.isArray(visible.componentData?.slots) ? (visible.componentData.slots as { startTime?: string; start?: string; display?: string; endTime?: string }[]) : [];
      return <TimeSlotSelector slots={slots} onSelect={onTimeSlotSelect} disabled={loading} showMore={false} />;
    }
    if (visible.activeComponent === "booking_confirmation" && visible.componentData) {
      const data = visible.componentData as Record<string, unknown>;
      const customerName = (data.customerName as string | undefined) ?? (data.customer_name as string | undefined) ?? "Guest";
      return <BookingConfirmation {...(data as object)} customerName={customerName} />;
    }
    if (visible.activeComponent === "order_summary" && visible.componentData) {
      const data = visible.componentData as Record<string, unknown>;
      const customerName = (data.customerName as string | undefined) ?? (data.customer_name as string | undefined) ?? "Guest";
      const contactInfo = (data.contactInfo as string | undefined) ?? (data.contact_info as string | undefined) ?? (data.customerEmail as string | undefined) ?? (data.customerPhone as string | undefined) ?? "";
      return <OrderConfirmation {...(data as object)} customerName={customerName} contactInfo={contactInfo} />;
    }
    return null;
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPanelOpen(false)} aria-label="Minimize panel">
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setIsPanelOpen(false); onDismiss?.(); }} aria-label="Close panel">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto pr-1">{renderActiveComponent()}</div>
          </Card>
        )}
      </div>
    </div>
  );
}
