// ═══════════════════════════════════════════════════════════════════════════
// ACTION PERMISSION GATE
// ═══════════════════════════════════════════════════════════════════════════
// 
// This middleware validates that all required slots are collected before
// allowing action tools to be executed (book_appointment, create_order, 
// cancel_booking, reschedule).
//
// The AI NEVER directly performs actions until conditions are verified.
// If any field is missing, the AI continues conversation to collect it.
// ═══════════════════════════════════════════════════════════════════════════

import type { FlowSlots } from "./flow/types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// ACTION TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type ActionType = 
  | 'book_appointment'
  | 'create_order' 
  | 'cancel_booking'
  | 'reschedule';

// ─────────────────────────────────────────────────────────────────────────────
// SLOT REQUIREMENTS PER ACTION
// ─────────────────────────────────────────────────────────────────────────────
export interface SlotRequirement {
  field: keyof FlowSlots | 'contact';
  label: string;
  required: boolean;
}

export const ACTION_REQUIREMENTS: Record<ActionType, SlotRequirement[]> = {
  book_appointment: [
    { field: 'serviceId', label: 'service', required: true },
    { field: 'date', label: 'date', required: true },
    { field: 'time', label: 'time', required: true },
    { field: 'customerName', label: 'name', required: true },
    { field: 'contact', label: 'phone or email', required: true },
  ],
  create_order: [
    { field: 'productId', label: 'product', required: true },
    { field: 'quantity', label: 'quantity', required: false }, // Defaults to 1
    { field: 'customerName', label: 'name', required: true },
    { field: 'contact', label: 'phone or email', required: true },
  ],
  cancel_booking: [
    { field: 'customerName', label: 'name', required: true },
    { field: 'contact', label: 'phone or email', required: true },
  ],
  reschedule: [
    { field: 'serviceId', label: 'service', required: true },
    { field: 'date', label: 'new date', required: true },
    { field: 'time', label: 'new time', required: true },
    { field: 'customerName', label: 'name', required: true },
    { field: 'contact', label: 'phone or email', required: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION RESULT
// ─────────────────────────────────────────────────────────────────────────────
export interface ActionGateResult {
  allowed: boolean;
  action: ActionType;
  missingSlots: string[];
  collectedSlots: string[];
  nextQuestion?: string;
  summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOT VALUE CHECKER
// ─────────────────────────────────────────────────────────────────────────────
function hasSlotValue(slots: FlowSlots, field: keyof FlowSlots | 'contact'): boolean {
  if (field === 'contact') {
    // Contact is satisfied by either phone or email
    return !!(slots.customerPhone || slots.customerEmail);
  }
  
  const value = slots[field as keyof FlowSlots];
  
  // Handle different value types
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true; // quantity = 0 is falsy but valid
  if (Array.isArray(value)) return value.length > 0;
  
  return !!value;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEXT QUESTION GENERATOR
// ─────────────────────────────────────────────────────────────────────────────
function getNextQuestion(missingSlot: string, action: ActionType): string {
  const questionMap: Record<string, string> = {
    'service': 'What service would you like to book?',
    'product': 'Which product would you like to order?',
    'date': 'What day works best for you?',
    'time': 'What time would be most convenient?',
    'new date': 'What date would you like to reschedule to?',
    'new time': 'What time would you prefer for the new appointment?',
    'name': 'Can I get your name please?',
    'phone or email': 'How can we reach you? Phone number or email?',
    'quantity': 'How many would you like?',
  };
  
  return questionMap[missingSlot] || `Could you please provide your ${missingSlot}?`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN VALIDATION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
export function validateActionGate(
  action: ActionType,
  slots: FlowSlots,
  context?: {
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    serviceMentioned?: string | null;
    serviceId?: string | null;
    productMentioned?: string | null;
    productId?: string | null;
    dateMentioned?: string | null;
    timeMentioned?: string | null;
    quantity?: number | null;
    selectedProducts?: Array<{ productId: string; productName: string; quantity: number; price?: number }>;
  }
): ActionGateResult {
  const requirements = ACTION_REQUIREMENTS[action];
  
  // Merge context into slots (slots take priority)
  const mergedSlots: FlowSlots = {
    ...slots,
    customerName: slots.customerName || context?.customerName || null,
    customerPhone: slots.customerPhone || context?.customerPhone || null,
    customerEmail: slots.customerEmail || context?.customerEmail || null,
    serviceId: slots.serviceId || context?.serviceId || null,
    serviceName: slots.serviceName || context?.serviceMentioned || null,
    productId: slots.productId || context?.productId || null,
    productName: slots.productName || context?.productMentioned || null,
    date: slots.date || context?.dateMentioned || null,
    time: slots.time || context?.timeMentioned || null,
    quantity: slots.quantity ?? context?.quantity ?? null,
    selectedProducts: slots.selectedProducts || context?.selectedProducts || undefined,
  };
  
  const missingSlots: string[] = [];
  const collectedSlots: string[] = [];
  
  for (const req of requirements) {
    if (req.required) {
      // Special handling for product - check selectedProducts array too
      if (req.field === 'productId') {
        const hasProduct = hasSlotValue(mergedSlots, 'productId') || 
                          (mergedSlots.selectedProducts && mergedSlots.selectedProducts.length > 0);
        if (hasProduct) {
          collectedSlots.push(req.label);
        } else {
          missingSlots.push(req.label);
        }
      } else if (hasSlotValue(mergedSlots, req.field)) {
        collectedSlots.push(req.label);
      } else {
        missingSlots.push(req.label);
      }
    } else {
      // Optional field - still track if collected
      if (req.field === 'productId') {
        const hasProduct = hasSlotValue(mergedSlots, 'productId') || 
                          (mergedSlots.selectedProducts && mergedSlots.selectedProducts.length > 0);
        if (hasProduct) collectedSlots.push(req.label);
      } else if (hasSlotValue(mergedSlots, req.field)) {
        collectedSlots.push(req.label);
      }
    }
  }
  
  const allowed = missingSlots.length === 0;
  const nextQuestion = !allowed ? getNextQuestion(missingSlots[0], action) : undefined;
  
  // Build summary
  const summary = allowed
    ? `✅ All requirements met for ${action}. Ready to execute.`
    : `⛔ BLOCKED: Missing ${missingSlots.join(', ')} for ${action}. Collected: ${collectedSlots.join(', ') || 'none'}.`;
  
  return {
    allowed,
    action,
    missingSlots,
    collectedSlots,
    nextQuestion,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECT ACTION FROM INTENT
// ─────────────────────────────────────────────────────────────────────────────
export function detectActionFromIntent(intent: string): ActionType | null {
  switch (intent) {
    case 'book_appointment':
      return 'book_appointment';
    case 'order_product':
      return 'create_order';
    case 'cancel_appointment':
      return 'cancel_booking';
    case 'reschedule':
      return 'reschedule';
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD GATE PROMPT BLOCK
// ─────────────────────────────────────────────────────────────────────────────
export function buildActionGatePrompt(gateResult: ActionGateResult | null): string {
  if (!gateResult) {
    return '';
  }
  
  return `# 📌 ACTION PERMISSION GATE

## Current Action: ${gateResult.action.toUpperCase()}

## Gate Status: ${gateResult.allowed ? '✅ APPROVED' : '⛔ BLOCKED'}

## Collected Slots
${gateResult.collectedSlots.length > 0 
  ? gateResult.collectedSlots.map(s => `- ✅ ${s}`).join('\n')
  : '- (none collected yet)'}

## Missing Slots
${gateResult.missingSlots.length > 0 
  ? gateResult.missingSlots.map(s => `- ❌ ${s}`).join('\n')
  : '- (all required slots collected)'}

## INSTRUCTION
${gateResult.allowed 
  ? 'All requirements met. You may proceed with the action.'
  : `BLOCKED: Do NOT execute the action yet. Continue conversation to collect: ${gateResult.missingSlots.join(', ')}.
  
Suggested next question: "${gateResult.nextQuestion}"`}

## CRITICAL RULES
- NEVER execute booking/order/cancel/reschedule without ALL required fields
- Ask for ONE missing field at a time
- Once all fields collected, confirm with user before executing
- If user provides partial info, acknowledge what you have and ask for what's missing`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: CHECK BOOKING GATE
// ─────────────────────────────────────────────────────────────────────────────
export function checkBookingGate(
  slots: FlowSlots,
  context?: Parameters<typeof validateActionGate>[2]
): ActionGateResult {
  return validateActionGate('book_appointment', slots, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: CHECK ORDER GATE
// ─────────────────────────────────────────────────────────────────────────────
export function checkOrderGate(
  slots: FlowSlots,
  context?: Parameters<typeof validateActionGate>[2]
): ActionGateResult {
  return validateActionGate('create_order', slots, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: CHECK CANCEL GATE
// ─────────────────────────────────────────────────────────────────────────────
export function checkCancelGate(
  slots: FlowSlots,
  context?: Parameters<typeof validateActionGate>[2]
): ActionGateResult {
  return validateActionGate('cancel_booking', slots, context);
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE: CHECK RESCHEDULE GATE
// ─────────────────────────────────────────────────────────────────────────────
export function checkRescheduleGate(
  slots: FlowSlots,
  context?: Parameters<typeof validateActionGate>[2]
): ActionGateResult {
  return validateActionGate('reschedule', slots, context);
}
