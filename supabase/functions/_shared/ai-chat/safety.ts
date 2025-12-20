// ═══════════════════════════════════════════════════════════════════════════
// LAYER 4: SAFETY CLASSIFIER & RED-TEAMING PATTERNS
// ═══════════════════════════════════════════════════════════════════════════

export const SAFETY_PATTERNS = {
  jailbreak: [
    /ignore (previous|all|your) instructions/i,
    /pretend (you are|to be|you're)/i,
    /act as if/i,
    /forget (everything|your training)/i,
    /you are now/i,
    /disregard (the|your) system/i,
    /bypass (safety|restrictions)/i,
    /roleplay as/i,
  ],
  harmful: [
    /how to (harm|hurt|kill)/i,
    /illegal (drugs|weapons)/i,
    /make (a bomb|explosives)/i,
  ],
  pii_request: [
    /give me (your|the) (password|api key|secret)/i,
    /what is (the|your) (credit card|ssn|social security)/i,
  ],
  bias_triggers: [
    /all (women|men|people of) are/i,
    /why are (asians|blacks|whites|mexicans)/i,
  ]
};

export interface SafetyResult {
  safe: boolean;
  violation?: string;
  severity: 'low' | 'medium' | 'high';
}

export function runSafetyClassifier(message: string): SafetyResult {
  for (const pattern of SAFETY_PATTERNS.jailbreak) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'jailbreak_attempt', severity: 'high' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.harmful) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'harmful_content', severity: 'high' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.pii_request) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'pii_extraction', severity: 'medium' };
    }
  }
  for (const pattern of SAFETY_PATTERNS.bias_triggers) {
    if (pattern.test(message)) {
      return { safe: false, violation: 'bias_trigger', severity: 'medium' };
    }
  }
  return { safe: true, severity: 'low' };
}

export function getSafetyResponse(violation: string): string {
  switch (violation) {
    case 'jailbreak_attempt':
      return "I'm here to help with business-related questions. How can I assist you today?";
    case 'harmful_content':
      return "I'm not able to help with that. Is there something else I can assist you with?";
    case 'pii_extraction':
      return "I can't share sensitive information. What else can I help you with?";
    case 'bias_trigger':
      return "I'd prefer to focus on how I can help you today. What can I do for you?";
    default:
      return "I'm here to help. What would you like to know?";
  }
}
