import { z } from "https://esm.sh/zod@3.21.4";

/**
 * OperationsConfig v1 — canonical server-side schema for the Business
 * Configuration Agent (Phase 1). Shared by the onboard-configurator edge
 * function. Mirrors docs/PHASE1_CONFIG_AGENT_SPEC.md.
 *
 * STRICT everywhere: unknown keys and unknown workflow types are rejected by
 * name. The agent authors configuration; it cannot invent engine capability.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dayHoursSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(HHMM),
  end_time: z.string().regex(HHMM),
});

export const operationsConfigSchema = z
  .object({
    version: z.literal(1),
    business: z
      .object({
        display_name: z.string().min(2).max(80),
        legal_name: z.string().min(2).max(120).optional(),
        business_type: z.string().min(2).max(60),
        description: z.string().max(2000).optional(),
        greeting_message: z.string().min(5).max(300).optional(),
        tone: z.enum(["friendly", "professional", "playful"]).optional(),
      })
      .strict(),
    contact: z
      .object({
        phone: z.string().min(7).max(20).optional(),
        email: z.string().email().optional(),
        website: z.string().url().max(200).optional(),
        address: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
    timezone: z.string().min(3).max(64),
    hours: z.array(dayHoursSchema).max(28),
    workflows: z
      .object({
        appointment_booking: z
          .object({
            enabled: z.boolean(),
            default_duration_minutes: z.number().int().min(5).max(480).optional(),
          })
          .strict()
          .optional(),
        product_ordering: z
          .object({
            enabled: z.boolean(),
            delivery: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine(
        (w) => w.appointment_booking?.enabled === true || w.product_ordering?.enabled === true,
        { message: "At least one workflow must be enabled" }
      ),
  })
  .strict();

export type OperationsConfig = z.infer<typeof operationsConfigSchema>;

export function isKnownTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type ValidationResult =
  | { ok: true; data: OperationsConfig }
  | { ok: false; issues: string[] };

export function validateOperationsConfig(input: unknown): ValidationResult {
  const parsed = operationsConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  if (!isKnownTimezone(parsed.data.timezone)) {
    return {
      ok: false,
      issues: [`timezone: "${parsed.data.timezone}" is not a recognized IANA timezone`],
    };
  }
  return { ok: true, data: parsed.data };
}

/** Extract a JSON object from model text (fenced or prose-wrapped). */
export function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch (_) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (_) {
        /* fall through */
      }
    }
  }
  throw new Error("No parseable JSON object found in response");
}
