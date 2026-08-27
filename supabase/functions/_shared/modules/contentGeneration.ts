/**
 * Module 12: Content Generation
 *
 * Drafts blog posts, ad copy, and social captions from a content calendar
 * or a one-line prompt from the owner. Pure AI generation — no external
 * connections needed. When it needs to actually POST the content, it
 * hands off to the Social Media Posting module (#5) which checks its
 * own connector tier.
 *
 * Tier: 1 (fully autonomous for generation)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ContentRequest {
  type: "blog_post" | "ad_copy" | "social_caption" | "email_subject" | "tagline" | "product_description";
  topic: string;
  tone?: string;
  audience?: string;
  platform?: string;      // For social: instagram, facebook, linkedin, etc.
  length?: "short" | "medium" | "long";
  keywords?: string[];
  extra_context?: string;
}

export interface GeneratedContent {
  title?: string;
  body: string;
  hashtags?: string[];
  call_to_action?: string;
  platform_notes?: string;  // Platform-specific advice
  character_count: number;
  within_limit: boolean;
}

const PLATFORM_LIMITS: Record<string, number> = {
  twitter_x: 280,
  instagram_caption: 2200,
  facebook: 63206,
  linkedin: 3000,
  tiktok_caption: 300,
  email_subject: 100,
  blog_post: 50000,
  ad_copy: 1000,
};

/**
 * Generate content using the AI. Returns structured output.
 * This calls the Gemini API directly — no external connection needed.
 */
export async function generateContent(
  supabase: SupabaseClient,
  receptionistId: string,
  request: ContentRequest,
): Promise<GeneratedContent> {
  // Load business context for personalized content
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, business_type, tone, knowledge_base")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "the business";
  const businessType = rec?.business_type || "";
  const tone = request.tone || rec?.tone || "professional";

  // Build the prompt
  const prompt = buildContentPrompt(request, businessName, businessType, tone);

  // Call Gemini
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse the generated content
  const platform = request.platform || "general";
  const charLimit = PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.blog_post;

  return {
    body: text.trim(),
    character_count: text.trim().length,
    within_limit: text.trim().length <= charLimit,
  };
}

/**
 * Generate multiple content variants for A/B testing.
 */
export async function generateContentVariants(
  supabase: SupabaseClient,
  receptionistId: string,
  request: ContentRequest,
  count: number = 3,
): Promise<GeneratedContent[]> {
  const variants = await Promise.all(
    Array.from({ length: count }, () =>
      generateContent(supabase, receptionistId, request),
    ),
  );

  // Deduplicate by body text
  const seen = new Set<string>();
  return variants.filter((v) => {
    if (seen.has(v.body)) return false;
    seen.add(v.body);
    return true;
  });
}

// ── Prompt Builder ─────────────────────────────────────────────────

function buildContentPrompt(
  request: ContentRequest,
  businessName: string,
  businessType: string,
  tone: string,
): string {
  const lengthMap = { short: "1-2 sentences", medium: "1 paragraph", long: "3-5 paragraphs" };
  const length = lengthMap[request.length || "medium"];

  let prompt = `You are a marketing copywriter for ${businessName}${businessType ? `, a ${businessType}` : ""}.

Write a ${request.type.replace(/_/g, " ")} about: ${request.topic}

Tone: ${tone}
Length: ${length}
Audience: ${request.audience || "potential customers"}

${request.keywords?.length ? `Include these keywords naturally: ${request.keywords.join(", ")}` : ""}
${request.extra_context ? `Additional context: ${request.extra_context}` : ""}
`;

  if (request.platform) {
    const limit = PLATFORM_LIMITS[request.platform] || PLATFORM_LIMITS.blog_post;
    prompt += `\nPlatform: ${request.platform} (max ${limit} characters)`;
  }

  prompt += `\n\nReturn the content as plain text, ready to use. Do not include labels or metadata.`;

  return prompt;
}
