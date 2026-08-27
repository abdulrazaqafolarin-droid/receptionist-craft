import { describe, it, expect } from "vitest";

// ── Phase 6 Multi-Staff Tests ───────────────────────────────────────
// Tests for staff availability matching and staff-scoped scheduling.

interface StaffRecord {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
}

interface AvailabilityRule {
  staff_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface Appointment {
  staff_id: string | null;
  start_time: string;
  status: string | null;
}

/**
 * Find which staff members are available for a given time slot.
 * Logic: staff must have an availability rule covering the slot AND no conflicting appointment.
 */
function findAvailableStaff(
  allStaff: StaffRecord[],
  rules: AvailabilityRule[],
  appointments: Appointment[],
  params: {
    day_of_week: number;
    slot_start: string; // HH:MM
    slot_end: string;   // HH:MM
    date: string;       // YYYY-MM-DD
  },
): StaffRecord[] {
  const { day_of_week, slot_start, slot_end, date } = params;

  // 1. Staff with availability rules covering this day and overlapping the slot
  const eligibleStaffIds = new Set(
    rules
      .filter(
        (r) =>
          r.staff_id != null &&
          r.day_of_week === day_of_week &&
          r.start_time <= slot_start &&
          r.end_time >= slot_end,
      )
      .map((r) => r.staff_id as string),
  );

  // 2. Staff with conflicting appointments on the same date
  const busyStaffIds = new Set(
    appointments
      .filter(
        (a) =>
          a.staff_id != null &&
          a.status !== "cancelled" &&
          a.start_time.startsWith(date),
      )
      .map((a) => a.staff_id as string),
  );

  return allStaff.filter(
    (s) => s.active && eligibleStaffIds.has(s.id) && !busyStaffIds.has(s.id),
  );
}

// ═══════════════════════════════════════════════════════════════════════

const staff: StaffRecord[] = [
  { id: "s1", name: "Dr. Amina", role: "Dentist", active: true },
  { id: "s2", name: "Dr. Bola", role: "Dentist", active: true },
  { id: "s3", name: "Dr. Chidi", role: "Dentist", active: false },
];

describe("findAvailableStaff", () => {
  const rules: AvailabilityRule[] = [
    // Dr. Amina: Mon-Fri 09:00-17:00
    { staff_id: "s1", day_of_week: 1, start_time: "09:00", end_time: "17:00" },
    { staff_id: "s1", day_of_week: 2, start_time: "09:00", end_time: "17:00" },
    // Dr. Bola: Mon-Wed 10:00-15:00
    { staff_id: "s2", day_of_week: 1, start_time: "10:00", end_time: "15:00" },
    { staff_id: "s2", day_of_week: 2, start_time: "10:00", end_time: "15:00" },
    // Business-level rule (no staff_id)
    { staff_id: null, day_of_week: 1, start_time: "08:00", end_time: "18:00" },
  ];

  it("returns all active staff with matching availability", () => {
    // Slot 10:00-12:00 fits within both Dr. Amina (09:00-17:00) and Dr. Bola (10:00-15:00)
    const result = findAvailableStaff(staff, rules, [], {
      day_of_week: 1,
      slot_start: "10:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    expect(result.map((s) => s.id)).toContain("s1");
    expect(result.map((s) => s.id)).toContain("s2");
  });

  it("excludes inactive staff", () => {
    const result = findAvailableStaff(staff, rules, [], {
      day_of_week: 1,
      slot_start: "09:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    expect(result.map((s) => s.id)).not.toContain("s3");
  });

  it("excludes staff when slot starts before their availability", () => {
    // Dr. Bola starts at 10:00 — slot 09:00-12:00 starts before her availability
    const result = findAvailableStaff(staff, rules, [], {
      day_of_week: 1,
      slot_start: "09:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    // Dr. Bola's rule is 10:00-15:00, slot is 09:00-12:00
    // rule.start_time (10:00) <= slot_start (09:00) is FALSE → excluded
    expect(result.map((s) => s.id)).not.toContain("s2");
    expect(result.map((s) => s.id)).toContain("s1");
  });

  it("excludes staff with conflicting appointments", () => {
    const appts: Appointment[] = [
      { staff_id: "s1", start_time: "2026-08-24T10:00:00", status: "booked" },
    ];
    const result = findAvailableStaff(staff, rules, appts, {
      day_of_week: 1,
      slot_start: "10:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    expect(result.map((s) => s.id)).not.toContain("s1");
    expect(result.map((s) => s.id)).toContain("s2");
  });

  it("does not exclude staff for cancelled appointments", () => {
    const appts: Appointment[] = [
      { staff_id: "s1", start_time: "2026-08-24T10:00:00", status: "cancelled" },
    ];
    const result = findAvailableStaff(staff, rules, appts, {
      day_of_week: 1,
      slot_start: "10:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    expect(result.map((s) => s.id)).toContain("s1");
  });

  it("returns empty when no rules match the day", () => {
    const result = findAvailableStaff(staff, rules, [], {
      day_of_week: 6, // Saturday
      slot_start: "09:00",
      slot_end: "12:00",
      date: "2026-08-29",
    });
    expect(result).toEqual([]);
  });

  it("returns empty when all staff are busy", () => {
    const appts: Appointment[] = [
      { staff_id: "s1", start_time: "2026-08-24T08:00:00", status: "booked" },
      { staff_id: "s2", start_time: "2026-08-24T08:00:00", status: "booked" },
    ];
    const result = findAvailableStaff(staff, rules, appts, {
      day_of_week: 1,
      slot_start: "10:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    expect(result).toEqual([]);
  });

  it("ignores business-level rules (staff_id null) in staff matching", () => {
    const result = findAvailableStaff(staff, rules, [], {
      day_of_week: 1,
      slot_start: "10:00",
      slot_end: "12:00",
      date: "2026-08-24",
    });
    // Only s1 and s2 should be matched, not via the null-staff rule
    expect(result.length).toBeLessThanOrEqual(2);
  });
});
