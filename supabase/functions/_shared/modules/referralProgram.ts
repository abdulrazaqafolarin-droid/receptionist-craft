/**
 * Module 14: Referral Program
 *
 * Generates unique referral codes, tracks who referred whom,
 * and manages reward fulfillment.
 *
 * Tier 1: Pure tracking + AI messaging — fully autonomous
 * Tier 2: SMS/email delivery of referral codes — needs connector
 * Tier 3: Reward fulfillment (gift cards, discounts) — needs payment connector
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../channels/emailSender.ts";
import { sendSms } from "../channels/smsSender.ts";

export interface ReferralConfig {
  referrer_reward: string;        // e.g., "10% off next visit"
  referee_reward: string;         // e.g., "Free consultation"
  code_length: number;
  max_referrals_per_customer: number;
  channels: ("email" | "sms" | "chat")[];
}

export interface ReferralCode {
  code: string;
  customer_id: string;
  referral_count: number;
  rewards_earned: number;
  created_at: string;
}

const DEFAULT_CONFIG: ReferralConfig = {
  referrer_reward: "10% off your next visit",
  referee_reward: "Free first consultation",
  code_length: 8,
  max_referrals_per_customer: 999,
  channels: ["chat"],
};

/**
 * Generate a unique referral code for a customer.
 */
export async function generateReferralCode(
  supabase: SupabaseClient,
  receptionistId: string,
  customerId: string,
  config: Partial<ReferralConfig> = {},
): Promise<{ code: string; message: string }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check if customer already has a code
  const { data: existing } = await supabase
    .from("conversion_events")
    .select("metadata")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "referral_code_created")
    .eq("session_id", customerId)
    .maybeSingle();

  if (existing?.metadata?.code) {
    return {
      code: existing.metadata.code as string,
      message: `Your referral code is ${existing.metadata.code}. Share it with friends — when they book, you both get a reward!`,
    };
  }

  // Generate new code
  const code = generateCode(cfg.code_length);

  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: customerId,
    event_type: "referral_code_created",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      code,
      referrer_reward: cfg.referrer_reward,
      referee_reward: cfg.referee_reward,
    },
  });

  return {
    code,
    message: `Your referral code is ${code}. Share it with friends — when they book, you get ${cfg.referrer_reward} and they get ${cfg.referee_reward}!`,
  };
}

/**
 * Track a referral conversion.
 */
export async function trackReferralConversion(
  supabase: SupabaseClient,
  receptionistId: string,
  referralCode: string,
  newCustomerId: string,
): Promise<{ success: boolean; message: string }> {
  // Find the original referrer
  const { data: event } = await supabase
    .from("conversion_events")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "referral_code_created")
    .like("metadata->>code", referralCode)
    .maybeSingle();

  if (!event) {
    return { success: false, message: "Invalid referral code" };
  }

  // Track the conversion
  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: event.session_id,
    event_type: "referral_conversion",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      referral_code: referralCode,
      new_customer_id: newCustomerId,
      referrer_customer_id: event.session_id,
    },
  });

  return {
    success: true,
    message: `Referral tracked! The referrer will receive their reward.`,
  };
}

/**
 * Get referral analytics.
 */
export async function getReferralAnalytics(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<{
  total_codes_issued: number;
  total_conversions: number;
  conversion_rate: number;
  top_referrers: Array<{ customer_id: string; referral_count: number }>;
}> {
  const codesRes = await supabase
    .from("conversion_events")
    .select("session_id")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "referral_code_created");

  const conversionsRes = await supabase
    .from("conversion_events")
    .select("metadata")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "referral_conversion");

  const codes = codesRes.data || [];
  const conversions = conversionsRes.data || [];

  // Count per referrer
  const referrerCounts = new Map<string, number>();
  conversions.forEach((c) => {
    const referrer = c.metadata?.referrer_customer_id;
    if (referrer) referrerCounts.set(referrer, (referrerCounts.get(referrer) || 0) + 1);
  });

  return {
    total_codes_issued: codes.length,
    total_conversions: conversions.length,
    conversion_rate: codes.length > 0 ? conversions.length / codes.length : 0,
    top_referrers: Array.from(referrerCounts.entries())
      .map(([customer_id, referral_count]) => ({ customer_id, referral_count }))
      .sort((a, b) => b.referral_count - a.referral_count)
      .slice(0, 10),
  };
}

function generateCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "REF-";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
