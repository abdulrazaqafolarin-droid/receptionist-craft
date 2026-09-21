/**
 * Module 19: Document / Contract Generation
 *
 * AI generates business-specific documents: proposals, contracts,
 * quotes, service agreements. Pure text generation — no external
 * connections needed for creation. Delivery uses existing channels.
 *
 * Tier: 1 (generation is fully autonomous)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DocumentRequest {
  type: "proposal" | "contract" | "quote" | "service_agreement" | "nda" | "invoice";
  customer_name?: string;
  details: Record<string, string | number>;
  extra_instructions?: string;
}

export interface GeneratedDocument {
  type: string;
  title: string;
  body: string;
  format: "text" | "markdown";
  word_count: number;
}

/**
 * Generate a business document.
 */
export async function generateDocument(
  supabase: SupabaseClient,
  receptionistId: string,
  request: DocumentRequest,
): Promise<GeneratedDocument> {
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, business_type, tone, knowledge_base")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "the business";
  const businessType = rec?.business_type || "";

  const prompt = buildDocumentPrompt(request, businessName, businessType, rec?.knowledge_base || "");

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      }),
    },
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    type: request.type,
    title: `${request.type.charAt(0).toUpperCase() + request.type.slice(1).replace(/_/g, " ")} — ${request.customer_name || businessName}`,
    body: text.trim(),
    format: "markdown",
    word_count: wordCount,
  };
}

/**
 * Generate a quote for a specific service.
 */
export async function generateQuote(
  supabase: SupabaseClient,
  receptionistId: string,
  serviceId: string,
  customerId: string,
  customNotes?: string,
): Promise<GeneratedDocument> {
  // Load service details
  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .maybeSingle();

  // Load customer details
  const { data: customer } = await supabase
    .from("customers")
    .select("name, email")
    .eq("id", customerId)
    .maybeSingle();

  return generateDocument(supabase, receptionistId, {
    type: "quote",
    customer_name: customer?.name,
    details: {
      service_name: service?.name || "Service",
      price: service?.price || 0,
      duration: service?.duration_minutes || 0,
      description: service?.description || "",
    },
    extra_instructions: customNotes,
  });
}

function buildDocumentPrompt(
  request: DocumentRequest,
  businessName: string,
  businessType: string,
  knowledgeBase: string,
): string {
  const typeLabels: Record<string, string> = {
    proposal: "business proposal",
    contract: "service contract",
    quote: "price quote / estimate",
    service_agreement: "service agreement",
    nda: "non-disclosure agreement",
    invoice: "invoice",
  };

  const prompt = `You are a professional document writer for ${businessName}${businessType ? `, a ${businessType}` : ""}.

Generate a ${typeLabels[request.type] || request.type} document.

${request.customer_name ? `Customer: ${request.customer_name}` : ""}

Details:
${Object.entries(request.details).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

${knowledgeBase ? `Business context: ${knowledgeBase}` : ""}
${request.extra_instructions ? `Additional instructions: ${request.extra_instructions}` : ""}

Requirements:
- Professional tone
- Include all relevant sections
- Use clear, specific language
- Include payment terms where applicable
- Return as clean markdown
- Do not include placeholder text like [INSERT]`;

  return prompt;
}
