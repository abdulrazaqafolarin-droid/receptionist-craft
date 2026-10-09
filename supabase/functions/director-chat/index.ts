/**
 * director-chat — the Director's brain.
 *
 * Assembles live platform context (operators, versions, build chats, jobs,
 * connectors, counts) with the service role, asks the gateway with the
 * Director system prompt, and returns a STRICT reply contract the client
 * executes (navigate / retry / draft / adjust links — approval stays human).
 * Parse failures degrade to words-only (no invented actions, ever).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { askRutex, RutexMcpError } from "../_shared/rutexMcp.ts";
import { researchNeed } from "../_shared/config/solutionResearch.ts";
import { resolveNeed } from "../_shared/config/capabilityRegistry.ts";
import {
  buildDirectorSystemPrompt,
  parseDirectorReply,
  type DirectorContext,
} from "../_shared/config/directorPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatMsg {
  role: string;
  content: string;
}

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    const rawHistory: unknown[] = Array.isArray(body.history) ? body.history : [];
    const history = rawHistory
      .filter((m: unknown): m is ChatMsg => !!m && typeof m === "object" && typeof (m as ChatMsg).content === "string")
      .slice(-10)
      .map((m: ChatMsg) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 2000) }));
    const thread_id = typeof body.thread_id === "string" ? body.thread_id : `director-${user_id.slice(0, 8)}`;
    if (!user_id || !message.trim()) {
      return jsonRes({ ok: false, error: "missing_user_id_or_message" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
    );

    const { data: recs } = await supabase
      .from("receptionists")
      .select("id,business_name,name,business_model,active,capabilities")
      .eq("user_id", user_id);
    const operators = ((recs || []) as unknown) as Array<{
      id: string; business_name: string | null; name: string | null;
      business_model: string | null; active: boolean; capabilities: unknown;
    }>;
    const opIds = operators.map((o) => o.id);
    const nameOf = (id: string) => {
      const o = operators.find((x) => x.id === id);
      return o ? o.business_name || o.name || "Operator" : "Operator";
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    const hstr = dayStr(horizon);
    const todayStr = dayStr(new Date());

    const perOp = await Promise.all(operators.map(async (op) => {
      const [apptRes, escRes, stockRes] = await Promise.all([
        supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).gte("start_time", today.toISOString()),
        supabase.from("escalations").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).is("resolved_at", null),
        supabase.from("services").select("stock_quantity,low_stock_threshold,expiry_date").eq("receptionist_id", op.id).eq("active", true).not("stock_quantity", "is", null).limit(200),
      ]);
      const rows = (((stockRes as { data?: unknown }).data || []) as unknown) as Array<{
        stock_quantity: number | null; low_stock_threshold: number | null; expiry_date: string | null;
      }>;
      let stockNeeds = 0;
      for (const row of rows) {
        const qty = row.stock_quantity ?? 0;
        if (qty <= 0 || qty <= (row.low_stock_threshold ?? 5)) { stockNeeds++; continue; }
        if (row.expiry_date && row.expiry_date <= hstr) stockNeeds++;
      }
      const caps = ((op.capabilities || {}) as Record<string, unknown>);
      const kind = typeof caps.operator_kind === "string" ? caps.operator_kind :
        op.business_model === "internal" ? "ops" : "receptionist";
      const tasks = (Array.isArray(caps.ops_tasks) ? caps.ops_tasks : []) as Array<{ due?: string; done?: boolean }>;
      return {
        id: op.id,
        display: op.business_name || op.name || "Operator",
        kind,
        model: op.business_model || "services",
        active: op.active !== false,
        upcomingBookings: ((apptRes as { count?: number }).count) || 0,
        openEscalations: ((escRes as { count?: number }).count) || 0,
        stockNeeds,
        overdueTasks: tasks.filter((t) => !t.done && t.due && t.due <= todayStr).length,
      };
    }));

    const [versRes, threadsRes, jobsRes, connRes] = await Promise.all([
      supabase.from("config_versions").select("receptionist_id,version_number,change_source,owner_input,created_at").in("receptionist_id", opIds.length > 0 ? opIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(8),
      supabase.from("build_threads").select("title,status,receptionist_id,updated_at").eq("user_id", user_id).order("updated_at", { ascending: false }).limit(8),
      supabase.from("plan_jobs").select("id,receptionist_id,status,error_text,created_at").in("receptionist_id", opIds.length > 0 ? opIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(20),
      supabase.from("connectors").select("display_name,status").eq("user_id", user_id),
    ]);
    const jobs = (((jobsRes as { data?: unknown }).data || []) as unknown) as Array<{ id: string; receptionist_id: string; status: string; error_text: string | null; created_at: string }>;
    const failedDetail = jobs.filter((j) => j.status === "failed").slice(0, 5).map((j) => ({
      job_id: j.id,
      operator: nameOf(j.receptionist_id),
      error: j.error_text || "no error recorded",
      created_at: j.created_at,
    }));
    const conns = (((connRes as { data?: unknown }).data || []) as unknown) as Array<{ display_name: string; status: string }>;
    const vers = (((versRes as { data?: unknown }).data || []) as unknown) as Array<{
      receptionist_id: string; version_number: number; change_source: string; owner_input: string | null; created_at: string;
    }>;
    const threads = (((threadsRes as { data?: unknown }).data || []) as unknown) as Array<{
      title: string; status: string; receptionist_id: string | null; updated_at: string;
    }>;

    const ctx: DirectorContext = {
      operators: perOp,
      versions: vers.map((v) => ({
        operator: nameOf(v.receptionist_id),
        version_number: v.version_number,
        change_source: v.change_source,
        owner_input: v.owner_input,
        created_at: v.created_at,
      })),
      threads: threads.map((t) => ({
        title: t.title,
        status: t.status,
        receptionist_name: t.receptionist_id ? nameOf(t.receptionist_id) : null,
        updated_at: t.updated_at,
      })),
      failedJobs: jobs.filter((j) => j.status === "failed").length,
      failedJobDetails: failedDetail,
      activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
      connectorsDown: conns.filter((c) => c.status === "error" || c.status === "expired").map((c) => c.display_name),
      attentionTotal: perOp.reduce((a, o) => a + o.upcomingBookings + o.openEscalations + o.stockNeeds + o.overdueTasks, 0),
    };

    const system = buildDirectorSystemPrompt(ctx);
    const convo = [...history.map((m) => `${m.role === "assistant" ? "Director" : "Owner"}: ${m.content}`), `Owner: ${message}`].join("\n\n");
    let reply: { reply: string; suggestions: string[]; actions: unknown[] };
    try {
      const r = await askRutex(thread_id, `${system}\n\n---\n\n${convo}`, { timeoutMs: 90000 });
      const parsed = parseDirectorReply(r.text || "");
      // research_need executes server-side: resolved evidence rides back
      // INLINE on the action (verified interface + provenance), so the
      // client renders findings, never bare links. Informational — no
      // grant needed, nothing moves but knowledge.
      for (const a of parsed.actions) {
        const act = a as { type?: string; need?: string; result?: unknown };
        if (act.type === "research_need" && typeof act.need === "string" && act.need.trim()) {
          try {
            const researched = await researchNeed(act.need.trim().slice(0, 120));
            act.result = resolveNeed(researched);
          } catch {
            act.result = {
              success: false, need: act.need, best_interface: "search",
              fallbacks: [], verification: "unverified", risk: "informational",
              candidates: [], errors: ["research unavailable right now"],
              provenance: { sources: [], retrieved_at: new Date().toISOString() },
            };
          }
        }
      }
      reply = { reply: parsed.reply, suggestions: parsed.suggestions, actions: parsed.actions };
    } catch (e) {
      if (e instanceof RutexMcpError) {
        return jsonRes({ ok: false, error: `gateway_${e.kind}`, details: String(e.message).slice(0, 200) }, 502);
      }
      // Contract broken but words exist: show the words, invent no actions.
      return jsonRes({ ok: true, reply: "I could not shape that into a clean answer — try asking once more, simply.", suggestions: [], actions: [] });
    }

    return jsonRes({ ok: true, ...reply });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return jsonRes({ ok: false, error: "internal_error", details: msg.slice(0, 200) }, 500);
  }
});
