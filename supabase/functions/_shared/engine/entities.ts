// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - ENTITY EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════
// 
// SINGLE entity extractor. Handles services, products, dates, times, contacts.
// ═══════════════════════════════════════════════════════════════════════════

import type { ExtractedEntities } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// TYPO CORRECTIONS
// ═══════════════════════════════════════════════════════════════════════════

const TYPO_MAP: Record<string, string> = {
  // Common typos
  'cok': 'Coke', 'coke': 'Coke', 'cofee': 'Coffee', 'coffe': 'Coffee',
  'apointment': 'appointment', 'appointmnt': 'appointment', 'appoitment': 'appointment',
  'tommorow': 'tomorrow', 'tomorow': 'tomorrow', 'tmrw': 'tomorrow', 'tmr': 'tomorrow',
  'wenesday': 'Wednesday', 'wensday': 'Wednesday', 'thurday': 'Thursday',
  'fone': 'phone', 'adress': 'address', 'adres': 'address',
  'plz': 'please', 'pls': 'please',
  'thx': 'thanks', 'tnx': 'thanks', 'ty': 'thank you',
  'ur': 'your', 'u': 'you', 'r': 'are',
  'wat': 'what', 'wht': 'what',
  'qty': 'quantity', 'pcs': 'pieces',
  'mins': 'minutes', 'hrs': 'hours',
};

// ═══════════════════════════════════════════════════════════════════════════
// INPUT CLEANING
// ═══════════════════════════════════════════════════════════════════════════

