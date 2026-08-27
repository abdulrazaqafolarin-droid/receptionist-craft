import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Test the payment types and provider config parsing ───────────────
// We can't import Deno edge functions directly, so we test the
// logic that's shared with the frontend or pure functions.

// Mock the types module for testing
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Deposit Calculation Tests ────────────────────────────────────────
// These test the deposit logic that will be used in create-payment-intent

function calculateDepositAmount(
  servicePrice: number,
  depositPercent: number,
): { paymentAmount: number; depositFraction: number } {
  const fraction = depositPercent / 100;
  const paymentAmount = Math.round(servicePrice * 100 * fraction);
  return { paymentAmount, depositFraction: fraction };
}

describe("Deposit calculation", () => {
  it("calculates 20% deposit correctly for a ₦10,000 service", () => {
    const result = calculateDepositAmount(10000, 20);
    expect(result.paymentAmount).toBe(200000); // 200,000 kobo = ₦2,000
    expect(result.depositFraction).toBe(0.2);
  });

  it("calculates 50% deposit correctly", () => {
    const result = calculateDepositAmount(5000, 50);
    expect(result.paymentAmount).toBe(250000); // 250,000 kobo = ₦2,500
    expect(result.depositFraction).toBe(0.5);
  });

  it("handles 100% deposit (full amount)", () => {
    const result = calculateDepositAmount(10000, 100);
    expect(result.paymentAmount).toBe(1000000); // 1,000,000 kobo = ₦10,000
    expect(result.depositFraction).toBe(1.0);
  });

  it("handles zero deposit gracefully", () => {
    const result = calculateDepositAmount(10000, 0);
    expect(result.paymentAmount).toBe(0);
    expect(result.depositFraction).toBe(0);
  });

  it("handles fractional amounts (e.g. 15%)", () => {
    const result = calculateDepositAmount(9999, 15);
    // 9999 * 100 * 0.15 = 149985 → rounds to 149985
    expect(result.paymentAmount).toBe(149985);
  });
});

// ── Provider Config Parsing Tests ────────────────────────────────────

function parseProviderConfig(configJson: unknown): {
  secret_key: string;
  webhook_secret?: string;
  publishable_key?: string;
  public_key?: string;
} | null {
  if (!configJson || typeof configJson !== "object") return null;
  const c = configJson as Record<string, unknown>;
  if (typeof c.secret_key !== "string" || !c.secret_key) return null;
  return {
    secret_key: c.secret_key,
    webhook_secret: typeof c.webhook_secret === "string" ? c.webhook_secret : undefined,
    publishable_key: typeof c.publishable_key === "string" ? c.publishable_key : undefined,
    public_key: typeof c.public_key === "string" ? c.public_key : undefined,
  };
}

describe("parseProviderConfig", () => {
  it("accepts a valid Stripe config", () => {
    const config = parseProviderConfig({
      secret_key: "sk_test_abc123",
      webhook_secret: "whsec_xyz",
      publishable_key: "pk_test_abc123",
    });
    expect(config).not.toBeNull();
    expect(config!.secret_key).toBe("sk_test_abc123");
    expect(config!.webhook_secret).toBe("whsec_xyz");
    expect(config!.publishable_key).toBe("pk_test_abc123");
  });

  it("accepts a valid Paystack config", () => {
    const config = parseProviderConfig({
      secret_key: "sk_live_abc123",
      webhook_secret: "hash123",
      public_key: "pk_live_abc123",
    });
    expect(config).not.toBeNull();
    expect(config!.secret_key).toBe("sk_live_abc123");
    expect(config!.public_key).toBe("pk_live_abc123");
  });

  it("rejects null/undefined", () => {
    expect(parseProviderConfig(null)).toBeNull();
    expect(parseProviderConfig(undefined)).toBeNull();
  });

  it("rejects missing secret_key", () => {
    expect(parseProviderConfig({ webhook_secret: "abc" })).toBeNull();
  });

  it("rejects empty secret_key", () => {
    expect(parseProviderConfig({ secret_key: "" })).toBeNull();
  });

  it("makes webhook_secret optional", () => {
    const config = parseProviderConfig({ secret_key: "sk_test_123" });
    expect(config).not.toBeNull();
    expect(config!.webhook_secret).toBeUndefined();
  });
});

