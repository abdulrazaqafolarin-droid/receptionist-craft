import { describe, it, expect } from "vitest";

// ── Phase 5 Analytics Tests ─────────────────────────────────────────
// Tests for no-show rate, service breakdown, and product breakdown
// computation logic extracted from analytics edge function.

// ── No-Show Rate ────────────────────────────────────────────────────

interface Appointment {
  id: string;
  status: string | null;
  service: string;
}

function computeNoShowRate(appointments: Appointment[]): {
  no_show_rate: number;
  cancelled: number;
  completed: number;
  total: number;
} {
  const total = appointments.length;
  if (total === 0) return { no_show_rate: 0, cancelled: 0, completed: 0, total: 0 };
  const cancelled = appointments.filter(a => a.status === "cancelled").length;
  const completed = appointments.filter(a => a.status === "completed").length;
  return {
    no_show_rate: cancelled / total,
    cancelled,
    completed,
    total,
  };
}

describe("No-show rate computation", () => {
  it("returns 0 for empty appointments", () => {
    const result = computeNoShowRate([]);
    expect(result.no_show_rate).toBe(0);
    expect(result.total).toBe(0);
  });

  it("computes 50% cancellation rate", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: "cancelled", service: "X-Ray" },
    ];
    const result = computeNoShowRate(appointments);
    expect(result.no_show_rate).toBe(0.5);
    expect(result.cancelled).toBe(1);
    expect(result.completed).toBe(1);
  });

  it("computes 0% when all completed", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: "completed", service: "X-Ray" },
    ];
    const result = computeNoShowRate(appointments);
    expect(result.no_show_rate).toBe(0);
  });

  it("computes 100% when all cancelled", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "cancelled", service: "Cleaning" },
      { id: "2", status: "cancelled", service: "X-Ray" },
    ];
    const result = computeNoShowRate(appointments);
    expect(result.no_show_rate).toBe(1);
  });

  it("ignores null status appointments in rate denominator", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: null, service: "X-Ray" },
      { id: "3", status: "cancelled", service: "Filling" },
    ];
    const result = computeNoShowRate(appointments);
    expect(result.no_show_rate).toBeCloseTo(1 / 3);
    expect(result.total).toBe(3);
  });
});

// ── Service Breakdown ───────────────────────────────────────────────

function computeServiceBreakdown(
  appointments: Appointment[],
): Array<{ service: string; count: number }> {
  const counts: Record<string, number> = {};
  appointments.forEach(a => {
    if (a.service) counts[a.service] = (counts[a.service] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count);
}

describe("Service breakdown computation", () => {
  it("returns empty for no appointments", () => {
    expect(computeServiceBreakdown([])).toEqual([]);
  });

  it("groups by service and counts", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: "completed", service: "Cleaning" },
      { id: "3", status: "completed", service: "X-Ray" },
    ];
    const result = computeServiceBreakdown(appointments);
    expect(result).toEqual([
      { service: "Cleaning", count: 2 },
      { service: "X-Ray", count: 1 },
    ]);
  });

  it("sorts descending by count", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Filling" },
      { id: "2", status: "completed", service: "Cleaning" },
      { id: "3", status: "completed", service: "Cleaning" },
      { id: "4", status: "completed", service: "Cleaning" },
      { id: "5", status: "completed", service: "X-Ray" },
      { id: "6", status: "completed", service: "X-Ray" },
    ];
    const result = computeServiceBreakdown(appointments);
    expect(result[0].service).toBe("Cleaning");
    expect(result[0].count).toBe(3);
    expect(result[1].service).toBe("X-Ray");
    expect(result[1].count).toBe(2);
    expect(result[2].service).toBe("Filling");
    expect(result[2].count).toBe(1);
  });

  it("handles cancelled appointments in breakdown", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: "cancelled", service: "Cleaning" },
    ];
    const result = computeServiceBreakdown(appointments);
    expect(result).toEqual([{ service: "Cleaning", count: 2 }]);
  });

  it("skips appointments with empty service", () => {
    const appointments: Appointment[] = [
      { id: "1", status: "completed", service: "Cleaning" },
      { id: "2", status: "completed", service: "" },
    ];
    const result = computeServiceBreakdown(appointments);
    expect(result).toEqual([{ service: "Cleaning", count: 1 }]);
  });
});

