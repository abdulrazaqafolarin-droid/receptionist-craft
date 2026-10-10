/**
 * Server-side web reading for the brain (browse_url).
 *
 * Fetches a page, strips it to readable text, and returns it as a
 * numbered grid — headings, text, links [1..n] with absolute URLs,
 * forms with their fields. Navigation is fetching the next URL;
 * acting on a page (clicks, typing, logins) belongs to companions
 * with a real browser (open_url) or to the owner. GET only — no
 * form submits, no side effects from reading.
 *
 * SSRF guardrails (a malicious link must never probe our network):
 * - http/https only. Private, loopback, link-local, .local/.internal
 *   hostnames and cloud metadata hosts refuse by pattern.
 * - When Deno.resolveDns exists, every resolved A/AAAA is checked
 *   against private ranges too (DNS-rebinding cover).
 * - Redirects followed manually, max 3, re-checked every hop.
 * - 20s timeout, 1MB body cap, text-ish content only.
 *
 * Pure parts (host checks, extraction) are unit-tested. Deno-safe.
 */

const BLOCKED_HOST_RES = [
  /^(localhost|localhost\.localdomain)$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::$|^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /\.local$/i,
  /\.internal$/i,
  /\.lan$/i,
  /metadata\.google/i,
  /169\.254\.169\.254/,
];

const BLOCKED_V4_RES = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./,
];

function isV6Private(ip: string): boolean {
  const h = ip.toLowerCase();
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
}

/** Hostname check. Returns the refusal reason, or null when allowed. */
export function checkHost(hostname: string): string | null {
  const h = hostname.trim().toLowerCase().replace(/\]$/, "").replace(/^\[/, "");
  if (!h) return "empty host";
  if (BLOCKED_HOST_RES.some((p) => p.test(h))) return "private or local address";
  return null;
}

/** DNS check when the runtime offers it. Null = clear or unavailable. */
export async function checkDns(hostname: string): Promise<string | null> {
  try {
    const deno = (globalThis as unknown as { Deno?: { resolveDns?: (h: string, t: string) => Promise<string[]> } }).Deno;
    if (!deno?.resolveDns) return null;
    const [a, aaaa] = await Promise.all([
      deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    for (const ip of [...a, ...aaaa]) {
      if (BLOCKED_V4_RES.some((p) => p.test(ip)) || isV6Private(ip)) {
        return "resolves to a private address";
      }
    }
    return null;
  } catch {
    return null;
  }
}

export interface PageLink { n: number; text: string; url: string }
export interface PageForm { action: string; method: string; inputs: string[] }

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/** Extract title, text, numbered absolute links, and forms. Pure. */
export function extractPage(html: string, baseUrl: string): {
  title: string; text: string; links: PageLink[]; forms: PageForm[];
} {
  const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title\s*>/i)?.[1] || "")
    .replace(/<[^>]+>/g, "").trim().slice(0, 160);
  const links: PageLink[] = [];
  const seen = new Set<string>();
  const linkRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a\s*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < 40) {
    let href = m[1].trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:") || href.toLowerCase().startsWith("mailto:")) continue;
    try {
      const abs = new URL(href, baseUrl);
      if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
      href = abs.toString();
    } catch {
      continue;
    }
    if (seen.has(href)) continue;
    seen.add(href);
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || href;
    links.push({ n: links.length + 1, text, url: href });
  }
  const forms: PageForm[] = [];
  const formRe = /<form\b([^>]*)>([\s\S]{0,4000}?)<\/form\s*>/gi;
  while ((m = formRe.exec(html)) !== null && forms.length < 8) {
    const attrs = m[1];
    const method = (attrs.match(/method\s*=\s*["']?(\w+)/i)?.[1] || "get").toLowerCase();
    let action = attrs.match(/action\s*=\s*["']([^"']*)["']/i)?.[1] || baseUrl;
    try {
      action = new URL(action, baseUrl).toString();
    } catch {
      action = baseUrl;
    }
    const inputs: string[] = [];
    const inRe = /<(input|select|textarea|button)\b([^>]*)>/gi;
    let im: RegExpExecArray | null;
    while ((im = inRe.exec(m[2])) !== null && inputs.length < 12) {
      const ia = im[2];
      const name = ia.match(/name\s*=\s*["']([^"']*)["']/i)?.[1]
        || ia.match(/id\s*=\s*["']([^"']*)["']/i)?.[1]
        || ia.match(/type\s*=\s*["']([^"']*)["']/i)?.[1]
        || im[1];
      const type = ia.match(/type\s*=\s*["']([^"']*)["']/i)?.[1]?.toLowerCase() || "";
      inputs.push(type === "password" ? `${name} (credential — never filled)` : name);
    }
    forms.push({ action, method, inputs });
  }
  return { title, text: stripTags(html).slice(0, 12000), links, forms };
}

const MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 20000;

/** Fetch + extract with all guards. Returns page or { error }. */
export async function browseUrl(rawUrl: string): Promise<
  | { title: string; url: string; text: string; links: PageLink[]; forms: PageForm[] }
  | { error: string }
> {
  let current: string;
  try {
    const u = new URL(rawUrl.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "only http(s) pages" };
    current = u.toString();
  } catch {
    return { error: "not a valid address" };
  }
  for (let hop = 0; hop <= 3; hop++) {
    const u = new URL(current);
    const hostRefused = checkHost(u.hostname);
    if (hostRefused) return { error: `refused (${hostRefused})` };
    const dnsRefused = await checkDns(u.hostname);
    if (dnsRefused) return { error: `refused (${dnsRefused})` };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": "RutexDirector/1.0 (+https://receptionist-craft.vercel.app)", "Accept": "text/html,application/xhtml+xml,text/*;q=0.9,*/*;q=0.1" },
      });
    } catch {
      clearTimeout(timer);
      return { error: "unreachable right now" };
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === 3) return { error: "too many redirects" };
      try {
        current = new URL(loc, current).toString();
      } catch {
        return { error: "bad redirect" };
      }
      continue;
    }
    if (!res.ok) return { error: `page answered ${res.status}` };
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    if (!/text|html|xml|json/.test(ctype)) return { error: `not a readable page (${ctype.split(";")[0] || "unknown type"})` };
    let html = "";
    try {
      const reader = res.body?.getReader();
      if (!reader) return { error: "empty page" };
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > MAX_BYTES) {
          try { await reader.cancel(); } catch { /* already closed */ }
          break;
        }
        chunks.push(value);
      }
      const total = chunks.reduce((a, c) => a + c.length, 0);
      const merged = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }
      html = new TextDecoder().decode(merged);
    } catch {
      return { error: "could not read the page" };
    }
    if (/application\/json/.test(ctype)) {
      return { title: current, url: current, text: html.slice(0, 12000), links: [], forms: [] };
    }
    const page = extractPage(html, current);
    return { url: current, title: page.title || current, text: page.text, links: page.links, forms: page.forms };
  }
  return { error: "too many redirects" };
}
