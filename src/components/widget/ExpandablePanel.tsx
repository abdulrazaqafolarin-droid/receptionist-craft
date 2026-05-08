import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  nav?: ReactNode;
}

export function ExpandablePanel({ open, title, subtitle, onClose, children, nav }: Props) {
  if (!open) return null;

  return (
    <>
      <button className="absolute inset-0 z-20 bg-transparent" onClick={onClose} aria-label="Close panel overlay" />
      <div className="absolute inset-x-0 bottom-[84px] z-30 px-2 animate-in slide-in-from-bottom-10 fade-in-0 duration-300">
        <section className="mx-auto h-[65vh] max-h-[65vh] w-full rounded-t-2xl border bg-white shadow-2xl flex flex-col">
          <button className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-muted" onClick={onClose} aria-label="Close panel" />
          <div className="px-4 pt-3 pb-2 border-b flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">{title}</h3>
              {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {nav ? <div className="border-t p-3">{nav}</div> : null}
        </section>
      </div>
    </>
  );
}
