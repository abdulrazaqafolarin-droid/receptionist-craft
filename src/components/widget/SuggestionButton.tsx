import { Button } from "@/components/ui/button";
import { X, ChevronRight, CalendarDays, Grid2x2, ShoppingBag, CheckCircle2, Package, UserRound } from "lucide-react";

export type SuggestionComponent =
  | "service_selector"
  | "product_selector"
  | "datetime_picker"
  | "booking_confirm"
  | "order_summary"
  | "lead_form";

const iconMap = {
  service_selector: Grid2x2,
  product_selector: ShoppingBag,
  datetime_picker: CalendarDays,
  booking_confirm: CheckCircle2,
  order_summary: Package,
  lead_form: UserRound,
};

const copyMap: Record<SuggestionComponent, { title: string; helper: string }> = {
  service_selector: { title: "Choose a service", helper: "Tap to see what's available" },
  product_selector: { title: "Browse products", helper: "Select what you'd like" },
  datetime_picker: { title: "Pick a date & time", helper: "See available slots" },
  booking_confirm: { title: "Review your booking", helper: "Ready to confirm" },
  order_summary: { title: "Review your order", helper: "Ready to checkout" },
  lead_form: { title: "Share your details", helper: "Quick 2-field form" },
};

interface Props {
  component: SuggestionComponent;
  accentColor: string;
  onOpen: () => void;
  onDismiss: () => void;
}

export function SuggestionButton({ component, accentColor, onOpen, onDismiss }: Props) {
  const Icon = iconMap[component];
  const copy = copyMap[component];

  return (
    <div className="animate-in slide-in-from-bottom-5 fade-in-0 duration-200 px-4 pb-2">
      <div className="rounded-xl border bg-white shadow-sm" style={{ borderLeft: `4px solid ${accentColor}` }}>
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">{copy.title}</p>
            <p className="text-xs text-muted-foreground truncate">{copy.helper}</p>
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onOpen}>
            Open <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss} aria-label="Dismiss suggestion">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
