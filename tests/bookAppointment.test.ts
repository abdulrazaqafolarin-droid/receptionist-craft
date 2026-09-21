import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase client
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

// Import after mocks
import { bookAppointment } from "@/lib/appointmentBooking";

interface BookAppointmentRequest {
  receptionistId: string;
  serviceId: string;
  startTime: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  bookingSource?: string;
  idempotencyKey?: string;
}

interface BookAppointmentResponse {
  success: boolean;
  appointment?: {
    id: string;
    start_time: string;
    end_time: string;
    service: string;
    customer_name: string;
  };
  error?: string;
  alternatives?: Array<{ start: string; end: string }>;
}

async function bookAppointment(request: BookAppointmentRequest): Promise<BookAppointmentResponse> {
  try {
    const response = await fetch("https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/book-appointment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Request failed" }));
      return { success: false, error: errorData.error || `HTTP ${response.status}` };
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

// Mock the global fetch
const fetchMock = vi.hoisted(() => vi.fn());
globalThis.fetch = fetchMock;

describe("bookAppointment", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  const validRequest = {
    receptionistId: "rec-001",
    serviceId: "svc-001",
    startTime: "2026-08-15T10:00:00Z",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    customerPhone: "+1234567890",
    bookingSource: "manual",
    idempotencyKey: "idem-key-123",
  };

  const mockSuccessResponse = {
    success: true,
    appointment: {
      id: "apt-001",
      start_time: "2026-08-15T10:00:00Z",
      end_time: "2026-08-15T11:00:00Z",
      service: "Dental Cleaning",
      customer_name: "John Doe",
    },
  };

  it("successfully books an appointment", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, appointment: { id: "apt-001", start_time: "2026-08-15T10:00:00Z", end_time: "2026-08-15T11:00:00Z", service: "Dental Cleaning", customer_name: "John Doe" } }),
    });

    const result = await bookAppointment({
      receptionistId: "rec-001",
      serviceId: "svc-001",
      startTime: "2026-08-15T10:00:00Z",
      customerName: "John Doe",
      customerEmail: "john@example.com",
      customerPhone: "+1234567890",
      bookingSource: "manual",
      idempotencyKey: "idem-key-123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://esvrhnlwquunsdduvbnr.supabase.co/functions/v1/book-appointment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          receptionistId: "rec-001",
          serviceId: "svc-001",
          startTime: "2026-08-15T10:00:00Z",
          customerName: "John Doe",
          customerEmail: "john@example.com",
          customerPhone: "+1234567890",
          bookingSource: "manual",
          idempotencyKey: "idem-key-123",
        }),
      })
    );

    expect(result.success).toBe(true);
    expect(result.appointment?.id).toBe("apt-001");
  });

  it("handles idempotency - returns existing appointment on duplicate key", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        appointment: { id: "apt-existing", start_time: "2026-08-15T10:00:00Z", end_time: "2026-08-15T11:00:00Z", service: "Dental Cleaning", customer_name: "John Doe" },
        existed: true,
      }),
    });

    const result = await bookAppointment({
      receptionistId: "rec-001",
      serviceId: "svc-001",
      startTime: "2026-08-15T10:00:00Z",
      customerName: "John Doe",
      idempotencyKey: "idem-key-123",
    });

    expect(result.success).toBe(true);
    expect(result.appointment?.id).toBe("apt-existing");
  });

  it("handles conflict - slot no longer available", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: "Selected time slot is no longer available",
        conflicts: [{ id: "apt-conflict", start_time: "2026-08-15T10:00:00Z", end_time: "2026-08-15T11:00:00Z", customer_name: "Jane Smith" }],
      }),
    });

    const result = await bookAppointment({
      receptionistId: "rec-001",
      serviceId: "svc-001",
      startTime: "2026-08-15T10:00:00Z",
      customerName: "John Doe",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Selected time slot is no longer available");
    expect(result.conflicts).toHaveLength(1);
  });

  it("handles validation error - missing required fields", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: "Validation failed: receptionistId, serviceId, startTime, customerName are required",
      }),
    });

    const result = await bookAppointment({
      receptionistId: "",
      serviceId: "",
      startTime: "",
      customerName: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Validation failed");
  });

  it("handles network error gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await bookAppointment({
      receptionistId: "rec-001",
      serviceId: "svc-001",
      startTime: "2026-08-15T10:00:00Z",
      customerName: "John Doe",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("handles 429 rate limit with retry suggestion", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        success: false,
        error: "Rate limit exceeded. Please try again in 30 seconds.",
      }),
    });

    const result = await bookAppointment({
      receptionistId: "rec-001",
      serviceId: "svc-001",
      startTime: "2026-08-15T10:00:00Z",
      customerName: "John Doe",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit");
  });
});