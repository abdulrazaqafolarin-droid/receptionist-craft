/**
 * Phase 6 — Staff Module
 *
 * CRUD + lookup for staff members under a receptionist.
 */

export interface StaffRecord {
  id: string;
  receptionist_id: string;
  name: string;
  role: string | null;
  active: boolean;
  created_at: string;
}

/**
 * Get all active staff for a receptionist.
 */
export async function getActiveStaff(
  supabase: any,
  receptionistId: string,
): Promise<StaffRecord[]> {
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .eq("active", true)
    .order("name");

  return (data ?? []) as StaffRecord[];
}

/**
 * Get a single staff member by ID.
 */
export async function getStaffById(
  supabase: any,
  staffId: string,
): Promise<StaffRecord | null> {
  const { data } = await supabase
    .from("staff")
    .select("*")
    .eq("id", staffId)
    .maybeSingle();

  return (data ?? null) as StaffRecord | null;
}

/**
 * Create a new staff member.
 */
export async function createStaff(
  supabase: any,
  params: {
    receptionist_id: string;
    name: string;
    role?: string | null;
  },
): Promise<StaffRecord> {
  const { data, error } = await supabase
    .from("staff")
    .insert({
      receptionist_id: params.receptionist_id,
      name: params.name.trim(),
      role: params.role?.trim() || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create staff: ${error.message}`);
  return data as StaffRecord;
}

/**
 * Deactivate a staff member (soft delete).
 */
export async function deactivateStaff(
  supabase: any,
  staffId: string,
): Promise<void> {
  const { error } = await supabase
    .from("staff")
    .update({ active: false })
    .eq("id", staffId);

  if (error) throw new Error(`Failed to deactivate staff: ${error.message}`);
}

/**
 * Find available staff for a given time slot.
 * Returns staff who have an availability rule for the day and no conflicting appointment.
 */
export async function findAvailableStaff(
  supabase: any,
  params: {
    receptionist_id: string;
    day_of_week: number;
    start_time: string; // HH:MM
    end_time: string;   // HH:MM
    date: string;       // YYYY-MM-DD for appointment conflict check
  },
): Promise<StaffRecord[]> {
  const { receptionist_id, day_of_week, start_time, end_time, date } = params;

  // 1. Get staff with availability rules for this day
  const { data: rules } = await supabase
    .from("availability_rules")
    .select("staff_id")
    .eq("receptionist_id", receptionist_id)
    .eq("day_of_week", day_of_week)
    .not("staff_id", "is", null);

  const staffIds = [...new Set((rules ?? []).map((r: any) => r.staff_id).filter(Boolean))];
  if (staffIds.length === 0) return [];

  // 2. Get those staff records
  const { data: staffList } = await supabase
    .from("staff")
    .select("*")
    .in("id", staffIds)
    .eq("active", true);

  if (!staffList || staffList.length === 0) return [];

  // 3. Check for conflicting appointments on that date
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;

  const { data: conflicts } = await supabase
    .from("appointments")
    .select("staff_id")
    .in("staff_id", staffIds)
    .gte("start_time", dayStart)
    .lte("start_time", dayEnd)
    .neq("status", "cancelled");

  const busyStaffIds = new Set((conflicts ?? []).map((c: any) => c.staff_id));

  return staffList.filter((s: StaffRecord) => !busyStaffIds.has(s.id));
}
