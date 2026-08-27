/**
 * Module 13: Invoice & Payment Follow-up
 *
 * Monitors unpaid invoices/orders and sends payment reminders
 * at configured intervals. Escalates if overdue beyond threshold.
 *
 * Tier 1: AI drafting + tracking — fully autonomous
 * Tier 2: Email/SMS delivery — needs connector for sending
 * Tier 3: Payment links — needs Stripe/Paystack connector
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../channels/emailSender.ts";
import { sendSms } from "../channels/smsSender.ts";

export interface FollowUpConfig {
  reminder_intervals_days: number[];  // [1, 3, 7, 14]
  max_reminders: number;
  escalate_after_days: number;
  channels: ("email" | "sms" | "chat")[];
}

export interface PaymentReminder {
  order_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  amount: number;
  currency: string;
  days_overdue: number;
  reminder_count: number;
  message: string;
  channel: "email" | "sms" | "chat";
  tier: 1 | 2 | 3;
}

const DEFAULT_CONFIG: FollowUpConfig = {
  reminder_intervals_days: [1, 3, 7, 14],
  max_reminders: 4,
  escalate_after_days: 30,
  channels: ["email"],
};

/**
 * Check for overdue payments and send follow-ups.
 */
export async function processPaymentFollowUps(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  config: Partial<FollowUpConfig> = {},
): Promise<{
  tier: 1 | 2 | 3;
  reminders_sent: number;
  reminders_drafted: number;
  escalated: number;
  reminders: PaymentReminder[];
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Find overdue orders
  const { data: orders } = await supabase
    .from("orders")
    .select("id, customer_id, total_amount, currency, created_at, metadata")
    .eq("receptionist_id", receptionistId)
    .eq("status", "pending")
    .not("status", "eq", "paid");

  if (!orders || orders.length === 0) {
    return { tier: 2, reminders_sent: 0, reminders_drafted: 0, escalated: 0, reminders: [] };
  }

  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "us";

  const reminders: PaymentReminder[] = [];
  let sent = 0;
  let drafted = 0;
  let escalated = 0;

  for (const order of orders) {
    const daysOverdue = Math.floor(
      (Date.now() - new Date(order.created_at).getTime()) / (24 * 60 * 60 * 1000),
    );

    // Check how many reminders already sent
    const { data: existingReminders } = await supabase
      .from("conversion_events")
      .select("id")
      .eq("receptionist_id", receptionistId)
      .eq("event_type", "payment_reminder_sent")
      .like("metadata->>order_id", order.id);

    const reminderCount = (existingReminders || []).length;

    // Should we send a reminder?
    const shouldRemind =
      reminderCount < cfg.max_reminders &&
      cfg.reminder_intervals_days.some((interval) => daysOverdue >= interval);

    if (!shouldRemind) continue;

    // Load customer info
    const { data: customer } = await supabase
      .from("customers")
      .select("name, email, phone")
      .eq("id", order.customer_id)
      .maybeSingle();

    if (!customer) continue;

    const message = generateReminderMessage(
      customer.name || "there",
      order.total_amount,
      order.currency,
      daysOverdue,
      businessName,
    );

    // Determine tier based on channel availability
    let tier: 1 | 2 | 3 = 3;
    let channel: "email" | "sms" | "chat" = "chat";

    if (cfg.channels.includes("email") && customer.email) {
      const result = await sendEmail(supabase, userId, receptionistId, {
        to: customer.email,
        subject: `Payment reminder — ${order.currency} ${order.total_amount}`,
        html: message.replace(/\n/g, "<br>"),
        text: message,
      });
      tier = result.tier;
      channel = "email";
      if (result.success && result.tier === 1) sent++;
      else drafted++;
    } else if (cfg.channels.includes("sms") && customer.phone) {
      const result = await sendSms(supabase, userId, receptionistId, {
        to: customer.phone,
        body: message,
      });
      tier = result.tier;
      channel = "sms";
      if (result.success && result.tier === 1) sent++;
      else drafted++;
    } else {
      // Chat only — tier 1 for conversational delivery
      tier = 1;
      channel = "chat";
      sent++;
    }

    // Track the reminder
    await supabase.from("conversion_events").insert({
      receptionist_id: receptionistId,
      session_id: "payment_followup",
      event_type: "payment_reminder_sent",
      revenue_value: order.total_amount,
      currency: order.currency,
      metadata: {
        order_id: order.id,
        days_overdue: daysOverdue,
        reminder_number: reminderCount + 1,
      },
    });

    reminders.push({
      order_id: order.id,
      customer_name: customer.name || "Unknown",
      customer_email: customer.email,
      customer_phone: customer.phone,
      amount: order.total_amount,
      currency: order.currency,
      days_overdue: daysOverdue,
      reminder_count: reminderCount + 1,
      message,
      channel,
      tier,
    });

    // Escalate if way overdue
    if (daysOverdue >= cfg.escalate_after_days) {
      escalated++;
      await supabase.from("escalations").insert({
        receptionist_id: receptionistId,
        session_id: "payment_followup",
        customer_id: order.customer_id,
        channel: "internal",
        status: "open",
        reason: `Payment ${daysOverdue} days overdue for order ${order.id}`,
      });
    }
  }

  return {
    tier: reminders.length > 0 ? reminders[0].tier : 2,
    reminders_sent: sent,
    reminders_drafted: drafted,
    escalated,
    reminders,
  };
}

function generateReminderMessage(
  customerName: string,
  amount: number,
  currency: string,
  daysOverdue: number,
  businessName: string,
): string {
  if (daysOverdue <= 1) {
    return `Hi ${customerName}, this is a friendly reminder that your payment of ${currency} ${amount} for ${businessName} is due. Please let us know if you have any questions.`;
  }
  if (daysOverdue <= 7) {
    return `Hi ${customerName}, your payment of ${currency} ${amount} for ${businessName} is now ${daysOverdue} days overdue. We'd appreciate it if you could settle this at your earliest convenience.`;
  }
  return `Hi ${customerName}, this is a final reminder that your payment of ${currency} ${amount} for ${businessName} is ${daysOverdue} days overdue. Please contact us to arrange payment.`;
}
