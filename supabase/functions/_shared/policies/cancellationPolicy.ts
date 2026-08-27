/**
 * Cancellation Policy Enforcement
 *
 * Real operational capability: enforces cancellation rules when
 * customers try to cancel or reschedule bookings.
 *
 * Rules are read from the receptionist's capabilities JSONB:
 * - cancellation_notice_hours: minimum hours before appointment
 * - cancellation_forfeit_deposit: whether deposit is kept
 * - cancellation_max_per_customer: max cancellations before restriction
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CancellationPolicy {
  notice_hours: number;
  forfeit_deposit: boolean;
  max_per_customer: number;
  enabled: boolean;
}

export interface CancellationResult {
  allowed: boolean;
  reason?: string;
  forfeit_deposit: boolean;
  refund_amount: number;
  original_amount: number;
}

const DEFAULT_POLICY: CancellationPolicy = {
  notice_hours: 24,
  forfeit_deposit: true,
  max_per_customer: 3,
  enabled: true,
};

/**
 * Load cancellation policy from receptionist capabilities.
 */
export function loadCancellationPolicy(
  capabilities: Record<string, unknown> | null,
): CancellationPolicy {
  if (!capabilities) return DEFAULT_POLICY;

  const policies = (capabilities.policies || {}) as Record<string, unknown>;
  const cancellation = (policies.cancellation || capabilities) as Record<string, unknown>;

  return {
    notice_hours: Number(cancellation.cancellation_notice_hours) || DEFAULT_POLICY.notice_hours,
    forfeit_deposit: cancellation.cancellation_forfeit_deposit !== false,
    max_per_customer: Number(cancellation.cancellation_max_per_customer) || DEFAULT_POLICY.max_per_customer,
    enabled: cancellation.cancellation_enabled !== false,
  };
}

/**
 * Check if a cancellation is allowed based on the policy.
 */
export async function checkCancellationAllowed(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<CancellationResult & { appointment?: Record<string, unknown> }> {
  // Load the appointment
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, start_time, status, customer_phone, customer_name, metadata, receptionist_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return {
      allowed: false,
      reason: "Appointment not found",
      forfeit_deposit: false,
      refund_amount: 0,
      original_amount: 0,
    };
  }

  if (appointment.status === "cancelled") {
    return {
      allowed: false,
      reason: "Appointment is already cancelled",
      forfeit_deposit: false,
      refund_amount: 0,
      original_amount: 0,
      appointment,
    };
  }

  if (appointment.status === "completed") {
    return {
      allowed: false,
      reason: "Cannot cancel a completed appointment",
      forfeit_deposit: false,
      refund_amount: 0,
      original_amount: 0,
      appointment,
    };
  }

  // Load receptionist capabilities
  const { data: rec } = await supabase
    .from("receptionists")
    .select("capabilities")
    .eq("id", appointment.receptionist_id)
    .maybeSingle();

  const policy = loadCancellationPolicy(rec?.capabilities as Record<string, unknown>);

  if (!policy.enabled) {
    return {
      allowed: true,
      forfeit_deposit: false,
      refund_amount: 0,
      original_amount: 0,
      appointment,
    };
  }

  // Check notice period
  const appointmentTime = new Date(appointment.start_time);
  const now = new Date();
  const hoursUntil = (appointmentTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < policy.notice_hours) {
    return {
      allowed: false,
      reason: `Cancellations require ${policy.notice_hours} hours notice. This appointment is in ${Math.round(hoursUntil)} hours.`,
      forfeit_deposit: policy.forfeit_deposit,
      refund_amount: 0,
      original_amount: 0,
      appointment,
    };
  }

  // Check customer cancellation frequency
  if (appointment.customer_phone) {
    const { count: recentCancellations } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("receptionist_id", appointment.receptionist_id)
      .eq("customer_phone", appointment.customer_phone)
      .eq("status", "cancelled")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if ((recentCancellations || 0) >= policy.max_per_customer) {
      return {
        allowed: false,
        reason: `You've reached the maximum number of cancellations (${policy.max_per_customer}) in the last 30 days. Please contact the business directly.`,
        forfeit_deposit: policy.forfeit_deposit,
        refund_amount: 0,
        original_amount: 0,
        appointment,
      };
    }
  }

  // Cancellation allowed
  return {
    allowed: true,
    forfeit_deposit: false,
    refund_amount: 0,
    original_amount: 0,
    appointment,
  };
}

/**
 * Execute a cancellation — update status, handle deposit forfeiture.
 */
export async function executeCancellation(
  supabase: SupabaseClient,
  appointmentId: string,
  reason: string,
): Promise<{ success: boolean; message: string }> {
  const check = await checkCancellationAllowed(supabase, appointmentId);

  if (!check.allowed) {
    return { success: false, message: check.reason || "Cancellation not allowed" };
  }

  // Update appointment status
  const { error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      metadata: {
        ...(check.appointment?.metadata as Record<string, unknown> || {}),
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        forfeit_deposit: check.forfeit_deposit,
      },
    })
    .eq("id", appointmentId);

  if (error) {
    return { success: false, message: "Failed to cancel appointment" };
  }

  let message = "Appointment cancelled successfully.";
  if (check.forfeit_deposit) {
    message += " The deposit has been retained per the cancellation policy.";
  }

  return { success: true, message };
}
