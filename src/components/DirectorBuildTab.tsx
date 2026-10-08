/**
 * DirectorBuildTab — the Director's hands.
 *
 * Three real operations, each grant-gated, each running the same lanes as
 * the main flows (sync-first, async queue + poll on capacity failure):
 * retry failed jobs, adjust an operator (change drafted — review in the
 * Builder), draft a helper (planned, never live — review in the Builder).
 * Nothing here approves. Approval stays human, in the Builder.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { actionDef, type DirectorActionKey } from "@/lib/directorActionDefs";
import type { GrantScope } from "@/lib/directorGrantRules";

interface FailedJob {
  id: string;
  receptionist_id: string;
  created_at: string;
}

interface OperatorRef {
  id: string;
  business_name: string | null;
  name: string | null;
}

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

async function pollJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    const { data: row } = await jobsTable().select("status,result_json,error_text").eq("id", jobId).maybeSingle();
    const j = (row || {}) as { status?: string; error_text?: string | null };
    if (j.status === "done") return { ok: true };
    if (j.status === "failed") return { ok: false, error: j.error_text || "background job failed" };
    if (Date.now() > deadline) return { ok: false, error: "timed out waiting — check Diagnostics" };
  }
}

export function DirectorBuildTab({
  userId,
  check,
  onNeedGrant,
}: {
  userId: string | undefined;
  check: (scope: string) => boolean;
  onNeedGrant: (scope: GrantScope) => void;
}) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<FailedJob[]>([]);
  const [operators, setOperators] = useState<OperatorRef[]>([]);
  const [busy, setBusy] = useState<DirectorActionKey | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [doneLink, setDoneLink] = useState<{ label: string; path: string } | null>(null);
  const [adjustOp, setAdjustOp] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftName, setDraftName] = useState("");

  const load = async () => {
    if (!userId) return;
    try {
      const { data: recs } = await supabase.from("receptionists").select("id,business_name,name").eq("user_id", userId);
      const ops = (((recs || []) as unknown) as OperatorRef[]);
      setOperators(ops);
      if (ops.length > 0 && !adjustOp) setAdjustOp(ops[0].id);
      // RLS scopes to the owner's rows; status filter picks the failed.
      const { data } = await jobsTable().select("id,receptionist_id,created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(10);
      setJobs((((data || []) as unknown) as FailedJob[]));
    } catch {
      // lists stay empty; actions still attemptable
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const gate = (key: DirectorActionKey): boolean => {
    const def = actionDef(key);
    if (!def) return false;
    if (!check(def.scope)) {
      toast.message("Grant needed — enable it on the Grants tab first.");
      onNeedGrant(def.scope);
      return false;
    }
    return true;
  };

  const opName = (id: string) => {
    const o = operators.find((x) => x.id === id);
    return o ? o.business_name || o.name || "Operator" : "Operator";
  };

  async function retryJob(id: string) {
    if (!gate("retry-job") || busy) return;
    setBusy("retry-job");
    setStatus(null);
    setDoneLink(null);
    try {
      const { error } = await jobsTable().update({ status: "queued", attempts: 0, error_text: null }).eq("id", id);
      if (error) throw new Error(error.message);
      toast.success("Job re-queued — the worker picks it up within a minute.");
      await load();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Requeue failed.");
    } finally {
      setBusy(null);
    }
  }

  async function adjust() {
    if (!gate("adjust-operator") || busy || !adjustOp || !adjustNote.trim() || !userId) return;
    setBusy("adjust-operator");
    setStatus("Asking for the change plan…");
    setDoneLink(null);
    try {
      const body = {
        change_request: adjustNote.trim(),
        receptionist_id: adjustOp,
        user_id: userId,
      };
      let data: unknown = null;
      try {
        const r = await supabase.functions.invoke("request-change", { body });
        if ((r.data as { ok?: boolean } | null)?.ok) data = r.data;
      } catch {
        data = null;
      }
      if (!data) {
        setStatus("Long job — queued in the background…");
        const queued = await supabase.functions.invoke("request-change", { body: { ...body, async: true } });
        const jobId = (queued.data as { job_id?: string } | null)?.job_id;
        if (queued.error || !jobId) throw new Error("Could not queue the change.");
        const res = await pollJob(jobId);
        if (!res.ok) throw new Error(res.error || "Change failed.");
      }
      setStatus("Change planned — review it in the Builder before anything goes live.");
      setDoneLink({ label: `Review ${opName(adjustOp)} in Builder`, path: `/builder/${adjustOp}` });
      setAdjustNote("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Change failed.");
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    if (!gate("draft-helper") || busy || !draftText.trim() || !userId) return;
    setBusy("draft-helper");
    setStatus("Creating the helper shell…");
    setDoneLink(null);
    try {
      const { data: rec, error: recErr } = await supabase
        .from("receptionists")
        .insert({
          user_id: userId,
          name: "Setting up...",
          business_name: draftName.trim() || "New helper",
          business_type: "General Business",
          tone: "friendly",
        })
        .select("id")
        .single();
      if (recErr || !rec) throw new Error("Could not create the helper shell.");
      const recId = (rec as { id: string }).id;
      const body = {
        description: draftText.trim(),
        receptionist_id: recId,
        user_id: userId,
        nofiles: true,
      };
      setStatus("Planning the helper — this takes a minute…");
      let ok = false;
      try {
        const r = await supabase.functions.invoke("propose-operator-plan", { body });
        ok = ((r.data as { ok?: boolean } | null)?.ok) === true;
      } catch {
        ok = false;
      }
      if (!ok) {
        setStatus("Long job — queued in the background…");
        const queued = await supabase.functions.invoke("propose-operator-plan", { body: { ...body, async: true } });
        const jobId = (queued.data as { job_id?: string } | null)?.job_id;
        if (queued.error || !jobId) throw new Error("Could not queue the plan.");
        const res = await pollJob(jobId);
        if (!res.ok) throw new Error(res.error || "Planning failed.");
      }
      setStatus("Helper drafted — review it in the Builder. Nothing is live.");
      setDoneLink({ label: "Review helper in Builder", path: `/builder/${recId}` });
      setDraftText("");
      setDraftName("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Draft failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {status && <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground" role="status">{status}</p>}
      {doneLink && (
        <button onClick={() => navigate(doneLink.path)} className="w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground">
          {doneLink.label}
        </button>
      )}

      <div className="rounded-xl border border-border bg-card px-3 py-2.5">
        <p className="text-sm font-medium">Failed jobs {jobs.length > 0 ? `(${jobs.length})` : ""}</p>
        {jobs.length === 0 && <p className="mt-1 text-xs text-muted-foreground">None. Failed plans land here with a retry.</p>}
        <ul className="mt-1 space-y-1">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{opName(j.receptionist_id)} · {new Date(j.created_at).toLocaleDateString()}</span>
              <button
                disabled={busy !== null}
                onClick={() => { void retryJob(j.id); }}
                className="shrink-0 rounded-lg border border-border px-2 py-1 font-medium hover:bg-muted disabled:opacity-50"
              >
                {busy === "retry-job" ? "…" : "Retry"}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card px-3 py-2.5">
        <p className="text-sm font-medium">Adjust an operator</p>
        <div className="mt-2 flex gap-2">
          <select
            value={adjustOp}
            onChange={(e) => setAdjustOp(e.target.value)}
            className="w-32 shrink-0 rounded-lg border border-border bg-background px-2 py-2 text-xs"
            aria-label="Operator to adjust"
          >
            {operators.map((o) => (
              <option key={o.id} value={o.id}>{o.business_name || o.name || "Operator"}</option>
            ))}
          </select>
          <input
            value={adjustNote}
            onChange={(e) => setAdjustNote(e.target.value)}
            placeholder="Change note, e.g. add Saturday hours"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs"
            aria-label="Change note"
          />
          <button
            disabled={busy !== null || !adjustNote.trim()}
            onClick={() => { void adjust(); }}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy === "adjust-operator" ? "…" : "Plan"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card px-3 py-2.5">
        <p className="text-sm font-medium">Draft a helper</p>
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Helper name (optional)"
          className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-2 text-xs"
          aria-label="Helper name"
        />
        <textarea
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          placeholder="Describe the helper's job in plain words…"
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-border bg-background px-2 py-2 text-xs"
          aria-label="Helper description"
        />
        <button
          disabled={busy !== null || !draftText.trim()}
          onClick={() => { void draft(); }}
          className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy === "draft-helper" ? "Planning…" : "Draft helper (never live until you approve)"}
        </button>
      </div>
    </div>
  );
}
