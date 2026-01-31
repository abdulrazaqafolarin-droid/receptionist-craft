// ═══════════════════════════════════════════════════════════════════════════
// AI HALLUCINATION GUARD - DATA GROUNDING ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════
// Prevents the AI from inventing: prices, availability, services, products, policies
// All factual answers MUST come from verified database or knowledge base sources.
// ═══════════════════════════════════════════════════════════════════════════

export interface GroundedData {
  services: GroundedService[];
  products: GroundedProduct[];
  businessHours: Record<string, string> | null;
  policies: string[];
  priceRange: { min: number; max: number } | null;
  knowledgeBase: string | null;
}

export interface GroundedService {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number;
  description: string | null;
  active: boolean;
}

export interface GroundedProduct {
  id: string;
  name: string;
  price: number | null;
  stock_quantity: number | null;
  in_stock: boolean;
  description: string | null;
}

/**
 * Sensitive data categories that require grounding
 */
export const GROUNDING_CATEGORIES = {
  pricing: [
    /how much/i,
    /what('s| is) the (price|cost|fee)/i,
    /price (of|for)/i,
    /cost (of|for)/i,
    /what do you charge/i,
    /pricing/i,
    /rate(s)?/i,
    /\$\d+/,
    /free|discount|deal/i,
  ],
  availability: [
    /available/i,
    /open (at|on|from)/i,
    /when (are|do) you/i,
    /hours/i,
    /schedule/i,
    /slot(s)?/i,
    /can I (come|book|get)/i,
    /next available/i,
    /earliest/i,
  ],
  services: [
    /what services/i,
    /do you (offer|provide|do)/i,
    /services offered/i,
    /what can you do/i,
    /list (of )?services/i,
    /menu/i,
    /treatment(s)?/i,
  ],
  products: [
    /what products/i,
    /do you (sell|have)/i,
    /in stock/i,
    /inventory/i,
    /catalog/i,
    /items/i,
    /available products/i,
  ],
  policies: [
    /policy|policies/i,
    /refund/i,
    /cancel(lation)?/i,
    /return/i,
    /reschedule/i,
    /guarantee/i,
    /terms/i,
    /conditions/i,
    /late (fee|policy)/i,
    /no.?show/i,
  ],
};

export interface GroundingCheckResult {
  requiresGrounding: boolean;
  categories: string[];
  dataAvailable: boolean;
  missingData: string[];
  fallbackResponse: string | null;
}

/**
 * Check if a user message requires data grounding
 */
export function checkGroundingRequired(message: string): { required: boolean; categories: string[] } {
  const detectedCategories: string[] = [];
  
  for (const [category, patterns] of Object.entries(GROUNDING_CATEGORIES)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        detectedCategories.push(category);
        break; // One match per category is enough
      }
    }
  }
  
  return {
    required: detectedCategories.length > 0,
    categories: detectedCategories,
  };
}

/**
 * Validate that grounded data exists for the required categories
 */
export function validateGroundedData(
  categories: string[],
  groundedData: GroundedData
): GroundingCheckResult {
  const missingData: string[] = [];
  
  for (const category of categories) {
    switch (category) {
      case 'pricing':
        // Check if we have any price data
        const hasPricing = 
          groundedData.services.some(s => s.price !== null) ||
          groundedData.products.some(p => p.price !== null) ||
          groundedData.priceRange !== null;
        if (!hasPricing) missingData.push('pricing information');
        break;
        
      case 'availability':
        // Check if we have business hours
        if (!groundedData.businessHours) {
          missingData.push('business hours');
        }
        break;
        
      case 'services':
        // Check if we have services
        if (groundedData.services.length === 0) {
          missingData.push('service list');
        }
        break;
        
      case 'products':
        // Check if we have products
        if (groundedData.products.length === 0) {
          missingData.push('product catalog');
        }
        break;
        
      case 'policies':
        // Check if we have policies in knowledge base
        const hasPolicies = 
          groundedData.policies.length > 0 ||
          (groundedData.knowledgeBase && /policy|cancel|refund|return/i.test(groundedData.knowledgeBase));
        if (!hasPolicies) missingData.push('policy information');
        break;
    }
  }
  
  const dataAvailable = missingData.length === 0;
  
  return {
    requiresGrounding: true,
    categories,
    dataAvailable,
    missingData,
    fallbackResponse: dataAvailable ? null : generateFallbackResponse(missingData),
  };
}

/**
 * Generate appropriate fallback response when data is missing
 */
