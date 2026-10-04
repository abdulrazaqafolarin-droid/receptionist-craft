/**
 * Module 5: Social Media Posting
 *
 * Posts content to social media accounts on behalf of the business.
 * Requires Instagram/Facebook/TikTok/LinkedIn connectors.
 *
 * Tier: 3 (requires social media connectors)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkConnectorTier } from "../connectors/registry.ts";
import { generateContent, type ContentRequest } from "./contentGeneration.ts";

export interface SocialPost {
  platform: "instagram" | "facebook" | "tiktok" | "linkedin" | "x";
  content: string;
  hashtags?: string[];
  image_url?: string;
  scheduled_at?: string;
}

/**
 * Post to social media. Tier 1 (connected connector + token) publishes via
 * the provider API; anything less falls back to drafts with an honest
 * connect prompt. Text-first: image publishing where the API allows it,
 * TikTok stays draft-mode (video files + direct-posting approval live
 * outside this module's reach).
 */
export async function postToSocial(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  post: SocialPost,
): Promise<{
  tier: 1 | 2 | 3;
  success: boolean;
  post_id?: string;
  draft?: string;
  connect_prompt: string;
}> {
  // Catalog key for the platform ("x" lives as twitter_x in connectors).
  const connectorKey = post.platform === "x" ? "twitter_x" : post.platform;

  const tierCheck = await checkConnectorTier(supabase, userId, connectorKey);

  // Tier 1: publish for real through the provider API.
  if (tierCheck.tier === 1) {
    const published = await publishTier1(supabase, userId, connectorKey, post);
    if (published.posted) {
      return { tier: 1, success: true, post_id: published.postId, connect_prompt: "" };
    }
    // Token present but publish failed (expired scope, missing page, …):
    // honest tier-2 with the reason, never a silent draft.
    return {
      tier: 2,
      success: true,
      draft: post.content,
      connect_prompt: `Automatic posting hit a snag (${published.reason}). Reconnect ${post.platform} on the Connections page — your caption is ready below to post manually meanwhile.`,
    };
  }

  if (tierCheck.tier >= 2) {
    // We can generate the content but not post it
    const content = await generateContent(supabase, receptionistId, {
      type: "social_caption",
      topic: post.content,
      platform: post.platform,
    });

    return {
      tier: 2,
      success: true,
      draft: content.body,
      connect_prompt: `Connect your ${post.platform} account to post automatically. For now, here's the content to copy and post manually.`,
    };
  }

  return {
    tier: 3,
    success: false,
    connect_prompt: `Social media posting for ${post.platform} is not yet available. This connector is on the roadmap. The AI can draft content for you to post manually.`,
    draft: post.content,
  };
}

/** Read the stored OAuth access token for a connector (server-side only). */
async function connectorToken(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("connectors")
    .select("config_json")
    .eq("user_id", userId)
    .eq("connector_key", connectorKey)
    .maybeSingle() as { data: { config_json?: Record<string, string> } | null };
  const token = data?.config_json?.access_token;
  return typeof token === "string" && token ? token : null;
}

