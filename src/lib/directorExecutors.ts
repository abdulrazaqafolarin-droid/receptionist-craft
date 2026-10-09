/**
 * Director executors — the Director's hands, shared by the panel Build tab
 * and the Director chat. One implementation, two doors.
 *
 * Every executor runs the same lanes as the main flows (sync-first, async
 * queue + poll on capacity failure, RLS-scoped). Nothing here approves —
 * drafts and plans come back for human review in the Builder.
 */

import { supabase } from "@/integrations/supabase/client";

function jobsTable() {
  return (supabase.from as unknown as (t: string) => {
    select(c: string): {
      eq(c: string, v: string): {
        order(c: string, o?: unknown): {
          limit(n: number): Promise<{ data: unknown }>;
        };
        maybeSingle(): Promise<{ data: unknown }>;
      };
    };
    update(v: unknown): {
      eq(c: string, v: string): Promise<{ error: { message: string } | null }>;
    };
  })("plan_jobs");
}

async function pollJob(jobId: string, onTick?: () => void): Promise<{ ok: boolean; error?: string }> {
  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    onTick?.();
    const { data: row } = await jobsTable().select("status,result_json,error_text").eq("id", jobId).maybeSingle();
    const j = (row || {}) as { status?: string; error_text?: string | null };
    if (j.status === "done") return { ok: true };
    if (j.status === "failed") return { ok: false, error: j.error_text || "background job failed" };
    if (Date.now() > deadline) return { ok: false, error: "timed out waiting — check Diagnostics" };
  }
}

export async function retryDirectorJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await jobsTable().update({ status: "queued", attempts: 0, error_text: null }).eq("id", jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Requeue failed." };
  }
}

export async function adjustDirectorOperator(
  userId: string,
  operatorId: string,
  note: string,
  onStatus?: (s: string) => void,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const body = { change_request: note.trim(), receptionist_id: operatorId, user_id: userId };
    try {
      const r = await supabase.functions.invoke("request-change", { body });
      if (((r.data as { ok?: boolean } | null)?.ok) === true) return { ok: true };
    } catch {
      // fall through to the background lane
    }
    onStatus?.("Long job — queued in the background…");
    const queued = await supabase.functions.invoke("request-change", { body: { ...body, async: true } });
    const jobId = (queued.data as { job_id?: string } | null)?.job_id;
    if (queued.error || !jobId) return { ok: false, error: "Could not queue the change." };
    const res = await pollJob(jobId, () => onStatus?.("Still planning…"));
    return res.ok ? { ok: true } : { ok: false, error: res.error || "Change failed." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Change failed." };
  }
}

export async function draftDirectorHelper(
  userId: string,
  name: string,
  description: string,
  onStatus?: (s: string) => void,
): Promise<{ ok: boolean; receptionistId?: string; error?: string }> {
  try {
    const { data: rec, error: recErr } = await supabase
      .from("receptionists")
      .insert({
        user_id: userId,
        name: "Setting up...",
        business_name: name.trim() || "New helper",
        business_type: "General Business",
        tone: "friendly",
      })
      .select("id")
      .single();
    if (recErr || !rec) return { ok: false, error: "Could not create the helper shell." };
    const recId = (rec as { id: string }).id;
    // If planning fails after this point, the shell row is removed so a
    // failed draft never strands a "Setting up..." operator on the dashboard.
    const removeShell = () =>
      supabase.from("receptionists").delete().eq("id", recId).eq("user_id", userId);
    const body = { description: description.trim(), receptionist_id: recId, user_id: userId, nofiles: true };
    onStatus?.("Planning the helper — this takes a minute…");
    try {
      const r = await supabase.functions.invoke("propose-operator-plan", { body });
      if (((r.data as { ok?: boolean } | null)?.ok) === true) return { ok: true, receptionistId: recId };
    } catch {
      // fall through to the background lane
    }
    onStatus?.("Long job — queued in the background…");
    const queued = await supabase.functions.invoke("propose-operator-plan", { body: { ...body, async: true } });
    const jobId = (queued.data as { job_id?: string } | null)?.job_id;
    if (queued.error || !jobId) {
      await removeShell();
      return { ok: false, error: "Could not queue the plan." };
    }
    const res = await pollJob(jobId, () => onStatus?.("Still planning…"));
    if (!res.ok) await removeShell();
    return res.ok ? { ok: true, receptionistId: recId } : { ok: false, error: res.error || "Planning failed." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Draft failed." };
  }
}