function generateFallbackResponse(missingData: string[]): string {
  const missing = missingData.join(', ');
  
  // Use varied, natural responses
  const responses = [
    `I don't have the ${missing} available right now. Would you like me to connect you with the business directly?`,
    `I'd need to check on that ${missing} for you. Can I have someone from the team reach out to you?`,
    `I want to give you accurate information, but I don't have the current ${missing}. Would you prefer I connect you to a staff member?`,
    `That's a great question! I don't have that specific ${missing} in my system. Let me connect you with someone who can help.`,
  ];
  
  return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Build the hallucination guard prompt block for injection into system prompt
 */
export function buildHallucinationGuardPrompt(groundedData: GroundedData): string {
  // Build verified data summary
  const servicesList = groundedData.services.length > 0
    ? groundedData.services.map(s => {
        const priceStr = s.price !== null ? `$${s.price}` : 'price not set';
        return `  - ${s.name} (${s.duration_minutes}min, ${priceStr})`;
      }).join('\n')
    : '  (No services configured)';
    
  const productsList = groundedData.products.length > 0
    ? groundedData.products.map(p => {
        const priceStr = p.price !== null ? `$${p.price}` : 'price not set';
        const stockStr = p.in_stock ? (p.stock_quantity ? `${p.stock_quantity} in stock` : 'in stock') : 'OUT OF STOCK';
        return `  - ${p.name} (${priceStr}, ${stockStr})`;
      }).join('\n')
    : '  (No products configured)';
    
  const hoursStr = groundedData.businessHours
    ? JSON.stringify(groundedData.businessHours, null, 2)
    : '  (Business hours not configured)';
    
  const policiesStr = groundedData.policies.length > 0
    ? groundedData.policies.map(p => `  - ${p}`).join('\n')
    : '  (No policies configured)';

  return `# 📌 HALLUCINATION GUARD — DATA GROUNDING RULES (CRITICAL)

## ⚠️ ABSOLUTE RULE: NEVER INVENT DATA

You are STRICTLY FORBIDDEN from inventing, estimating, or guessing:
- **PRICES** — NEVER say "I think it costs..." or "It's usually around..."
- **AVAILABILITY** — NEVER guess hours or slot availability
- **SERVICES** — NEVER invent services not in your verified list
- **PRODUCTS** — NEVER invent products or stock levels
- **POLICIES** — NEVER make up cancellation, refund, or business policies

## VERIFIED DATA SOURCES (USE ONLY THESE)

### Services (VERIFIED):
${servicesList}

### Products (VERIFIED):
${productsList}

### Business Hours (VERIFIED):
${hoursStr}

### Policies (VERIFIED):
${policiesStr}

## GROUNDING RULES

1. **For pricing questions:**
   - If price is in verified list → State exact price: "Our [service] is $[price]"
   - If price shows "not set" → Say: "I don't have the exact pricing for that. Would you like me to connect you with the business?"
   - NEVER estimate: "It's probably around $50" ❌

2. **For availability questions:**
   - If hours are configured → State exact hours from verified data
   - If hours are NOT configured → Say: "I don't have the current hours available. Would you like me to find out for you?"
   - NEVER guess: "I think we're open until 6" ❌

3. **For service/product questions:**
   - ONLY mention services/products in your verified list
   - If asked about something not in list → Say: "I don't see that in our current offerings. Here's what we do have: [list available options]"
   - NEVER invent: "Yes, we also offer facial treatments" ❌ (if not in list)

4. **For policy questions:**
   - If policy is in verified list → State exact policy
   - If policy is NOT configured → Say: "I'd want to give you accurate information about our policy. Let me connect you with someone who can help."
   - NEVER invent: "Our cancellation policy is 24 hours" ❌ (if not verified)

## FALLBACK RESPONSES (USE WHEN DATA IS MISSING)

When you don't have verified data, use ONE of these:
- "I don't have that information in my system right now. Would you like me to connect you with the business?"
- "I want to make sure you get accurate information. Let me have someone from the team reach out to you."
- "That's a great question! I don't have the specific details, but I can connect you with someone who does."

## SELF-CHECK BEFORE RESPONDING

Before stating ANY fact about prices, hours, services, products, or policies:
1. Is this data in my VERIFIED sources above? → If YES, proceed
2. If NO → Use fallback response, NEVER guess

**Violating this rule is a CRITICAL FAILURE that damages customer trust.**`;
}

/**
 * Extract grounded data from database records
 */
export function extractGroundedData(
  services: any[],
  receptionist: any,
  knowledgeBase: string | null
): GroundedData {
  const groundedServices: GroundedService[] = services
    .filter(s => !s.is_product && s.active !== false)
    .map(s => ({
      id: s.id,
      name: s.name,
      price: s.price,
      duration_minutes: s.duration_minutes || 30,
      description: s.description,
      active: s.active ?? true,
    }));
    
  const groundedProducts: GroundedProduct[] = services
    .filter(s => s.is_product === true && s.active !== false)
    .map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      stock_quantity: p.stock_quantity,
      in_stock: (p.stock_quantity ?? 0) > 0,
      description: p.description,
    }));
    
  // Extract business hours
  let businessHours: Record<string, string> | null = null;
  if (receptionist.hours_of_operation) {
    businessHours = typeof receptionist.hours_of_operation === 'string'
      ? JSON.parse(receptionist.hours_of_operation)
      : receptionist.hours_of_operation;
  }
  
  // Extract policies from knowledge base
  const policies: string[] = [];
  if (knowledgeBase) {
    // Look for policy-related content
    const policyMatches = knowledgeBase.match(/(?:policy|cancellation|refund|return)[^.!?\n]*[.!?\n]/gi);
    if (policyMatches) {
      policies.push(...policyMatches.map(p => p.trim()));
    }
  }
  
  // Calculate price range
  const allPrices = [...groundedServices, ...groundedProducts]
    .map(item => item.price)
    .filter((p): p is number => p !== null);
  const priceRange = allPrices.length > 0
    ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
    : null;
    
  return {
    services: groundedServices,
    products: groundedProducts,
    businessHours,
    policies,
    priceRange,
    knowledgeBase,
  };
}
