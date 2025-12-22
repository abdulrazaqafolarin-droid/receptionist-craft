import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED VALIDATION LIBRARY - Production Ready
// ═══════════════════════════════════════════════════════════════════════════

// Email validation with additional security checks
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(255, "Email must be less than 255 characters")
  .refine(
    (email) => !email.includes("..") && !email.startsWith(".") && !email.endsWith("."),
    "Invalid email format"
  );

// E.164 phone number validation (international format)
// Accepts: +1234567890, +44 20 7946 0958, etc.
export const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[1-9]\d{1,14}$/,
    "Phone must be in E.164 format (e.g., +1234567890)"
  )
  .max(20, "Phone number too long");

// Flexible phone validation (accepts common formats, cleans to digits)
export const flexiblePhoneSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/[\s\-().]/g, ""))
  .refine(
    (val) => /^\+?[\d]{7,20}$/.test(val),
    "Invalid phone number format"
  );

// Strong password validation
export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .refine(
    (password) => /[A-Z]/.test(password),
    "Password must contain at least one uppercase letter"
  )
  .refine(
    (password) => /[a-z]/.test(password),
    "Password must contain at least one lowercase letter"
  )
  .refine(
    (password) => /[0-9]/.test(password),
    "Password must contain at least one number"
  )
  .refine(
    (password) => /[^A-Za-z0-9]/.test(password),
    "Password must contain at least one special character"
  );

// Basic password (for existing systems - minimum security)
export const basicPasswordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters")
  .max(128, "Password must be less than 128 characters");

// Username/handle validation
export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be less than 30 characters")
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Username can only contain letters, numbers, and underscores"
  );

// Name validation (prevents XSS, allows unicode names)
export const nameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(100, "Name must be less than 100 characters")
  .refine(
    (name) => !/[<>{}]/.test(name),
    "Name contains invalid characters"
  );

// URL validation
export const urlSchema = z
  .string()
  .trim()
  .url("Invalid URL format")
  .max(2048, "URL too long")
  .refine(
    (url) => url.startsWith("https://") || url.startsWith("http://"),
    "URL must start with http:// or https://"
  );

// Timezone validation
export const timezoneSchema = z
  .string()
  .max(50, "Invalid timezone")
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    "Invalid timezone"
  );

// Receptionist validation schema
export const receptionistSchema = z.object({
  name: nameSchema,
  business_name: z.string().trim().min(1, "Business name is required").max(200),
  business_type: z.string().max(100).optional(),
  phone: flexiblePhoneSchema.optional().or(z.literal("")),
  tone: z.enum(["friendly", "professional", "playful"]),
  greeting_message: z.string().max(500).optional(),
  knowledge_base: z.string().max(10000).optional(),
  language: z.string().max(50).optional(),
  goal: z.string().max(1000).optional(),
});

// Appointment validation schema
export const appointmentSchema = z.object({
  customer_name: nameSchema,
  customer_email: emailSchema.optional().or(z.literal("")),
  customer_phone: flexiblePhoneSchema.optional().or(z.literal("")),
  service: z.string().trim().min(1, "Service is required").max(200),
  start_time: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid start time"),
  end_time: z.string().refine((val) => !isNaN(Date.parse(val)), "Invalid end time"),
  notes: z.string().max(1000).optional(),
}).refine(
  (data) => data.customer_email || data.customer_phone,
  {
    message: "Either email or phone number is required",
    path: ["customer_email"],
  }
).refine(
  (data) => new Date(data.end_time) > new Date(data.start_time),
  {
    message: "End time must be after start time",
    path: ["end_time"],
  }
);

// Service validation schema
export const serviceSchema = z.object({
  name: z.string().trim().min(1, "Service name is required").max(200),
  description: z.string().max(1000).optional(),
  duration_minutes: z.number().min(5, "Duration must be at least 5 minutes").max(480, "Duration cannot exceed 8 hours"),
  buffer_before_minutes: z.number().min(0).max(120).default(0),
  buffer_after_minutes: z.number().min(0).max(120).default(0),
});

// FAQ validation schema
export const faqSchema = z.object({
  question: z.string().trim().min(1, "Question is required").max(500),
  answer: z.string().trim().min(1, "Answer is required").max(2000),
  priority: z.number().min(0).max(100).optional(),
});

// Availability rule validation schema
export const availabilityRuleSchema = z.object({
  day_of_week: z.number().min(0).max(6),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (HH:MM)"),
  timezone: timezoneSchema.default("UTC"),
}).refine(
  (data) => data.end_time > data.start_time,
  {
    message: "End time must be after start time",
    path: ["end_time"],
  }
);

// Contact info validation (for booking)
export const contactSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional().or(z.literal("")),
  phone: flexiblePhoneSchema.optional().or(z.literal("")),
}).refine(
  (data) => data.email || data.phone,
  {
    message: "Either email or phone is required",
    path: ["email"],
  }
);

// Auth schemas
export const signUpSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: basicPasswordSchema, // Use strongPasswordSchema for stricter requirements
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

// Sanitization utilities
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeForUrl(input: string): string {
  return encodeURIComponent(input.trim());
}
