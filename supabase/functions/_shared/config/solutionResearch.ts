/**
 * Solution Research — open-source-first external solution finding (Stage 4).
 *
 * For each connector need the Configurator names but the platform does not
 * provide (e.g. "tiktok-auto-post"), search GitHub repositories and rank
 * candidates so the owner sees the best FREE/open option before any paid one:
 *
 *   1. Open-source license (MIT, Apache-2.0, GPL, BSD, ISC, MPL) first
 *   2. Then by stars (community trust) and recent activity
 *   3. Paid/API-only options are noted, never recommended first
 *
 * Uses the public GitHub Search API (no key needed at low volume).
 * Every failure degrades to an empty list — research never blocks planning.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface SolutionCandidate {
  name: string; // owner/repo
  url: string;
  description: string;
  stars: number;
  license: string; // SPDX id or "none" / "unknown"
  open_source: boolean;
  updated: string; // ISO date of last push
  setup: "easy" | "moderate" | "involved"; // rough setup effort
}

export interface ResearchedSolution {
  need: string;
  candidates: SolutionCandidate[];
  note: string; // plain-language guidance for the owner
  /**
   * Fulfillment stage (the loop is lane-2 builder work; research only ever
   * produces "found" — later stages advance it with evidence, never silently).
   * found -> fetched -> evaluated -> integrated
   */
  fulfillment: "found" | "fetched" | "evaluated" | "integrated";
}

const OSS_LICENSES = new Set([
  "mit", "apache-2.0", "gpl-2.0", "gpl-3.0", "agpl-3.0", "lgpl-2.1",
  "lgpl-3.0", "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0",
  "unlicense", "cc0-1.0", "artistic-2.0", "epl-2.0",
]);

/**
 * Vetted starting points for the needs businesses actually ask for.
 * These ALWAYS come first — official docs/SDKs and battle-tested
 * community projects — so the owner never sees only search noise.
 */
