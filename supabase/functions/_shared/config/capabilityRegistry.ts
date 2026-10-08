/**
 * Capability registry + resolution (CLI-Anything pattern, Rutex-shaped).
 *
 * solutionResearch finds CANDIDATES (links). This layer resolves them into
 * CAPABILITIES the planner can reason over: which interface actually works
 * (native API > CLI > structured integration > browser automation), what
 * risk it carries, whether each candidate is verified or merely found, and
 * where every claim came from (provenance). No new network calls — it
 * annotates research output deterministically.
 *
 * Result envelope per need (the file's recommended shape, trimmed):
 *   { success, need, best_interface, fallbacks, verification, risk,
 *     provenance, errors }
 *
 * Deno-safe: ASCII only, no imports.
 */

import type { ResearchedSolution, SolutionCandidate } from "./solutionResearch.ts";

export type CapabilityInterface = "api" | "cli" | "integration" | "browser" | "search";
export type VerifyStatus = "official" | "trusted" | "unverified";
export type RiskLevel = "informational" | "standard" | "privileged";

export interface VerifiedCandidate {
  name: string;
  url: string;
  interface: CapabilityInterface;
  verification: VerifyStatus;
  evidence: string[];
}

export interface CapabilityResolution {
  success: boolean;
  need: string;
  best_interface: CapabilityInterface;
  fallbacks: CapabilityInterface[];
  verification: VerifyStatus;
  risk: RiskLevel;
  candidates: VerifiedCandidate[];
  errors: string[];
  provenance: { sources: string[]; retrieved_at: string };
}

interface NeedProfile {
  match: RegExp;
  interfaces: CapabilityInterface[];
  risk: RiskLevel;
}

/**
 * Interface priority per need family (the file's rule: prefer the most
 * reliable interface available — native API, then CLI, then structured
 * integration, then browser automation). Entries are ordered by that
 * priority; the first is best, the rest are fallbacks.
 */
const PROFILES: NeedProfile[] = [
  { match: /paystack|stripe|payment|pay\b/i, interfaces: ["api"], risk: "privileged" },
  { match: /tiktok/i, interfaces: ["cli", "browser"], risk: "standard" },
  { match: /instagram|facebook|social/i, interfaces: ["api", "cli", "browser"], risk: "standard" },
  { match: /whatsapp|sms|twilio/i, interfaces: ["api", "cli"], risk: "standard" },
  { match: /calendar|gmail|outlook|smtp|email/i, interfaces: ["api", "cli"], risk: "standard" },
  { match: /sheet|drive|contact/i, interfaces: ["api"], risk: "standard" },
  { match: /review|yelp|trustpilot/i, interfaces: ["api", "browser"], risk: "informational" },
  { match: /ads/i, interfaces: ["api"], risk: "standard" },
  { match: /map/i, interfaces: ["api"], risk: "informational" },
];

const DEFAULT_PROFILE: NeedProfile = {
  match: /.*/i,
  interfaces: ["search", "browser"],
  risk: "informational",
};

function profileFor(need: string): NeedProfile {
  return PROFILES.find((p) => p.match.test(need)) || DEFAULT_PROFILE;
}

/**
 * Verification (the file's rule: never assume success). Computed from
 * evidence already in hand — no new fetches:
 * - official docs/SDK entries -> official (source-confirmed)
 * - OSS + 1000+ stars + pushed within 2 years -> trusted (community-proof)
 * - everything else -> unverified (found, not vouched for)
 */
function verifyCandidate(c: SolutionCandidate, nowYear: number): { status: VerifyStatus; evidence: string[] } {
  const evidence: string[] = [];
  if (c.license === "docs" || c.updated === "official") {
    return { status: "official", evidence: ["provider-published-docs"] };
  }
  if (c.open_source) evidence.push(`oss-license:${c.license}`);
  if (c.stars >= 1000) evidence.push(`stars:${c.stars}`);
  const pushedYear = parseInt((c.updated || "").slice(0, 4), 10);
  const fresh = !isNaN(pushedYear) && nowYear - pushedYear <= 2;
  if (fresh) evidence.push(`active:${c.updated}`);
  if (c.open_source && c.stars >= 1000 && fresh) {
    return { status: "trusted", evidence };
  }
  return { status: "unverified", evidence: evidence.length > 0 ? evidence : ["listed-only"] };
}

/**
 * Resolve ONE researched need into a capability. Never throws — worst case
 * is success:false with errors naming exactly what is missing.
 */
export function resolveNeed(researched: ResearchedSolution, nowIso?: string): CapabilityResolution {
  const now = nowIso || new Date().toISOString();
  const nowYear = parseInt(now.slice(0, 4), 10) || 2026;
  const profile = profileFor(researched.need);
  const [best, ...fallbacks] = profile.interfaces;
  const verified: VerifiedCandidate[] = researched.candidates.map((c) => {
    const v = verifyCandidate(c, nowYear);
    return {
      name: c.name,
      url: c.url,
      interface: best === "search" ? "browser" : best,
      verification: v.status,
      evidence: v.evidence,
    };
  });
  const top = verified.find((v) => v.verification === "official")
    || verified.find((v) => v.verification === "trusted");
  const errors: string[] = [];
  if (verified.length === 0) {
    errors.push("no candidates found — research together in chat");
  } else if (!top) {
    errors.push("candidates found but none verified — review licenses before committing");
  }
  return {
    success: !!top,
    need: researched.need,
    best_interface: best,
    fallbacks,
    verification: top ? top.verification : "unverified",
    risk: profile.risk,
    candidates: verified.slice(0, 3),
    errors,
    provenance: { sources: ["curated", "github-search"], retrieved_at: now },
  };
}

/** Resolve a batch (already researched). Pure over the research output. */
export function resolveCapabilities(
  researched: ResearchedSolution[],
  nowIso?: string,
): CapabilityResolution[] {
  return researched.map((r) => resolveNeed(r, nowIso));
}
