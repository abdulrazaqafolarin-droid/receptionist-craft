import { z } from "zod";

// Receptionist validation schema
export const receptionistSchema = z.object({
  name: z.string().trim().min(1, "Receptionist name is required").max(100),
  business_name: z.string().trim().min(1, "Business name is required").max(200),
  business_type: z.string().max(100).optional(),
  phone: z.string().regex(/^\+?[\d\s\-()]+$/, "Invalid phone number format").max(20).optional().or(z.literal("")),
  tone: z.enum(["friendly", "professional", "playful"]),
  greeting_message: z.string().max(500).optional(),
  knowledge_base: z.string().max(10000).optional(),
  language: z.string().max(50).optional(),
  goal: z.string().max(1000).optional(),
});

// Appointment validation schema
export const appointmentSchema = z.object({
  customer_name: z.string().trim().min(1, "Customer name is required").max(100),
  customer_email: z.string().trim().email("Invalid email address").max(255).optional().or(z.literal("")),
  customer_phone: z.string().regex(/^\+?[\d\s\-()]+$/, "Invalid phone number format").max(20).optional().or(z.literal("")),
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
  timezone: z.string().max(50).default("UTC"),
}).refine(
  (data) => data.end_time > data.start_time,
  {
    message: "End time must be after start time",
    path: ["end_time"],
  }
);
