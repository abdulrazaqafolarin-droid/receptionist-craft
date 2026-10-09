/**
 * director-sweep — the Director's autonomous heartbeat.
 *
 * Invoked by pg_cron every 15 minutes (and manually with dry_run for
 * proof). For every owner with an allowed grant, it reads live rows and
 * either acts or notifies — never both, never neither without a record.
 *
 * The rules, in order:
 * 1. Failed jobs are ANALYSED before any retry (classifyJobError).
 *    Transient re-queues (grant: fix_small). Permanent or uncertain
 *    notifies with the real error. A job the sweep already retried once
 *    is never retried again — the owner is asked instead.
 * 2. Bookkeeping writes only what live rows prove (grant: bookkeeping):
 *    completed-order stock decrements. No products, no items, no writes —
 *    operators without stock are structurally untouched. Quantities are
 *    never invented. Overdue freeform tasks cannot be verified, so they
 *    are flagged, not completed.
 * 3. Abandoned shells resume planning once ever (grant: build_helpers):
 *    a "Setting up..." operator older than 7 days with no services and a
 *    build thread that never reached planning gets its plan job queued.
 *    Shells with no thread are flagged, not drafted.
 * 4. Every autonomous write goes through the ledger. Missing grant means
 *    skip + say so in the report, never silent, never acted.
 *
 * dry_run=true analyses and returns the plan with zero writes — no ledger
 * rows, no notifications, no data changes. That is the safe live proof.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyJobError } from "../_shared/directorTriage.ts";
import { ledgerStart, ledgerFinish } from "../_shared/directorLedger.ts";
import { stockSteps, requeueSteps, draftSteps } from "../_shared/directorSteps.ts";
import type { PresenceStep } from "../_shared/directorSteps.ts";

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

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SweepReport {
  user_id: string;
  jobs_triaged: number;
  requeued: string[];
  job_notified: string[];
  stock_decremented: string[];
  tasks_flagged: string[];
  drafts_resumed: string[];
  skipped: string[];
}

async function notify(
  supabase: { from(table: string): any },
  user_id: string,
  receptionist_id: string | null,
  type: string,
  title: string,
  message: string,
  priority: string,
): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id,
      receptionist_id,
      type,
      title: title.slice(0, 200),
      message: message.slice(0, 1000),
      priority,
    });
  } catch {
    // A failed notification must never break the sweep.
  }
}

/**
 * Presence signal: one 'running' row when a visible action starts, one
 * 'done' row when it finishes. The app subscribes via Realtime and the
 * cursor replays `steps` — autopilot stays visible while it happens.
 * Never throws; presence is a courtesy, not a dependency.
 */
async function activity(
  supabase: { from(table: string): any },
  user_id: string,
  action_id: string | null,
  phase: "running" | "done",
  label: string,
  steps: PresenceStep[],
): Promise<void> {
  try {
    await supabase.from("director_activity").insert({
      user_id,
      action_id,
      phase,
      label: label.slice(0, 200),
      steps,
    });
  } catch {
    // Presence failed; the ledger still records the work.
  }
}

