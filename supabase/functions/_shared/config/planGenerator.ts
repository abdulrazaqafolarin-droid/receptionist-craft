/**
 * Operator Plan Generator
 *
 * Transforms an OperationsConfig into a plain-language plan that the
 * business owner can read, understand, and approve. This is the
 * "human-readable rendering of the exact configuration that will
 * actually run" — it must never drift from the config.
 */

export interface PlanSection {
  id: string;
  title: string;
  content: string;
  confidence: "high" | "medium" | "low";
  owner_action?: string;
}

export interface GeneratedPlan {
  full_text: string;
  sections: PlanSection[];
}

/**
 * Generate a plain-language plan from an OperationsConfig.
 * The plan reads like a competent employee's proposal to the business owner.
 */
export function generatePlanFromConfig(config: Record<string, unknown>): GeneratedPlan {
  const business = (config.business || {}) as Record<string, string>;
  const contact = (config.contact || {}) as Record<string, string>;
  const hours = (config.hours || []) as Array<Record<string, string>>;
  const workflows = (config.workflows || {}) as Record<string, Record<string, unknown>>;

  const sections: PlanSection[] = [];

  // Section 1: Business Identity
  sections.push({
    id: "identity",
    title: "Your Business",
    content: formatBusinessIdentity(business, contact),
    confidence: "high",
  });

  // Section 2: Business Knowledge
  if (typeof config.knowledge_base === "string" && config.knowledge_base.trim()) {
    sections.push({
      id: "knowledge",
      title: "Business Knowledge",
      content: config.knowledge_base.trim(),
      confidence: "medium",
      owner_action: "This is what your AI will know about your business. Any inaccuracy here would be repeated to customers — does this look right?",
    });
  }

  // Section: Operating Hours
  if (hours.length > 0) {
    sections.push({
      id: "hours",
      title: "Operating Hours",
      content: formatHours(hours),
      confidence: "high",
    });
  }

  // Section 3: Appointment Booking
  if (workflows.appointment_booking) {
    const appt = workflows.appointment_booking;
    sections.push({
      id: "bookings",
      title: "Appointment Booking",
      content: formatBookingWorkflow(appt, business),
      confidence: "high",
    });
  }

  // Section 4: Product Ordering
  if (workflows.product_ordering) {
    const order = workflows.product_ordering;
    sections.push({
      id: "orders",
      title: "Product Ordering",
      content: formatOrderingWorkflow(order, business),
      confidence: "high",
    });
  }

  // Section 5: Deposit & Payment Policy
  const depositPolicy = extractDepositPolicy(config);
  if (depositPolicy) {
    sections.push({
      id: "deposits",
      title: "Payment & Deposits",
      content: depositPolicy,
      confidence: "medium",
      owner_action: "Does this deposit policy match how you actually want to handle payments?",
    });
  }

  // Section 6: Cancellation Policy
  const cancelPolicy = extractCancellationPolicy(config);
  if (cancelPolicy) {
    sections.push({
      id: "cancellation",
      title: "Cancellation Policy",
      content: cancelPolicy,
      confidence: "low",
      owner_action: "I'm not sure about your cancellation rules — can you confirm this is right?",
    });
  }

  // Section 7: Escalation Rules
  sections.push({
    id: "escalation",
    title: "When to Get You Involved",
    content: formatEscalationRules(config),
    confidence: "medium",
    owner_action: "Are there other situations where you'd want to be notified directly?",
  });

  // Section 8: Channels
  sections.push({
    id: "channels",
    title: "Communication Channels",
    content: formatChannels(config),
    confidence: "medium",
  });

  // Build full text
  const full_text = sections
    .map((s) => {
      let text = `## ${s.title}\n\n${s.content}`;
      if (s.owner_action) {
        text += `\n\n> **Your input needed:** ${s.owner_action}`;
      }
      return text;
    })
    .join("\n\n");

  return { full_text, sections };
}