function fullText(post: SocialPost): string {
  const tags = (post.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  return tags ? `${post.content}\n\n${tags}` : post.content;
}

/**
 * Tier-1 publish executors. Text-first; each returns posted=false with a
 * plain-language reason when the provider refuses (scope, page, auth).
 */
async function publishTier1(
  supabase: SupabaseClient,
  userId: string,
  connectorKey: string,
  post: SocialPost,
): Promise<{ posted: boolean; postId?: string; reason?: string }> {
  const token = await connectorToken(supabase, userId, connectorKey);
  if (!token) return { posted: false, reason: "no access token stored — reconnect" };

  try {
    // Facebook Page: resolve first page, publish to its feed.
    if (connectorKey === "facebook") {
      const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?access_token=${encodeURIComponent(token)}`);
      if (!pagesRes.ok) return { posted: false, reason: "provider rejected the token" };
      const pages = ((await pagesRes.json()) as { data?: Array<{ id?: string; access_token?: string; name?: string }> }).data || [];
      const page = pages.find((p) => p.id && p.access_token);
      if (!page) return { posted: false, reason: "no Facebook Page linked to this account" };
      const pub = await fetch(`https://graph.facebook.com/v20.0/${page.id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullText(post), access_token: page.access_token }),
      });
      const out = (await pub.json()) as { id?: string; error?: { message?: string } };
      if (!pub.ok || !out.id) return { posted: false, reason: out.error?.message?.slice(0, 120) || "publish refused" };
      return { posted: true, postId: out.id };
    }

    // Instagram: page → linked IG business account → photo/video container.
    // Text-only posts are not publishable on Instagram; without an image we
    // stay honest instead of faking it.
    if (connectorKey === "instagram") {
      if (!post.image_url) {
        return { posted: false, reason: "Instagram needs an image or video — text-only posts cannot publish" };
      }
      const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
      if (!pagesRes.ok) return { posted: false, reason: "provider rejected the token" };
      const pages = ((await pagesRes.json()) as { data?: Array<{ instagram_business_account?: { id?: string } }> }).data || [];
      const igId = pages.map((p) => p.instagram_business_account?.id).find(Boolean);
      if (!igId) return { posted: false, reason: "no Instagram business account linked to your Facebook Page" };
      const isVideo = /\.(mp4|mov)$/i.test(post.image_url);
      const container = await fetch(`https://graph.facebook.com/v20.0/${igId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isVideo ? { media_type: "REELS", video_url: post.image_url } : { image_url: post.image_url }),
          caption: fullText(post),
          access_token: token,
        }),
      });
      const cOut = (await container.json()) as { id?: string; error?: { message?: string } };
      if (!container.ok || !cOut.id) return { posted: false, reason: cOut.error?.message?.slice(0, 120) || "media container refused" };
      const pub = await fetch(`https://graph.facebook.com/v20.0/${igId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: cOut.id, access_token: token }),
      });
      const pOut = (await pub.json()) as { id?: string; error?: { message?: string } };
      if (!pub.ok || !pOut.id) return { posted: false, reason: pOut.error?.message?.slice(0, 120) || "publish refused" };
      return { posted: true, postId: pOut.id };
    }

    // LinkedIn: resolve person URN, publish text UGC post.
    if (connectorKey === "linkedin") {
      const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!meRes.ok) return { posted: false, reason: "provider rejected the token" };
      const me = (await meRes.json()) as { sub?: string };
      if (!me.sub) return { posted: false, reason: "could not resolve LinkedIn profile" };
      const pub = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({
          author: `urn:li:person:${me.sub}`,
          lifecycleState: "PUBLISHED",
          specificContent: { "com.linkedin.ugc.ShareContent": { shareCommentary: { text: fullText(post) }, shareMediaCategory: "NONE" } },
          visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
        }),
      });
      const pOut = (await pub.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!pub.ok || !pOut.id) return { posted: false, reason: String(pOut.message || "publish refused").slice(0, 120) };
      return { posted: true, postId: pOut.id };
    }

    // X (Twitter): text posts via API v2.
    if (connectorKey === "twitter_x") {
      const pub = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText(post).slice(0, 280) }),
      });
      const pOut = (await pub.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string };
      if (!pub.ok || !pOut.data?.id) return { posted: false, reason: String(pOut.detail || "publish refused").slice(0, 120) };
      return { posted: true, postId: pOut.data.id };
    }

    // TikTok: video publishing needs media files plus a multi-step
    // init/upload/publish flow with direct-posting approval — outside what a
    // text draft can trigger. Honest tier-2, never a fake success.
    return { posted: false, reason: "TikTok publishing needs a video file — drafts stay manual for now" };
  } catch (e) {
    return { posted: false, reason: `provider error: ${String(e).slice(0, 100)}` };
  }
}
