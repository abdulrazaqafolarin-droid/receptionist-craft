/**
 * Skill-Based Staff Matching
 *
 * Matches customers to the right staff member based on:
 * 1. Which staff can perform the requested service (service_staff junction)
 * 2. Staff availability at the requested time
 * 3. Customer preference for a specific staff member
 * 4. Priority ordering (preferred staff first)
 *
 * Used by: booking flow, widget-chat, appointment scheduling
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface StaffMatch {
  staff_id: string;
  staff_name: string;
  staff_role: string;
  price_override: number | null;
  duration_override_minutes: number | null;
  priority: number;
  available: boolean;
  conflict_reason?: string;
}

/**
 * Find staff who can perform a specific service and are available at the requested time.
 */
export async function findServiceStaff(
  supabase: SupabaseClient,
  receptionistId: string,
  serviceId: string,
  requestedDate: string, // YYYY-MM-DD
  requestedTime: string, // HH:MM
  excludeAppointmentId?: string, // Don't count this appointment as a conflict (for reschedule)
): Promise<StaffMatch[]> {
  // 1. Get all staff linked to this service
  const { data: serviceStaffLinks } = await supabase
    .from("service_staff")
    .select(`
      staff_id,
      price_override,
      duration_override_minutes,
      priority,
      staff:staff_id (id, name, role, active)
    `)
    .eq("receptionist_id", receptionistId)
    .eq("service_id", serviceId);

  if (!serviceStaffLinks || serviceStaffLinks.length === 0) {
    // No service-specific links — fall back to all active staff
    return findAllAvailableStaff(supabase, receptionistId, requestedDate, requestedTime, excludeAppointmentId);
  }

  // 2. Filter to active staff only
  const activeLinks = serviceStaffLinks.filter(
    (link: any) => link.staff?.active !== false,
  );

  // 3. Check availability for each staff member
  const dayOfWeek = new Date(requestedDate).getDay();
  const results: StaffMatch[] = [];

  for (const link of activeLinks) {
    const staff = link.staff as any;
    if (!staff) continue;

    // Check if staff has an availability rule for this day
    const { data: rules } = await supabase
      .from("availability_rules")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .eq("staff_id", staff.id)
      .eq("day_of_week", dayOfWeek);

    if (!rules || rules.length === 0) {
      results.push({
        staff_id: staff.id,
        staff_name: staff.name,
        staff_role: staff.role || "",
        price_override: link.price_override,
        duration_override_minutes: link.duration_override_minutes,
        priority: link.priority || 0,
        available: false,
        conflict_reason: "No availability rule for this day",
      });
      continue;
    }

    // Check for conflicting appointments
    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("receptionist_id", receptionistId)
      .eq("staff_id", staff.id)
      .neq("status", "cancelled")
      .eq("start_time", `${requestedDate}T${requestedTime}:00`)
      .neq("id", excludeAppointmentId || "");

    results.push({
      staff_id: staff.id,
      staff_name: staff.name,
      staff_role: staff.role || "",
      price_override: link.price_override,
      duration_override_minutes: link.duration_override_minutes,
      priority: link.priority || 0,
      available: (count || 0) === 0,
      conflict_reason: (count || 0) > 0 ? "Already booked at this time" : undefined,
    });
  }

  // Sort: available first, then by priority (lower = preferred)
  return results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.priority - b.priority;
  });
}

/**
 * Fallback: find all available staff (when no service-specific links exist).
 */
async function findAllAvailableStaff(
  supabase: SupabaseClient,
  receptionistId: string,
  requestedDate: string,
  requestedTime: string,
  excludeAppointmentId?: string,
): Promise<StaffMatch[]> {
  const dayOfWeek = new Date(requestedDate).getDay();

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("receptionist_id", receptionistId)
    .eq("active", true);

  if (!staff) return [];

  const results: StaffMatch[] = [];

  for (const s of staff) {
    const { data: rules } = await supabase
      .from("availability_rules")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .eq("staff_id", s.id)
      .eq("day_of_week", dayOfWeek);

    if (!rules || rules.length === 0) {
      results.push({
        staff_id: s.id,
        staff_name: s.name,
        staff_role: s.role || "",
        price_override: null,
        duration_override_minutes: null,
        priority: 0,
        available: false,
        conflict_reason: "No availability rule for this day",
      });
      continue;
    }

    const { count } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("receptionist_id", receptionistId)
      .eq("staff_id", s.id)
      .neq("status", "cancelled")
      .eq("start_time", `${requestedDate}T${requestedTime}:00`)
      .neq("id", excludeAppointmentId || "");

    results.push({
      staff_id: s.id,
      staff_name: s.name,
      staff_role: s.role || "",
      price_override: null,
      duration_override_minutes: null,
      priority: 0,
      available: (count || 0) === 0,
      conflict_reason: (count || 0) > 0 ? "Already booked at this time" : undefined,
    });
  }

  return results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return a.priority - b.priority;
  });
}

/**
 * Get staff preferred by a returning customer.
 * Looks at past bookings to find which staff they've seen before.
 */
export async function getCustomerPreferredStaff(
  supabase: SupabaseClient,
  receptionistId: string,
  customerId: string,
): Promise<string | null> {
  const { data: recentBookings } = await supabase
    .from("appointments")
    .select("staff_id")
    .eq("receptionist_id", receptionistId)
    .eq("customer_id", customerId)
    .not("staff_id", "is", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!recentBookings || recentBookings.length === 0) return null;

  // Count staff occurrences and return the most frequent
  const counts = new Map<string, number>();
  recentBookings.forEach((b) => {
    counts.set(b.staff_id, (counts.get(b.staff_id) || 0) + 1);
  });

  let maxCount = 0;
  let preferred = "";
  counts.forEach((count, staffId) => {
    if (count > maxCount) {
      maxCount = count;
      preferred = staffId;
    }
  });

  return preferred || null;
}