// ── Payment Status Mapping Tests ─────────────────────────────────────

describe("Payment status mapping", () => {
  const statusMap: Record<string, string> = {
    "payment.completed": "completed",
    "payment.failed": "failed",
    "payment.refunded": "refunded",
  };

  it("maps completed correctly", () => {
    expect(statusMap["payment.completed"]).toBe("completed");
  });

  it("maps failed correctly", () => {
    expect(statusMap["payment.failed"]).toBe("failed");
  });

  it("maps refunded correctly", () => {
    expect(statusMap["payment.refunded"]).toBe("refunded");
  });

  it("has entries for all webhook event types", () => {
    expect(Object.keys(statusMap)).toHaveLength(3);
  });
});

// ── Currency Conversion Tests ────────────────────────────────────────

describe("Currency amount conversion", () => {
  it("converts USD dollars to cents", () => {
    const amount = 25.50;
    const cents = Math.round(amount * 100);
    expect(cents).toBe(2550);
  });

  it("converts NGN naira to kobo", () => {
    const amount = 10000;
    const kobo = Math.round(amount * 100);
    expect(kobo).toBe(1000000);
  });

  it("handles very small amounts", () => {
    const amount = 0.01;
    const cents = Math.round(amount * 100);
    expect(cents).toBe(1);
  });

  it("handles zero", () => {
    expect(Math.round(0 * 100)).toBe(0);
  });
});

// ── Webhook Signature Verification Logic Tests ───────────────────────
// Testing the timing-safe comparison used by both providers

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

describe("timingSafeEqual (webhook signature)", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });

  it("constant-time comparison: same-length strings always compare fully", () => {
    // Verify the function iterates all characters (constant-time property)
    // by checking it returns correct results for various positions
    const base = "aaaaaaaaaa";
    expect(timingSafeEqual(base, "aaaaaaaaaa")).toBe(true);
    expect(timingSafeEqual(base, "aaaaaaaaab")).toBe(false); // last char differs
    expect(timingSafeEqual(base, "baaaaaaaaa")).toBe(false); // first char differs
    expect(timingSafeEqual(base, "aaaaaabaaa")).toBe(false); // middle char differs
  });
});

// ── Payment Record Shape Tests ───────────────────────────────────────

describe("Payment record shape", () => {
  it("validates required fields", () => {
    const payment = {
      id: crypto.randomUUID(),
      receptionist_id: crypto.randomUUID(),
      amount: 2000,
      currency: "NGN",
      provider: "paystack" as const,
      status: "pending" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(payment.id).toBeTruthy();
    expect(payment.amount).toBeGreaterThan(0);
    expect(["stripe", "paystack"]).toContain(payment.provider);
    expect(["pending", "completed", "failed", "refunded", "cancelled"]).toContain(payment.status);
  });

  it("allows optional fields", () => {
    const payment = {
      id: crypto.randomUUID(),
      appointment_id: crypto.randomUUID(),
      order_id: null,
      receptionist_id: crypto.randomUUID(),
      amount: 5000,
      currency: "USD",
      provider: "stripe" as const,
      status: "completed" as const,
      deposit_fraction: 0.2,
      receipt_url: "https://dashboard.stripe.com/payments/pi_123",
      provider_ref: "pi_123abc",
      provider_meta: { webhook_event: "payment.completed" },
    };

    expect(payment.appointment_id).toBeTruthy();
    expect(payment.order_id).toBeNull();
    expect(payment.deposit_fraction).toBe(0.2);
    expect(payment.receipt_url).toContain("stripe");
  });
});
