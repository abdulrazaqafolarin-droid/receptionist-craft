import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

/**
 * Dead-path tripwire (Phase 0.3).
 *
 * Guarantees the widget client NEVER regains direct transactional execution:
 * bookings/orders must flow exclusively through the server-side widget-chat
 * path. If any of these strings reappear in Widget.tsx, this test fails and
 * whoever added them needs to justify reintroducing a second execution path.
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetSource = readFileSync(resolve(root, "src/pages/Widget.tsx"), "utf-8");
const helpersSource = readFileSync(resolve(root, "src/lib/widgetMessages.ts"), "utf-8");

describe("P0.3 dead-path tripwire: single server-side execution path", () => {
  const forbiddenInWidget = [
    ["create_widget_order", "direct order RPC from browser"],
    ["book-appointment", "direct booking invoke from browser"],
    ["bookingContext", "ignored field sent to backend"],
    ["collectingInfo", "client-side collection state machine"],
    ["awaitingOrderConfirmation", "client-side order confirmation state"],
    ["pendingProducts", "client-side cart storage"],
  ] as const;

  for (const [needle, reason] of forbiddenInWidget) {
    it(`Widget.tsx contains no "${needle}" (${reason})`, () => {
      expect(widgetSource).not.toContain(needle);
    });
  }

  it("widget still routes messages through widget-chat", () => {
    expect(widgetSource).toContain('functions.invoke("widget-chat"');
  });

  it("helpers module stays pure (no supabase/network imports)", () => {
    expect(helpersSource).not.toMatch(/supabase|fetch\(|import\s+.*from\s+["']@/);
  });
});
