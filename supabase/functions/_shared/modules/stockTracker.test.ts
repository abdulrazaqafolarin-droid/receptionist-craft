/**
 * Stock write validation gate: the shelf truth must survive staff thumbs.
 * Wrong quantities and malformed dates are rejected before any DB write.
 *
 * Run: deno test supabase/functions/_shared/modules/stockTracker.test.ts
 */

import { validateStockUpdate } from "./stockTracker.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function rejects(input: Record<string, unknown>, msg: string): void {
  let threw = false;
  try {
    validateStockUpdate(input);
  } catch {
    threw = true;
  }
  check(threw, msg);
}

Deno.test("accepts a clean count and expiry", () => {
  const out = validateStockUpdate({ stock_quantity: 12, expiry_date: "2026-12-01" });
  check(out.stock_quantity === 12, "quantity kept");
  check(out.expiry_date === "2026-12-01", "expiry kept");
});

Deno.test("accepts clearing the expiry", () => {
  const out = validateStockUpdate({ stock_quantity: 5, expiry_date: null });
  check(out.expiry_date === null, "expiry clears");
});

Deno.test("rejects fractional, negative, and non-number quantities", () => {
  rejects({ stock_quantity: 2.5 }, "fractional rejected");
  rejects({ stock_quantity: -1 }, "negative rejected");
  rejects({ stock_quantity: "many" }, "string rejected");
});

Deno.test("rejects malformed expiry dates", () => {
  rejects({ stock_quantity: 5, expiry_date: "tomorrow" }, "words rejected");
  rejects({ stock_quantity: 5, expiry_date: "2026-13-99" }, "bad month rejected");
  rejects({ stock_quantity: 5, expiry_date: "01-12-2026" }, "wrong order rejected");
});

Deno.test("rejects an empty update", () => {
  rejects({}, "nothing-to-update rejected");
});
