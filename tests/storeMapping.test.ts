import { describe, it, expect } from "vitest";
import { deriveReceptionistPatch } from "../src/store/onboarding";
import type { OperationsConfig } from "../src/lib/operationsConfig";

const base: OperationsConfig = {
  version: 1,
  business: {
    display_name: "Sunrise Dental Clinic",
    business_type: "dental_clinic",
    greeting_message: "Welcome to Sunrise Dental Clinic!",
    tone: "friendly",
  },
  contact: { phone: "+2348012345678" },
  timezone: "Africa/Lagos",
  hours: [
    { day_of_week: 1, start_time: "09:00", end_time: "17:00" },
    { day_of_week: 6, start_time: "10:00", end_time: "14:00" },
  ],
  workflows: {
    appointment_booking: { enabled: true, default_duration_minutes: 30 },
    product_ordering: { enabled: true, delivery: true },
  },
};

describe("deriveReceptionistPatch", () => {
  it("maps a booking+ordering business to both/sales with correct capabilities", () => {
    const p = deriveReceptionistPatch(base);
    expect(p.receptionist.business_name).toBe("Sunrise Dental Clinic");
    expect(p.receptionist.business_model).toBe("both");
    expect(p.receptionist.primary_goal).toBe("sales");
    expect(p.receptionist.capabilities).toEqual({
      sells_products: true,
      books_appointments: true,
      offers_services: true,
      delivers: true,
      requires_compliance: false,
      supports_emergency: false,
      deposit_required: false,
      deposit_percent: 20,
    });
    expect(p.receptionist.phone).toBe("+2348012345678");
    expect(p.timezone).toBe("Africa/Lagos");
    expect(p.availabilityRules).toHaveLength(2);
    expect(p.availabilityRules[0]).toMatchObject({
      day_of_week: 1,
      start_time: "09:00",
      end_time: "17:00",
      timezone: "Africa/Lagos",
    });
  });

  it("booking-only → services/bookings, no delivery", () => {
    const p = deriveReceptionistPatch({
      ...base,
      workflows: { appointment_booking: { enabled: true } },
    });
    expect(p.receptionist.business_model).toBe("services");
    expect(p.receptionist.primary_goal).toBe("bookings");
    expect(p.receptionist.capabilities.sells_products).toBe(false);
    expect(p.receptionist.capabilities.delivers).toBe(false);
  });

  it("ordering-only → products/sales", () => {
    const p = deriveReceptionistPatch({
      ...base,
      workflows: { product_ordering: { enabled: true } },
    });
    expect(p.receptionist.business_model).toBe("products");
    expect(p.receptionist.primary_goal).toBe("sales");
    expect(p.receptionist.capabilities.books_appointments).toBe(false);
  });

  it("defaults tone and blanks optional contact gracefully", () => {
    const p = deriveReceptionistPatch({
      ...base,
      business: { display_name: "X", business_type: "y" },
      contact: {},
      workflows: { appointment_booking: { enabled: true } },
    });
    expect(p.receptionist.tone).toBe("friendly");
    expect(p.receptionist.phone).toBe("");
    expect(p.receptionist.greeting_message).toBe("");
  });
});
