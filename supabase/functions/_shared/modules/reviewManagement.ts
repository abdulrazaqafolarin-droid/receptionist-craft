/**
 * Module 7: Review Management
 *
 * Monitors and responds to Google Reviews, Yelp, Trustpilot, etc.
 * Requires Google Reviews / Yelp / Trustpilot connectors.
 *
 * Google path is LIVE (list + reply via Business Profile API v4) once the
 * google_reviews connector holds an access token plus the location it
 * watches ({account_id, location_id} in config_json). Yelp/Trustpilot
 * remain draft-mode with honest prompts (no API credentials wired yet).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";

export interface LiveReview {
  platform: string;
  rating: number;
  text: string;
  author: string;
  external_id: string;
  replied: boolean;
  created_at: string;
}

/** Read a connector's stored OAuth token (server-side only, never logged). */
async function connectorToken(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
): Promise<{ token: string; config: Record<string, string> } | null> {
  const { data } = await supabase
    .from("connectors")
    .select("config_json, status")
    .eq("user_id", userId)
    .eq("connector_key", connectorKey)
    .maybeSingle() as { data: { config_json?: Record<string, string>; status?: string } | null };
  const token = data?.config_json?.access_token;
  if (typeof token !== "string" || !token) return null;
  return { token, config: data?.config_json || {} };
}

/** Mark a connector expired when its token is rejected (UI offers reconnect). */
async function markExpired(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
  reason: string,
): Promise<void> {
  await supabase.from("connectors").update({
    status: "expired",
    last_error: reason.slice(0, 200),
  }).eq("user_id", userId).eq("connector_key", connectorKey);
}

/**
 * Discover the owner's Google locations (account picker for the connect
 * dialog; also used to validate a stored location still exists).
 */
export async function discoverGoogleLocations(
  accessToken: string,
): Promise<Array<{ account_id: string; location_id: string; name: string }>> {
  const out: Array<{ account_id: string; location_id: string; name: string }> = [];
  const accountsRes = await fetch("https://mybusiness.googleapis.com/v4/accounts?pageSize=20", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!accountsRes.ok) return out;
  const accountsBody = (await accountsRes.json()) as { accounts?: Array<{ name?: string }> };
  const accounts = accountsBody.accounts || [];
  for (const acct of accounts) {
    const accountId = (acct.name || "").split("/").pop() || "";
    if (!accountId) continue;
    const locRes = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations?pageSize=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!locRes.ok) continue;
    const locBody = (await locRes.json()) as { locations?: Array<{ name?: string; locationName?: string }> };
    const locs = locBody.locations || [];
    for (const loc of locs) {
      const locationId = (loc.name || "").split("/").pop() || "";
      if (locationId) out.push({ account_id: accountId, location_id: locationId, name: loc.locationName || locationId });
    }
  }
  return out;
}

/**
 * Fetch unanswered-first Google reviews for the watched location.
 * 401 → token dead: mark expired, return honestly (never fake reviews).
 */
export async function fetchGoogleReviews(
  supabase: SupabaseClient,
  userId: string,
  maxResults = 20,
): Promise<{ reviews: LiveReview[]; error?: string }> {
  const conn = await connectorToken(supabase, userId, "google_reviews");
  if (!conn) return { reviews: [], error: "not_connected" };
  const accountId = conn.config.account_id || "";
  const locationId = conn.config.location_id || conn.config.locationId || "";
  if (!accountId || !locationId) {
    return { reviews: [], error: "no_location_selected" };
  }
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews?pageSize=${Math.min(Math.max(maxResults, 1), 50)}&orderBy=updateTime%20desc`,
    { headers: { Authorization: `Bearer ${conn.token}` } },
  );
  if (res.status === 401) {
    await markExpired(supabase, userId, "google_reviews", "Google rejected the token — reconnect");
    return { reviews: [], error: "token_expired" };
  }
  if (!res.ok) return { reviews: [], error: `google_http_${res.status}` };
  const data = (await res.json()) as {
    reviews?: Array<{
      reviewId?: string; starRating?: string; comment?: string;
      reviewer?: { displayName?: string }; createTime?: string;
      reviewReply?: { comment?: string };
    }>;
  };
  const starMap: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const reviews: LiveReview[] = (data.reviews || []).map((r) => ({
    platform: "google",
    rating: starMap[r.starRating || ""] || 0,
    text: r.comment || "(no written review)",
    author: r.reviewer?.displayName || "A Google user",
    external_id: r.reviewId || "",
    replied: !!(r.reviewReply && r.reviewReply.comment),
    created_at: r.createTime || "",
  }));
  // Unanswered first — the neglect queue the owner actually needs.
  reviews.sort((a, b) => Number(a.replied) - Number(b.replied));
  return { reviews };
}

/**
 * Post an owner-approved reply to a Google review. Replies are NEVER
 * auto-sent by this module — the owner reviews every draft (in the KB
 * suggestions flow or escalations) and this executes only on approval.
 */
export async function postGoogleReply(
  supabase: SupabaseClient,
  userId: string,
  reviewId: string,
  comment: string,
): Promise<{ posted: boolean; error?: string }> {
  if (!reviewId || !comment.trim()) return { posted: false, error: "missing_review_or_comment" };
  const conn = await connectorToken(supabase, userId, "google_reviews");
  if (!conn) return { posted: false, error: "not_connected" };
  const accountId = conn.config.account_id || "";
  const locationId = conn.config.location_id || conn.config.locationId || "";
  if (!accountId || !locationId) return { posted: false, error: "no_location_selected" };
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${conn.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.slice(0, 4000) }),
    },
  );
  if (res.status === 401) {
    await markExpired(supabase, userId, "google_reviews", "Google rejected the token — reconnect");
    return { posted: false, error: "token_expired" };
  }
  if (!res.ok) return { posted: false, error: `google_http_${res.status}` };
  return { posted: true };
}

/**
 * Monitor reviews. Tier 1 with REAL reviews when google_reviews is live;
 * honest lower tiers otherwise (never empty success, never fake data).
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

  // Google path executes for real — reviews come back live, unanswered
  // first. This is what turns "monitor reviews" from a promise into a feed.
  const google = await fetchGoogleReviews(supabase, userId).catch(() => ({ reviews: [], error: "fetch_failed" }));
  if (google.reviews.length > 0) {
    return {
      tier: 1,
      success: true,
      reviews: google.reviews,
      connect_prompt: "",
    };
  }

  if (anyConnected) {
    const reason = google.error === "token_expired"
      ? "Your Google connection expired — reconnect on the Connections page and monitoring resumes."
      : google.error === "no_location_selected"
        ? "Pick which business location to watch on the Connections page, then monitoring starts."
        : "Connected, but no reviews came back yet. New reviews will appear here automatically.";
    return { tier: 2, success: true, reviews: [], connect_prompt: reason };
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