const CURATED: Record<string, SolutionCandidate[]> = {
  "tiktok-auto-post": [
    { name: "TikTok Developers (official)", url: "https://developers.tiktok.com", description: "Official TikTok API docs — Content Posting API for direct publishing.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "moderate" },
    { name: "tiktok-api (unofficial python)", url: "https://github.com/davidteather/TikTok-Api", description: "Popular unofficial TikTok API for Python (research/automation).", stars: 3000, license: "MIT", open_source: true, updated: "community", setup: "moderate" },
  ],
  "instagram-auto-post": [
    { name: "Meta Graph API (official)", url: "https://developers.facebook.com/docs/instagram-platform", description: "Official Instagram publishing via Meta's API.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "moderate" },
    { name: "instagrapi", url: "https://github.com/subzeroid/instagrapi", description: "Popular unofficial Instagram API client for Python.", stars: 8000, license: "MIT", open_source: true, updated: "community", setup: "moderate" },
  ],
  "whatsapp-messaging": [
    { name: "WhiskeySockets/Baileys", url: "https://github.com/WhiskeySockets/Baileys", description: "The standard open-source WhatsApp Web API library.", stars: 10000, license: "MIT", open_source: true, updated: "community", setup: "involved" },
    { name: "WhatsApp Business API (official)", url: "https://developers.facebook.com/docs/whatsapp", description: "Official WhatsApp Business Platform.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "moderate" },
  ],
  "paystack-payments": [
    { name: "Paystack docs (official)", url: "https://paystack.com/docs", description: "Official Paystack API docs and SDKs.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "easy" },
    { name: "paystackhq/paystack-node", url: "https://github.com/paystackhq/paystack-node", description: "Official Paystack Node.js SDK.", stars: 200, license: "MIT", open_source: true, updated: "community", setup: "easy" },
  ],
  "stripe-payments": [
    { name: "Stripe docs (official)", url: "https://docs.stripe.com", description: "Official Stripe API docs and SDKs.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "easy" },
  ],
  "google-calendar-sync": [
    { name: "Google Calendar API (official)", url: "https://developers.google.com/calendar", description: "Official Google Calendar API.", stars: 0, license: "docs", open_source: false, updated: "official", setup: "moderate" },
  ],
};

/** Scam/malware signals — a repo matching these is NEVER recommended. */
const DENY = [/bypass/i, /crack/i, /\bhack\b/i, /hacking/i, /stealer/i, /phish/i, /carding/i, /free.?followers/i, /free.?likes/i, /token.?grab/i, /rat\b/i, /keylog/i];

function isDenied(name: string, description: string): boolean {
  const hay = `${name} ${description}`;
  return DENY.some((p) => p.test(hay));
}

/** Map a connector need to GitHub search terms. Unknown needs fall back to keywords. */
function searchTerms(need: string): string {
  const n = need.toLowerCase();
  if (n.includes("tiktok")) return "tiktok upload api bot";
  if (n.includes("instagram")) return "instagram api post bot";
  if (n.includes("whatsapp")) return "whatsapp api bot baileys";
  if (n.includes("paystack") || n.includes("stripe") || n.includes("payment")) return "payment nodejs sdk";
  if (n.includes("calendar")) return "google calendar api sync";
  if (n.includes("facebook")) return "facebook graph api bot";
  if (n.includes("linkedin")) return "linkedin api post";
  if (n.includes("twitter") || n.includes(" x-")) return "twitter api bot";
  if (n.includes("sms") || n.includes("twilio")) return "sms gateway api";
  if (n.includes("email") || n.includes("smtp") || n.includes("gmail")) return "transactional email api";
  if (n.includes("review") || n.includes("yelp") || n.includes("trustpilot")) return "google reviews api monitor";
  if (n.includes("ads")) return "google ads api";
  if (n.includes("sheet")) return "google sheets api";
  if (n.includes("drive")) return "google drive api upload";
  return need.replace(/[-_]+/g, " ").slice(0, 60);
}

function setupEffort(description: string, stars: number): "easy" | "moderate" | "involved" {
  const d = (description || "").toLowerCase();
  if (/sdk|client|library|wrapper|unofficial api/i.test(d) || stars > 5000) return "easy";
  if (/self-host|server|docker|framework|platform/i.test(d)) return "involved";
  return "moderate";
}

/** Research ONE need. Never throws — returns empty candidates on any failure. */
export async function researchNeed(need: string): Promise<ResearchedSolution> {
  const empty: ResearchedSolution = {
    need,
    candidates: [],
    note: "No public option found yet — ask in the chat and we will look together.",
    fulfillment: "found",
  };
  // Vetted starting points always lead; live search fills behind them.
  const curated = (CURATED[need.toLowerCase()] || []).slice();
  try {
    // stars floor kills 1-star spam; NOT-terms keep scam repos out of results.
    // 10s cap: research runs inside the 150s edge budget after the AI call.
    const q = encodeURIComponent(
      `${searchTerms(need)} in:name,description stars:>20 NOT:bypass NOT:crack NOT:hack NOT:stealer NOT:phishing`,
    );
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`, {
        signal: ctrl.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "RutexSolutionBot/1.0" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      if (curated.length > 0) return { need, candidates: curated.slice(0, 3), note: "Vetted starting points below — live search was unavailable.", fulfillment: "found" };
      return empty;
    }
    const data = (await res.json()) as {
      items?: Array<{
        full_name?: string; html_url?: string; description?: string | null;
        stargazers_count?: number; license?: { spdx_id?: string } | null; pushed_at?: string;
      }>;
    };
    const items = Array.isArray(data.items) ? data.items : [];
    const candidates: SolutionCandidate[] = items
      .filter((r) => typeof r.full_name === "string" && typeof r.html_url === "string")
      .filter((r) => !isDenied(r.full_name as string, r.description || ""))
      .map((r) => {
        const spdx = r.license?.spdx_id || "unknown";
        const oss = OSS_LICENSES.has(spdx.toLowerCase());
        return {
          name: r.full_name as string,
          url: r.html_url as string,
          description: (r.description || "No description.").slice(0, 160),
          stars: typeof r.stargazers_count === "number" ? r.stargazers_count : 0,
          license: spdx,
          open_source: oss,
          updated: typeof r.pushed_at === "string" ? r.pushed_at.slice(0, 10) : "unknown",
          setup: setupEffort(r.description || "", typeof r.stargazers_count === "number" ? r.stargazers_count : 0),
        };
      });
    // Open-source first, then stars. Unknown-license repos sink below known OSS.
    candidates.sort((a, b) => {
      const rank = (c: SolutionCandidate) => (c.open_source ? 0 : c.license === "unknown" ? 1 : 2);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return b.stars - a.stars;
    });
    // Merge: vetted entries lead, live results follow, deduped by URL.
    const seen = new Set(curated.map((c) => c.url));
    const merged = [...curated];
    for (const c of candidates) {
      if (merged.length >= 4) break;
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      merged.push(c);
    }
    const top = merged.slice(0, 3);
    const ossCount = top.filter((c) => c.open_source).length;
    return {
      need,
      candidates: top,
      fulfillment: "found",
      note:
        top.length === 0
          ? empty.note
          : ossCount > 0
            ? `${ossCount} free open-source option${ossCount === 1 ? "" : "s"} found — start there before paying for anything.`
            : "No clearly open-source option surfaced — review licenses before committing.",
    };
  } catch {
    if (curated.length > 0) {
      return { need, candidates: curated.slice(0, 3), note: "Vetted starting points below — live search was unavailable.", fulfillment: "found" };
    }
    return empty;
  }
}

/** Research several needs with bounded concurrency (max 3 at once).
 *
 * Timeout discipline: Supabase kills idle edge calls at 150s, and the
 * gateway ask ahead of research can take up to 120s. Sequential research
 * (5 needs x 15s) blows the budget alone — parallel x3 at 10s each keeps
 * the whole tail under ~15s. Max 3 needs researched per call; the rest
 * keep their honest "look together" note from the empty path.
 */
export async function researchNeeds(needs: string[]): Promise<ResearchedSolution[]> {
  const unique = [...new Set(needs.filter((n) => typeof n === "string" && n.trim()))].slice(0, 3);
  const out: (ResearchedSolution | null)[] = new Array(unique.length).fill(null);
  const CONCURRENCY = 3;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const i = cursor++;
      out[i] = await researchNeed(unique[i].trim());
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, () => worker()));
  return out as ResearchedSolution[];
}
