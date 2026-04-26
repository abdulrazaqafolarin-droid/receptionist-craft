import { z } from "zod";

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

const INTENTS = [
  "browsing",
  "service_enquiry",
  "product_enquiry",
  "booking",
  "ordering",
  "pricing",
  "availability",
  "booking_modification",
  "support",
  "lead_capture",
  "confirmation",
  "closing",
] as const satisfies readonly IntentType[];

const COMPONENTS = [
  "service_selector",
  "product_selector",
  "date_picker",
  "time_picker",
  "booking_confirmation",
  "order_summary",
  "lead_form",
  "switch_confirmation",
  null,
] as const satisfies readonly UIComponentType[];

const REASONS = ["intent_switch", "step_progression", "task_complete", "user_cancel", "no_ui_needed"] as const;

const FLOW_SCHEMA = z.object({
  activeFlow: z.enum(["booking", "ordering", "support"]).nullable(),
  step: z.string().nullable(),
  blocking: z.boolean(),
});

export const UISIGNAL_SCHEMA = z.object({
  version: z.literal("1.0"),
  intent: z.enum(INTENTS),
  activeComponent: z.enum(COMPONENTS.filter((v): v is Exclude<UIComponentType, null> => v !== null)).nullable(),
  componentData: z.record(z.unknown()),
  dismissPrevious: z.boolean(),
  reason: z.enum(REASONS),
  flow: FLOW_SCHEMA,
  conversationCanContinue: z.boolean(),
});

export function isUISignal(value: unknown): value is UISignal {
  return UISIGNAL_SCHEMA.safeParse(value).success;
}

export function normalizeUISignal(signal: Partial<UISignal> & Pick<UISignal, "intent" | "activeComponent">): UISignal {
  const normalized = {
    version: "1.0",
    componentData: {},
    dismissPrevious: true,
    reason: signal.activeComponent ? "step_progression" : "no_ui_needed",
    flow: { activeFlow: null, step: null, blocking: false },
    conversationCanContinue: true,
    ...signal,
  };
  return UISIGNAL_SCHEMA.parse(normalized);
}

export function parseUISignal(value: unknown): UISignal | null {
  const parsed = UISIGNAL_SCHEMA.safeParse(value);
  if (parsed.success) return parsed.data;
  return null;
}
