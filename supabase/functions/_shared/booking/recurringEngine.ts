/**
 * Recurring Booking Engine
 *
 * Manages recurring appointment series:
 * - Create a recurring pattern (e.g., "every Tuesday at 10am")
 * - Generate individual appointments from the pattern
 * - Pause, resume, or cancel a series
 * - Handle exceptions (holidays, cancellations within a series)
 *
 * Used by: widget-chat (when customer requests recurring),
 *          booking engine (when creating from series template),
 *          cron job (to generate upcoming occurrences)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RecurrencePattern {
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
  interval: number;              // Every N periods
  days_of_week?: number[];       // For weekly: [0-6] (0=Sunday)
  day_of_month?: number;         // For monthly: 1-31
  start_date: string;            // YYYY-MM-DD
  end_date?: string;             // YYYY-MM-DD
  max_occurrences?: number;
}

export interface SeriesConfig {
  receptionist_id: string;
  service_id: string;
  staff_id?: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  start_time: string;            // HH:MM
  duration_minutes?: number;
  recurrence: RecurrencePattern;
}

/**
 * Create a recurring booking series and generate the first batch of occurrences.
 */
export async function createBookingSeries(
  supabase: SupabaseClient,
  config: SeriesConfig,
): Promise<{ series_id: string; appointments_created: number }> {
  // Calculate next occurrence date
  const nextDate = calculateNextOccurrence(
    config.recurrence,
    config.recurrence.start_date,
  );

  // Create the series record
  const { data: series, error: seriesErr } = await supabase
    .from("booking_series")
    .insert({
      receptionist_id: config.receptionist_id,
      service_id: config.service_id,
      staff_id: config.staff_id || null,
      customer_id: config.customer_id || null,
      customer_name: config.customer_name,
      customer_phone: config.customer_phone,
      customer_email: config.customer_email,
      start_time: config.start_time,
      duration_minutes: config.duration_minutes,
      frequency: config.recurrence.frequency,
      interval: config.recurrence.interval,
      days_of_week: config.recurrence.days_of_week || null,
      day_of_month: config.recurrence.day_of_month || null,
      start_date: config.recurrence.start_date,
      end_date: config.recurrence.end_date || null,
      max_occurrences: config.recurrence.max_occurrences || null,
      next_occurrence_date: nextDate,
      status: "active",
    })
    .select("id")
    .single();

  if (seriesErr) throw seriesErr;

  // Generate the first batch of appointments (next 8 weeks)
  const appointmentsCreated = await generateOccurrences(
    supabase,
    series.id,
    config,
    8, // Generate 8 weeks ahead
  );

  return {
    series_id: series.id,
    appointments_created: appointmentsCreated,
  };
}

/**
 * Generate upcoming occurrences for a series.
 * Called by cron job or on-demand.
 */
export async function generateOccurrences(
  supabase: SupabaseClient,
  seriesId: string,
  config: SeriesConfig,
  weeksAhead: number = 4,
): Promise<number> {
  // Get the series
  const { data: series } = await supabase
    .from("booking_series")
    .select("*")
    .eq("id", seriesId)
    .eq("status", "active")
    .maybeSingle();

  if (!series) return 0;

  const pattern: RecurrencePattern = {
    frequency: series.frequency,
    interval: series.interval,
    days_of_week: series.days_of_week,
    day_of_month: series.day_of_month,
    start_date: series.start_date,
    end_date: series.end_date,
    max_occurrences: series.max_occurrences,
  };

  // Calculate dates for the next N weeks
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + weeksAhead * 7);

  let currentDate = series.next_occurrence_date
    ? new Date(series.next_occurrence_date)
    : new Date(series.start_date);

  let created = 0;
  const maxToCreate = series.max_occurrences
    ? series.max_occurrences - (series.occurrences_created || 0)
    : 52; // Safety cap

  while (created < maxToCreate && currentDate <= cutoffDate) {
    // Check end date
    if (series.end_date && currentDate > new Date(series.end_date)) break;

    // Check if this date already has an appointment in the series
    const dateStr = currentDate.toISOString().split("T")[0];
    const startTime = `${dateStr}T${series.start_time}`;

    const { data: existing } = await supabase
      .from("appointments")
      .select("id")
      .eq("receptionist_id", series.receptionist_id)
      .eq("staff_id", series.staff_id)
      .eq("start_time", startTime)
      .neq("status", "cancelled")
      .maybeSingle();

    if (!existing) {
      // Create the appointment
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + (series.duration_minutes || 60));

      const { error: apptErr } = await supabase
        .from("appointments")
        .insert({
          receptionist_id: series.receptionist_id,
          service_id: series.service_id,
          staff_id: series.staff_id,
          customer_id: series.customer_id,
          customer_name: series.customer_name,
          customer_phone: series.customer_phone,
          customer_email: series.customer_email,
          start_time: startTime,
          end_time: endTime.toISOString(),
          status: "confirmed",
          metadata: {
            series_id: seriesId,
            recurring: true,
            occurrence_number: (series.occurrences_created || 0) + created + 1,
          },
        });

      if (!apptErr) created++;
    }

    // Advance to next occurrence
    currentDate = getNextOccurrenceDate(pattern, currentDate);
  }

  // Update series tracking
  await supabase
    .from("booking_series")
    .update({
      occurrences_created: (series.occurrences_created || 0) + created,
      next_occurrence_date: currentDate.toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId);

  return created;
}

