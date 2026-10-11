/**
 * director-task — goals that drive themselves to DONE or BLOCKED.
 *
 * Started by the brain, the owner (chat button, session JWT), or the
 * sweep: { action: "start", goal, lane?, device_id?, budget? } runs
 * the loop synchronously up to a wall budget, then returns terminal
 * or { status: "running", task_id } for continue calls to resume —
 * state persists per step, so nothing restarts. { action: "continue",
 * task_id } picks up exactly where the last call stopped.
 *
 * The loop (Jev's six mechanics, every lane):
 * 1. Observe (in-app look_at_page / device look_at_screen via a
 *    queued command + wait). Timeout → running, resume later.
 * 2. Fingerprint; tripwire (3 stagnant non-waits → BLOCKED).
 * 3. Decide via the gateway (in-app limits noted: no SELECT/SCROLL/
 *    UPLOAD — open then click, read again instead of scrolling).
 * 4. Execute via a queued command + wait. Refusals replan, never
 *    blind-retry: the identical failed action twice running means
 *    stop and BLOCK as stuck.
 * 5. DONE → one fresh look + verify call. The trail is the proof.
 * 6. Terminal → task row + ledger report row. Dropped calls resume.
 *
 * Auth: gateway key (brain) or session JWT (owner). User id comes
 * from the credential, never the body.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { askRutex, RutexMcpError } from "../_shared/rutexMcp.ts";
import { buildDecidePrompt, parseDecision } from "../_shared/directorDecide.ts";
import {
  fingerprintTable, noProgress, labelForIndex, refusedGoal,
  type TaskStep,
} from "../_shared/directorTask.ts";
import { ledgerStart, ledgerFinish } from "../_shared/directorLedger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gateway-key",
};

const WALL_BUDGET_MS = 100000;
const OBSERVE_WAIT_MS = 25000;
const ACT_WAIT_MS = 30000;
const DECIDE_TIMEOUT_MS = 60000;
const POLL_STEP_MS = 1500;
const DEFAULT_BUDGET = 12;

const INAPP_LIMITS = [
  "Lane: this app only. SELECT, SCROLL_UP, SCROLL_DOWN, UPLOAD do not exist here —",
  "open dropdowns with CLICK then CLICK the option; read again instead of scrolling;",
  "uploads are impossible. Use CLICK, TYPE_TEXT, WAIT, DONE, BLOCKED only.",
].join(" ");
const DEVICE_LIMITS = [
  "Lane: a real computer. SELECT and UPLOAD do not exist here —",
  "CLICK the field first, then TYPE_TEXT; open dropdowns with CLICK then CLICK the option.",
  "Use CLICK, TYPE_TEXT, SCROLL_UP, SCROLL_DOWN, WAIT, DONE, BLOCKED only.",
].join(" ");

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function keysEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TaskRow {
  id: string;
  user_id: string;
  goal: string;
  lane: string;
  device_id: string | null;
  budget: number;
  history: TaskStep[];
  status: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const startedAt = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Identity: gateway key first, session JWT second. Body never decides.
    let user_id = "";
    const gwPresented = req.headers.get("X-Gateway-Key") || "";
    const gwExpected = Deno.env.get("RUTEX_GATEWAY_KEY") || "";
    if (gwPresented && keysEqual(gwPresented, gwExpected)) {
      const b = await req.json().catch(() => ({}));
      user_id = typeof (b as Record<string, unknown>).user_id === "string"
        ? ((b as Record<string, unknown>).user_id as string) : "";
      if (!user_id) return jsonRes({ ok: false, error: "user_id required" }, 400);
    } else {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const { data: { user }, error: authError } = await supabase.auth.getUser(token || "invalid");
      if (authError || !user) return jsonRes({ ok: false, error: "invalid token" }, 401);
      user_id = user.id;
    }
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "start";

    const loadTask = async (id: string): Promise<TaskRow | null> => {
      const { data } = await supabase.from("director_tasks").select("*").eq("id", id).maybeSingle();
      const t = data as TaskRow | null;
      return t && t.user_id === user_id ? t : null;
    };
    const saveTask = async (t: TaskRow) => {
      await supabase.from("director_tasks").update({
        history: t.history,
        status: t.status,
        result: (t as { result?: string }).result ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", t.id);
    };

    // Run one command through the queue and wait for its outcome.
    // Returns null on timeout (caller resumes later).
    const runCommand = async (
      tool: string, args: Record<string, unknown>, device_id: string | null, waitMs: number,
    ): Promise<{ ok: boolean; result: unknown; error: string | null } | null> => {
      const { data, error } = await supabase.from("director_commands").insert({
        user_id,
        session_id: `task`,
        device_id,
        tool,
        args,
        status: "queued",
      }).select("id").single();
      if (error || !data) return { ok: false, result: null, error: "queue failed" };
      const cid = (data as { id: string }).id;
      const deadline = Date.now() + waitMs;
      for (;;) {
        const { data: row } = await supabase
          .from("director_commands")
          .select("status,result,error")
          .eq("id", cid)
          .maybeSingle();
        const r = row as { status: string; result: unknown; error: string | null } | null;
        if (!r) return { ok: false, result: null, error: "command vanished" };
        if (r.status === "done" || r.status === "failed") {
          return { ok: r.status === "done", result: r.result, error: r.error };
        }
        if (Date.now() >= deadline) return null;
        await sleep(POLL_STEP_MS);
      }
    };

    const askBrain = async (
      task: TaskRow, table: string, url: string, trail: string[], limits: string,
    ): Promise<{ op: string; target?: string; text?: string; reason?: string } | null> => {
      try {
        const r = await askRutex(
          `task-${task.id.slice(0, 8)}`,
          buildDecidePrompt({ goal: task.goal, url, table, history: trail, mode: "loop", limits }),
          { timeoutMs: DECIDE_TIMEOUT_MS },
        );
        const d = parseDecision(r.text || "");
        return { op: d.operation, target: d.target, text: d.text, reason: d.reason };
      } catch {
        return null;
      }
    };

    const finishTask = async (
      task: TaskRow, status: "done" | "blocked" | "failed", result: string,
    ) => {
      task.status = status;
      (task as { result?: string }).result = result.slice(0, 500);
      await saveTask(task);
      const lid = await ledgerStart(supabase, {
        user_id: task.user_id,
        kind: "report",
        summary: `Task ${status}: ${task.goal.slice(0, 120)} (${task.history.length} steps)`,
        before: { task_id: task.id, goal: task.goal },
        visible: status !== "failed",
      });
      await ledgerFinish(supabase, lid, {
        status: status === "failed" ? "failed" : "done",
        after: { result: result.slice(0, 500), steps: task.history.length },
      });
    };

    if (action === "start") {
      const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 1000) : "";
      if (!goal) return jsonRes({ ok: false, error: "goal required" }, 400);
      const refused = refusedGoal(goal);
      if (refused) return jsonRes({ ok: false, error: refused }, 400);
      const lane = body.device_id ? "device" : "inapp";
      const device_id = typeof body.device_id === "string" && body.device_id ? body.device_id : null;
      if (device_id) {
        const { data: dev } = await supabase
          .from("companion_devices")
          .select("id,user_id,enabled")
          .eq("id", device_id)
          .maybeSingle();
        const owned = dev as { id: string; user_id: string; enabled: boolean } | null;
        if (!owned || owned.user_id !== user_id) return jsonRes({ ok: false, error: "unknown device" }, 404);
        if (!owned.enabled) return jsonRes({ ok: false, error: "device paused — enable it first" }, 409);
      }
      const budget = Math.min(Math.max(Number(body.budget) || DEFAULT_BUDGET, 1), 24);
      const { data, error } = await supabase.from("director_tasks").insert({
        user_id,
        goal,
        lane,
        device_id,
        budget,
        history: [],
        status: "running",
      }).select("*").single();
      if (error || !data) return jsonRes({ ok: false, error: "task queue failed" }, 500);
      const task = data as TaskRow;
      return await drive(task);
    }

    if (action === "continue") {
      const task_id = typeof body.task_id === "string" ? body.task_id : "";
      if (!task_id) return jsonRes({ ok: false, error: "task_id required" }, 400);
      const task = await loadTask(task_id);
      if (!task) return jsonRes({ ok: false, error: "task not found" }, 404);
      if (task.status !== "running") {
        return jsonRes({ ok: true, status: task.status, task_id: task.id, result: (task as { result?: string }).result ?? null });
      }
      return await drive(task);
    }

    return jsonRes({ ok: false, error: "action must be start or continue" }, 400);

    // ---------- The loop ----------
    async function drive(task: TaskRow): Promise<Response> {
      const device_id = task.device_id;
      const limits = device_id ? DEVICE_LIMITS : INAPP_LIMITS;
      const trail = (task.history || []).map((h) => `${h.op}${h.target ? ` [${h.target}]` : ""}: ${h.detail}`.slice(0, 160));
      let unmappable = 0;
      let lastFailedSig = "";

      const observe = async (): Promise<{ table: string; url: string } | null> => {
        const tool = device_id ? "look_at_screen" : "look_at_page";
        const out = await runCommand(tool, {}, device_id, OBSERVE_WAIT_MS);
        if (!out || !out.ok) return null;
        const res = (out.result || {}) as Record<string, unknown>;
        if (device_id) {
          const screen = typeof res.screen === "string" ? res.screen : "";
          return screen ? { table: screen.slice(0, 6000), url: "device screen" } : null;
        }
        const page = (res.page || {}) as Record<string, unknown>;
        const elements = (Array.isArray(page.elements) ? page.elements : []) as string[];
        const anchors = (Array.isArray(page.anchors) ? page.anchors : []) as string[];
        const table = [...elements, ...anchors.map((a) => `anchor | ${a}`)].join("\n").slice(0, 6000);
        return table ? { table, url: String(page.route || "/") } : null;
      };

      // Execute one decided step. Null = silent mid-step (timeout) or
      // unmappable op — caller resumes, never blind-retries.
      const executeStep = async (
        decided: { op: string; target?: string; text?: string },
        table: string,
      ): Promise<{ ok: boolean; detail: string; kind: string } | null> => {
        if (decided.op === "WAIT") {
          await sleep(2500);
          return { ok: true, detail: "waited", kind: "wait" };
        }
        let tool = "";
        let args: Record<string, unknown> = {};
        if (!device_id) {
          if (decided.op === "CLICK" && decided.target) {
            const label = labelForIndex(table, decided.target);
            tool = "live_click";
            args = { index: Number(decided.target) };
            if (label) args.expect = label;
          } else if (decided.op === "TYPE_TEXT" && decided.target && typeof decided.text === "string") {
            tool = "live_type";
            args = { index: Number(decided.target), text: decided.text.slice(0, 500) };
            const label = labelForIndex(table, decided.target);
            if (label) args.expect = label;
          } else {
            return null;
          }
        } else {
          if (decided.op === "CLICK" && decided.target) { tool = "click"; args = { target_id: decided.target }; }
          else if (decided.op === "TYPE_TEXT" && typeof decided.text === "string") { tool = "type_text"; args = { text: decided.text.slice(0, 500) }; }
          else if (decided.op === "SCROLL_UP" || decided.op === "SCROLL_DOWN") { tool = "scroll"; args = { direction: decided.op === "SCROLL_UP" ? "up" : "down", amount: 4 }; }
          else return null;
        }
        const out = await runCommand(tool, args, device_id, ACT_WAIT_MS);
        if (!out) return null;
        return {
          ok: out.ok,
          detail: out.ok ? "done" : String(out.error || "refused").slice(0, 160),
          kind: decided.op.toLowerCase(),
        };
      };

      while (task.history.length < task.budget && Date.now() - startedAt < WALL_BUDGET_MS) {
        const seen = await observe();
        if (!seen) {
          await saveTask(task);
          return jsonRes({ ok: true, status: "running", task_id: task.id, steps_done: task.history.length, waiting: "hands silent — continue to resume" });
        }
        const fp = fingerprintTable(seen.table);
        if (noProgress(task.history.map((h) => ({ fingerprint: h.fingerprint, kind: h.op.toLowerCase() })))) {
          await finishTask(task, "blocked", "three steps, no movement — stopped instead of spinning");
          return jsonRes({ ok: true, status: "blocked", task_id: task.id, result: "three steps, no movement — stopped instead of spinning", trail: task.history });
        }
        const decided = await askBrain(task, seen.table, seen.url, trail, limits);
        if (!decided) {
          await saveTask(task);
          return jsonRes({ ok: true, status: "running", task_id: task.id, steps_done: task.history.length, waiting: "brain silent — continue to resume" });
        }
        if (decided.op === "DONE") {
          const fresh = await observe();
          if (!fresh) {
            await saveTask(task);
            return jsonRes({ ok: true, status: "running", task_id: task.id, steps_done: task.history.length, waiting: "verify look missed — continue to resume" });
          }
          const check = await askBrain(task, fresh.table, fresh.url,
            [...trail, "CLAIMED DONE — is every requirement visibly satisfied? Answer DONE only if yes, else the next real step."], limits);
          if (check && check.op === "DONE") {
            await finishTask(task, "done", `done in ${task.history.length} steps — verified against a fresh look`);
            return jsonRes({ ok: true, status: "done", task_id: task.id, result: `done in ${task.history.length} steps`, trail: task.history });
          }
          const vstep: TaskStep = {
            n: task.history.length + 1, op: "VERIFY", detail: "claimed done, fresh look disagreed — continuing",
            fingerprint: fingerprintTable(fresh.table), at: new Date().toISOString(),
          };
          task.history.push(vstep);
          trail.push("VERIFY: claim rejected, continuing");
          await saveTask(task);
          continue;
        }
        if (decided.op === "BLOCKED") {
          await finishTask(task, "blocked", decided.reason || "brain stopped the task");
          return jsonRes({ ok: true, status: "blocked", task_id: task.id, result: decided.reason || "blocked", trail: task.history });
        }
        const res = await executeStep(decided, seen.table);
        if (res === null) {
          unmappable += 1;
          if (unmappable >= 2) {
            await finishTask(task, "blocked", "stuck: two running unmappable or silent steps");
            return jsonRes({ ok: true, status: "blocked", task_id: task.id, result: "stuck", trail: task.history });
          }
          await saveTask(task);
          return jsonRes({ ok: true, status: "running", task_id: task.id, steps_done: task.history.length, waiting: "step went silent — continue to resume" });
        }
        // Record BEFORE re-observing: a stale post-action look must not
        // erase what happened. Never blind-retry the identical failure.
        const sig = `${decided.op}:${decided.target || ""}`;
        const step: TaskStep = {
          n: task.history.length + 1,
          op: decided.op,
          target: decided.target,
          detail: res.detail,
          fingerprint: fp,
          at: new Date().toISOString(),
        };
        task.history.push(step);
        trail.push(`${decided.op}${decided.target ? ` [${decided.target}]` : ""}: ${res.detail}`.slice(0, 160));
        await saveTask(task);
        if (!res.ok && lastFailedSig === sig) {
          await finishTask(task, "blocked", `stuck on refused action ${sig} — stopped instead of retrying`);
          return jsonRes({ ok: true, status: "blocked", task_id: task.id, result: `stuck on ${sig}`, trail: task.history });
        }
        lastFailedSig = res.ok ? "" : sig;
      }
      await saveTask(task);
      if (task.history.length >= task.budget) {
        await finishTask(task, "blocked", `budget reached (${task.budget} steps)`);
        return jsonRes({ ok: true, status: "blocked", task_id: task.id, result: "budget reached", trail: task.history });
      }
      return jsonRes({ ok: true, status: "running", task_id: task.id, steps_done: task.history.length, waiting: "wall budget — continue to resume" });
    }

  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }

  function unused(): void {
    return undefined;
  }
  void unused;
});
