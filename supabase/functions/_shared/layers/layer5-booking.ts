// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5: EXECUTION (BOOKING / ACTIONS)
// ═══════════════════════════════════════════════════════════════════════════
// This layer handles booking state machine logic and action execution.
// Booking requires ALL of: Service, Date, Time, Contact (email or phone)
// ═══════════════════════════════════════════════════════════════════════════

import type { ConversationContext } from './layer3-memory.ts';

/**
 * Booking state machine states
 */
export type BookingState =
  | 'idle'
  | 'collecting_service'
  | 'collecting_date'
  | 'collecting_time'
  | 'collecting_contact'
  | 'ready_to_confirm'
  | 'confirmed';

/**
 * Required fields for a complete booking
 */
export interface BookingRequirements {
  service: boolean;
  date: boolean;
  time: boolean;
  contact: boolean; // email OR phone
  name: boolean;
}

/**
 * Check what booking fields are still needed
 */
export function checkBookingRequirements(context: ConversationContext): BookingRequirements {
  return {
    service: !!context.serviceMentioned,
    date: !!context.dateMentioned,
    time: !!context.timeMentioned,
    contact: !!(context.customerEmail || context.customerPhone),
    name: !!context.customerName,
  };
}

/**
 * Determine which field to ask for next, handling out-of-order collection.
 * 
 * Customers may provide date, time, or contact info before service.
 * This function returns the FIRST truly missing field regardless of order,
 * and the prompt block below explicitly handles out-of-order scenarios.
 * 
 * Returns:
 * - collecting_service if service is missing (even if other fields are filled)
 * - collecting_date if service is collected but date is missing
 * - collecting_time if service+date collected but time is missing
 * - collecting_contact if service+date+time collected but contact/name missing
 * - ready_to_confirm if all required fields are present
 */
export function determineBookingState(context: ConversationContext): BookingState {
  const req = checkBookingRequirements(context);
  
  // Check each required field independently — order doesn't matter,
  // we find the first gap and return the corresponding collection state.
  // Fields provided out of order (e.g., date before service) are preserved
  // in the context and shown in the prompt block below.
  if (!req.service) return 'collecting_service';
  if (!req.date) return 'collecting_date';
  if (!req.time) return 'collecting_time';
  if (!req.contact || !req.name) return 'collecting_contact';
  
  return 'ready_to_confirm';
}

/**
 * Get the next question to ask based on booking state
 */
export function getNextBookingQuestion(state: BookingState): string {
  switch (state) {
    case 'collecting_service':
      return 'What service are you interested in?';
    case 'collecting_date':
      return 'What day works best for you?';
    case 'collecting_time':
      return 'What time would be most convenient?';
    case 'collecting_contact':
      return 'Can I get your name and phone number or email to confirm the booking?';
    case 'ready_to_confirm':
      return 'Great! Let me confirm the details with you...';
    default:
      return '';
  }
}

/**
 * Build a booking confirmation summary
 */
export function buildBookingSummary(context: ConversationContext): string {
  const parts: string[] = [];
  
  if (context.serviceMentioned) parts.push(`Service: ${context.serviceMentioned}`);
  if (context.dateMentioned) parts.push(`Date: ${context.dateMentioned}`);
  if (context.timeMentioned) parts.push(`Time: ${context.timeMentioned}`);
  if (context.customerName) parts.push(`Name: ${context.customerName}`);
  if (context.customerPhone) parts.push(`Phone: ${context.customerPhone}`);
  if (context.customerEmail) parts.push(`Email: ${context.customerEmail}`);
  
  return parts.join('\n');
}

/**
 * Build the booking intelligence prompt block
 */
export function buildBookingPrompt(context: ConversationContext): string {
  const state = determineBookingState(context);
  const requirements = checkBookingRequirements(context);
  const summary = buildBookingSummary(context);
  
  const hasOutOfOrderData = (requirements.date && !requirements.service) || (requirements.time && (!requirements.service || !requirements.date)) || (requirements.contact && (!requirements.service || !requirements.date || !requirements.time));

  return `# 📌 BOOKING INTELLIGENCE (NEXT NEEDED FIELD)

## Field Status
Booking requires ALL of:
- Service: ${requirements.service ? '✅ ' + context.serviceMentioned : '❌ Missing'}
- Date: ${requirements.date ? '✅ ' + context.dateMentioned : '❌ Missing'}
- Time: ${requirements.time ? '✅ ' + context.timeMentioned : '❌ Missing'}
- Contact: ${requirements.contact ? '✅ ' + (context.customerEmail || context.customerPhone) : '❌ Missing (email or phone)'}
- Name: ${requirements.name ? '✅ ' + context.customerName : '❌ Missing'}

## Next Field to Ask About: ${state === 'ready_to_confirm' ? 'CONFIRMATION' : state.replace('collecting_', '').toUpperCase()}

${hasOutOfOrderData ? `
## ⚠️ OUT-OF-ORDER DATA DETECTED
The customer has provided some details ahead of the usual sequence.
Already collected: ${[
  requirements.service && 'service',
  requirements.date && 'date',
  requirements.time && 'time',
  requirements.contact && 'contact',
  requirements.name && 'name',
].filter(Boolean).join(', ')}.
Acknowledge what they've already told you, then ask only for what's still missing.
` : ''}

## Booking Rules
- If any field is missing, ask naturally. Asking for related fields together is fine (e.g., "What day and time work for you?"). Prefer not to split related items into separate turns.
- Never ask for information already provided
- If the customer provides details out of order, accept ALL provided details and ask only for what is still missing
- If time unavailable, offer up to 3 alternatives
- If alternatives accepted, proceed to booking
- **Never book without explicit confirmation**

## Collected Information So Far
${summary || 'No booking information collected yet.'}

## Booking Flow Reference (not mandatory — adapt to conversation)
1. Service → 2. Date → 3. Time → 4. Contact → 5. Confirmation

### Important:
- **NEVER** use technical commands or jargon
- Be flexible and accommodating
- Confirm understanding at each step`;
}
