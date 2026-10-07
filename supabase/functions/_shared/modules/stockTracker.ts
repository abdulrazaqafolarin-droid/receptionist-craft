/**
 * Module: Stock Tracker (Phase C ops module, internal-only).
 *
 * Watches product stock levels and expiry dates on the services table and
 * tells the owner what to reorder. Reads real rows — never invents stock.
 * No connectors needed: it works entirely on data already in the platform.
 *
 * Deno-safe: ASCII only, no Node APIs.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type StockAlertKind = "out" | "low" | "expired" | "expiring";

export interface StockAlert {
  service_id: string;
  name: string;
  kind: StockAlertKind;
  stock_quantity: number | null;
  expiry_date: string | null;
  detail: string;
}

interface StockRow {
  id: string;
  name: string;
  stock_quantity: number | null;
  low_stock_threshold: number | null;
  expiry_date: string | null;
}

function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addDaysISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Scan every stocked product for this operator. A row counts as stocked
 * when stock_quantity is set (service rows leave it NULL). Expiry alerts
 * only apply when expiry_date is set (NULL = not perishable).
 */
export async function getStockAlerts(
  supabase: SupabaseClient,
  receptionistId: string,
  opts?: { expiry_window_days?: number; today?: string },
): Promise<StockAlert[]> {
  const windowDays = opts?.expiry_window_days ?? 30;
  const today = opts?.today ?? todayISO();
  const horizon = addDaysISO(today, windowDays);

  const { data, error } = await supabase
    .from("services")
    .select("id, name, stock_quantity, low_stock_threshold, expiry_date")
    .eq("receptionist_id", receptionistId)
    .eq("active", true)
    .not("stock_quantity", "is", null);

  if (error) throw new Error(`stock scan failed: ${error.message}`);
  const alerts: StockAlert[] = [];
  for (const row of (data || []) as StockRow[]) {
    const qty = row.stock_quantity;
    const threshold = row.low_stock_threshold ?? 5;
    if (qty !== null && qty <= 0) {
      alerts.push({
        service_id: row.id, name: row.name, kind: "out",
        stock_quantity: qty, expiry_date: row.expiry_date,
        detail: `${row.name} is out of stock`,
      });
    } else if (qty !== null && qty <= threshold) {
      alerts.push({
        service_id: row.id, name: row.name, kind: "low",
        stock_quantity: qty, expiry_date: row.expiry_date,
        detail: `${row.name} is low (${qty} left, restock at ${threshold})`,
      });
    }
    if (row.expiry_date) {
      if (row.expiry_date < today) {
        alerts.push({
          service_id: row.id, name: row.name, kind: "expired",
          stock_quantity: qty, expiry_date: row.expiry_date,
          detail: `${row.name} expired on ${row.expiry_date} — remove from sale`,
        });
      } else if (row.expiry_date <= horizon) {
        alerts.push({
          service_id: row.id, name: row.name, kind: "expiring",
          stock_quantity: qty, expiry_date: row.expiry_date,
          detail: `${row.name} expires ${row.expiry_date} — sell or discount first`,
        });
      }
    }
  }
  // Worst first: expired, out, expiring, low.
  const rank: Record<StockAlertKind, number> = { expired: 0, out: 1, expiring: 2, low: 3 };
  alerts.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return alerts;
}

/** Plain-language reorder lines for the owner (or the operator console). */
export function reorderSuggestions(alerts: StockAlert[]): string[] {
  return alerts
    .filter((a) => a.kind === "out" || a.kind === "low" || a.kind === "expiring")
    .map((a) => a.detail);
}

const EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for dates that exist on a calendar (round-trip check, UTC). */
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export interface StockUpdate {
  stock_quantity?: number;
  expiry_date?: string | null;
}

/**
 * Validate a console stock write. A wrong quantity or a malformed date is
 * rejected rather than stored — the shelf truth must survive staff thumbs.
 */
export function validateStockUpdate(input: { stock_quantity?: unknown; expiry_date?: unknown }): StockUpdate {
  const out: StockUpdate = {};
  if (input.stock_quantity !== undefined) {
    const q = input.stock_quantity;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 0) {
      throw new Error("stock rejected: quantity must be a whole number, zero or more");
    }
    out.stock_quantity = q;
  }
  if (input.expiry_date !== undefined) {
    const e = input.expiry_date;
    // Format first, then calendar reality (month 13 passes a regex but is
    // not a date — a wrong deadline on drugs is worse than none).
    if (e !== null && (typeof e !== "string" || !EXPIRY_RE.test(e) || !isRealDate(e))) {
      throw new Error("stock rejected: expiry must be a real yyyy-mm-dd date or cleared");
    }
    out.expiry_date = e;
  }
  if (out.stock_quantity === undefined && out.expiry_date === undefined) {
    throw new Error("stock rejected: nothing to update");
  }
  return out;
}

/**
 * Write a stock count or expiry date. The row must belong to this operator —
 * a staff member can never adjust another operator's shelf, even by typo.
 */
export async function setStockLevel(
  supabase: SupabaseClient,
  receptionistId: string,
  serviceId: string,
  input: { stock_quantity?: unknown; expiry_date?: unknown },
): Promise<{ id: string; name: string; stock_quantity: number | null; expiry_date: string | null }> {
  const update = validateStockUpdate(input);
  const { data: row, error: findErr } = await supabase
    .from("services")
    .select("id, name")
    .eq("id", serviceId)
    .eq("receptionist_id", receptionistId)
    .maybeSingle();
  if (findErr || !row) {
    throw new Error("stock rejected: item not found on this operator");
  }
  const { data: updated, error: updErr } = await supabase
    .from("services")
    .update(update)
    .eq("id", serviceId)
    .select("id, name, stock_quantity, expiry_date")
    .maybeSingle();
  if (updErr || !updated) {
    throw new Error(`stock save failed: ${updErr?.message || "unknown"}`);
  }
  return updated as { id: string; name: string; stock_quantity: number | null; expiry_date: string | null };
}
