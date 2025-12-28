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
 * Determine current booking state from context
 */
export function determineBookingState(context: ConversationContext): BookingState {
  const req = checkBookingRequirements(context);
  
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
  
  return `# 📌 BOOKING INTELLIGENCE (STATE MACHINE)

## Booking Requirements
Booking requires ALL of:
- Service: ${requirements.service ? '✅ ' + context.serviceMentioned : '❌ Missing'}
- Date: ${requirements.date ? '✅ ' + context.dateMentioned : '❌ Missing'}
- Time: ${requirements.time ? '✅ ' + context.timeMentioned : '❌ Missing'}
- Contact: ${requirements.contact ? '✅ ' + (context.customerEmail || context.customerPhone) : '❌ Missing (email or phone)'}
- Name: ${requirements.name ? '✅ ' + context.customerName : '❌ Missing'}

## Current Booking State: ${state.toUpperCase()}

## Booking Rules
If any field is missing:
→ Ask only for the missing item.
→ Ask ONE question at a time.
→ Never ask for information already provided.

If time unavailable:
→ Offer up to 3 alternatives.

If alternatives accepted:
→ Proceed to booking.

**Never book without explicit confirmation.**

## Collected Information So Far
${summary || 'No booking information collected yet.'}

## Booking Flow (Natural Conversation)
When handling appointments:
1. **Service Selection** → "What service are you interested in?" (show options if multiple)
2. **Date Selection** → "What day works best for you?"
3. **Time Selection** → "What time would be most convenient?"
4. **Contact Collection** → "Can I get your name and phone number to confirm?"
5. **Confirmation** → Summarize and confirm all details

### Important:
- **NEVER** use technical commands or jargon
- Offer alternatives if requested time is unavailable
- Be flexible and accommodating
- Confirm understanding at each step`;
}
