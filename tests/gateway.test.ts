import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

// Mock the Supabase client BEFORE importing gateway.ts — client.ts requires
// VITE_SUPABASE_* env vars and browser storage at module scope.
const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { handleEdgePayload, draftOperationsConfig } from "../src/lib/gateway";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendGateway = readFileSync(resolve(root, "src/lib/gateway.ts"), "utf-8");
const sharedSchema = readFileSync(
  resolve(root, "supabase/functions/_shared/operationsConfigSchema.ts"),
  "utf-8"
);
const clientSchema = readFileSync(resolve(root, "src/lib/operationsConfig.ts"), "utf-8");

const validConfig = {
  version: 1,
  business: { display_name: "Padaria Central", business_type: "Bakery" },
  contact: {},
  timezone: "America/Sao_Paulo",
  hours: [{ day_of_week: 1, start_time: "06:00", end_time: "19:00" }],
  workflows: { product_ordering: { enabled: true, delivery: true } },
};

describe("handleEdgePayload", () => {
  it("accepts a valid edge payload and returns config", () => {
    const r = handleEdgePayload({ ok: true, config: validConfig });
    expect(r.ok).toBe(true);
  });

  it("propagates edge errors with issues", () => {
    const r = handleEdgePayload({
      ok: false,
      error: "schema_validation_failed",
      issues: ["timezone: bad"],
    });
    expect(r).toEqual({
      ok: false,
      error: "schema_validation_failed",
      issues: ["timezone: bad"],
    });
  });

  it("re-validates and rejects a tampered config (defense in depth)", () => {
    const r = handleEdgePayload({
      ok: true,
      config: { ...validConfig, timezone: "Mars/Olympus" },
    });
    expect(r.ok).toBe(false);
  });

  it("handles null/malformed payloads safely", () => {
    expect(handleEdgePayload(null).ok).toBe(false);
    expect(handleEdgePayload("nope").ok).toBe(false);
    expect(handleEdgePayload({ ok: true }).ok).toBe(false); // missing config
  });
});

describe("draftOperationsConfig (edge invoke wrapper)", () => {
  beforeEach(() => invokeMock.mockReset());

  it("invokes onboard-configurator with the description", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true, config: validConfig }, error: null });
    const r = await draftOperationsConfig("a bakery in Lagos");
    expect(invokeMock).toHaveBeenCalledWith("onboard-configurator", { body: { description: "a bakery in Lagos" } });
    expect(r.ok).toBe(true);
  });

  it("maps edge errors to typed failures", async () => {
    invokeMock.mockResolvedValue({ data: { ok: false, error: "gateway_timeout" }, error: null });
    const r = await draftOperationsConfig("x");
    expect(r).toEqual({ ok: false, error: "gateway_timeout" });
  });

  it("surfaces invoke transport errors", async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: "FunctionsHttpError" } });
    const r = await draftOperationsConfig("x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("FunctionsHttpError");
  });

  it("blocks empty descriptions without calling the edge", async () => {
    await draftOperationsConfig("   ");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("guide-compliance tripwires (FRONTDESK-INTEGRATION-GUIDE.md)", () => {
  it("§7.3 — gateway URL/keys never enter browser code", () => {
    for (const forbidden of ["Bearer", "VITE_GATEWAY", "/v1/ask", "fetch("]) {
      expect(frontendGateway).not.toContain(forbidden);
    }
  });

  it("schema drift tripwire — client + server schemas agree on the engine boundary", () => {
    for (const marker of [
      "version: z.literal(1)",
      "appointment_booking:",
      "product_ordering:",
      ".strict()",
    ]) {
      expect(sharedSchema).toContain(marker);
      expect(clientSchema).toContain(marker);
    }
    // No third workflow type may appear in either schema
    for (const f of [sharedSchema, clientSchema]) {
      expect(f.match(/enabled: z\.boolean\(\)/g)?.length).toBe(2);
    }
  });
});