function formatBusinessIdentity(
  business: Record<string, string>,
  contact: Record<string, string>,
): string {
  const name = business.display_name || "your business";
  const type = business.business_type || "business";
  const desc = business.description || "";
  const tone = business.tone || "friendly";
  const greeting = business.greeting_message || "";

  let text = `Your AI operator will represent **${name}**, a ${type.toLowerCase()}`;
  if (desc) text += ` that ${desc.toLowerCase().replace(/^[a-z]/, (c) => c)}`;
  text += ".\n\n";
  text += `The tone will be **${tone}** — `;
  if (tone === "friendly") text += "warm, welcoming, and conversational.";
  else if (tone === "professional") text += "polished, formal, and efficient.";
  else if (tone === "playful") text += "fun, energetic, and engaging.";
  text += "\n\n";
  if (greeting) text += `When a customer first messages, they'll hear: *"${greeting}"*\n\n`;
  if (contact.phone) text += `The business phone is ${contact.phone}. `;
  if (contact.email) text += `Email: ${contact.email}. `;
  if (contact.website) text += `Website: ${contact.website}. `;
  return text;
}

function formatHours(hours: Array<Record<string, string>>): string {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const lines = hours.map((h) => {
    const day = dayNames[Number(h.day_of_week)] || `Day ${h.day_of_week}`;
    if (h.start_time === "00:00" && h.end_time === "23:59") return `- **${day}:** Open 24 hours`;
    return `- **${day}:** ${formatTime(h.start_time)} – ${formatTime(h.end_time)}`;
  });
  return lines.join("\n");
}

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatBookingWorkflow(
  appt: Record<string, unknown>,
  business: Record<string, string>,
): string {
  const duration = appt.default_duration_minutes || 30;
  let text = `Customers can book appointments through the AI operator. `;
  text += `The default session length is **${duration} minutes**.\n\n`;
  text += `The AI will guide customers through selecting a service, picking a date and time, and confirming the booking — all conversationally, without forms.\n\n`;
  if (business.business_type) {
    text += `For a ${business.business_type.toLowerCase()}, this means customers can book anytime — even at 2 AM on a Sunday — and get instant confirmation.\n`;
  }
  return text;
}

function formatOrderingWorkflow(
  order: Record<string, unknown>,
  business: Record<string, string>,
): string {
  const delivery = order.delivery ? "with delivery available" : "for pickup only";
  let text = `Customers can order products through the AI operator, ${delivery}. `;
  text += `The AI will show available products, help customers choose, confirm quantities, and process the order.\n\n`;
  text += `The operator handles the full order flow — product selection → quantity → customer details → confirmation.\n`;
  return text;
}

function extractDepositPolicy(config: Record<string, unknown>): string | null {
  const capabilities = (config.capabilities || {}) as Record<string, unknown>;
  if (!capabilities.deposit_required) return null;

  const percent = Number(capabilities.deposit_percent) || 20;
  return `A **${percent}% deposit** is required at booking time. This helps reduce no-shows and secures the customer's commitment. The remaining balance is collected at the time of service.`;
}

function extractCancellationPolicy(config: Record<string, unknown>): string | null {
  const policies = (config.policies || {}) as Record<string, unknown>;
  if (!policies) return null;

  const cancelHours = Number(policies.cancellation_notice_hours) || null;
  if (!cancelHours) return null;

  return `Customers must cancel at least **${cancelHours} hours** in advance. Late cancellations may result in the deposit being kept.`;
}

function formatEscalationRules(config: Record<string, unknown>): string {
  return `The AI operator handles most conversations independently, but will escalate to you (the business owner) when:\n\n- A customer **explicitly asks to speak to a human**\n- The AI detects **frustration or repeated confusion**\n- A **complex objection or complaint** needs your personal judgment\n- The AI **fails to resolve an issue** after multiple attempts\n\nWhen escalation happens, you'll see it in your Escalations dashboard with the full conversation context, and you can respond directly to the customer.`;
}

function formatChannels(config: Record<string, unknown>): string {
  const channels = (config.channels || {}) as Record<string, boolean>;
  const enabled: string[] = [];
  if (channels.widget !== false) enabled.push("website widget");
  if (channels.whatsapp) enabled.push("WhatsApp");
  if (channels.phone) enabled.push("phone/voice");
  if (channels.sms) enabled.push("SMS");
  if (channels.email) enabled.push("email");

  if (enabled.length === 0) enabled.push("website widget");

  return `Your AI operator will be available on: **${enabled.join(", ")}**.\n\nAll channels share the same conversation memory — a customer can start on WhatsApp and continue on the website widget without losing context.`;
}
