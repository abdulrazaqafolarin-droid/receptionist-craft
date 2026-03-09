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
  'wondering', 'thinking', 'feeling', 'working', 'living', 'doing', 'browse',
  'browsing', 'like', 'sorry', 'want', 'need', 'know', 'think', 'see',
  'look', 'tell', 'give', 'take', 'come', 'make', 'find', 'keep',
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
  'everything', 'nothing', 'done', 'again', 'new', 'old',
  // Common short words that look like names
  'sir', 'mam', 'miss', 'mrs', 'dear',
  // Business names that could leak
  'nazdac', 'tess',
  'specifically', 'definitely', 'actually', 'basically', 'honestly',
]);

/**
 * Patterns that indicate the input is a SENTENCE, not a name.
 * If ANY of these match, the entire input is rejected as a name.
 */
const SENTENCE_PATTERNS: RegExp[] = [
  // Contains common verbs (conjugated)
  /\b(i'll|i'd|i'm|i've|i am|i was|i will|i would|i could|i should|i might|i can|i want|i need|i think|i know|i see|i hope|i wish|i like|i love|i hate|i don't|i didn't|i won't|i can't|i couldn't|i shouldn't|i wouldn't)\b/i,
  // Contains "to + verb" patterns
  /\bto\s+(browse|order|book|buy|get|see|check|look|find|make|take|have|know|ask|try|go|come|leave|start|stop|cancel)\b/i,
  // Contains apologies or hedging
  /\b(sorry|apolog|excuse me|pardon|forgive|my bad|oops|whoops)\b/i,
  // Contains question words in question context
  /\b(can you|could you|would you|will you|do you|is there|are there|what is|how do|how can)\b/i,
  // Contains conjunctions suggesting a sentence
  /\b(because|although|however|therefore|instead|otherwise|meanwhile|furthermore)\b/i,
  // Starts with a verb or action word
  /^(let|let's|please|just|maybe|perhaps|actually|honestly|basically|well|so|oh|um|uh|hmm|ah)\b/i,
  // Contains "like to" pattern (e.g., "I'll like to browse")
  /\blike\s+to\b/i,
  // Contains obvious non-name phrases
  /\b(never\s*mind|forget\s*it|hold\s*on|wait\s*a|not\s+sure|no\s+thanks|no\s+thank)\b/i,
];

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
 * Validates a raw user input as a name (used when the AI is explicitly asking for a name).
 * This is stricter than extractValidatedName because the ENTIRE input should be a name,
 * not just contain a name pattern.
 *
 * Returns the cleaned name if valid, or null if rejected.
 */
export function validateDirectNameInput(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // PRE-CHECK: Reject anything that is clearly a sentence or non-name phrase
  // This catches: "I'll like to browse sorry", "The same name give you earlier", etc.
  const HARD_REJECT_WORDS = new Set([
    'browse', 'sorry', 'want', 'like', 'give', 'earlier', 'same',
    'please', 'wait', 'trying', 'thinking', 'actually', 'basically',
    'correct', 'that', 'which', 'earlier', 'previous', 'already',
    'the', 'you', 'your', 'my', 'our', 'their',
  ]);

  const words = trimmed.split(/\s+/);

  // Reject if more than 4 words — no name needs that many
  if (words.length > 4) return null;

  // Reject if any word is in the hard reject list (for multi-word inputs)
  if (words.length > 1) {
    for (const word of words) {
      if (HARD_REJECT_WORDS.has(word.toLowerCase())) return null;
    }
  }

  // Reject if it looks like a sentence (contains verbs, apologies, etc.)
  for (const pattern of SENTENCE_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }

  // Reject if more than 3 words (no name is longer than 3 words)
  if (words.length > 3) return null;

  // If 3 words, only allow if all look like name parts (e.g., "Mary Jane Watson")
  if (words.length === 3) {
    for (const word of words) {
      if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) return null;
      if (word.length < 2 || word.length > 15) return null;
      if (NAME_BLOCKLIST.has(word.toLowerCase())) return null;
    }
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // For 1-2 words, use the existing validator
  return validateCandidateName(trimmed);
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
