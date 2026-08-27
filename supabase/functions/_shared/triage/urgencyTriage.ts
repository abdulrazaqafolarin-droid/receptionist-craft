/**
 * Urgency-Based Triage System
 *
 * Detects urgency from conversation context and routes accordingly:
 * - Emergency: bypass queue, escalate immediately, offer earliest slot
 * - Urgent: priority scheduling, earlier slots, skip optional fields
 * - Routine: normal booking flow
 *
 * Businesses define their own urgency keywords and rules via triage_rules.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type TriageLevel = "routine" | "urgent" | "emergency";

export interface TriageRules {
  urgent_keywords?: string[];
  emergency_keywords?: string[];
  urgent_response_minutes?: number;
  emergency_response_minutes?: number;
  escalate_emergency_to?: "human" | "staff" | "system";
  skip_queue_for_urgent?: boolean;
}

export interface TriageResult {
  level: TriageLevel;
  matched_keywords: string[];
  escalate: boolean;
  skip_optional_fields: boolean;
  offer_earliest_slot: boolean;
  response_time_minutes: number;
  message: string; // Plain-language explanation for the customer
}

const DEFAULT_EMERGENCY_KEYWORDS = [
  "emergency",
  "severe bleeding",
  "chest pain",
  "can't breathe",
  "unconscious",
  "fire",
  "flooding",
  "gas leak",
  "broken bone",
  "seizure",
  "allergic reaction",
  "choking",
  "drowning",
  " electrocution",
  "severe burn",
];

const DEFAULT_URGENT_KEYWORDS = [
  "pain",
  "hurt",
  "urgent",
  "asap",
  "immediately",
  "broken",
  "leaking",
  "smoke",
  "flooding",
  "severe",
  "bleeding",
  "swollen",
  "fever",
  "infection",
  "emergency",
  "critical",
  "bad",
  "terrible",
  "worst",
  "disaster",
];

/**
 * Detect urgency level from a customer's message and conversation context.
 * Uses the business's custom triage_rules if configured, falls back to defaults.
 */
export async function detectUrgency(
  supabase: SupabaseClient,
  receptionistId: string,
  currentMessage: string,
  recentMessages: string[] = [],
): Promise<TriageResult> {
  // Load business triage rules
  const { data: rec } = await supabase
    .from("receptionists")
    .select("triage_rules, business_type")
    .eq("id", receptionistId)
    .maybeSingle();

  const rules: TriageRules = (rec?.triage_rules as TriageRules) || {};
  const businessType = rec?.business_type || "";

  const urgentKeywords = rules.urgent_keywords || getDefaultUrgentKeywords(businessType);
  const emergencyKeywords = rules.emergency_keywords || getDefaultEmergencyKeywords(businessType);

  // Check all messages (current + recent) for urgency signals
  const allMessages = [currentMessage, ...recentMessages].join(" ").toLowerCase();

  // Check emergency first (highest priority)
  const emergencyMatches = emergencyKeywords.filter((kw) =>
    allMessages.includes(kw.toLowerCase()),
  );

  if (emergencyMatches.length > 0) {
    return {
      level: "emergency",
      matched_keywords: emergencyMatches,
      escalate: rules.escalate_emergency_to !== "system",
      skip_optional_fields: true,
      offer_earliest_slot: true,
      response_time_minutes: rules.emergency_response_minutes || 15,
      message: "I understand this is urgent. Let me get you help right away.",
    };
  }

  // Check urgent
  const urgentMatches = urgentKeywords.filter((kw) =>
    allMessages.includes(kw.toLowerCase()),
  );

  if (urgentMatches.length > 0) {
    return {
      level: "urgent",
      matched_keywords: urgentMatches,
      escalate: false,
      skip_optional_fields: true,
      offer_earliest_slot: rules.skip_queue_for_urgent || false,
      response_time_minutes: rules.urgent_response_minutes || 60,
      message: "I understand this needs attention soon. Let me prioritize your booking.",
    };
  }

  // Routine
  return {
    level: "routine",
    matched_keywords: [],
    escalate: false,
    skip_optional_fields: false,
    offer_earliest_slot: false,
    response_time_minutes: rules.urgent_response_minutes || 1440, // Default 24h
    message: "",
  };
}

