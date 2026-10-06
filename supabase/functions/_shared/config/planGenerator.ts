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

  // Section 9: Honest boundaries — what the operator will and won't do
  const willDo = (config.will_do || []) as unknown[];
  const wontDo = (config.wont_do || []) as unknown[];
  const externalNeeds = (config.external_needs || []) as unknown[];
  const willList = willDo.filter((x): x is string => typeof x === "string" && !!x.trim());
  const wontList = wontDo.filter((x): x is string => typeof x === "string" && !!x.trim());
  const needList = externalNeeds.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (willList.length > 0 || wontList.length > 0) {
    const lines: string[] = [];
    if (willList.length > 0) {
      lines.push("**What it will handle:**\n" + willList.map((w) => `- ${w}`).join("\n"));
    }
    if (wontList.length > 0) {
      lines.push("**What it will NOT do on its own:**\n" + wontList.map((w) => `- ${w}`).join("\n"));
    }
    sections.push({
      id: "boundaries",
      title: "What It Will (and Won't) Do",
      content: lines.join("\n\n"),
      confidence: "high",
    });
  }
  if (needList.length > 0) {
    const solutions = (config.external_solutions || []) as Array<{
      need?: unknown; note?: unknown; fulfillment?: unknown;
      candidates?: Array<{ name?: unknown; url?: unknown; stars?: unknown; license?: unknown; open_source?: unknown; description?: unknown }>;
    }>;
    const lines: string[] = [];
    for (const n of needList) {
      lines.push(`- ${n}`);
      const s = solutions.find((x) => x?.need === n);
      if (!s) continue;
      const stage = typeof s.fulfillment === "string" && ["fetched", "evaluated", "integrated"].includes(s.fulfillment)
        ? s.fulfillment
        : "found";
      const cands = (s.candidates || []).filter((c) => typeof c?.name === "string" && typeof c?.url === "string");
      lines.push(`  Fulfillment status: ${stage}.`);
      if (cands.length > 0) {
        lines.push(`  Best free options (open-source first) — status: ${stage}:`);
        for (const c of cands.slice(0, 3)) {
          const oss = c.open_source === true ? "free/open-source" : `license: ${String(c.license || "unknown")}`;
          lines.push(`  - ${String(c.name)} (${c.stars ?? 0} stars, ${oss}): ${String(c.url)}`);
        }
      }
      if (typeof s.note === "string" && s.note) lines.push(`  ${s.note}`);
    }
    sections.push({
      id: "external-needs",
      title: "Connections Needed Later",
      content:
        "These outside connections are not attached yet. Your operator is still useful without them — it prepares everything so that connecting later is a flip of a switch. Free open-source options are listed first — start there before paying for anything:\n" +
        lines.join("\n"),
      confidence: "medium",
      owner_action: "Do you have access to these accounts? Connecting them later unlocks the full automation.",
    });
  }

  // Build needs: what the AI lacked mid-build (power, information, capability).
  // Shown so gaps become roadmap input instead of silent guesses.
  const buildNeeds = (config.build_needs || []) as Array<{ need?: unknown; why?: unknown }>;
  const needItems = buildNeeds
    .filter((x) => typeof x?.need === "string" && (x.need as string).trim())
    .slice(0, 5)
    .map((x) => ({ need: x.need as string, why: typeof x.why === "string" ? x.why : "" }));
  if (needItems.length > 0) {
    sections.push({
      id: "build-needs",
      title: "To Build Even Better Next Time",
      content:
        "While planning, the AI ran into limits it wants you to know about — nothing was guessed over, and each of these is tracked for future upgrades:\n" +
        needItems.map((n) => `- ${n.need}${n.why ? ` — ${n.why}` : ""}`).join("\n"),
      confidence: "high",
    });
  }

  // Section 10: Operator dashboard surface (pages, modules, connectors, retention)
  const uiPlan = (config.ui_plan || {}) as {
    show?: Array<{ key?: string; why?: string }>;
    hide?: Array<{ key?: string; why?: string }>;
    modules_on?: Array<{ key?: string; why?: string }>;
    connectors_needed?: Array<{ key?: string; why?: string }>;
    retention_on?: Array<{ key?: string; why?: string }>;
    widget_pieces?: { booking?: boolean; ordering?: boolean; voice?: boolean; lead_capture?: boolean };
  };
  // Accept both shapes: {key, why} objects (spec) and bare strings
  // (models compress under size discipline).
  const asItem = (x: unknown): { key: string; why: string } | null => {
    if (typeof x === "string" && x) return { key: x, why: "" };
    if (!!x && typeof x === "object") {
      const r = x as Record<string, unknown>;
      if (typeof r.key === "string" && r.key) {
        return { key: r.key, why: typeof r.why === "string" ? r.why : "" };
      }
    }
    return null;
  };
  const asList = (l: unknown): Array<{ key: string; why: string }> => {
    if (!Array.isArray(l)) return [];
    const out: Array<{ key: string; why: string }> = [];
    for (const x of l) {
      const it = asItem(x);
      if (it) out.push(it);
    }
    return out;
  };
  const showList = asList(uiPlan.show);
  const hideList = asList(uiPlan.hide);
  if (showList.length > 0 || hideList.length > 0) {
    const lines: string[] = [];
    if (showList.length > 0) {
      lines.push("**Your dashboard will include:**\n" + showList.map((p) => `- ${p.key}${p.why ? ` — ${p.why}` : ""}`).join("\n"));
    }
    if (hideList.length > 0) {
      lines.push("**Hidden to keep things simple (ask anytime to bring one back):**\n" + hideList.map((p) => `- ${p.key}${p.why ? ` — ${p.why}` : ""}`).join("\n"));
    }
    const modList = asList(uiPlan.modules_on);
    if (modList.length > 0) {
      lines.push("**Working for you behind the scenes:**\n" + modList.map((m) => `- ${m.key}${m.why ? ` — ${m.why}` : ""}`).join("\n"));
    }
    const connList = asList(uiPlan.connectors_needed);
    if (connList.length > 0) {
      lines.push("**Worth connecting later:**\n" + connList.map((c) => `- ${c.key}${c.why ? ` — ${c.why}` : ""}`).join("\n"));
    }
    const retList = asList(uiPlan.retention_on);
    if (retList.length > 0) {
      lines.push("**Keeping customers coming back:**\n" + retList.map((r) => `- ${r.key}${r.why ? ` — ${r.why}` : ""}`).join("\n"));
    }
    const wp = uiPlan.widget_pieces;
    if (wp && typeof wp === "object") {
      const chatBits: string[] = ["a clean chat that answers questions"];
      if (wp.booking === true) chatBits.push("booking pickers (service, date, time)");
      if (wp.ordering === true) chatBits.push("product picker and ordering");
      if (wp.lead_capture === true) chatBits.push("lead capture before handoff");
      if (wp.voice === true) chatBits.push("voice input");
      lines.push("**What your customers will see:**\n" + chatBits.map((b) => `- ${b}`).join("\n"));
    }
    sections.push({
      id: "dashboard-surface",
      title: "Your Dashboard",
      content: lines.join("\n\n"),
      confidence: "high",
      owner_action: "This is the exact set of pages your dashboard will show. Want anything added back or removed?",
    });
  }

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
