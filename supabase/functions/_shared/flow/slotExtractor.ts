// ═══════════════════════════════════════════════════════════════════════════
// SLOT EXTRACTOR - Extracts booking/ordering slots from messages
// ═══════════════════════════════════════════════════════════════════════════

import { FlowSlots } from "./types.ts";

export interface ExtractionResult {
  slots: Partial<FlowSlots>;
  corrections: string[];
}

// Date patterns
const DATE_PATTERNS = [
  /(?:on\s+)?(?:the\s+)?(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i,
  /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/,
  /(today|tomorrow|next\s+week|this\s+week)/i,
  /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
];

// Time patterns
const TIME_PATTERNS = [
  /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
  /(\d{1,2})\s*(am|pm)/i,
  /(morning|afternoon|evening|noon|midnight)/i,
];

// Contact patterns
const PHONE_PATTERN = /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

// Name patterns
const NAME_PATTERNS = [
  /(?:my name is|i'm|i am|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/,
];

// Quantity patterns
const QUANTITY_PATTERN = /(\d+)\s*(?:pieces?|items?|units?|of|x)?/i;

// Extract date from message
function extractDate(message: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

// Extract time from message
function extractTime(message: string): string | null {
  for (const pattern of TIME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

// Extract phone number
function extractPhone(message: string): string | null {
  const match = message.match(PHONE_PATTERN);
  return match ? match[1] : null;
}

// Extract email
function extractEmail(message: string): string | null {
  const match = message.match(EMAIL_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

// Extract name
function extractName(message: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// Extract quantity
function extractQuantity(message: string): number | null {
  const match = message.match(QUANTITY_PATTERN);
  if (match) {
    const qty = parseInt(match[1]);
    return qty > 0 && qty <= 100 ? qty : null;
  }
  // Default to 1 if "one" or "a" is mentioned
  if (/\b(one|a|an)\b/i.test(message)) {
    return 1;
  }
  return null;
}

// Detect corrections
function detectCorrections(message: string, currentSlots: FlowSlots): string[] {
  const corrections: string[] = [];
  const lowerMsg = message.toLowerCase();
  
  const correctionIndicators = [
    /actually/i,
    /i meant/i,
    /i said (.+) not/i,
    /no,?\s+it's/i,
    /correction/i,
    /change that to/i,
    /switch (it|that) to/i,
    /not (.+), (.+)/i,
  ];

  for (const pattern of correctionIndicators) {
    if (pattern.test(message)) {
      // Determine what's being corrected based on what's extracted
      const newDate = extractDate(message);
      const newTime = extractTime(message);
      const newName = extractName(message);
      
      if (newDate && currentSlots.date) corrections.push('date');
      if (newTime && currentSlots.time) corrections.push('time');
      if (newName && currentSlots.customerName) corrections.push('name');
      break;
    }
  }
  
  return corrections;
}

// Main extraction function
export function extractSlots(
  message: string,
  currentSlots: FlowSlots,
  services?: any[],
  products?: any[]
): ExtractionResult {
  const extractedSlots: Partial<FlowSlots> = {};
  const corrections = detectCorrections(message, currentSlots);
  
  // Extract date
  const date = extractDate(message);
  if (date) extractedSlots.date = date;
  
  // Extract time
  const time = extractTime(message);
  if (time) extractedSlots.time = time;
  
  // Extract phone
  const phone = extractPhone(message);
  if (phone) extractedSlots.customerPhone = phone;
  
  // Extract email
  const email = extractEmail(message);
  if (email) extractedSlots.customerEmail = email;
  
  // Extract name
  const name = extractName(message);
  if (name) extractedSlots.customerName = name;
  
  // Extract quantity
  const quantity = extractQuantity(message);
  if (quantity) extractedSlots.quantity = quantity;
  
  // Match service by name if services provided
  if (services && services.length > 0) {
    const lowerMsg = message.toLowerCase();
    for (const service of services) {
      if (lowerMsg.includes(service.name.toLowerCase())) {
        extractedSlots.serviceId = service.id;
        extractedSlots.serviceName = service.name;
        break;
      }
    }
  }
  
  // Match product by name if products provided
  if (products && products.length > 0) {
    const lowerMsg = message.toLowerCase();
    for (const product of products) {
      if (lowerMsg.includes(product.name.toLowerCase())) {
        extractedSlots.productId = product.id;
        extractedSlots.productName = product.name;
        break;
      }
    }
  }
  
  return { slots: extractedSlots, corrections };
}

// Merge new slots with existing, respecting corrections
export function mergeSlots(
  currentSlots: FlowSlots,
  newSlots: Partial<FlowSlots>,
  corrections: string[]
): FlowSlots {
  const merged = { ...currentSlots };
  
  for (const [key, value] of Object.entries(newSlots)) {
    if (value !== null && value !== undefined) {
      // Always update if it's a correction or if slot was empty
      const slotKey = key as keyof FlowSlots;
      if (corrections.includes(slotKey) || !merged[slotKey]) {
        (merged as any)[slotKey] = value;
      }
    }
  }
  
  return merged;
}

// Build slot summary for confirmation
export function buildSlotSummary(slots: FlowSlots, flowType: 'SERVICE' | 'PRODUCT'): string {
  const parts: string[] = [];
  
  if (flowType === 'SERVICE') {
    if (slots.serviceName) parts.push(`Service: ${slots.serviceName}`);
    if (slots.date) parts.push(`Date: ${slots.date}`);
    if (slots.time) parts.push(`Time: ${slots.time}`);
  } else {
    if (slots.productName) parts.push(`Product: ${slots.productName}`);
    if (slots.quantity) parts.push(`Quantity: ${slots.quantity}`);
    if (slots.selectedProducts?.length) {
      const productList = slots.selectedProducts
        .map(p => `${p.quantity}x ${p.productName}`)
        .join(', ');
      parts.push(`Products: ${productList}`);
    }
  }
  
  if (slots.customerName) parts.push(`Name: ${slots.customerName}`);
  if (slots.customerPhone) parts.push(`Phone: ${slots.customerPhone}`);
  if (slots.customerEmail) parts.push(`Email: ${slots.customerEmail}`);
  
  return parts.join('\n');
}