/**
 * Apply triage to a booking: set triage_level, adjust slot selection, escalate if needed.
 */
export async function applyTriage(
  supabase: SupabaseClient,
  receptionistId: string,
  appointmentId: string,
  triage: TriageResult,
): Promise<void> {
  // Set triage level on the appointment
  await supabase
    .from("appointments")
    .update({ triage_level: triage.level })
    .eq("id", appointmentId);

  // Create escalation for emergency
  if (triage.level === "emergency" && triage.escalate) {
    await supabase.from("escalations").insert({
      receptionist_id: receptionistId,
      appointment_id: appointmentId,
      reason: `Emergency detected: ${triage.matched_keywords.join(", ")}`,
      summary: `Customer message triggered emergency triage. Keywords: ${triage.matched_keywords.join(", ")}. Immediate attention required.`,
      urgency_source: "keyword_detection",
      status: "pending",
    });
  }

  // Log the triage event
  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: "triage",
    event_type: "triage_applied",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      appointment_id: appointmentId,
      triage_level: triage.level,
      matched_keywords: triage.matched_keywords,
      escalated: triage.escalate,
    },
  });
}

/**
 * Get the earliest available slot for urgent/emergency cases.
 * Skips the normal queue and finds the next open slot.
 */
export async function findEarliestSlot(
  supabase: SupabaseClient,
  receptionistId: string,
  serviceId?: string,
  staffId?: string,
): Promise<{ date: string; time: string } | null> {
  // Search the next 7 days for the first available slot
  const today = new Date();

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const searchDate = new Date(today);
    searchDate.setDate(searchDate.getDate() + dayOffset);
    const dateStr = searchDate.toISOString().split("T")[0];
    const dayOfWeek = searchDate.getDay();

    // Get availability rules for this day
    const rulesQuery = supabase
      .from("availability_rules")
      .select("start_time, end_time, staff_id")
      .eq("receptionist_id", receptionistId)
      .eq("day_of_week", dayOfWeek);

    if (staffId) {
      rulesQuery.eq("staff_id", staffId);
    }

    const { data: rules } = await rulesQuery;

    if (!rules || rules.length === 0) continue;

    for (const rule of rules) {
      // Check if this time slot is already booked
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("receptionist_id", receptionistId)
        .eq("staff_id", rule.staff_id)
        .neq("status", "cancelled")
        .gte("start_time", `${dateStr}T${rule.start_time}`)
        .lt("start_time", `${dateStr}T${rule.end_time}`);

      if ((count || 0) === 0) {
        return {
          date: dateStr,
          time: rule.start_time.substring(0, 5),
        };
      }
    }
  }

  return null;
}

// ── Business-type-specific defaults ────────────────────────────────

function getDefaultUrgentKeywords(businessType: string): string[] {
  const base = DEFAULT_URGENT_KEYWORDS;

  const businessSpecific: Record<string, string[]> = {
    dental_clinic: [...base, "toothache", "swollen jaw", " knocked out tooth", "abscess"],
    medical_clinic: [...base, "fever", "vomiting", "dizzy", "rash", "infection"],
    auto_repair: [...base, "breaks not working", "overheating", "strange noise", "won't start"],
    veterinary: [...base, "not eating", "limping", "vomiting", "not breathing well", "seizure"],
    home_services: [...base, "burst pipe", "gas smell", "no heat", "no power", "flooded"],
    restaurant: [...base, "food poisoning", "allergic reaction", "foreign object"],
  };

  return businessSpecific[businessType] || base;
}

function getDefaultEmergencyKeywords(businessType: string): string[] {
  const base = DEFAULT_EMERGENCY_KEYWORDS;

  const businessSpecific: Record<string, string[]> = {
    dental_clinic: ["severe jaw swelling", "difficulty breathing", "uncontrolled bleeding"],
    medical_clinic: ["chest pain", "stroke symptoms", "severe allergic reaction", "unconscious"],
    veterinary: ["not breathing", "seizure", "hit by car", "ingested poison", "severe bleeding"],
    home_services: ["gas leak", "electrical fire", "flooding", "structural damage"],
  };

  return businessSpecific[businessType] || base;
}
