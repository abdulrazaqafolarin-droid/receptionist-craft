/**
 * Phase 4 — Customer Memory Module
 *
 * Unified customer identity across visits, bookings, and orders.
 */

export {
  resolveCustomer,
  computeFingerprint,
  bumpVisitCount,
  type CustomerRecord,
} from "./resolveCustomer.ts";

export {
  getCustomerHistory,
  formatHistoryForPrompt,
  type VisitHistory,
} from "./getCustomerHistory.ts";
