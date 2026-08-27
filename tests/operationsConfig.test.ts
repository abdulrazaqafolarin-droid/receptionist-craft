import { describe, it, expect } from "vitest";
import {
  validateOperationsConfig,
  isKnownTimezone,
  type OperationsConfig,
} from "../src/lib/operationsConfig";

const validBase: OperationsConfig = {
  version: 1,
  business: {
    display_name: "Lagos Dental Studio",
    business_type: "Dental Clinic",
    greeting_message: "Welcome to Lagos Dental Studio! How can I help you today?",
    tone: "friendly",
  },
  contact: { phone: "+2348012345678" },
  timezone: "Africa/Lagos",
  hours: [
    { day_of_week: 1, start_time: "08:00", end_time: "17:00" },
    { day_of_week: 2, start_time: "08:00", end_time: "17:00" },
  ],
  workflows: {
    appointment_booking: { enabled: true, default_duration_minutes: 30 },
  },
};

describe("validateOperationsConfig", () => {
  it("accepts a minimal valid config", () => {
    const r = validateOperationsConfig(validBase);
    expect(r.ok).toBe(true);
  });

  it("accepts both workflow types enabled (the only types that exist)", () => {
    const r = validateOperationsConfig({
      ...validBase,
      workflows: {
        appointment_booking: { enabled: true },
        product_ordering: { enabled: true, delivery: true },
      },
    });
    expect(r.ok).toBe(true);
  });

  it("REJECTS an invented workflow type (strict engine boundary)", () => {
    const r = validateOperationsConfig({
      ...validBase,
      workflows: { queue_management: { enabled: true } },
    });
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/queue_management|unrecognized|invalid/i);
  });

  it("rejects when no workflow is enabled", () => {
    const r = validateOperationsConfig({
      ...validBase,
      workflows: { appointment_booking: { enabled: false } },
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a config with contact omitted entirely", () => {
    const { contact, ...withoutContact } = validBase;
    const r = validateOperationsConfig(withoutContact);
    expect(r.ok).toBe(true);
  });

  it("rejects wrong version literal", () => {
    const r = validateOperationsConfig({ ...validBase, version: 2 });
    expect(r.ok).toBe(false);
  });

  it("rejects malformed HH:mm times", () => {
    const r = validateOperationsConfig({
      ...validBase,
      hours: [{ day_of_week: 1, start_time: "8am", end_time: "25:00" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects out-of-range day_of_week", () => {
    const r = validateOperationsConfig({
      ...validBase,
      hours: [{ day_of_week: 7, start_time: "08:00", end_time: "17:00" }],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown top-level keys (strict)", () => {
    const r = validateOperationsConfig({ ...validBase, custom_code: "DROP TABLE" });
    expect(r.ok).toBe(false);
  });

  it("rejects a fake timezone with a precise issue", () => {
    const r = validateOperationsConfig({ ...validBase, timezone: "Mars/Olympus_Mons" });
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatch(/IANA/);
  });

  it("rejects empty display_name", () => {
    const r = validateOperationsConfig({
      ...validBase,
      business: { ...validBase.business, display_name: "" },
    });
    expect(r.ok).toBe(false);
  });
});

describe("isKnownTimezone", () => {
  it("knows real zones across regions", () => {
    expect(isKnownTimezone("Africa/Lagos")).toBe(true);
    expect(isKnownTimezone("America/Sao_Paulo")).toBe(true);
    expect(isKnownTimezone("Europe/London")).toBe(true);
  });
  it("rejects nonsense", () => {
    expect(isKnownTimezone("Not/AZone")).toBe(false);
  });
});
