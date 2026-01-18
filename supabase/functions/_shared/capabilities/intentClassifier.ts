// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL INTENT CLASSIFIER
// ═══════════════════════════════════════════════════════════════════════════
// This runs BEFORE detailed intent detection to classify user's core need.
// The result is then validated against business capabilities.
// ═══════════════════════════════════════════════════════════════════════════

import { 
  UniversalIntent, 
  BusinessCapabilities, 
  CapabilityRoutingResult,
  PrimaryGoal 
} from './types.ts';

/**
 * Classify user message into universal intent (first-pass)
 */
export function classifyUniversalIntent(message: string): UniversalIntent {
  const lowerMsg = message.toLowerCase().trim();
  
  // Product purchase signals
  const productSignals = [
    /\b(buy|purchase|order|get|want|need)\b.*\b(product|item|thing|one|some)/i,
    /\bhow much (is|are|does|do)\b/i,
    /\b(price|cost)\b.*\b(of|for)\b/i,
    /\badd to cart\b/i,
    /\bcheckout\b/i,
    /\bin stock\b/i,
    /\bdo you (sell|have|carry)\b/i,
  ];
  
  // Appointment booking signals
  const appointmentSignals = [
    /\b(book|schedule|make|set up)\b.*\b(appointment|booking|reservation|slot)\b/i,
    /\bwhen (can|could) (i|we) (come|visit|see)\b/i,
    /\b(available|availability)\b.*\b(time|slot|day)\b/i,
    /\breserve\b/i,
    /\bsign (me )?up\b/i,
    /\bi('d| would) like to (book|schedule|see|visit)\b/i,
  ];
  
  // Service request signals (on-demand, now, immediate)
  const serviceSignals = [
    /\b(need|want|get)\b.*\b(service|done|cleaned|fixed|washed|repaired)\b/i,
    /\bcan (you|someone)\b.*\b(help|assist|do)\b/i,
    /\bright now\b/i,
    /\btoday\b.*\b(possible|available)\b/i,
    /\bwalk-?in\b/i,
    /\basap\b/i,
    /\bimmediately\b/i,
  ];
  
  // Support/complaint signals
  const supportSignals = [
    /\b(problem|issue|trouble|wrong|broken|not working)\b/i,
    /\b(complain|complaint|unhappy|upset|frustrated)\b/i,
    /\b(refund|return|exchange|cancel)\b/i,
    /\bspeak to (a |someone|human|person|manager)\b/i,
    /\bhelp (with|me)\b/i,
    /\b(didn't|did not|hasn't|has not) (arrive|work|receive)\b/i,
  ];
  
  // Information signals
  const infoSignals = [
    /\bwhat (is|are|do|does|time|day)\b/i,
    /\bwhere (is|are|do|can)\b/i,
    /\bhow (do|does|long|much|many)\b/i,
    /\btell me (about|more)\b/i,
    /\bdo you (have|offer|provide|accept)\b/i,
    /\b(hours|location|address|directions)\b/i,
    /\bopen\b/i,
    /\bclose\b/i,
  ];
  
  // Check each category
  for (const pattern of productSignals) {
    if (pattern.test(lowerMsg)) return 'ProductPurchase';
  }
  
  for (const pattern of appointmentSignals) {
    if (pattern.test(lowerMsg)) return 'AppointmentBooking';
  }
  
  for (const pattern of serviceSignals) {
    if (pattern.test(lowerMsg)) return 'ServiceRequest';
  }
  
  for (const pattern of supportSignals) {
    if (pattern.test(lowerMsg)) return 'Support';
  }
  
  for (const pattern of infoSignals) {
    if (pattern.test(lowerMsg)) return 'Information';
  }
  
  return 'Unknown';
}

/**
 * Check if intent matches business capabilities
 */
export function validateIntentAgainstCapabilities(
  intent: UniversalIntent,
  capabilities: BusinessCapabilities
): CapabilityRoutingResult {
  switch (intent) {
    case 'ProductPurchase':
      if (capabilities.sells_products) {
        return {
          allowed: true,
          flowType: 'PRODUCT',
        };
      }
      // Suggest alternative if available
      if (capabilities.books_appointments) {
        return {
          allowed: false,
          flowType: null,
          reason: 'This business does not sell products directly',
          alternative: 'However, I can help you book an appointment for a consultation.',
          suggestedAction: 'book_appointment',
        };
      }
      return {
        allowed: false,
        flowType: null,
        reason: 'This business does not sell products',
        alternative: 'I can answer questions about our services instead.',
      };
      
    case 'AppointmentBooking':
      if (capabilities.books_appointments) {
        return {
          allowed: true,
          flowType: 'SERVICE',
        };
      }
      // Suggest alternative if available
      if (capabilities.offers_services_on_demand) {
        return {
          allowed: false,
          flowType: 'SERVICE_ON_DEMAND',
          reason: 'We don\'t require appointments',
          alternative: 'You can simply walk in or let me know what service you need!',
          suggestedAction: 'service_request',
        };
      }
      if (capabilities.sells_products) {
        return {
          allowed: false,
          flowType: null,
          reason: 'We don\'t offer appointment-based services',
          alternative: 'However, I can help you with our products. What are you looking for?',
          suggestedAction: 'product_inquiry',
        };
      }
      return {
        allowed: false,
        flowType: null,
        reason: 'Appointments are not available at this business',
      };
      
    case 'ServiceRequest':
      if (capabilities.offers_services_on_demand) {
        return {
          allowed: true,
          flowType: 'SERVICE_ON_DEMAND',
        };
      }
      if (capabilities.books_appointments) {
        return {
          allowed: false,
          flowType: 'SERVICE',
          reason: 'We require appointments for our services',
          alternative: 'Would you like me to help you book an appointment?',
          suggestedAction: 'book_appointment',
        };
      }
      return {
        allowed: false,
        flowType: null,
        reason: 'Services are not available at this time',
      };
      
    case 'Support':
      // Support is always allowed
      return {
        allowed: true,
        flowType: null,
        suggestedAction: 'handle_support',
      };
      
    case 'Information':
      // Information is always allowed
      return {
        allowed: true,
        flowType: null,
        suggestedAction: 'provide_info',
      };
      
    case 'Unknown':
    default:
      return {
        allowed: true,
        flowType: null,
        suggestedAction: 'discover_intent',
      };
  }
}

/**
 * Get behavioral bias based on primary goal
 */
export function getGoalBias(goal: PrimaryGoal): string {
  switch (goal) {
    case 'increase_sales':
      return `GOAL BIAS: Push toward product purchases. 
- Suggest products when relevant
- Mention deals and limited availability
- After answering questions, suggest: "Would you like to order that?"
- Use assumptive language: "How many would you like?"`;

    case 'increase_bookings':
      return `GOAL BIAS: Push toward appointment bookings.
- Suggest booking when services are mentioned
- Offer earliest available slots proactively
- After answering questions, suggest: "Would you like to book an appointment?"
- Use assumptive language: "I have a great slot at [time]. Should I reserve it?"`;

    case 'reduce_calls':
      return `GOAL BIAS: Resolve inquiries to reduce phone calls.
- Provide comprehensive answers
- Anticipate follow-up questions
- Offer self-service options when available
- Confirm: "Does that answer your question?" before closing`;

    case 'capture_leads':
      return `GOAL BIAS: Capture contact information for follow-up.
- Before ending ANY conversation, get name and contact
- Offer to have someone call them back
- Use: "Can I get your contact info so we can follow up?"
- Even for simple inquiries, suggest: "Would you like us to send you more information?"`;

    case 'general_support':
    default:
      return `GOAL BIAS: Balanced support and assistance.
- Help with whatever the user needs
- Guide them to appropriate actions
- Be helpful without being pushy`;
  }
}

/**
 * Build capability-aware prompt block
 */
export function buildCapabilityPrompt(
  capabilities: BusinessCapabilities,
  primaryGoal: PrimaryGoal,
  universalIntent: UniversalIntent,
  routingResult: CapabilityRoutingResult
): string {
  const capabilityList: string[] = [];
  
  if (capabilities.sells_products) capabilityList.push('✓ Can sell products');
  else capabilityList.push('✗ Cannot sell products');
  
  if (capabilities.books_appointments) capabilityList.push('✓ Can book appointments');
  else capabilityList.push('✗ Cannot book appointments');
  
  if (capabilities.offers_services_on_demand) capabilityList.push('✓ Offers walk-in/on-demand services');
  else capabilityList.push('✗ No walk-in services');
  
  if (capabilities.delivers) capabilityList.push('✓ Can deliver');
  if (capabilities.supports_urgent_requests) capabilityList.push('✓ Handles urgent requests');
  if (capabilities.requires_compliance) capabilityList.push('⚠️ Requires compliance (no medical/legal advice)');
  if (capabilities.has_membership) capabilityList.push('✓ Has membership/subscription options');

  const goalBias = getGoalBias(primaryGoal);

  return `# 📌 BUSINESS CAPABILITY LAYER (DYNAMIC)

## What This Business Can Do
${capabilityList.join('\n')}

## Primary Business Goal: ${primaryGoal.replace('_', ' ').toUpperCase()}
${goalBias}

## Current User Intent Classification
Detected Intent: **${universalIntent}**
Capability Match: ${routingResult.allowed ? '✓ ALLOWED' : '✗ NOT DIRECTLY SUPPORTED'}
${routingResult.reason ? `Reason: ${routingResult.reason}` : ''}
${routingResult.alternative ? `Alternative Response: "${routingResult.alternative}"` : ''}

## CAPABILITY ENFORCEMENT RULES
1. NEVER offer actions the business cannot perform
2. If user asks for unsupported action → Explain politely + suggest alternative
3. Always align responses with the primary goal
4. For compliance businesses → NEVER give professional advice (medical, legal, financial)
5. Dynamic flow switching is ALLOWED based on user intent changes`;
}
