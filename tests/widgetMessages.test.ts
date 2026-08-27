import { describe, it, expect } from "vitest";
import { buildCartMessage, buildLeadFormMessage, buildTimeSlotMessage, type CartItem } from "../src/lib/widgetMessages";

describe("buildCartMessage", () => {
  const item = (over: Partial<CartItem> = {}): CartItem => ({
    productId: "p1",
    productName: "Espresso",
    quantity: 2,
    ...over,
  });

  it("formats a single-item cart", () => {
    expect(buildCartMessage([item()])).toBe("I'd like to order: 2x Espresso");
  });

  it("formats a multi-item cart in order", () => {
    expect(buildCartMessage([item(), item({ productId: "p2", productName: "Croissant", quantity: 1 })]))
      .toBe("I'd like to order: 2x Espresso, 1x Croissant");
  });

  it("trims product names", () => {
    expect(buildCartMessage([item({ productName: "  Bagel  " })])).toBe("I'd like to order: 2x Bagel");
  });

  it("returns null for an empty cart", () => {
    expect(buildCartMessage([])).toBeNull();
  });

  it("drops items with invalid quantities", () => {
    expect(buildCartMessage([item({ quantity: 0 }), item({ quantity: -3 })])).toBeNull();
  });

  it("keeps valid items while dropping invalid ones", () => {
    expect(buildCartMessage([item({ quantity: 0 }), item({ productId: "p2", productName: "Tea", quantity: 1 })]))
      .toBe("I'd like to order: 1x Tea");
  });

  it("omits prices entirely (backend owns pricing)", () => {
    const msg = buildCartMessage([item({ price: 9.99 })])!;
    expect(msg).not.toContain("9.99");
    expect(msg).not.toContain("$");
  });
});

describe("buildLeadFormMessage", () => {
  it("builds name-only message", () => {
    expect(buildLeadFormMessage({ name: "Adaeze" })).toBe("My name is Adaeze.");
  });

  it("builds full contact message", () => {
    expect(buildLeadFormMessage({ name: "John", email: "j@x.com", phone: "+2348012345678" }))
      .toBe("My name is John. email: j@x.com. phone: +2348012345678.");
  });

  it("builds contact-only message when name missing", () => {
    expect(buildLeadFormMessage({ phone: "08012345678" })).toBe("phone: 08012345678.");
  });

  it("ignores whitespace-only fields", () => {
    expect(buildLeadFormMessage({ name: "   ", email: null })).toBeNull();
  });

  it("returns null when the form contributed nothing", () => {
    expect(buildLeadFormMessage({})).toBeNull();
    expect(buildLeadFormMessage({ name: null, email: null, phone: null })).toBeNull();
  });
});

describe("buildTimeSlotMessage", () => {
  it("includes time only when no date given", () => {
    expect(buildTimeSlotMessage("3:00 PM")).toBe("I'll take the 3:00 PM slot");
  });

  it("includes date when given", () => {
    expect(buildTimeSlotMessage("3:00 PM", "Tuesday, June 3")).toBe(
      "I'll take the 3:00 PM slot on Tuesday, June 3"
    );
  });

  it("omits empty date cleanly", () => {
    expect(buildTimeSlotMessage("9:00 AM", "")).toBe("I'll take the 9:00 AM slot");
  });
});
