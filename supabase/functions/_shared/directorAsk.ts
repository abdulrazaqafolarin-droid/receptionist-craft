/**
 * Ask-channel shapes + validation — shared by the edge and its tests.
 *
 * Field: { key, label, type, required?, minLength?, options?, help? }
 * Types: text | password | otp | file | yesno | choice
 * Validation is format-only and honest: it rejects empty required
 * fields, short secrets, non-digit OTPs, off-list choices — and says
 * exactly which field failed. Provider verification (is the key real?)
 * happens in the edge via verify-connector, never here.
 * Deno-safe: no imports.
 */

export interface AskField {
  key: string;
  label: string;
  type: "text" | "password" | "otp" | "file" | "yesno" | "choice";
  required?: boolean;
  minLength?: number;
  options?: string[];
  help?: string;
}

export type AskKind = "credential" | "approval" | "otp" | "choice" | "files";

export function validateAnswer(
  fields: AskField[],
  values: Record<string, unknown>,
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const f of fields) {
    const v = values[f.key];
    const missing = v === undefined || v === null || (typeof v === "string" && !v.trim());
    if (missing) {
      if (f.required !== false) errors.push(`${f.label}: required`);
      continue;
    }
    if (f.type === "otp") {
      const digits = String(v).replace(/\D/g, "");
      if (digits.length < 4 || digits.length > 10 || digits !== String(v).trim()) {
        errors.push(`${f.label}: enter the digits only`);
      }
    } else if (f.type === "yesno") {
      if (typeof v !== "boolean") errors.push(`${f.label}: answer yes or no`);
    } else if (f.type === "choice") {
      if (!Array.isArray(f.options) || !f.options.includes(String(v))) {
        errors.push(`${f.label}: pick one of the offered options`);
      }
    } else {
      const s = String(v);
      const min = f.type === "password" ? Math.max(8, f.minLength ?? 0) : (f.minLength ?? 0);
      if (s.trim().length < min) {
        errors.push(f.type === "password"
          ? `${f.label}: too short to be a real key`
          : `${f.label}: too short (min ${min})`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Which field types may be stored where. Credential/file answers never persist as plaintext. */
export function answerDisposition(kind: AskKind): "vault" | "burn" | "keep" {
  if (kind === "credential") return "vault";
  if (kind === "otp") return "burn";
  return "keep";
}