// ── Product Breakdown ───────────────────────────────────────────────

interface OrderItem {
  product_name: string;
  quantity: number;
  order_id: string;
}

interface Order {
  id: string;
  total_amount: number | null;
}

function computeProductBreakdown(
  orders: Order[],
  orderItems: OrderItem[],
): Array<{ product: string; count: number; revenue: number }> {
  const orderIdToRevenue: Record<string, number> = {};
  orders.forEach(o => { orderIdToRevenue[o.id] = Number(o.total_amount) || 0; });

  const productMap: Record<string, { count: number; revenue: number }> = {};
  orderItems.forEach(item => {
    const name = item.product_name || "Unknown";
    if (!productMap[name]) productMap[name] = { count: 0, revenue: 0 };
    productMap[name].count += item.quantity || 1;
    productMap[name].revenue += orderIdToRevenue[item.order_id] || 0;
  });

  return Object.entries(productMap)
    .map(([product, data]) => ({ product, ...data }))
    .sort((a, b) => b.count - a.count);
}

describe("Product breakdown computation", () => {
  it("returns empty for no items", () => {
    expect(computeProductBreakdown([], [])).toEqual([]);
  });

  it("groups products and sums quantities", () => {
    const orders: Order[] = [
      { id: "o1", total_amount: 30 },
      { id: "o2", total_amount: 20 },
    ];
    const items: OrderItem[] = [
      { product_name: "Toothbrush", quantity: 2, order_id: "o1" },
      { product_name: "Toothpaste", quantity: 1, order_id: "o1" },
      { product_name: "Toothbrush", quantity: 3, order_id: "o2" },
    ];
    const result = computeProductBreakdown(orders, items);
    expect(result[0].product).toBe("Toothbrush");
    expect(result[0].count).toBe(5);
    expect(result[0].revenue).toBe(50); // 30 + 20
    expect(result[1].product).toBe("Toothpaste");
    expect(result[1].count).toBe(1);
    expect(result[1].revenue).toBe(30);
  });

  it("sorts descending by count", () => {
    const orders: Order[] = [{ id: "o1", total_amount: 10 }];
    const items: OrderItem[] = [
      { product_name: "A", quantity: 1, order_id: "o1" },
      { product_name: "B", quantity: 5, order_id: "o1" },
      { product_name: "C", quantity: 3, order_id: "o1" },
    ];
    const result = computeProductBreakdown(orders, items);
    expect(result.map(p => p.product)).toEqual(["B", "C", "A"]);
  });

  it("handles null total_amount gracefully", () => {
    const orders: Order[] = [{ id: "o1", total_amount: null }];
    const items: OrderItem[] = [
      { product_name: "Item", quantity: 1, order_id: "o1" },
    ];
    const result = computeProductBreakdown(orders, items);
    expect(result[0].revenue).toBe(0);
  });

  it("defaults quantity to 1 when missing", () => {
    const orders: Order[] = [{ id: "o1", total_amount: 10 }];
    const items: OrderItem[] = [
      { product_name: "Item", quantity: 0, order_id: "o1" },
    ];
    const result = computeProductBreakdown(orders, items);
    expect(result[0].count).toBe(1);
  });

  it("handles missing product_name as Unknown", () => {
    const orders: Order[] = [{ id: "o1", total_amount: 10 }];
    const items: OrderItem[] = [
      { product_name: "", quantity: 1, order_id: "o1" },
    ];
    const result = computeProductBreakdown(orders, items);
    expect(result[0].product).toBe("Unknown");
  });
});