export function cleanInput(input: string): string {
  if (!input) return '';
  
  let cleaned = input.trim();
  
  // Apply typo corrections
  const words = cleaned.split(/\s+/);
  const correctedWords = words.map(word => {
    const lowerWord = word.toLowerCase().replace(/[.,!?]/g, '');
    const punctuation = word.slice(lowerWord.length);
    return TYPO_MAP[lowerWord] ? TYPO_MAP[lowerWord] + punctuation : word;
  });
  cleaned = correctedWords.join(' ');
  
  // Normalize punctuation and whitespace
  cleaned = cleaned.replace(/[!?]{3,}/g, '!');
  cleaned = cleaned.replace(/\.{3,}/g, '...');
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  return cleaned;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function extractEntities(
  message: string,
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>,
  products: Array<{ id: string; name: string; price?: number; in_stock?: boolean }>
): ExtractedEntities {
  const entities: ExtractedEntities = {};
  const cleaned = cleanInput(message);
  const lower = cleaned.toLowerCase();
  
  // ─────────────────────────────────────────────────────────────────────────
  // SERVICE MATCHING (fuzzy)
  // ─────────────────────────────────────────────────────────────────────────
  for (const service of services) {
    const serviceLower = service.name.toLowerCase();
    // Exact or partial match
    if (lower.includes(serviceLower) || fuzzyMatch(lower, serviceLower)) {
      entities.service_id = service.id;
      entities.service_name = service.name;
      break;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCT MATCHING (fuzzy)
  // ─────────────────────────────────────────────────────────────────────────
  for (const product of products) {
    const productLower = product.name.toLowerCase();
    if (lower.includes(productLower) || fuzzyMatch(lower, productLower)) {
      entities.product_id = product.id;
      entities.product_name = product.name;
      break;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // QUANTITY EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const qtyPatterns = [
    /(\d+)\s*(?:pieces?|items?|units?|bottles?|cans?|boxes?|packs?|of|x)/i,
    /(?:quantity|qty)[\s:]*(\d+)/i,
    /^(\d+)$/,  // Just a number
  ];
  for (const pattern of qtyPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const qty = parseInt(match[1]);
      if (qty > 0 && qty <= 999) {
        entities.quantity = qty;
        break;
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DATE EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const datePatterns = [
    // Relative dates
    { pattern: /\b(today)\b/i, extract: (m: RegExpMatchArray) => m[0] },
    { pattern: /\b(tomorrow)\b/i, extract: (m: RegExpMatchArray) => m[0] },
    { pattern: /\b(next\s+week)\b/i, extract: (m: RegExpMatchArray) => m[0] },
    { pattern: /\b(this\s+week)\b/i, extract: (m: RegExpMatchArray) => m[0] },
    
    // Day names
    { pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, extract: (m: RegExpMatchArray) => m[0] },
    
    // Ordinal dates: "15th of February", "February 15th"
    { pattern: /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)/i, extract: (m: RegExpMatchArray) => m[0] },
    { pattern: /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i, extract: (m: RegExpMatchArray) => m[0] },
    
    // Numeric: MM/DD or DD/MM/YYYY
    { pattern: /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/, extract: (m: RegExpMatchArray) => m[0] },
    
    // ISO format
    { pattern: /(\d{4})-(\d{2})-(\d{2})/, extract: (m: RegExpMatchArray) => m[0] },
  ];
  
  for (const { pattern, extract } of datePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      entities.date = extract(match);
      break;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // TIME EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const timePatterns = [
    // HH:MM am/pm
    { pattern: /(\d{1,2}):(\d{2})\s*(am|pm)/i, extract: (m: RegExpMatchArray) => m[0] },
    // HH:MM (24h)
    { pattern: /(\d{1,2}):(\d{2})/, extract: (m: RegExpMatchArray) => m[0] },
    // Xam/pm
    { pattern: /(\d{1,2})\s*(am|pm)/i, extract: (m: RegExpMatchArray) => m[0] },
    // Time of day
    { pattern: /\b(morning|afternoon|evening|noon|midnight)\b/i, extract: (m: RegExpMatchArray) => m[0] },
  ];
  
  for (const { pattern, extract } of timePatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      entities.time = extract(match);
      break;
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // NAME EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  // STRICT NAME EXTRACTION — Only extract when user EXPLICITLY states their name
  // DO NOT use loose patterns like "i'm" or "i am" — they match "I'm in pain", "I am not sure"
  // Only use patterns where the SOLE PURPOSE is to declare a name
  // ─────────────────────────────────────────────────────────────────────────
  const namePatterns = [
    // "My name is John" / "My name is John Smith"
    /(?:my\s+name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    // "Call me John" / "You can call me John"
    /(?:(?:you\s+can\s+)?call\s+me|they\s+call\s+me|people\s+call\s+me|just\s+call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    // "The name is John" / "Name: John" / "Name is John"
    /(?:the\s+name\s+is|name[':]?\s*is|name[':]?\s+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    // "I'm John" ONLY when followed by end-of-string or punctuation (not "I'm in pain")
    /\bi'?m\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!?,]?\s*$/i,
    // "I am John" ONLY when followed by end-of-string or punctuation (not "I am not sure")  
    /\bi\s+am\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!?,]?\s*$/i,
    // "This is John" ONLY at start of message (introducing oneself)
    /^this\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];
  
  // Extended blocklist to prevent capturing common conversational words as names
  const NAME_BLOCKLIST = new Set([
    'hello', 'thanks', 'please', 'yes', 'no', 'sure', 'okay', 'great',
    'good', 'fine', 'nice', 'cool', 'right', 'perfect', 'awesome',
    'morning', 'afternoon', 'evening', 'today', 'tomorrow', 'monday',
    'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',
    'ridiculous', 'terrible', 'awful', 'horrible', 'amazing', 'wonderful',
    'urgent', 'emergency', 'appointment', 'booking', 'order', 'delivery',
    'bread', 'cake', 'dental', 'clinic', 'store', 'shop', 'service',
    'the', 'this', 'that', 'what', 'when', 'where', 'how', 'why',
    'not', 'but', 'and', 'for', 'with', 'about', 'just', 'here',
    'in', 'so', 'much', 'very', 'really', 'quite', 'too', 'also',
    'specifically', 'interested', 'looking', 'waiting', 'trying',
  ]);
  
  for (const pattern of namePatterns) {
    const match = message.match(pattern); // Use original to preserve case
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 50) {
      const name = match[1].trim();
      // Block common words
      const nameWords = name.toLowerCase().split(/\s+/);
      const isBlocklisted = nameWords.some(w => NAME_BLOCKLIST.has(w));
      if (!isBlocklisted && name.length >= 2) {
        entities.customer_name = name;
        break;
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // PHONE EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const phonePatterns = [
    // International format
    /(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/,
    // US format
    /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/,
    // Simple digits (10-15 digits)
    /\b(\d{10,15})\b/,
  ];
  
  for (const pattern of phonePatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const digits = match[1].replace(/\D/g, '');
      if (digits.length >= 7 && digits.length <= 15) {
        entities.customer_phone = match[1];
        break;
      }
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // EMAIL EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const emailMatch = cleaned.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    entities.customer_email = emailMatch[1].toLowerCase();
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // DELIVERY ADDRESS EXTRACTION
  // ─────────────────────────────────────────────────────────────────────────
  const addressPatterns = [
    /(?:deliver(?:y)?(?:\s+to)?|send(?:\s+to)?|ship(?:\s+to)?|address\s+is|my\s+address\s+is|at)\s+(.{15,150})/i,
  ];
  
  for (const pattern of addressPatterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      entities.delivery_address = match[1].trim();
      break;
    }
  }
  
  return entities;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUZZY MATCHING HELPER
// ═══════════════════════════════════════════════════════════════════════════

function fuzzyMatch(text: string, target: string): boolean {
  // Check if target words appear in text (for multi-word services/products)
  const targetWords = target.split(/\s+/).filter(w => w.length > 2);
  if (targetWords.length === 0) return false;
  
  let matchedWords = 0;
  for (const word of targetWords) {
    if (text.includes(word)) matchedWords++;
  }
  
  // Match if at least 60% of words match
  return matchedWords / targetWords.length >= 0.6;
}
