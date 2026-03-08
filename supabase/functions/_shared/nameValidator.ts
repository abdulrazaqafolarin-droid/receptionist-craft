// ═══════════════════════════════════════════════════════════════════════════
// CENTRALIZED NAME VALIDATION LAYER
// ═══════════════════════════════════════════════════════════════════════════
// Hybrid approach: regex proposes candidates, this layer validates them.
// Single source of truth — used by ALL extraction points.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strict name extraction patterns.
 * Only match when the user EXPLICITLY declares their name.
 */
export const STRICT_NAME_PATTERNS: RegExp[] = [
  // "My name is John" / "My name is John Smith"
  /(?:my\s+name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "Call me John" / "You can call me John" / "Just call me John"
  /(?:(?:you\s+can\s+)?call\s+me|they\s+call\s+me|just\s+call\s+me|people\s+call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "The name is John" / "Name is John" / "Name: John"
  /(?:the\s+name\s+is|name[':]?\s*is|name[':]?\s+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "This is John" ONLY at start of message (introducing oneself)
  /^this\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "It's John" / "Its John" — short self-intro
  /^it'?s\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[.!?,]?\s*$/i,
  // "I'm John" ONLY at end of string (not "I'm in pain", "I'm interested")
  /\bi'?m\s+([A-Z][a-z]+)\s*[.!?,]?\s*$/i,
  // "I am John" ONLY at end of string (not "I am not sure")
  /\bi\s+am\s+([A-Z][a-z]+)\s*[.!?,]?\s*$/i,
];

/**
 * Comprehensive blocklist: common English words, adjectives, verbs,
 * days, months, filler, emotions, business terms that are NOT names.
 */
const NAME_BLOCKLIST = new Set([
  // Greetings & conversational
  'hello', 'hi', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'sure',
  'okay', 'ok', 'great', 'good', 'fine', 'nice', 'cool', 'right', 'perfect',
  'awesome', 'wonderful', 'amazing', 'excellent', 'fantastic',
  // Days & months
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
  // Time of day
  'morning', 'afternoon', 'evening', 'noon', 'midnight', 'tonight', 'today', 'tomorrow',
  // Emotions & adjectives (false positive traps)
  'ridiculous', 'terrible', 'awful', 'horrible', 'angry', 'upset', 'frustrated',
  'confused', 'worried', 'anxious', 'nervous', 'happy', 'sad', 'mad',
  'desperate', 'annoyed', 'furious', 'disgusted', 'shocked', 'scared',
  'interested', 'excited', 'curious', 'concerned', 'disappointed',
  // Common verbs that regex might capture
  'looking', 'waiting', 'trying', 'going', 'coming', 'leaving', 'calling',
  'booking', 'ordering', 'buying', 'getting', 'having', 'making', 'taking',
  'running', 'sitting', 'standing', 'walking', 'talking', 'asking', 'helping',
  'wondering', 'thinking', 'feeling', 'working', 'living', 'doing',
  // Common filler / function words
  'in', 'so', 'much', 'very', 'really', 'quite', 'too', 'also', 'just',
  'not', 'but', 'and', 'for', 'with', 'about', 'here', 'there', 'back',
  'the', 'this', 'that', 'what', 'when', 'where', 'how', 'why', 'who',
  'some', 'any', 'all', 'each', 'every', 'well', 'still', 'already',
  // Business / product terms
  'bread', 'cake', 'dental', 'clinic', 'store', 'shop', 'service', 'product',
  'appointment', 'booking', 'order', 'delivery', 'urgent', 'emergency',
  'available', 'open', 'closed', 'free', 'busy', 'ready',
  // Pronouns & misc
  'someone', 'anyone', 'everyone', 'nobody', 'something', 'anything',
  'everything', 'nothing', 'done', 'again', 'new', 'old', 'sorry',
  // Common short words that look like names
  'sir', 'mam', 'miss', 'mrs', 'dear',
  // Business names that could leak
  'nazdac', 'tess',
  'specifically', 'definitely', 'actually', 'basically', 'honestly',
]);

/**
 * Validates a candidate name extracted by regex.
 * Returns the cleaned name if valid, or null if rejected.
 *
 * Rules:
 * 1. Must be 1-2 words
 * 2. Must not exceed 20 characters total
 * 3. Each word must be 2-15 characters, start with a letter
 * 4. Must not contain verbs, adjectives, filler, or emotional words
 * 5. Must not contain digits or special characters
 * 6. Must not be a single character
 */
export function validateCandidateName(candidate: string | undefined | null): string | null {
  if (!candidate) return null;

  const trimmed = candidate.trim();

  // Rule: max 20 characters
  if (trimmed.length < 2 || trimmed.length > 20) return null;

  // Rule: 1-2 words only
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 2) return null;

  for (const word of words) {
    // Each word must be 2-15 chars
    if (word.length < 2 || word.length > 15) return null;

    // Must start with a letter and contain only letters (possibly hyphens/apostrophes for names like O'Brien, Jean-Luc)
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) return null;

    // Blocklist check (case-insensitive)
    if (NAME_BLOCKLIST.has(word.toLowerCase())) return null;
  }

  // Title-case the result
  const formatted = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return formatted;
}

/**
 * Detects if a message is a back-reference to a previously given name
 * (e.g., "the same name I gave you", "use my earlier name", "you already have it").
 */
export const NAME_BACK_REFERENCE_PATTERN = /\b(same\s+name|name\s+i\s+(?:gave|told|provided|said|mentioned)|(?:use|keep)\s+(?:my|the)\s+(?:earlier|previous|last|same)\s+name|already\s+(?:gave|told|said|provided)\s+(?:you\s+)?(?:my\s+)?name|you\s+(?:already\s+)?have\s+(?:my|it|the)\s+name)\b/i;

export function isNameBackReference(message: string): boolean {
  return NAME_BACK_REFERENCE_PATTERN.test(message);
}

/**
 * Extract a validated name from a message using strict patterns + validation.
 * Returns null if no valid name found — the AI should then ask politely.
 */
export function extractValidatedName(message: string): string | null {
  for (const pattern of STRICT_NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const validated = validateCandidateName(match[1]);
      if (validated) return validated;
    }
  }
  return null;
}

/**
 * Extract a name from a message, resolving back-references from conversation history.
 * Pass the full history array (objects with `sender` and `message` fields).
 * Returns null if no name can be resolved.
 */
export function extractNameWithHistory(message: string, history: Array<{ sender: string; message: string }>): string | null {
  // First try direct extraction
  const direct = extractValidatedName(message);
  if (direct) return direct;

  // Check for back-reference
  if (isNameBackReference(message)) {
    // Scan history in reverse for a previously extracted name
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].sender === 'user' || history[i].sender === 'bot' || history[i].sender === 'ai') {
        // Check user messages for direct name declarations
        if (history[i].sender === 'user') {
          const name = extractValidatedName(history[i].message || '');
          if (name) return name;
        }
        // Check bot messages for "Thank you, Name" acknowledgements
        if (history[i].sender === 'bot' || history[i].sender === 'ai') {
          const thankYou = (history[i].message || '').match(/Thank you,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[!.]/);
          if (thankYou?.[1]) {
            const validated = validateCandidateName(thankYou[1]);
            if (validated) return validated;
          }
        }
      }
    }
  }

  return null;
}
