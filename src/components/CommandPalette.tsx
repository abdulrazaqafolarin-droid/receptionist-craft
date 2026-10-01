import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MessageCircle,
  CalendarDays,
  Calendar,
  ShoppingBag,
  BarChart3,
  CreditCard,
  Settings,
  DollarSign,
  Brain,
  LifeBuoy,
  Plus,
  Sparkles,
  Search,
  Users,
  Clock,
  ConciergeBell,
} from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export const RUTEX_OPEN_PALETTE_EVENT = "rutex:open-palette";
export const RUTEX_ASK_AI_EVENT = "rutex:ask-ai";

export function openRutexPalette() {
  window.dispatchEvent(new CustomEvent(RUTEX_OPEN_PALETTE_EVENT));
}

export function askFrontDeskAI(message: string) {
  window.dispatchEvent(new CustomEvent(RUTEX_ASK_AI_EVENT, { detail: { message } }));
}

interface PaletteEntry {
  label: string;
  hint?: string;
  icon: React.ElementType;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(RUTEX_OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(RUTEX_OPEN_PALETTE_EVENT, onOpen);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const ask = (message: string) => {
    setOpen(false);
    askFrontDeskAI(message);
    navigate("/dashboard");
  };

  const navItems: PaletteEntry[] = [
    { label: "Dashboard", icon: LayoutDashboard, run: () => go("/dashboard") },
    { label: "Conversations", hint: "Chat transcripts", icon: MessageCircle, run: () => go("/conversations") },
    { label: "Calendar", hint: "Full schedule view", icon: CalendarDays, run: () => go("/calendar") },
    { label: "Appointments", hint: "Manage bookings", icon: Calendar, run: () => go("/appointments") },
    { label: "Orders", hint: "Manage orders", icon: ShoppingBag, run: () => go("/orders") },
    { label: "Services", hint: "Offerings catalog", icon: ConciergeBell, run: () => go("/services") },
    { label: "Availability", hint: "Business hours", icon: Clock, run: () => go("/availability") },
    { label: "Customers", hint: "Customer timeline", icon: Users, run: () => go("/customers") },
    { label: "Analytics", hint: "Performance insights", icon: BarChart3, run: () => go("/analytics") },
    { label: "Billing", hint: "Subscription & payments", icon: CreditCard, run: () => go("/billing") },
    { label: "Money Mode", hint: "Revenue control center", icon: DollarSign, run: () => go("/money-mode") },
    { label: "MEO Dashboard", hint: "Revenue intelligence", icon: Brain, run: () => go("/meo-dashboard") },
    { label: "Settings", hint: "App configuration", icon: Settings, run: () => go("/settings") },
    { label: "Help", hint: "Docs & support", icon: LifeBuoy, run: () => go("/help") },
  ];

  const actionItems: PaletteEntry[] = [
    { label: "New AI operator", hint: "Chat or guided form", icon: Plus, run: () => go("/onboarding?returning=1") },
    { label: "Manage Services", hint: "Add or edit offerings", icon: ConciergeBell, run: () => go("/services") },
    { label: "Set Business Hours", hint: "Booking availability", icon: Clock, run: () => go("/availability") },
  ];

  const askItems: PaletteEntry[] = [
    { label: "How did we perform this month?", icon: Sparkles, run: () => ask("How did we perform this month?") },
    { label: "Show unpaid invoices", icon: Search, run: () => ask("Show unpaid invoices.") },
    { label: "Which customers haven't returned?", icon: Search, run: () => ask("Which customers haven't returned?") },
    { label: "Follow up with yesterday's leads", icon: Search, run: () => ask("Follow up with yesterday's leads.") },
  ];

  const renderEntry = (entry: PaletteEntry) => (
    <CommandItem
      key={entry.label}
      value={entry.label}
      onSelect={() => entry.run()}
      className="gap-3 px-3 py-2.5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
        <entry.icon className="h-4 w-4 text-primary" />
      </span>
      <span className="flex-1 text-sm font-medium">{entry.label}</span>
      {entry.hint && <span className="text-xs text-muted-foreground">{entry.hint}</span>}
    </CommandItem>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-3 overflow-hidden p-0 sm:max-w-lg" aria-label="Rutex command palette">
        <DialogTitle className="sr-only">Ask Rutex — search, navigate, act</DialogTitle>
        <Command className="bg-transparent">
          <CommandInput placeholder="Ask Rutex, search pages, or run an action…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Ask FrontDesk AI">
              {askItems.map(renderEntry)}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Go to">
              {navItems.map(renderEntry)}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Actions">
              {actionItems.map(renderEntry)}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
