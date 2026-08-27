import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Customer Memory Tests ───────────────────────────────────────────
// Tests for Phase 4: Customer resolution, fingerprinting, history formatting.
// Pure functions tested directly; Supabase calls mocked.

// ── Fingerprint Logic ───────────────────────────────────────────────
// Extracted from resolveCustomer.ts for testing without Deno imports.

function computeFingerprint(
  email?: string | null,
  phone?: string | null,
): string | null {
  if (email && String(email).trim()) {
    return `email:${String(email).trim().toLowerCase()}`;
  }
  if (phone && String(phone).trim()) {
    return `tel:${String(phone).replace(/[^0-9]/g, "")}`;
  }
  return null;
}

// ── History Formatting Logic ────────────────────────────────────────
// Extracted from getCustomerHistory.ts for testing.

interface VisitHistory {
  customer_name: string;
  is_returning: boolean;
  total_visits: number;
  appointments: Array<{
    service: string;
    date: string;
    status: string;
  }>;
  orders: Array<{
    items: string;
    total: number | null;
    date: string;
    status: string;
  }>;
  known_facts: {
    preferred_service?: string;
    preferred_time?: string;
    notes?: string[];
  };
}

function formatHistoryForPrompt(history: VisitHistory): string {
  if (!history.is_returning) return "";

  const lines: string[] = [
    "---",
    "RETURNING CUSTOMER:",
    `- Name: ${history.customer_name}`,
    `- Total visits: ${history.total_visits}`,
  ];

  if (history.appointments.length > 0) {
    lines.push("- Prior appointments:");
    for (const a of history.appointments) {
      const dateStr = a.date
        ? new Date(a.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "unknown date";
      lines.push(`  • ${a.service} on ${dateStr} (${a.status})`);
    }
  }

  if (history.orders.length > 0) {
    lines.push("- Prior orders:");
    for (const o of history.orders) {
      const dateStr = o.date
        ? new Date(o.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "unknown date";
      const totalStr = o.total != null ? ` — $${o.total}` : "";
      lines.push(`  • ${o.items}${totalStr} on ${dateStr} (${o.status})`);
    }
  }

  if (history.known_facts.preferred_service) {
    lines.push(`- Usually books: ${history.known_facts.preferred_service}`);
  }
  if (history.known_facts.preferred_time) {
    lines.push(`- Preferred time: around ${history.known_facts.preferred_time}`);
  }

  lines.push(
    "- Acknowledge them warmly. Do NOT re-ask for details already provided.",
  );

  return lines.join("\n");
}

// ── Customer Resolution Mock Logic ──────────────────────────────────

interface CustomerRecord {
  id: string;
  receptionist_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  fingerprint: string | null;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
}

async function resolveCustomer(
  db: { from: Function },
  params: {
    receptionist_id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ customer: CustomerRecord; created: boolean }> {
  const { receptionist_id, name, email, phone } = params;
  const fingerprint = computeFingerprint(email, phone);

  // 1. Try fingerprint match
  if (fingerprint) {
    const { data: existing } = await db
      .from("customers")
      .select("*")
      .eq("receptionist_id", receptionist_id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing) {
      return { customer: existing as CustomerRecord, created: false };
    }
  }

  // 2. Try name match
  if (name && name.trim()) {
    let query = db
      .from("customers")
      .select("*")
      .eq("receptionist_id", receptionist_id)
      .ilike("name", name.trim());

    if (email) {
      query = query.ilike("email", email.trim().toLowerCase());
    } else if (phone) {
      query = query.eq("phone", phone.trim());
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return { customer: existing as CustomerRecord, created: false };
    }
  }

  // 3. Create new
  const newCustomer = {
    id: `cust-${Date.now()}`,
    receptionist_id,
    name: (name || "Unknown Customer").trim(),
    email: email?.trim().toLowerCase() || null,
    phone: phone?.trim() || null,
    fingerprint,
    visit_count: 1,
    last_visit_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { data: inserted } = await db
    .from("customers")
    .insert(newCustomer)
    .select()
    .single();

  return { customer: (inserted ?? newCustomer) as CustomerRecord, created: true };
}

// ── Mock Supabase builder ──────────────────────────────────────────

function createMockDb(existingCustomer: CustomerRecord | null = null) {
  let lastInsert: Record<string, unknown> | null = null;

  const builder: any = {
    select: () => builder,
    eq: () => builder,
    ilike: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: existingCustomer, error: null }),
    single: async () => ({
      data: existingCustomer ?? lastInsert,
      error: null,
    }),
    insert: (data: Record<string, unknown>) => {
      lastInsert = data;
      return builder;
    },
  };

  return {
    from: () => builder,
    getInserted: () => lastInsert,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("computeFingerprint", () => {
  it("returns email: prefix for email input", () => {
    expect(computeFingerprint("test@example.com", null)).toBe(
      "email:test@example.com",
    );
  });

  it("lowercases email", () => {
    expect(computeFingerprint("TEST@Example.COM", null)).toBe(
      "email:test@example.com",
    );
  });

  it("trims whitespace from email", () => {
    expect(computeFingerprint("  test@example.com  ", null)).toBe(
      "email:test@example.com",
    );
  });

  it("returns tel: prefix for phone input", () => {
    expect(computeFingerprint(null, "+1234567890")).toBe("tel:1234567890");
  });

  it("strips non-digits from phone", () => {
    expect(computeFingerprint(null, "+1 (234) 567-890")).toBe("tel:1234567890");
  });

  it("prefers email over phone when both provided", () => {
    expect(computeFingerprint("a@b.com", "+1234567890")).toBe("email:a@b.com");
  });

  it("returns null when neither email nor phone", () => {
    expect(computeFingerprint(null, null)).toBeNull();
    expect(computeFingerprint(undefined, undefined)).toBeNull();
  });

  it("returns null for empty string email", () => {
    expect(computeFingerprint("", null)).toBeNull();
  });

  it("handles whitespace-only phone as no phone", () => {
    expect(computeFingerprint(null, "   ")).toBeNull();
  });
});

// ── resolveCustomer tests ───────────────────────────────────────────

describe("resolveCustomer", () => {
  const recId = "rec-001";

  it("finds existing customer by fingerprint", async () => {
    const existing: CustomerRecord = {
      id: "cust-100",
      receptionist_id: recId,
      name: "Alice",
      email: "alice@test.com",
      phone: null,
      fingerprint: "email:alice@test.com",
      visit_count: 3,
      last_visit_at: "2026-08-01T00:00:00Z",
      created_at: "2026-06-01T00:00:00Z",
    };
    const db = createMockDb(existing);
    const result = await resolveCustomer(db, {
      receptionist_id: recId,
      name: "Alice",
      email: "alice@test.com",
    });
    expect(result.created).toBe(false);
    expect(result.customer.id).toBe("cust-100");
    expect(result.customer.visit_count).toBe(3);
  });

  it("creates new customer when no fingerprint match", async () => {
    const db = createMockDb(null);
    const result = await resolveCustomer(db, {
      receptionist_id: recId,
      name: "Bob",
      email: "bob@test.com",
      phone: "+1234567890",
    });
    expect(result.created).toBe(true);
    expect(result.customer.name).toBe("Bob");
    expect(result.customer.fingerprint).toBe("email:bob@test.com");
    expect(result.customer.visit_count).toBe(1);
  });

  it("falls back to name match when no fingerprint", async () => {
    const existing: CustomerRecord = {
      id: "cust-200",
      receptionist_id: recId,
      name: "Charlie",
      email: null,
      phone: null,
      fingerprint: null,
      visit_count: 2,
      last_visit_at: "2026-07-01T00:00:00Z",
      created_at: "2026-05-01T00:00:00Z",
    };
    const db = createMockDb(existing);
    const result = await resolveCustomer(db, {
      receptionist_id: recId,
      name: "Charlie",
    });
    expect(result.created).toBe(false);
    expect(result.customer.id).toBe("cust-200");
  });

  it("creates unknown customer when name is null", async () => {
    const db = createMockDb(null);
    const result = await resolveCustomer(db, {
      receptionist_id: recId,
    });
    expect(result.created).toBe(true);
    expect(result.customer.name).toBe("Unknown Customer");
  });
});

// ── formatHistoryForPrompt tests ────────────────────────────────────

describe("formatHistoryForPrompt", () => {
  const baseHistory: VisitHistory = {
    customer_name: "Alice",
    is_returning: true,
    total_visits: 3,
    appointments: [
      { service: "Dental Cleaning", date: "2026-08-01T10:00:00Z", status: "confirmed" },
      { service: "X-Ray", date: "2026-06-15T14:00:00Z", status: "completed" },
    ],
    orders: [
      { items: "2x Toothbrush", total: 15.0, date: "2026-08-01T10:30:00Z", status: "completed" },
    ],
    known_facts: {
      preferred_service: "Dental Cleaning",
      preferred_time: "10:00",
    },
  };

  it("returns empty string for non-returning customer", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      is_returning: false,
    });
    expect(result).toBe("");
  });

  it("includes customer name and visit count", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Name: Alice");
    expect(result).toContain("Total visits: 3");
  });

  it("lists prior appointments with service and status", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Prior appointments:");
    expect(result).toContain("Dental Cleaning");
    expect(result).toContain("X-Ray");
    expect(result).toContain("confirmed");
    expect(result).toContain("completed");
  });

  it("lists prior orders with items and total", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Prior orders:");
    expect(result).toContain("2x Toothbrush");
    expect(result).toContain("$15");
  });

  it("includes preferred service", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Usually books: Dental Cleaning");
  });

  it("includes preferred time", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Preferred time: around 10:00");
  });

  it("includes the do-not-reask instruction", () => {
    const result = formatHistoryForPrompt(baseHistory);
    expect(result).toContain("Do NOT re-ask");
  });

  it("omits appointments section when none", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      appointments: [],
    });
    expect(result).not.toContain("Prior appointments:");
  });

  it("omits orders section when none", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      orders: [],
    });
    expect(result).not.toContain("Prior orders:");
  });

  it("omits preferred service when not set", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      known_facts: {},
    });
    expect(result).not.toContain("Usually books:");
  });

  it("omits preferred time when not set", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      known_facts: { preferred_service: "Dental Cleaning" },
    });
    expect(result).not.toContain("Preferred time:");
  });

  it("handles single visit correctly", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      total_visits: 1,
      appointments: [{ service: "Consultation", date: "2026-08-20T09:00:00Z", status: "confirmed" }],
      orders: [],
      known_facts: {},
    });
    expect(result).toContain("Total visits: 1");
    expect(result).toContain("Consultation");
  });

  it("handles order with null total", () => {
    const result = formatHistoryForPrompt({
      ...baseHistory,
      orders: [
        { items: "1x Poster", total: null, date: "2026-08-01T10:30:00Z", status: "pending" },
      ],
    });
    expect(result).toContain("1x Poster");
    expect(result).toContain("pending");
    expect(result).not.toContain("$null");
  });
});
