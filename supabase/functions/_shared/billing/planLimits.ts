/**
 * Plan Limits Enforcement
 *
 * Checks if a user has exceeded their plan limits before allowing
 * operations like creating receptionists, customers, or sending messages.
 *
 * Usage in edge functions:
 *   const check = await enforcePlanLimit(supabase, userId, "receptionists");
 *   if (!check.allowed) return jsonRes({ ok: false, error: check.reason }, 403);
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type LimitResource = "receptionists" | "customers" | "messages";

interface LimitCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
}

const PLAN_LIMITS: Record<string, Record<LimitResource, number>> = {
  free: { receptionists: 1, customers: 50, messages: 500 },
  pro: { receptionists: 5, customers: 500, messages: 5000 },
  enterprise: { receptionists: 9999, customers: 999999, messages: 9999999 },
};

export async function enforcePlanLimit(
  supabase: SupabaseClient,
  userId: string,
  resource: LimitResource,
): Promise<LimitCheck> {
  // Get user's plan
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();

  const plan = profile?.plan || "free";
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const maxAllowed = limits[resource];

  // Count current usage
  let current = 0;

  if (resource === "receptionists") {
    const { count } = await supabase
      .from("receptionists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    current = count || 0;
  } else if (resource === "customers") {
    // Count customers across all user's receptionists
    const { data: rids } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", userId);
    if (rids && rids.length > 0) {
      const { count } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .in("receptionist_id", rids.map((r) => r.id));
      current = count || 0;
    }
  } else if (resource === "messages") {
    // Count messages in current billing period
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("current_period_start")
      .eq("user_id", userId)
      .maybeSingle();

    const periodStart = sub?.current_period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const { data: rids } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", userId);

    if (rids && rids.length > 0) {
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .in("receptionist_id", rids.map((r) => r.id))
        .gte("created_at", periodStart);
      current = count || 0;
    }
  }

  if (current >= maxAllowed) {
    return {
      allowed: false,
      reason: `${resource} limit reached (${current}/${maxAllowed}) on ${plan} plan. Upgrade to increase your limit.`,
      current,
      limit: maxAllowed,
    };
  }

  return { allowed: true, current, limit: maxAllowed };
}
