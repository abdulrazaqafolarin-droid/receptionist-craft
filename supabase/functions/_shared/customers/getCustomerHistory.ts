/**
 * Phase 4 — Customer History for AI Context
 *
 * Loads a customer's visit history and formats it as a structured
 * block for the AI prompt. Replaces the current summary-only
 * returning customer block with actual booking/order data.
 */

export interface VisitHistory {
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

/**
 * Load full customer history for AI context.
 *
 * @param supabase - Supabase client with service role
 * @param customerId - The customer's ID
 * @param maxAppointments - Max prior appointments to include (default 5)
 * @param maxOrders - Max prior orders to include (default 5)
 */
export async function getCustomerHistory(
  supabase: any,
  customerId: string,
  maxAppointments = 5,
  maxOrders = 5,
): Promise<VisitHistory | null> {
  // Load customer record
  const { data: customer } = await supabase
    .from("customers")
    .select("name, visit_count, email, phone")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) return null;

  // Load recent appointments
  const { data: appointments } = await supabase
    .from("appointments")
    .select("service, start_time, status")
    .eq("customer_id", customerId)
    .order("start_time", { ascending: false })
    .limit(maxAppointments);

  // Load recent orders
  const { data: orders } = await supabase
    .from("orders")
    .select("total_amount, status, created_at, order_items(product_name, quantity)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(maxOrders);

  // Build order items summary
  const orderSummaries = (orders ?? []).map((o: any) => {
    const items = (o.order_items ?? [])
      .map((i: any) => `${i.quantity}x ${i.product_name}`)
      .join(", ");
    return {
      items: items || "Unknown items",
      total: o.total_amount,
      date: o.created_at,
      status: o.status,
    };
  });

  // Derive known facts from history
  const serviceCounts: Record<string, number> = {};
  for (const a of appointments ?? []) {
    if (a.service) {
      serviceCounts[a.service] = (serviceCounts[a.service] || 0) + 1;
    }
  }
  const preferredService = Object.entries(serviceCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0];

  // Derive preferred time from appointment patterns
  const hourCounts: Record<number, number> = {};
  for (const a of appointments ?? []) {
    if (a.start_time) {
      const hour = new Date(a.start_time).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  }
  const preferredHour = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  const preferredTime = preferredHour !== undefined
    ? `${preferredHour}:00`
    : undefined;

  return {
    customer_name: customer.name,
    is_returning: (customer.visit_count ?? 0) > 1,
    total_visits: customer.visit_count ?? 1,
    appointments: (appointments ?? []).map((a: any) => ({
      service: a.service,
      date: a.start_time,
      status: a.status,
    })),
    orders: orderSummaries,
    known_facts: {
      preferred_service: preferredService,
      preferred_time: preferredTime,
    },
  };
}

/**
 * Format visit history as a prompt block for the AI.
 * Appended to the system prompt when a returning customer is detected.
 */
export function formatHistoryForPrompt(history: VisitHistory): string {
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
