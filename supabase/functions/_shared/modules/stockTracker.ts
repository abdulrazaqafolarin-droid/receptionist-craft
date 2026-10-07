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
