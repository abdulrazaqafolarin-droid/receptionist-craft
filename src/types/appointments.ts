// src/types/appointments.ts
export type UUID = string;

export type Service = {
  id?: UUID;
  name: string;
  duration_minutes: number;
  buffer_minutes?: number; // before/after buffer
  price_cents?: number | null;
};

export type AvailabilityRule = {
  id?: UUID;
  receptionist_id: UUID;
  day_of_week: number; // 0 Sun - 6 Sat
  start_time: string; // "09:00"
  end_time: string;   // "17:00"
  timezone?: string;  // e.g. "Africa/Lagos"
};

export type AvailabilityException = {
  id?: UUID;
  receptionist_id: UUID;
  start_datetime: string; // ISO
  end_datetime: string;   // ISO
  reason?: string | null;
};

export type Appointment = {
  id?: UUID;
  receptionist_id: UUID;
  service_id?: UUID | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  start_time: string; // ISO
  end_time: string; // ISO
  status?: "booked" | "confirmed" | "cancelled" | "completed";
  created_at?: string;
  notes?: string | null;
  metadata?: Record<string, any> | null; // e.g. { source: 'ai_receptionist' }
};

export type CheckAvailabilityRequest = {
  receptionist_id: UUID;
  service_id?: UUID | null;
  date_from_iso?: string; // optional date window start ISO
  date_to_iso?: string;   // optional date window end ISO
  timezone?: string | null;
  duration_minutes?: number | null; // override duration
  max_slots?: number; // how many slots to return
};

export type CheckAvailabilityResult = {
  slots: Array<{
    start_time: string;
    end_time: string;
    display?: string;
    score?: number;
  }>;
  receptionist_id: UUID;
};

export type BookAppointmentRequest = {
  receptionist_id: UUID;
  service_id?: UUID | null;
  start_time: string; // ISO
  end_time?: string | null; // optional; if omitted compute from service
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  notes?: string | null;
  metadata?: Record<string, any> | null;
  auto_confirm?: boolean; // if true mark as confirmed (e.g. calendar sync)
};

export type BookAppointmentResult = {
  success: boolean;
  appointment?: Appointment | null;
  error?: string | null;
};
