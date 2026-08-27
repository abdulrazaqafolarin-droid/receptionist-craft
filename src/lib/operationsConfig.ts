import { z } from "zod";

/**
 * OperationsConfig v1 — the structured contract between the Business
 * Configuration Agent (gateway `configurator`) and the EXISTING runtime
 * engine (widget-chat + onboarding store).
 *
 * Design rules (Phase 1 spec, docs/PHASE1_CONFIG_AGENT_SPEC.md):
 * - `.strict()` everywhere: unknown keys and unknown workflow types are
 *   rejected. The agent authors config; it cannot invent capabilities the
 *   engine doesn't have. A genuinely new workflow type is a deliberate,
 *   reviewed engine addition — never an ad-hoc per-client JSON blob.
 * - Only workflow types that exist on the ground today: appointment_booking
 *   and product_ordering.
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dayHoursSchema = z.object({
  day_of_week: z.number().int().min(0).max(6), // 0 = Sunday, matches availability_rules
  start_time: z.string().regex(HHMM, "start_time must be HH:mm (24h)"),
  end_time: z.string().regex(HHMM, "end_time must be HH:mm (24h)"),
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
    timezone: z.string().min(3).max(64), // IANA name, reality-checked below
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

/** True when the platform's Intl implementation recognizes the timezone. */
export function isKnownTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: string[] };

/**
 * Validate an unknown payload as OperationsConfig.
 * Never trust gateway text — this is the only door into real state.
 */
export function validateOperationsConfig(input: unknown): ValidationResult<OperationsConfig> {
  const parsed = operationsConfigSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
      ),
    };
  }
  if (!isKnownTimezone(parsed.data.timezone)) {
    return { ok: false, issues: [`timezone: "${parsed.data.timezone}" is not a recognized IANA timezone`] };
  }
  return { ok: true, data: parsed.data };
}
