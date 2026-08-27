/**
 * Module 7: Review Management
 *
 * Monitors and responds to Google Reviews, Yelp, Trustpilot, etc.
 * Requires Google Reviews / Yelp / Trustpilot connectors.
 *
 * Tier: 3 (requires review platform connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

/**
 * Monitor reviews. Always Tier 3.
 */
export async function checkReviews(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  reviews: Array<{ platform: string; rating: number; text: string; author: string }>;
  connect_prompt: string;
}> {
  const checks = await Promise.all([
    checkConnectorTier(supabase, userId, "google_reviews"),
    checkConnectorTier(supabase, userId, "yelp"),
    checkConnectorTier(supabase, userId, "trustpilot"),
  ]);

  const anyConnected = checks.some((c) => c.tier <= 1);

  if (anyConnected) {
    return {
      tier: 1,
      success: true,
      reviews: [],
      connect_prompt: "",
    };
  }

  return {
    tier: 3,
    success: false,
    reviews: [],
    connect_prompt: "Connect Google Reviews, Yelp, or Trustpilot to monitor and respond to reviews automatically.",
  };
}

/**
 * Generate a reply to a review. Uses AI — no connector needed for generation.
 */
export async function generateReviewReply(
  supabase: SupabaseClient,
  receptionistId: string,
  review: { rating: number; text: string; author: string },
): Promise<{ reply: string; sentiment: string }> {
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, tone")
    .eq("id", receptionistId)
    .maybeSingle();

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return { reply: "Thank you for your review!", sentiment: "neutral" };

  const prompt = `You are responding to a ${review.rating}-star review for ${rec?.business_name || "a business"}.
Review by ${review.author}: "${review.text}"
Tone: ${rec?.tone || "professional"}

Write a professional, empathetic reply. If the review is negative, acknowledge the concern and offer to make it right. If positive, thank them warmly.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
      }),
    },
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Thank you for your review.";

  return {
    reply: text.trim(),
    sentiment: review.rating >= 4 ? "positive" : review.rating >= 3 ? "neutral" : "negative",
  };
}
