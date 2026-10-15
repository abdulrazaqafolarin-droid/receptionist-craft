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
  briefDue,
  buildBriefUpdatePrompt,
  buildDirectorSystemPrompt,
  parseDirectorReply,
  type DirectorContext,
} from "../_shared/config/directorPrompt.ts";
import { parseMemoryBrief } from "../_shared/ownerMemory.ts";

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
    // Identity comes from the caller's JWT, never from the body. A leaked
    // anon key must not let anyone read another owner's operators.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return jsonRes({ ok: false, error: "missing_authorization" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonRes({ ok: false, error: "invalid_token" }, 401);
    }

    // Ping: proves the function is alive WITHOUT calling the gateway.
    // Lets the app (and the owner) tell "chat service broken" apart from
    // "brain service unreachable" instead of one mystery error.
    const earlyBody = await req.json().catch(() => ({}));
    if ((earlyBody as Record<string, unknown>).action === "ping") {
      return jsonRes({
        ok: true,
        pong: true,
        user_id: user.id,
        gateway_configured: !!(Deno.env.get("RUTEX_GATEWAY_URL") && Deno.env.get("RUTEX_GATEWAY_KEY")),
        time: new Date().toISOString(),
      });
    }

    const body = earlyBody as Record<string, unknown>;
    const user_id = user.id;
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    const rawHistory: unknown[] = Array.isArray(body.history) ? body.history : [];
    const history = rawHistory
      .filter((m: unknown): m is ChatMsg => !!m && typeof m === "object" && typeof (m as ChatMsg).content === "string")
      .slice(-10)
      .map((m: ChatMsg) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content.slice(0, 2000) }));
    const thread_id = typeof body.thread_id === "string" ? body.thread_id : `director-${user_id.slice(0, 8)}`;
    if (!message.trim()) {
      return jsonRes({ ok: false, error: "missing_message" }, 400);
    }

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
      // Each operator's queries are isolated: one flapping table (or a
      // dropped DB connection mid-batch) degrades that operator to
      // zeros instead of 500ing the whole brain call.
      const safe = async <T>(p: PromiseLike<T>): Promise<T | null> => {
        try {
          return await p;
        } catch {
          return null;
        }
      };
      const [apptRes, escRes, stockRes, prodRes] = await Promise.all([
        safe(supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).gte("start_time", today.toISOString())),
        safe(supabase.from("escalations").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).is("resolved_at", null)),
        safe(supabase.from("services").select("stock_quantity,low_stock_threshold,expiry_date").eq("receptionist_id", op.id).eq("active", true).not("stock_quantity", "is", null).limit(200)),
        safe(supabase.from("services").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).eq("active", true)),
      ]);
      const rows = ((((stockRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
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
        upcomingBookings: ((apptRes as { count?: number } | null)?.count) || 0,
        openEscalations: ((escRes as { count?: number } | null)?.count) || 0,
        stockNeeds,
        overdueTasks: tasks.filter((t) => !t.done && t.due && t.due <= todayStr).length,
        productCount: ((prodRes as { count?: number } | null)?.count) || 0,
      };
    }));

    const safeQ = async <T>(p: PromiseLike<T>): Promise<T | null> => {
      try {
        return await p;
      } catch {
        return null;
      }
    };
    const [versRes, threadsRes, jobsRes, connRes, dirThreadsRes, ledgerRes, notifRes, devRes, memoryRes] = await Promise.all([
      safeQ(supabase.from("config_versions").select("receptionist_id,version_number,change_source,owner_input,created_at").in("receptionist_id", opIds.length > 0 ? opIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(15)),
      safeQ(supabase.from("build_threads").select("title,status,receptionist_id,updated_at").eq("user_id", user_id).order("updated_at", { ascending: false }).limit(12)),
      safeQ(supabase.from("plan_jobs").select("id,receptionist_id,status,error_text,created_at").in("receptionist_id", opIds.length > 0 ? opIds : ["00000000-0000-0000-0000-000000000000"]).order("created_at", { ascending: false }).limit(20)),
      safeQ(supabase.from("connectors").select("display_name,status").eq("user_id", user_id)),
      safeQ(supabase.from("director_threads").select("id,title,updated_at").eq("user_id", user_id).order("updated_at", { ascending: false }).limit(6)),
      safeQ(supabase.from("director_actions").select("kind,summary,created_at").eq("user_id", user_id).eq("visible", true).order("created_at", { ascending: false }).limit(5)),
      safeQ(supabase.from("notifications").select("title,created_at").eq("user_id", user_id).eq("read", false).order("created_at", { ascending: false }).limit(5)),
      safeQ(supabase.from("companion_devices").select("id,name,platform,enabled,last_seen").eq("user_id", user_id).order("last_seen", { ascending: false, nullsFirst: true })),
      safeQ(supabase.from("director_memory").select("thread_id,brief,updated_at").eq("user_id", user_id).order("updated_at", { ascending: false }).limit(12)),
    ]);
    const jobs = ((((jobsRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{ id: string; receptionist_id: string; status: string; error_text: string | null; created_at: string }>;
    const failedDetail = jobs.filter((j) => j.status === "failed").slice(0, 8).map((j) => ({
      job_id: j.id,
      operator: nameOf(j.receptionist_id),
      error: j.error_text || "no error recorded",
      created_at: j.created_at,
    }));
    const conns = ((((connRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{ display_name: string; status: string }>;
    const vers = ((((versRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      receptionist_id: string; version_number: number; change_source: string; owner_input: string | null; created_at: string;
    }>;
    const threads = ((((threadsRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      title: string; status: string; receptionist_id: string | null; updated_at: string;
    }>;
    const dirThreads = (((((dirThreadsRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      id: string; title: string; updated_at: string;
    }>).filter((t) => t.id !== (typeof body.thread_id === "string" ? body.thread_id : ""));
    const reports = (((((ledgerRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      kind: string; summary: string; created_at: string;
    }>);
    const unread = (((((notifRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      title: string; created_at: string;
    }>);
    const devices = (((((devRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      id: string; name: string; platform: string; enabled: boolean; last_seen: string | null;
    }>);
    const memoryRows = (((((memoryRes as { data?: unknown } | null)?.data) || []) as unknown) as Array<{
      thread_id: string; brief: string; updated_at: string;
    }>);
    const currentThreadId = typeof body.thread_id === "string" ? body.thread_id : "";
    const sharedMemory = memoryRows
      .filter((m) => m.thread_id !== currentThreadId && typeof m.brief === "string" && m.brief.trim())
      .slice(0, 10)
      .map((m) => ({
        source: dirThreads.find((t) => t.id === m.thread_id)?.title || "Earlier Director conversation",
        content: m.brief,
        created_at: m.updated_at,
      }));

    const ctx: DirectorContext = {
      ownerId: user_id,
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
      pastChats: dirThreads.map((t) => ({ title: t.title, updated_at: t.updated_at })),
      recentWork: reports.map((r) => ({ kind: r.kind, summary: r.summary, created_at: r.created_at })),
      unreadNotifications: unread.map((n) => ({ title: n.title, created_at: n.created_at })),
      devices: devices.map((d) => ({ id: d.id, name: d.name, platform: d.platform, enabled: d.enabled, last_seen: d.last_seen })),
      sharedMemory,
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

    // Keep a compact fact brief for long Director conversations. Memory is
    // best-effort: a failure must never turn a good chat answer into an error.
    try {
      const memoryThreadId = typeof body.thread_id === "string" ? body.thread_id : "";
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryThreadId);
      if (isUuid) {
        const { data: threadOwner } = await supabase
          .from("director_threads")
          .select("id,user_id")
          .eq("id", memoryThreadId)
          .maybeSingle();
        // Service-role queries must verify ownership explicitly before an upsert.
        if (threadOwner && (threadOwner as { user_id: string }).user_id === user_id) {
          const [memoryRes, countRes] = await Promise.all([
            supabase.from("director_memory")
              .select("brief,briefed_through")
              .eq("thread_id", memoryThreadId)
              .maybeSingle(),
            supabase.from("director_messages")
              .select("id", { count: "exact", head: true })
              .eq("thread_id", memoryThreadId),
          ]);
          const currentMemory = (memoryRes.data || null) as { brief: string; briefed_through: number } | null;
          const persistedCount = typeof countRes.count === "number" ? countRes.count : 0;
          // The user message is saved asynchronously by the client; include the
          // current user/Director pair even if one of those writes is not visible yet.
          const totalMessages = Math.max(persistedCount + 1, history.length + 2);
          if (briefDue(totalMessages, currentMemory)) {
            const recent = [
              ...history.map((m) => `${m.role === "assistant" ? "Director" : "Owner"}: ${m.content}`),
              `Owner: ${message}`,
              `Director: ${reply.reply}`,
            ].slice(-30);
            const memoryReply = await askRutex(
              `director-memory-${memoryThreadId.slice(0, 8)}`,
              buildBriefUpdatePrompt(currentMemory?.brief || "", recent),
              { timeoutMs: 20000 },
            );
            const brief = parseMemoryBrief(memoryReply.text || "");
            if (brief !== null) {
              await supabase.from("director_memory").upsert({
                user_id,
                thread_id: memoryThreadId,
                brief,
                briefed_through: totalMessages,
                updated_at: new Date().toISOString(),
              }, { onConflict: "thread_id" });
            }
          }
        }
      }
    } catch {
      // Memory is an enhancement; preserve the actual Director answer.
    }

    return jsonRes({ ok: true, ...reply });
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return jsonRes({ ok: false, error: "internal_error", details: msg.slice(0, 200) }, 500);
  }
});
