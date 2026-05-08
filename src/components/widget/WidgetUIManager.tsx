import { useEffect, useMemo, useState } from "react";
import { UISignal } from "@/components/widget/UISignalRenderer";
import { SuggestionButton, SuggestionComponent } from "@/components/widget/SuggestionButton";
import { ExpandablePanel } from "@/components/widget/ExpandablePanel";
import { ServiceSelectorPanel } from "@/components/widget/panels/ServiceSelectorPanel";
import { ProductSelectorPanel } from "@/components/widget/panels/ProductSelectorPanel";
import { DateTimePickerPanel } from "@/components/widget/panels/DateTimePickerPanel";
import { BookingConfirmPanel } from "@/components/widget/panels/BookingConfirmPanel";
import { OrderSummaryPanel } from "@/components/widget/panels/OrderSummaryPanel";

type Service = { id: string; name: string; duration_minutes?: number; price?: number | null };
type Product = { id: string; name: string; price?: number; stock_quantity?: number | null };

export function WidgetUIManager({ signal, services, products, accentColor, onServiceSelect, onProductsConfirm, onDateSelect, onTimeSlotSelect, onDismiss }: { signal: UISignal | null; services: Service[]; products: Product[]; accentColor: string; onServiceSelect: (id: string, name: string) => void; onProductsConfirm: (p: Array<{ productId: string; productName: string; quantity: number; price?: number }>) => void; onDateSelect: (date: Date) => void; onTimeSlotSelect: (slot: { startTime: string; endTime?: string }) => void; onDismiss?: () => void; }) {
  const [current, setCurrent] = useState<SuggestionComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<SuggestionComponent | null>(null);

  useEffect(() => {
    const mapped = signal?.activeComponent === "date_picker" || signal?.activeComponent === "time_picker" ? "datetime_picker" :
      signal?.activeComponent === "booking_confirmation" ? "booking_confirm" : signal?.activeComponent as SuggestionComponent | null;
    if (!mapped) return;
    if (dismissed === mapped) return;
    setCurrent(mapped);
  }, [signal, dismissed]);

  const panel = useMemo(() => {
    if (!current || !signal) return null;
    if (current === "service_selector") return <ServiceSelectorPanel services={services} accentColor={accentColor} onContinue={(s) => { onServiceSelect(s.id, s.name); setOpen(false); }} />;
    if (current === "product_selector") return <ProductSelectorPanel products={products} onConfirm={(items) => { onProductsConfirm(items); setOpen(false); }} />;
    if (current === "datetime_picker") return <DateTimePickerPanel slots={(signal.componentData?.slots as Array<{ startTime: string; available?: boolean }>) ?? []} onConfirm={({ date, slot }) => { onDateSelect(new Date(date)); onTimeSlotSelect(slot); setOpen(false); }} />;
    if (current === "booking_confirm") return <BookingConfirmPanel accentColor={accentColor} summary={(signal.componentData as Record<string, string>) ?? {}} onConfirm={() => setOpen(false)} />;
    if (current === "order_summary") return <OrderSummaryPanel lines={Object.entries((signal.componentData as Record<string, unknown>) ?? {}).map(([k, v]) => `${k}: ${String(v)}`)} onConfirm={() => setOpen(false)} />;
    return null;
  }, [accentColor, current, onDateSelect, onProductsConfirm, onServiceSelect, onTimeSlotSelect, products, services, signal]);

  if (!current) return null;
  return <div className="relative">{!open && <SuggestionButton component={current} accentColor={accentColor} onOpen={() => setOpen(true)} onDismiss={() => { setDismissed(current); setCurrent(null); onDismiss?.(); }} />}<ExpandablePanel open={open} title="Assistant panel" subtitle="Choose an option" onClose={() => setOpen(false)}>{panel}</ExpandablePanel></div>;
}
