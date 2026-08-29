import { useCallback, useEffect, useRef, useState } from "react";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";
import { LeadForm } from "@/components/widget/LeadForm";
import { SwitchConfirmation } from "@/components/widget/SwitchConfirmation";
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
  moneyModeActive?: boolean;
}

interface Props {
  signal: UISignal | null;
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>;
  products: Array<{ id: string; name: string; price?: number; stock_quantity?: number }>;
  loading: boolean;
  onServiceSelect: (serviceId: string, serviceName: string) => void;
  onProductsConfirm: (selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void;
  onDateSelect: (date: Date) => void;
  onTimeSlotSelect: (slot: { startTime?: string; start?: string; endTime?: string; end?: string; display?: string }) => void;
  onDismiss?: () => void;
  onEditBooking?: () => void;
  onCancelBooking?: () => void;
  onEditOrder?: () => void;
  onCancelOrder?: () => void;
  onLeadFormSubmit?: (data: { name: string; email?: string; phone?: string }) => void;
  onLeadFormSkip?: () => void;
  onSwitchConfirm?: () => void;
  onSwitchCancel?: () => void;
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
  onEditBooking,
  onCancelBooking,
  onEditOrder,
  onCancelOrder,
  onLeadFormSubmit,
  onLeadFormSkip,
  onSwitchConfirm,
  onSwitchCancel,
}: Props) {
  const [visible, setVisible] = useState<UISignal | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const isMounted = useRef(true);
  const processingDismiss = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  // Focus panel content when opening
  useEffect(() => {
    if (isPanelOpen && panelRef.current) {
      const firstFocusable = panelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [isPanelOpen]);

  // Focus launcher when panel closes
  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    setTimeout(() => launcherRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!isMounted.current) return;
    if (signal?.dismissPrevious && !visible?.activeComponent) {
      return;
    }
    setVisible(signal);
    setIsPanelOpen(false);
  }, [signal]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleDismiss = () => {
    if (!isMounted.current) return;
    if (processingDismiss.current) return;
    processingDismiss.current = true;
    closePanel();
    onDismiss?.();
    setTimeout(() => {
      processingDismiss.current = false;
    }, 300);
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePanel();
    }
  };

  if (!visible?.activeComponent && !visible?.moneyModeActive) return null;
  const activeComponent = visible.activeComponent;
  if (!activeComponent && !visible?.moneyModeActive) return null;
  const showMoneyBadge = !!visible?.moneyModeActive;

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
        .map((s) => ({ id: s.id, name: s.name, duration_minutes: typeof s.duration_minutes === "number" ? s.duration_minutes : 0, price: s.price ?? null }));
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
      return <BookingConfirmation {...(data as object)} customerName={customerName} onEdit={onEditBooking} onCancel={onCancelBooking} />;
    }
    if (visible.activeComponent === "order_summary" && visible.componentData) {
      const data = visible.componentData as Record<string, unknown>;
      const customerName = (data.customerName as string | undefined) ?? (data.customer_name as string | undefined) ?? "Guest";
      const contactInfo = (data.contactInfo as string | undefined) ?? (data.contact_info as string | undefined) ?? (data.customerEmail as string | undefined) ?? (data.customerPhone as string | undefined) ?? "";
      return <OrderConfirmation {...(data as object)} customerName={customerName} contactInfo={contactInfo} onEdit={onEditOrder} onCancel={onCancelOrder} />;
    }
    if (visible.activeComponent === "lead_form") {
      return (
        <LeadForm
          onSubmit={(formData) => onLeadFormSubmit?.(formData)}
          onSkip={onLeadFormSkip}
          disabled={loading}
          componentData={visible.componentData as Record<string, unknown>}
        />
      );
    }
    if (visible.activeComponent === "switch_confirmation") {
      return (
        <SwitchConfirmation
          onConfirm={() => onSwitchConfirm?.()}
          onCancel={() => onSwitchCancel?.()}
          disabled={loading}
          componentData={visible.componentData as Record<string, unknown>}
        />
      );
    }
    return null;
  };

  return (
    <div className="px-4 sm:px-6 pb-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <div className="max-w-[85%] sm:max-w-[75%] space-y-1">
        {showMoneyBadge && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-xs text-amber-700 w-fit animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>Personalized suggestions active</span>
          </div>
        )}
        <Button
          ref={launcherRef}
          variant="outline"
          className="w-full justify-start gap-2 rounded-xl border-primary/30 bg-primary/5 backdrop-blur-sm hover:bg-primary/10 transition-all duration-200 shadow-sm hover:shadow active:scale-[0.97]"
          onClick={() => setIsPanelOpen((prev) => !prev)}
          disabled={loading}
          aria-expanded={isPanelOpen}
          aria-haspopup="dialog"
        >
          <Layers3 className="h-4 w-4 text-primary" />
          {activeComponent ? launcherLabel[activeComponent] : null}
        </Button>
        {isPanelOpen && (
          <Card
            ref={panelRef}
            className="mt-2 rounded-xl border border-primary/15 bg-background/80 backdrop-blur-md p-3 shadow-md shadow-primary/5 animate-in zoom-in-95 fade-in-0 duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Interactive panel"
            onKeyDown={handlePanelKeyDown}
          >
            <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Interactive Panel
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 pressable" onClick={() => { closePanel(); }} aria-label="Minimize panel">
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 pressable" onClick={handleDismiss} aria-label="Close panel">
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
