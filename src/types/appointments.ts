// src/types/appointments.ts
import type { Json } from "@/integrations/supabase/types";

export type UUID = string;

export type AppointmentStatus = "booked" | "confirmed" | "cancelled" | "completed";

export interface Service {
  id?: UUID;
  name: string;
  duration_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  price_cents?: number | null;
  active?: boolean;
}

export interface AvailabilityRule {
  id?: UUID;
  receptionist_id: UUID;
  day_of_week: number; // 0 Sun - 6 Sat
  start_time: string; // "09:00"
  end_time: string;   // "17:00"
  timezone?: string;  // e.g. "Africa/Lagos"
  priority?: number;
}

export interface AvailabilityException {
  id?: UUID;
  receptionist_id: UUID;
  start_timestamptz: string; // ISO
  end_timestamptz: string;   // ISO
  reason?: string | null;
}

export interface Appointment {
  id?: UUID;
  receptionist_id: UUID;
  service_id?: UUID | null;
  service?: string; // Service name
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  start_time: string; // ISO
  end_time: string; // ISO
  status?: AppointmentStatus | null;
  created_at?: string;
  notes?: string | null;
  metadata?: Json | null;
  booking_source?: string; // e.g. 'ai_receptionist'
  source?: string; // alias for booking_source
}

export interface CheckAvailabilityRequest {
  receptionist_id: UUID;
  service_id?: UUID | null;
  startDate?: string; // ISO
  endDate?: string;   // ISO
  timezone?: string | null;
  duration_minutes?: number | null;
  max_slots?: number;
  desiredStart?: string | null;
  desiredEnd?: string | null;
  request_message?: string;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  display?: string;
  score?: number;
  reason?: string;
}

export interface CheckAvailabilityResult {
  success: boolean;
  available?: boolean;
  slots: AvailabilitySlot[];
  alternatives?: AvailabilitySlot[];
  service?: Service | null;
}

export interface BookAppointmentRequest {
  receptionistId: UUID;
  serviceId?: UUID | null;
  startTime: string; // ISO
  endTime?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string; // 'ai_receptionist' | 'manual' | etc
  userId?: UUID | null;
}

export interface BookAppointmentResult {
  success?: boolean;
  appointment?: Appointment | null;
  error?: string | null;
  idempotency_key?: string | null;
}

export interface AppointmentData {
  id: string;
  service: string;
  start_time: string;
  customer_name: string;
  status: string;
  [key: string]: unknown;
}
