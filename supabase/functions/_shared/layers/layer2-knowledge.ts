// ═══════════════════════════════════════════════════════════════════════════
// LAYER 2: KNOWLEDGE & GROUNDING (RAG)
// ═══════════════════════════════════════════════════════════════════════════
// This layer handles retrieval-augmented generation (RAG) for factual grounding.
// All factual answers MUST come from verified knowledge sources.
// ═══════════════════════════════════════════════════════════════════════════

export interface BusinessInfo {
  businessName: string;
  businessType?: string;
  phone?: string;
  address?: string;
  website?: string;
  timezone?: string;
  hoursOfOperation?: Record<string, any> | string;
  knowledgeBase?: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface Service {
  name: string;
  description?: string;
  duration_minutes?: number;
}

/**
 * Confidence levels for knowledge sources
 */
export const CONFIDENCE_LEVELS = {
  HIGH: 'HIGH CONFIDENCE',      // Direct from database, verified
  MEDIUM: 'MEDIUM CONFIDENCE',  // Auto-generated, may need verification
  LOW: 'LOW CONFIDENCE',        // Inferred, should ask user
} as const;

/**
 * Build a structured knowledge base from business data
 */
export function buildKnowledgeBase(
  business: BusinessInfo,
  faqs: FAQ[],
  services: Service[]
): string {
  const sections: string[] = [];

  // Business Information (HIGH CONFIDENCE - Direct from database)
  sections.push(`## VERIFIED BUSINESS INFORMATION [${CONFIDENCE_LEVELS.HIGH}]`);
  sections.push(`Business: ${business.businessName}`);
  if (business.businessType) sections.push(`Type: ${business.businessType}`);
  if (business.phone) sections.push(`Phone: ${business.phone}`);
  if (business.address) sections.push(`Address: ${business.address}`);
  if (business.website) sections.push(`Website: ${business.website}`);
  if (business.timezone) sections.push(`Timezone: ${business.timezone}`);

  // Hours of Operation
  if (business.hoursOfOperation) {
    sections.push(`\n## HOURS OF OPERATION [${CONFIDENCE_LEVELS.HIGH}]`);
    if (typeof business.hoursOfOperation === 'object') {
      sections.push(JSON.stringify(business.hoursOfOperation, null, 2));
    } else {
      sections.push(business.hoursOfOperation);
    }
  }

  // Services (HIGH CONFIDENCE - Direct from database)
  if (services && services.length > 0) {
    sections.push(`\n## AVAILABLE SERVICES [${CONFIDENCE_LEVELS.HIGH}]`);
    services.forEach((s) => {
      let serviceDesc = `- **${s.name}**`;
      if (s.duration_minutes) serviceDesc += ` (${s.duration_minutes} minutes)`;
      if (s.description) serviceDesc += `: ${s.description}`;
      sections.push(serviceDesc);
    });
  }

  // FAQs (HIGH CONFIDENCE - Curated by business owner)
  if (faqs && faqs.length > 0) {
    sections.push(`\n## FREQUENTLY ASKED QUESTIONS [${CONFIDENCE_LEVELS.HIGH}]`);
    faqs.forEach((f) => {
      sections.push(`Q: ${f.question}`);
      sections.push(`A: ${f.answer}\n`);
    });
  }

  // Knowledge Base (MEDIUM CONFIDENCE - May be auto-generated)
  if (business.knowledgeBase) {
    sections.push(`\n## ADDITIONAL BUSINESS KNOWLEDGE [${CONFIDENCE_LEVELS.MEDIUM}]`);
    sections.push(business.knowledgeBase);
  }

  return sections.join('\n');
}

/**
 * Build the RAG grounding prompt
 */
export function buildKnowledgePrompt(knowledgeBase: string): string {
  return `# 📌 KNOWLEDGE-GROUNDED ANSWERING (RAG + VERIFICATION LAYER)

Before answering ANY factual question, you MUST:
1. Check if the answer exists in the knowledge base
2. Retrieve the relevant information
3. Cross-verify the answer internally
4. If uncertain, do NOT guess — ask a clarifying question
5. Provide the source of information if appropriate

## If Information Is Missing

You MUST say:
- "I don't have that information right now, but I can check."
- "Let me verify that and get back to you."
- "Would you like me to connect you to a staff member?"

**NEVER invent information.**

## Retrieval Behavior (RAG Logic)

When answering questions:
1. Search knowledge base FIRST
2. Only answer confidently from [HIGH CONFIDENCE] sources
3. NEVER invent policies, prices, or data
4. Cite sources if required

## 🎯 CONTEXTUAL FILTERING (CRITICAL — APPLY BEFORE EVERY RESPONSE)

Before presenting ANY list of services or products, you MUST perform this internal reasoning:

1. **Identify the customer's need**: What symptom, problem, goal, or desire did the customer express?
2. **Filter ruthlessly**: Only include services/products that DIRECTLY address what the customer described.
3. **Never dump the full list**: If the customer gave you context about their situation, showing everything is lazy and unhelpful.

### Examples of CORRECT contextual filtering:
- Customer says "I have a toothache" → Only show pain-related services (emergency exam, root canal, extraction). Do NOT show whitening, cleaning, or cosmetic services.
- Customer says "I want whiter teeth" → Only show whitening and cosmetic options. Do NOT show fillings, extractions, or emergency services.
- Customer says "my car is making a strange noise" → Only show diagnostic and repair services. Do NOT show detailing or tire rotation.
- Customer says "I need a gift for my mom" → Only show gift-appropriate products. Do NOT show the entire catalog.

### Examples of WRONG responses (NEVER DO):
- ❌ Customer describes a specific problem → You list ALL services with "Here's everything we offer!"
- ❌ Customer mentions one need → You present 10+ unrelated options
- ❌ Customer says "I need help with X" → You respond with the entire service menu

### When IS it okay to show the full list?
- Customer explicitly asks "What do you offer?" or "Show me everything"
- Customer gives NO context about their needs (general browsing)
- Customer asks "What else do you have?" after seeing filtered results

**REMEMBER**: A smart receptionist doesn't hand someone the entire menu when they say "I'm looking for something for a headache." They walk you to the right aisle.

### Your Knowledge Base:
${knowledgeBase}`;
}
