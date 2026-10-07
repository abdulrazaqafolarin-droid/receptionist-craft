/**
 * Module: Staff Roster (Phase C ops module, internal-only).
 *
 * Keeps weekly shifts per staff member and flags what the owner would miss:
 * double-booked people and days with nobody on. Staff identity lives in the
 * real `staff` table; shift assignments live under capabilities.ops_shifts
 * (small structured data, edited through saveShifts which validates shape).
 *
 * Deno-safe: ASCII only, no Node APIs.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface Shift {
  staff_name: string;
  day: number; // 0 = Sunday .. 6 = Saturday
  start: string; // "09:00"
  end: string; // "17:00"
}

export interface StaffMember {
  id: string;
  name: string;
  role: string | null;
}

export interface ShiftConflict {
  staff_name: string;
  day: number;
  first: Shift;
  second: Shift;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function validShift(s: unknown): s is Shift {
  if (!s || typeof s !== "object") return false;
  const r = s as Record<string, unknown>;
  return (
    typeof r.staff_name === "string" && r.staff_name.trim().length > 0 &&
    typeof r.day === "number" && Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 &&
    typeof r.start === "string" && TIME_RE.test(r.start) &&
    typeof r.end === "string" && TIME_RE.test(r.end) &&
    r.start < r.end
  );
}

async function readCapabilities(supabase: SupabaseClient, receptionistId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("receptionists")
    .select("capabilities")
    .eq("id", receptionistId)
    .maybeSingle();
  if (error) throw new Error(`roster read failed: ${error.message}`);
  const caps = (data as { capabilities?: unknown } | null)?.capabilities;
  return caps && typeof caps === "object" ? (caps as Record<string, unknown>) : {};
}

/** Staff list plus their shifts. Unknown staff names in shifts are kept — the owner may have typed faster than the Staff page. */
export async function getRoster(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<{ staff: StaffMember[]; shifts: Shift[] }> {
  const { data: staffRows, error: staffErr } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("receptionist_id", receptionistId)
    .eq("active", true)
    .order("name");
  if (staffErr) throw new Error(`roster staff read failed: ${staffErr.message}`);
  const caps = await readCapabilities(supabase, receptionistId);
  const raw = caps.ops_shifts;
  const shifts = Array.isArray(raw) ? raw.filter(validShift) : [];
  return { staff: (staffRows || []) as StaffMember[], shifts };
}

/** Replace the shift plan. Rejects malformed shifts rather than saving half a roster. */
export async function saveShifts(
  supabase: SupabaseClient,
  receptionistId: string,
  shifts: Shift[],
): Promise<{ saved: number }> {
  const bad = shifts.filter((s) => !validShift(s));
  if (bad.length > 0) {
    throw new Error(`roster rejected: ${bad.length} invalid shift(s) — day must be 0-6 and times HH:MM with start before end`);
  }
  const caps = await readCapabilities(supabase, receptionistId);
  const { error } = await supabase
    .from("receptionists")
    .update({ capabilities: { ...caps, ops_shifts: shifts } })
    .eq("id", receptionistId);
  if (error) throw new Error(`roster save failed: ${error.message}`);
  return { saved: shifts.length };
}

/** Same person, same day, overlapping times. */
export function findConflicts(shifts: Shift[]): ShiftConflict[] {
  const out: ShiftConflict[] = [];
  for (let i = 0; i < shifts.length; i++) {
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i];
      const b = shifts[j];
      if (a.staff_name.toLowerCase() !== b.staff_name.toLowerCase()) continue;
      if (a.day !== b.day) continue;
      if (a.start < b.end && b.start < a.end) {
        out.push({ staff_name: a.staff_name, day: a.day, first: a, second: b });
      }
    }
  }
  return out;
}

/** Days in openDays with zero shifts scheduled. */
export function uncoveredDays(shifts: Shift[], openDays: number[]): number[] {
  const covered = new Set(shifts.map((s) => s.day));
  return openDays.filter((d) => !covered.has(d));
}
