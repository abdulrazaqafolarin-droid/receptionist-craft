/**
 * Capability resolution gate: interface priority, verification honesty,
 * envelope shape. No network — annotates fixed research fixtures.
 *
 * Run: deno test supabase/functions/_shared/config/capabilityRegistry.test.ts
 */

import { resolveNeed, resolveCapabilities } from "./capabilityRegistry.ts";
import type { ResearchedSolution } from "./solutionResearch.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function researched(need: string, candidates: ResearchedSolution["candidates"] = []): ResearchedSolution {
  return { need, candidates, note: "", fulfillment: "found" };
}

const NOW = "2026-10-08T00:00:00.000Z";

Deno.test("payments resolve to api with privileged risk", () => {
  const r = resolveNeed(researched("paystack-payments", [
    { name: "Paystack docs", url: "https://paystack.com/docs", description: "", stars: 0, license: "docs", open_source: false, updated: "official", setup: "easy" },
  ]), NOW);
  check(r.success && r.best_interface === "api", "api wins for payments");
  check(r.risk === "privileged", "money movement is privileged");
  check(r.verification === "official", "docs are source-confirmed");
  check(r.provenance.sources.includes("curated"), "provenance cited");
});

Deno.test("tiktok resolves to cli first, browser fallback", () => {
  const r = resolveNeed(researched("tiktok-auto-post", [
    { name: "x/y", url: "https://github.com/x/y", description: "", stars: 3000, license: "MIT", open_source: true, updated: "2026-03-01", setup: "moderate" },
  ]), NOW);
  check(r.success && r.best_interface === "cli", "cli works today for tiktok");
  check(r.fallbacks.includes("browser"), "browser kept as fallback");
  check(r.risk === "standard", "posting is standard risk");
  check(r.verification === "trusted", "stars+oss+fresh earns trusted");
});

Deno.test("stale and thin candidates stay unverified, honestly failed", () => {
  const r = resolveNeed(researched("mystery-need", [
    { name: "a/b", url: "https://github.com/a/b", description: "", stars: 12, license: "unknown", open_source: false, updated: "2019-01-01", setup: "moderate" },
  ]), NOW);
  check(!r.success, "nothing vouched for");
  check(r.best_interface === "search", "unknown needs discover first");
  check(r.verification === "unverified", "label says unverified");
  check(r.errors.length > 0, "errors name the gap");
  check(r.candidates[0].evidence.includes("listed-only"), "evidence admits thinness");
});

Deno.test("empty research resolves to chat-together, never throws", () => {
  const r = resolveNeed(researched("nothing-here"), NOW);
  check(!r.success && r.errors.join(" ").includes("chat"), "points back to chat");
});

Deno.test("batch resolves in order with shared timestamp", () => {
  const out = resolveCapabilities([
    researched("stripe-payments", [
      { name: "Stripe docs", url: "https://docs.stripe.com", description: "", stars: 0, license: "docs", open_source: false, updated: "official", setup: "easy" },
    ]),
    researched("empty-need"),
  ], NOW);
  check(out.length === 2, "batch preserved");
  check(out[0].success && !out[1].success, "mixed outcomes kept distinct");
  check(out.every((r) => r.provenance.retrieved_at === NOW), "one timestamp across batch");
});