async function alreadyRetried(
  supabase: { from(table: string): any },
  jobId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("director_actions")
      .select("id")
      .eq("kind", "job_retry")
      .eq("status", "done")
      .filter("after", "cs", JSON.stringify({ job_id: jobId }))
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function alreadyResumed(
  supabase: { from(table: string): any },
  receptionistId: string,
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("director_actions")
      .select("id")
      .eq("kind", "operator_draft")
      .filter("after", "cs", JSON.stringify({ receptionist_id: receptionistId }))
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function sweepUser(
  supabase: { from(table: string): any },
  user_id: string,
  scopes: Set<string>,
  dry: boolean,
): Promise<SweepReport> {
  const report: SweepReport = {
    user_id,
    jobs_triaged: 0,
    requeued: [],
    job_notified: [],
    stock_decremented: [],
    tasks_flagged: [],
    drafts_resumed: [],
    skipped: [],
  };

  const { data: recs } = await supabase
    .from("receptionists")
    .select("id,business_name,name,created_at,capabilities")
    .eq("user_id", user_id);
  const ops = (Array.isArray(recs) ? recs : []) as Array<{
    id: string; business_name: string; name: string; created_at: string; capabilities: unknown;
  }>;
  if (ops.length === 0) return report;
  const opIds = ops.map((o) => o.id);
  const nameOf = (id: string) => ops.find((o) => o.id === id)?.business_name || "operator";

  // 1. Job triage.
  const { data: failedRows } = await supabase
    .from("plan_jobs")
    .select("id,receptionist_id,error_text,attempts,created_at")
    .in("receptionist_id", opIds)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(20);
  const failed = (Array.isArray(failedRows) ? failedRows : []) as Array<{
    id: string; receptionist_id: string; error_text: string | null; attempts: number;
  }>;
  report.jobs_triaged = failed.length;
  for (const job of failed) {
    const opName = nameOf(job.receptionist_id);
    const { verdict, reason } = classifyJobError(job.error_text || "");
    if (verdict === "retry" && scopes.has("fix_small")) {
      if (await alreadyRetried(supabase, job.id)) {
        if (!dry) {
          await notify(supabase, user_id, job.receptionist_id, "director_sweep",
            `Still failing: ${opName}`,
            `I already re-queued this plan once and it failed again (${reason}). It needs you — the error is: ${(job.error_text || "").slice(0, 300)}`,
            "high");
          report.job_notified.push(job.id.slice(0, 8));
        } else {
          report.job_notified.push(job.id.slice(0, 8));
        }
        continue;
      }
      if (dry) {
        report.requeued.push(job.id.slice(0, 8));
        continue;
      }
      const lid = await ledgerStart(supabase, {
        user_id,
        receptionist_id: job.receptionist_id,
        kind: "job_retry",
        summary: `Re-queued failed plan (${reason})`,
        before: { status: "failed", attempts: job.attempts },
        visible: true,
      });
      const steps = requeueSteps(opName);
      const stepLabel = `Re-queued ${opName}'s failed plan`;
      await activity(supabase, user_id, lid, "running", stepLabel, steps);
      const { error } = await supabase.from("plan_jobs").update({
        status: "queued",
        attempts: 0,
        error_text: null,
        started_at: null,
      }).eq("id", job.id);
      await ledgerFinish(supabase, lid, error
        ? { status: "failed", error: String(error).slice(0, 300) }
        : { status: "done", after: { job_id: job.id, status: "queued", actor_steps: steps } });
      await activity(supabase, user_id, lid, "done", stepLabel, steps);
      report.requeued.push(job.id.slice(0, 8));
    } else {
      const why = verdict !== "retry" ? reason : "needs the fix_small grant";
      if (verdict !== "retry") report.skipped.push(`job ${job.id.slice(0, 8)}: ${why}`);
      else report.skipped.push(`job triage needs fix_small`);
      if (!dry && verdict !== "retry") {
        await notify(supabase, user_id, job.receptionist_id, "director_sweep",
          `Plan failed: ${opName}`,
          `I looked at this one and a re-run won't fix it (${why}). The error is: ${(job.error_text || "").slice(0, 300)}`,
          "high");
        report.job_notified.push(job.id.slice(0, 8));
      } else if (dry && verdict !== "retry") {
        report.job_notified.push(job.id.slice(0, 8));
      }
    }
  }

  // 2. Stock decrement on completed orders (derivable, idempotent).
  if (scopes.has("bookkeeping")) {
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id,receptionist_id,metadata")
      .in("receptionist_id", opIds)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);
    const orders = (Array.isArray(orderRows) ? orderRows : []) as Array<{
      id: string; receptionist_id: string; metadata: unknown;
    }>;
    for (const order of orders) {
      const meta = (order.metadata && typeof order.metadata === "object" ? order.metadata : {}) as Record<string, unknown>;
      if (meta.stock_decremented === true) continue;
      const { data: itemRows } = await supabase
        .from("order_items")
        .select("product_id,quantity")
        .eq("order_id", order.id);
      const items = (Array.isArray(itemRows) ? itemRows : []) as Array<{ product_id: string | null; quantity: number }>;
      const linked = items.filter((i) => !!i.product_id);
      if (linked.length === 0) {
        if (!dry) {
          await supabase.from("orders").update({ metadata: { ...meta, stock_decremented: true } }).eq("id", order.id);
        }
        continue;
      }
      if (dry) {
        report.stock_decremented.push(order.id.slice(0, 8));
        continue;
      }
      const before: Record<string, number> = {};
      const qtys: Array<{ product_id: string; qty: number; take: number }> = [];
      for (const item of linked) {
        const { data: svc } = await supabase.from("services").select("stock_quantity").eq("id", item.product_id).maybeSingle();
        const qty = (svc as { stock_quantity: number | null } | null)?.stock_quantity;
        if (qty === null || qty === undefined) continue;
        before[item.product_id as string] = qty;
        qtys.push({ product_id: item.product_id as string, qty, take: item.quantity || 0 });
      }
      if (qtys.length === 0) {
        if (!dry) {
          await supabase.from("orders").update({ metadata: { ...meta, stock_decremented: true } }).eq("id", order.id);
        }
        continue;
      }
      const opName = nameOf(order.receptionist_id);
      const steps = stockSteps(opName, linked.length);
      const stepLabel = `Stock updated for ${opName}`;
      const lid = await ledgerStart(supabase, {
        user_id,
        receptionist_id: order.receptionist_id,
        kind: "bookkeeping",
        summary: `Stock decremented for completed order (${linked.length} lines)`,
        before,
        visible: true,
      });
      await activity(supabase, user_id, lid, "running", stepLabel, steps);
      const after: Record<string, number> = {};
      for (const q of qtys) {
        const next = q.qty - q.take;
        await supabase.from("services").update({ stock_quantity: next }).eq("id", q.product_id);
        after[q.product_id] = next;
      }
      await supabase.from("orders").update({ metadata: { ...meta, stock_decremented: true } }).eq("id", order.id);
      await ledgerFinish(supabase, lid, { status: "done", after: { ...after, actor_steps: steps } });
      await activity(supabase, user_id, lid, "done", stepLabel, steps);
      report.stock_decremented.push(order.id.slice(0, 8));
    }
  } else {
    report.skipped.push("stock bookkeeping needs the bookkeeping grant");
  }

  // 3. Overdue tasks are flagged, never auto-completed (freeform titles
  // cannot be verified — completing one unseen would be fabrication).
  {
    const today = dayStr(new Date());
    const overdue: string[] = [];
    for (const op of ops) {
      const caps = (op.capabilities && typeof op.capabilities === "object" ? op.capabilities : {}) as Record<string, unknown>;
      const tasks = (Array.isArray(caps.ops_tasks) ? caps.ops_tasks : []) as Array<{ title?: string; due?: string; done?: boolean }>;
      for (const t of tasks) {
        if (!t.done && t.due && t.due <= today) overdue.push(`${op.business_name}: ${t.title || "untitled"}`);
      }
    }
    if (overdue.length > 0) {
      report.tasks_flagged = overdue.slice(0, 10);
      if (!dry) {
        await notify(supabase, user_id, null, "director_sweep",
          `${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`,
          overdue.slice(0, 5).join("\n") + (overdue.length > 5 ? `\n…and ${overdue.length - 5} more. Tell me which are actually done.` : "\nTell me which are actually done."),
          "normal");
      }
    }
  }

  // 4. Abandoned shells resume planning once ever (drafts stay drafts).
  if (scopes.has("build_helpers")) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const shells = ops.filter((o) => o.created_at < weekAgo);
    for (const shell of shells) {
      const [{ count: svcCount }, { count: apptCount }] = await Promise.all([
        supabase.from("services").select("*", { count: "exact", head: true }).eq("receptionist_id", shell.id),
        supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", shell.id),
      ]);
      if ((svcCount || 0) > 0 || (apptCount || 0) > 0) continue;
      const { data: threadRows } = await supabase
        .from("build_threads")
        .select("id,title,status")
        .eq("receptionist_id", shell.id)
        .order("updated_at", { ascending: false })
        .limit(1);
      const thread = (Array.isArray(threadRows) ? threadRows : [])[0] as
        | { id: string; title: string; status: string } | undefined;
      if (!thread) {
        if (!dry) {
          await notify(supabase, user_id, shell.id, "director_sweep",
            `Unfinished operator: ${shell.business_name}`,
            `You started this one over a week ago and it was never planned. Say the word and I'll draft it.`,
            "normal");
        }
        report.skipped.push(`shell ${shell.business_name}: no build thread to resume from`);
        continue;
      }
      if (await alreadyResumed(supabase, shell.id)) {
        report.skipped.push(`shell ${shell.business_name}: already resumed once`);
        continue;
      }
      if (dry) {
        report.drafts_resumed.push(shell.business_name);
        continue;
      }
      const steps = draftSteps(shell.business_name);
      const stepLabel = `Picked ${shell.business_name} back up`;
      const lid = await ledgerStart(supabase, {
        user_id,
        receptionist_id: shell.id,
        kind: "operator_draft",
        summary: `Resumed planning for abandoned shell from "${thread.title}"`,
        before: { status: "shell" },
        visible: true,
      });
      await activity(supabase, user_id, lid, "running", stepLabel, steps);
      const { data: job, error } = await supabase.from("plan_jobs").insert({
        receptionist_id: shell.id,
        user_id,
        kind: "operator",
        input_json: {
          description: `${thread.title} — ${shell.business_name}`,
          nofiles: true,
          resumed_by: "director-sweep",
        },
      }).select("id").single();
      await ledgerFinish(supabase, lid, error || !job
        ? { status: "failed", error: "job queue failed" }
        : { status: "done", after: { job_id: (job as { id: string }).id, receptionist_id: shell.id, actor_steps: steps } });
      await activity(supabase, user_id, lid, "done", stepLabel, steps);
      if (!error && job) report.drafts_resumed.push(shell.business_name);
    }
  } else {
    report.skipped.push("shell resume needs the build_helpers grant");
  }

  // 5. The report row — what this sweep did, in one place for the chat.
  if (!dry) {
    const acted = report.requeued.length + report.stock_decremented.length + report.drafts_resumed.length;
    const lid = await ledgerStart(supabase, {
      user_id,
      kind: "report",
      summary: acted === 0 && report.job_notified.length === 0 && report.tasks_flagged.length === 0
        ? "Sweep: nothing needed attention"
        : `Sweep: ${acted} action${acted === 1 ? "" : "s"}, ${report.job_notified.length} job alerts, ${report.tasks_flagged.length} tasks flagged`,
      before: {},
      visible: acted > 0,
    });
    await ledgerFinish(supabase, lid, {
      status: "done",
      after: {
        requeued: report.requeued,
        stock_decremented: report.stock_decremented,
        drafts_resumed: report.drafts_resumed,
        skipped: report.skipped,
      },
    });
  }

  return report;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const dry = (body as Record<string, unknown>).dry_run === true;

    const supabase: { from(table: string): any } = createClient<any>(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: grantRows } = await supabase
      .from("director_grants")
      .select("user_id,scope")
      .eq("allowed", true);
    const byUser = new Map<string, Set<string>>();
    for (const g of ((Array.isArray(grantRows) ? grantRows : []) as Array<{ user_id: string; scope: string }>)) {
      if (!byUser.has(g.user_id)) byUser.set(g.user_id, new Set());
      byUser.get(g.user_id)!.add(g.scope);
    }
    // No grants anywhere means no autonomy anywhere — no rows, no noise.
    if (byUser.size === 0) return jsonRes({ ok: true, dry_run: dry, users: [] });

    const users: SweepReport[] = [];
    for (const [user_id, scopes] of byUser) {
      try {
        users.push(await sweepUser(supabase, user_id, scopes, dry));
      } catch (e) {
        users.push({
          user_id,
          jobs_triaged: 0,
          requeued: [],
          job_notified: [],
          stock_decremented: [],
          tasks_flagged: [],
          drafts_resumed: [],
          skipped: [`sweep failed: ${e instanceof Error ? e.message.slice(0, 160) : "unknown"}`],
        });
      }
    }
    return jsonRes({ ok: true, dry_run: dry, users });
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }, 500);
  }
});
