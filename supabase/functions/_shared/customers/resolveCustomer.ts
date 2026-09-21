/**
 * Phase 4 — Customer Resolution
 *
 * Given a receptionist_id + contact info (email/phone/name),
 * finds or creates a unified customer record.
 *
 * Resolution order:
 *   1. Fingerprint match (email: or tel:)
 *   2. Name match within same receptionist (fallback)
 *   3. Create new customer record
 *
 * Called after the AI collects contact info during a conversation,
 * and when processing bookings/orders.
 */

export interface CustomerRecord {
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

/**
 * Compute a stable fingerprint from email or phone.
 * Same logic as widget-chat's computeContactFingerprint.
 */
export function computeFingerprint(
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

interface SupabaseClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string | number | boolean): {
        ilike(col: string, val: string): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        };
        maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        eq(col: string, val: string): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        };
        order(col: string, opts?: { ascending?: boolean }): {
          limit(n: number): Promise<{ data: unknown; error: unknown }>;
        };
      };
      insert(row: Record<string, unknown>): {
        select(): {
          single(): Promise<{ data: unknown; error: unknown }>;
        };
        select(cols: string): {
          maybeSingle(): Promise<{ data: unknown; error: unknown }>;
        };
      };
      update(row: Record<string, unknown>): {
        eq(col: string, val: string): Promise<{ error: unknown }>;
      };
    };
  };
}

/**
 * Resolve a customer: find existing or create new.
 * Returns the customer record and whether it was newly created.
 */
export async function resolveCustomer(
  supabase: SupabaseClient,
  params: {
    receptionist_id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ customer: CustomerRecord; created: boolean }> {
  const { receptionist_id, name, email, phone } = params;
  const fingerprint = computeFingerprint(email, phone);

  // ── 1. Try fingerprint match ──────────────────────────────────────
  if (fingerprint) {
    const { data: existing } = await supabase
      .from("customers")
      .select("*")
      .eq("receptionist_id", receptionist_id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (existing) {
      // Update name if we have a better one now
      if (name && name !== existing.name) {
        await supabase
          .from("customers")
          .update({ name })
          .eq("id", existing.id);
        existing.name = name;
      }
      return { customer: existing as CustomerRecord, created: false };
    }
  }

  // ── 2. Try name match (fallback when no fingerprint) ──────────────
  if (name && name.trim()) {
    let query = supabase
      .from("customers")
      .select("*")
      .eq("receptionist_id", receptionist_id)
      .ilike("name", name.trim());

    // If we have email/phone, also match on those for disambiguation
    if (email) {
      query = query.ilike("email", email.trim().toLowerCase());
    } else if (phone) {
      query = query.eq("phone", phone.trim());
    }

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      // Update with any new contact info
      const updates: Record<string, unknown> = {};
      if (email && !existing.email) updates.email = email.trim().toLowerCase();
      if (phone && !existing.phone) updates.phone = phone.trim();
      if (fingerprint && !existing.fingerprint) updates.fingerprint = fingerprint;

      if (Object.keys(updates).length > 0) {
        await supabase.from("customers").update(updates).eq("id", existing.id);
        Object.assign(existing, updates);
      }

      return { customer: existing as CustomerRecord, created: false };
    }
  }

  // ── 3. Create new customer ────────────────────────────────────────
  const newCustomer = {
    receptionist_id,
    name: (name || "Unknown Customer").trim(),
    email: email?.trim().toLowerCase() || null,
    phone: phone?.trim() || null,
    fingerprint,
    visit_count: 1,
    last_visit_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("customers")
    .insert(newCustomer)
    .select()
    .single();

  if (error) {
    // Race condition: another request inserted first. Retry lookup.
    if (error.code === "23505" && fingerprint) {
      const { data: race } = await supabase
        .from("customers")
        .select("*")
        .eq("receptionist_id", receptionist_id)
        .eq("fingerprint", fingerprint)
        .maybeSingle();

      if (race) return { customer: race as CustomerRecord, created: false };
    }
    throw new Error(`Failed to create customer: ${error.message}`);
  }

  return { customer: inserted as CustomerRecord, created: true };
}

/**
 * Increment visit count and update last_visit_at.
 * Called after each booking or order is confirmed.
 * Uses read-then-write since Supabase client doesn't support raw SQL increments.
 */
export async function bumpVisitCount(
  supabase: SupabaseClient,
  customerId: string,
): Promise<void> {
  const { data } = await supabase
    .from("customers")
    .select("visit_count")
    .eq("id", customerId)
    .maybeSingle();

  const newCount = (data?.visit_count ?? 0) + 1;

  await supabase
    .from("customers")
    .update({
      visit_count: newCount,
      last_visit_at: new Date().toISOString(),
    })
    .eq("id", customerId);
}
