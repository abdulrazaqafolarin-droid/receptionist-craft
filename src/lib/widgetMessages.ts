/**
 * Pure message builders for the widget → widget-chat handoff.
 *
 * After Phase 0.3 (state unification), the widget NEVER executes bookings or
 * orders itself. Widget interactions are converted into natural-language
 * messages that the server-side engine (widget-chat) parses with its own
 * slot extractors, gates, and idempotency guarantees.
 */

export interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  price?: number;
}

export interface LeadFormData {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

/**
 * Build the order-intent message sent to widget-chat when the user confirms
 * a product cart. Prices are deliberately omitted — the backend prices from
 * its own DB (hallucination guard territory).
 * Returns null when there is nothing valid to order.
 */
export function buildCartMessage(items: CartItem[]): string | null {
  const valid = items.filter(
    (i) =>
      Boolean(i.productId) &&
      Boolean(i.productName?.trim()) &&
      Number.isFinite(i.quantity) &&
      i.quantity > 0
  );
  if (valid.length === 0) return null;
  const parts = valid.map((i) => `${i.quantity}x ${i.productName.trim()}`);
  return `I'd like to order: ${parts.join(", ")}`;
}

/**
 * Build the lead-capture message sent to widget-chat after a LeadForm submit.
 * The server-side name validator and slot extractor own validation from here.
 * Returns null when the form contributed nothing.
 */
export function buildLeadFormMessage(data: LeadFormData): string | null {
  const bits: string[] = [];
  if (data.name && data.name.trim()) bits.push(`My name is ${data.name.trim()}`);
  if (data.email && data.email.trim()) bits.push(`email: ${data.email.trim()}`);
  if (data.phone && data.phone.trim()) bits.push(`phone: ${data.phone.trim()}`);
  return bits.length > 0 ? `${bits.join(". ")}.` : null;
}

/**
 * Build the slot-selection message for a time picked from the time picker.
 */
export function buildTimeSlotMessage(time: string, date?: string | null): string {
  return `I'll take the ${time} slot${date ? ` on ${date}` : ""}`;
}
