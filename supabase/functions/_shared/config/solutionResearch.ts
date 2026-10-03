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
}

const OSS_LICENSES = new Set([
  "mit", "apache-2.0", "gpl-2.0", "gpl-3.0", "agpl-3.0", "lgpl-2.1",
  "lgpl-3.0", "bsd-2-clause", "bsd-3-clause", "isc", "mpl-2.0",
  "unlicense", "cc0-1.0", "artistic-2.0", "epl-2.0",
]);

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
  };
  try {
    const q = encodeURIComponent(`${searchTerms(need)} in:name,description`);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`, {
        signal: ctrl.signal,
        headers: { Accept: "application/vnd.github+json", "User-Agent": "RutexSolutionBot/1.0" },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      items?: Array<{
        full_name?: string; html_url?: string; description?: string | null;
        stargazers_count?: number; license?: { spdx_id?: string } | null; pushed_at?: string;
      }>;
    };
    const items = Array.isArray(data.items) ? data.items : [];
    const candidates: SolutionCandidate[] = items
      .filter((r) => typeof r.full_name === "string" && typeof r.html_url === "string")
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
    const top = candidates.slice(0, 3);
    const ossCount = top.filter((c) => c.open_source).length;
    return {
      need,
      candidates: top,
      note:
        top.length === 0
          ? empty.note
          : ossCount > 0
            ? `${ossCount} free open-source option${ossCount === 1 ? "" : "s"} found — start there before paying for anything.`
            : "No clearly open-source option surfaced — review licenses before committing.",
    };
  } catch {
    return empty;
  }
}

/** Research several needs sequentially (respects GitHub's unauthenticated rate limit). */
export async function researchNeeds(needs: string[]): Promise<ResearchedSolution[]> {
  const unique = [...new Set(needs.filter((n) => typeof n === "string" && n.trim()))].slice(0, 5);
  const out: ResearchedSolution[] = [];
  for (const need of unique) {
    out.push(await researchNeed(need.trim()));
  }
  return out;
}
