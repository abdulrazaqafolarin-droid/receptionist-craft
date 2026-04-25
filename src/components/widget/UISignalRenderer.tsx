import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelectorEnhanced } from "@/components/widget/ProductSelectorEnhanced";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";

export type UISignalIntent =
  | "browsing"
  | "service_enquiry"
  | "product_enquiry"
  | "booking_intent"
  | "availability_check"
  | "order_intent"
  | "booking_modify"
  | "pricing_question"
  | "hours_question"
  | "location_question"
  | "complaint_support"
  | "lead_capture"
  | "confirmation"
  | "cancellation"
  | "escalation"
  | "unknown";

export type UIComponentType =
  | "quick_replies"
  | "service_selector"
  | "product_selector"
  | "date_picker"
  | "time_picker"
  | "lead_form"
  | "booking_confirmation"
  | "order_summary"
  | "none";

export interface UISignal {
  version: "2026-04-ui-signal-v1";
  intent: UISignalIntent;
  activeComponent: UIComponentType;
  componentData: Record<string, any>;
  dismissPrevious: boolean;
  reason: "intent_change" | "step_change" | "completion" | "fallback";
  confidence: number;
  flow: {
    type: "booking" | "ordering" | "support" | "none";
    step: string | null;
    canContinue: boolean;
  };
}

type ServiceItem = { id: string; name: string; duration_minutes?: number; price?: number | null };
type ProductItem = { id: string; name: string; price?: number | null; stock_quantity?: number | null };

interface UISignalRendererProps {
  signal: UISignal | null;
  services: ServiceItem[];
  products: ProductItem[];
  timeSlots: any[];
  disabled?: boolean;
  onServiceSelect: (serviceId: string, serviceName: string) => void;
  onProductsConfirm: (items: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void;
  onDateSelect: (date: Date) => void;
  onTimeSlotSelect: (slot: any) => void;
}

export function UISignalRenderer({
  signal,
  services,
  products,
  timeSlots,
  disabled,
  onServiceSelect,
  onProductsConfirm,
  onDateSelect,
  onTimeSlotSelect,
}: UISignalRendererProps) {
  const activeComponent = signal?.activeComponent || "none";

  const renderComponent = () => {
    if (!signal || activeComponent === "none") return null;

    switch (activeComponent) {
      case "service_selector":
        if (services.length === 0) return null;
        return <ServiceSelector services={services as any[]} onSelect={onServiceSelect} disabled={disabled} />;
      case "product_selector":
        if (products.length === 0) return null;
        return <ProductSelectorEnhanced products={products as any[]} onConfirm={onProductsConfirm} disabled={disabled} />;
      case "date_picker":
        return <DateSelector onSelect={onDateSelect} disabled={disabled} minDate={new Date()} />;
      case "time_picker":
        if (!timeSlots?.length) return null;
        return <TimeSlotSelector slots={timeSlots} onSelect={onTimeSlotSelect} disabled={disabled} showMore={false} />;
      case "booking_confirmation":
        return <BookingConfirmation {...(signal.componentData as any)} />;
      case "order_summary":
        return <OrderConfirmation {...(signal.componentData as any)} />;
      default:
        return null;
    }
  };

  const component = renderComponent();
  if (!component) return null;

  return (
    <div className="mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <div className="flex justify-start">
        <div className="max-w-[85%]">{component}</div>
      </div>
    </div>
  );
}