/**
 * Pause a recurring series.
 */
export async function pauseSeries(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<void> {
  await supabase
    .from("booking_series")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", seriesId);
}

/**
 * Resume a paused series.
 */
export async function resumeSeries(
  supabase: SupabaseClient,
  seriesId: string,
): Promise<void> {
  const { data: series } = await supabase
    .from("booking_series")
    .select("next_occurrence_date, start_date")
    .eq("id", seriesId)
    .maybeSingle();

  if (!series) return;

  // Reset next occurrence to today if it's in the past
  const nextDate = series.next_occurrence_date;
  const today = new Date().toISOString().split("T")[0];

  await supabase
    .from("booking_series")
    .update({
      status: "active",
      next_occurrence_date: nextDate < today ? today : nextDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId);
}

/**
 * Cancel a series and optionally cancel all future appointments.
 */
export async function cancelSeries(
  supabase: SupabaseClient,
  seriesId: string,
  cancelFutureAppointments: boolean = true,
): Promise<number> {
  await supabase
    .from("booking_series")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", seriesId);

  if (cancelFutureAppointments) {
    const { count } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("metadata->>series_id", seriesId)
      .eq("status", "confirmed")
      .gte("start_time", new Date().toISOString())
      .select("id", { count: "exact", head: true });

    return count || 0;
  }

  return 0;
}

// ── Helpers ────────────────────────────────────────────────────────

function calculateNextOccurrence(
  pattern: RecurrencePattern,
  fromDate: string,
): string {
  const date = new Date(fromDate);
  return getNextOccurrenceDate(pattern, date).toISOString().split("T")[0];
}

function getNextOccurrenceDate(
  pattern: RecurrencePattern,
  currentDate: Date,
): Date {
  const next = new Date(currentDate);

  switch (pattern.frequency) {
    case "daily":
      next.setDate(next.getDate() + pattern.interval);
      break;

    case "weekly":
      if (pattern.days_of_week && pattern.days_of_week.length > 0) {
        // Find next matching day of week
        next.setDate(next.getDate() + 1);
        while (!pattern.days_of_week.includes(next.getDay())) {
          next.setDate(next.getDate() + 1);
          // Safety: if we've gone more than 7 days, something is wrong
          if (next.getTime() - currentDate.getTime() > 8 * 24 * 60 * 60 * 1000) {
            next.setDate(currentDate.getDate() + 7 * pattern.interval);
            break;
          }
        }
      } else {
        next.setDate(next.getDate() + 7 * pattern.interval);
      }
      break;

    case "biweekly":
      next.setDate(next.getDate() + 14 * pattern.interval);
      break;

    case "monthly":
      if (pattern.day_of_month) {
        next.setMonth(next.getMonth() + pattern.interval);
        next.setDate(Math.min(pattern.day_of_month, getDaysInMonth(next)));
      } else {
        next.setMonth(next.getMonth() + pattern.interval);
      }
      break;
  }

  return next;
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
