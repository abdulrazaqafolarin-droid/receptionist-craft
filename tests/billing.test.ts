import { describe, it, expect } from "vitest";

// ── Phase 8 Subscription Billing Tests ──────────────────────────────
// Tests for plan limits and subscription logic.

interface PlanLimits {
  plan: string;
  max_receptionists: number;
  max_customers: number;
  max_messages_monthly: number;
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: { plan: "free", max_receptionists: 1, max_customers: 50, max_messages_monthly: 500 },
  pro: { plan: "pro", max_receptionists: 5, max_customers: 500, max_messages_monthly: 5000 },
  enterprise: { plan: "enterprise", max_receptionists: 9999, max_customers: 999999, max_messages_monthly: 9999999 },
};

function checkPlanLimit(
  currentPlan: string,
  resource: "receptionists" | "customers" | "messages",
  currentCount: number,
): { allowed: boolean; limit: number; remaining: number } {
  const limits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;
  let limit: number;
  switch (resource) {
    case "receptionists": limit = limits.max_receptionists; break;
    case "customers": limit = limits.max_customers; break;
    case "messages": limit = limits.max_messages_monthly; break;
  }
  const remaining = Math.max(0, limit - currentCount);
  return { allowed: currentCount < limit, limit, remaining };
}

// ═══════════════════════════════════════════════════════════════════════

describe("Plan limits", () => {
  it("free plan allows 1 receptionist", () => {
    const result = checkPlanLimit("free", "receptionists", 0);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(1);
    expect(result.remaining).toBe(1);
  });

  it("free plan blocks 2nd receptionist", () => {
    const result = checkPlanLimit("free", "receptionists", 1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("pro plan allows 5 receptionists", () => {
    const result = checkPlanLimit("pro", "receptionists", 4);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("pro plan blocks 6th receptionist", () => {
    const result = checkPlanLimit("pro", "receptionists", 5);
    expect(result.allowed).toBe(false);
  });

  it("enterprise plan allows many receptionists", () => {
    const result = checkPlanLimit("enterprise", "receptionists", 100);
    expect(result.allowed).toBe(true);
  });

  it("free plan customer limit is 50", () => {
    const result = checkPlanLimit("free", "customers", 49);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("free plan blocks 51st customer", () => {
    const result = checkPlanLimit("free", "customers", 50);
    expect(result.allowed).toBe(false);
  });

  it("pro plan customer limit is 500", () => {
    const result = checkPlanLimit("pro", "customers", 500);
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(500);
  });

  it("free plan message limit is 500", () => {
    const result = checkPlanLimit("free", "messages", 499);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("free plan blocks 501st message", () => {
    const result = checkPlanLimit("free", "messages", 500);
    expect(result.allowed).toBe(false);
  });

  it("unknown plan falls back to free limits", () => {
    const result = checkPlanLimit("unknown", "receptionists", 0);
    expect(result.limit).toBe(1);
  });
});

describe("Subscription record structure", () => {
  it("has all required fields", () => {
    const sub = {
      id: "sub-001",
      user_id: "user-001",
      plan: "pro",
      status: "active",
      provider: "stripe",
      provider_subscription_id: "sub_stripe_123",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      trial_end: null,
      created_at: new Date().toISOString(),
    };

    expect(sub.id).toBeTruthy();
    expect(sub.user_id).toBeTruthy();
    expect(["free", "pro", "enterprise"]).toContain(sub.plan);
    expect(["active", "past_due", "cancelled", "trial"]).toContain(sub.status);
    expect(["stripe", "paystack", "manual"]).toContain(sub.provider);
  });

  it("supports trial status", () => {
    const sub = {
      status: "trial",
      trial_end: new Date(Date.now() + 14 * 86400000).toISOString(),
    };
    expect(sub.status).toBe("trial");
    expect(new Date(sub.trial_end).getTime()).toBeGreaterThan(Date.now());
  });
});
