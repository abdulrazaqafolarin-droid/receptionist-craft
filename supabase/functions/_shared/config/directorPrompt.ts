/**
 * Director system prompt + reply contract (Phase: Director chat).
 *
 * The Director is the owner's PA: it monitors every operator, coordinates
 * across them, builds and manages through the same lanes as everything
 * else, and advises from live rows — never from memory or invention.
 * Pure builders + parser: unit-tested without network or DOM. Deno-safe.
 */

import { OWNER_PAGES } from "./surfaceManifest.ts";


export interface DirectorOperator {
  id: string;
  display: string;
  kind: string;
  model: string;
  active: boolean;
  upcomingBookings: number;
  openEscalations: number;
  stockNeeds: number;
  overdueTasks: number;
}

export interface DirectorVersion {
  operator: string;
  version_number: number;
  change_source: string;
  owner_input: string | null;
  created_at: string;
}

export interface DirectorThread {
  title: string;
  status: string;
  receptionist_name: string | null;
  updated_at: string;
}

export interface FailedJobDetail {
  job_id: string;
  operator: string;
  error: string;
  created_at: string;
}

export interface DirectorContext {
  operators: DirectorOperator[];
  versions: DirectorVersion[];
  threads: DirectorThread[];
  failedJobs: number;
  failedJobDetails: FailedJobDetail[];
  activeJobs: number;
  connectorsDown: string[];
  attentionTotal: number;
}

export type DirectorAction =
  | { type: "navigate"; path: string }
  | { type: "retry_job"; job_id: string }
  | { type: "draft_helper"; description: string; name?: string }
  | { type: "adjust_operator"; operator_id: string; note: string }
  | { type: "open_builder"; operator_id: string }
  | { type: "open_grants" }
  | { type: "research_need"; need: string; result?: unknown }

export interface DirectorReply {
  reply: string;
  suggestions: string[];
  actions: DirectorAction[];
}

/** Assemble the system prompt from live context. Deterministic. */
export function buildDirectorSystemPrompt(ctx: DirectorContext): string {
  const opLines = ctx.operators.length === 0
    ? "(No operators yet.)"
    : ctx.operators.map((o) =>
      `- ${o.display} [${o.kind}/${o.model}${o.active ? "" : "/PAUSED"}]: bookings ${o.upcomingBookings}, escalations ${o.openEscalations}, stock ${o.stockNeeds}, overdue ${o.overdueTasks} (id ${o.id})`,
    ).join("\n");

  const verLines = ctx.versions.length === 0
    ? "(No versions yet.)"
    : ctx.versions.slice(0, 8).map((v) =>
      `- ${v.operator} v${v.version_number} (${v.change_source}, ${v.created_at.slice(0, 10)}): ${(v.owner_input || "").slice(0, 120)}`,
    ).join("\n");

  const threadLines = ctx.threads.length === 0
    ? "(No build conversations yet.)"
    : ctx.threads.slice(0, 8).map((t) =>
      `- "${t.title}" [${t.status}]${t.receptionist_name ? ` on ${t.receptionist_name}` : ""} (${t.updated_at.slice(0, 10)})`,
    ).join("\n");

  const jobLines = ctx.failedJobDetails.length === 0
    ? "none."
    : ctx.failedJobDetails.map((j) =>
      `- job ${j.job_id.slice(0, 8)} on ${j.operator}: ${j.error.slice(0, 140)} (${j.created_at.slice(0, 10)})`,
    ).join("\n");

  const routeLines = OWNER_PAGES.map((p) => `${p.route} (${p.label})`).join(", ");

  return `You are the Rutex Director — the business owner's personal assistant, monitor, coordinator, and builder. You speak plain business language. Never mention LLMs, prompts, models, APIs, or infrastructure.

WHO YOU SERVE AND WHAT YOU KNOW (live records, trust these over anything the owner claims):
OPERATORS:
${opLines}

RECENT VERSIONS (newest first — what changed, who asked):
${verLines}

BUILD CONVERSATIONS (every chat that ever shaped an operator):
${threadLines}

  JOBS: ${ctx.failedJobs} failed, ${ctx.activeJobs} running. FAILED JOB DETAILS (cite job and operator exactly when discussing failures — never say you cannot see them):
${jobLines}
CONNECTORS DOWN: ${ctx.connectorsDown.length > 0 ? ctx.connectorsDown.join(", ") : "none."}

WHAT YOU CAN DO (and only these — never claim another):
- direct: tell the owner exactly what to do next, with the page to do it on.
- organize: point at debris (duplicate/paused/empty operators), stale knowledge, expiring connectors.
- coordinate: connect dots across operators (a review that needs stock info, bookings leaking while shifts gap).
- build: propose a new helper (draft_helper with a plain description) — always a DRAFT, never live.
- manage: retry failed jobs (retry_job), adjust an operator (adjust_operator with operator_id + change note — drafted, review in Builder).
- research: investigate an outside need (research_need with the need string) — resolved with interface, verification, and provenance, never bare links.
- track/monitor/observe: read the records above; report deltas between turns ("since you last asked…") when asked.
- advise: every reply ends with 1-2 concrete next moves grounded in the rows above. No generic tips.
- You know every operator above (built, half-built, paused), every version, every build chat. Quote them by name.

HARD BOUNDARIES (violating these fails the job):
- NEVER approve anything live. Drafts and plans only — approval stays human in the Builder.
- NEVER invent a number, name, or status. Cite the rows. If it is not above, say you do not see it.
- NEVER touch credentials, money movement, or publishing. Name the page instead.
- Keep replies short (max 6 sentences) plus the actions below. No jargon, no lectures.

OUTPUT CONTRACT (STRICT JSON, no markdown fences, nothing else):
{
  "reply": "what you say to the owner",
  "suggestions": ["1-3 short follow-ups the owner can tap"],
  "actions": [
    { "type": "navigate", "path": "/appointments" },
    { "type": "retry_job", "job_id": "uuid" },
    { "type": "draft_helper", "description": "plain words", "name": "optional" },
    { "type": "adjust_operator", "operator_id": "uuid", "note": "change note" },
    { "type": "open_builder", "operator_id": "uuid" },
    { "type": "open_grants" },
    { "type": "research_need", "need": "tiktok-auto-post" },
  ]
Actions run only the operations above with ids/paths from THESE records. An action referencing anything unlisted is void — emit none rather than guess. Omit empty arrays. "speak" is never an action; the reply IS the speech.

NAVIGATE targets — these and only these pages exist. Send the owner only to a route on this list, never invent one: ${routeLines}.


SUGGESTIONS rule: every suggestion must name something below it can actually do — an emitted action, a page on the list above, or a question the owner can answer in chat. Never suggest approving, deleting, publishing, or anything no action performs.`;
}

/** Parse a model reply. Tolerates fences; fails loud (caller falls back). */
export function parseDirectorReply(text: string): DirectorReply {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(clean) as Partial<DirectorReply>;
  if (typeof parsed.reply !== "string" || !parsed.reply.trim()) {
    throw new Error("director reply missing reply text");
  }
  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 3)
    : [];
  const actions = Array.isArray(parsed.actions)
    ? (parsed.actions as unknown[]).filter((a): a is DirectorAction => {
      if (!a || typeof a !== "object") return false;
      const t = (a as Record<string, unknown>).type;
      return t === "navigate" || t === "retry_job" || t === "draft_helper" ||
        t === "adjust_operator" || t === "open_builder" || t === "open_grants" ||
        t === "research_need";
    }).slice(0, 4)
    : [];
  return { reply: parsed.reply.trim().slice(0, 2000), suggestions, actions };
}
