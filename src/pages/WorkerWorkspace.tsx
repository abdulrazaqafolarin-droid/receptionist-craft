import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, Loader2, Save, Archive, ShieldCheck, Plug, ClipboardList,
  Rocket, RefreshCw, Pause, Play, CheckCircle2, AlertTriangle, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateWorkerPurpose } from "@/lib/workerDefinition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkerFieldView {
  key: string;
  label: string;
  type: string;
  required: boolean;
  description?: string;
}

interface WorkerDefinitionView {
  purpose?: string;
  responsibilities?: string[];
  inputs?: WorkerFieldView[];
  outputs?: WorkerFieldView[];
  capability_keys?: string[];
  allowed_actions?: string[];
  approval_required_for?: string[];
  autonomy_mode?: string;
  execution?: { max_steps: number; timeout_seconds: number; max_retries: number };
  verification?: { success_criteria: string[]; require_evidence: boolean };
  workspace?: { layout: string; panels: string[] };
}

interface WorkerDetails {
  id: string;
  organization_id: string | null;
  created_by: string;
  name: string;
  description: string;
  status: string;
  version: number;
  definition: unknown;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
  verified_version?: number | null;
  verification_run_id?: string | null;
  permissions?: { can_edit: boolean; can_archive: boolean };
}

interface VerificationRecord {
  id: string;
  worker_id: string;
  worker_version: number;
  definition_hash: string;
  status: "running" | "passed" | "failed";
  tests: Array<{ name: string; passed: boolean; detail: string }>;
  summary: string;
  created_at: string;
  completed_at: string | null;
}

interface WorkerTask {
  id: string;
  worker_id: string;
  title: string;
  goal: string;
  status: string;
  output_json: unknown;
  error_text: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

function defaultPayload(definition: WorkerDefinitionView): string {
  const payload: Record<string, unknown> = {};
  for (const field of definition.inputs || []) {
    if (field.type === "file") continue;
    if (field.type === "text") payload[field.key] = field.required ? "Please draft based on this request." : "";
    else if (field.type === "number") payload[field.key] = 1;
    else if (field.type === "boolean") payload[field.key] = false;
    else if (field.type === "date") payload[field.key] = "2026-01-15";
    else payload[field.key] = {};
  }
  return JSON.stringify(payload, null, 2);
}

function supportsDraftRunner(definition: WorkerDefinitionView): boolean {
  const safeActions = new Set(["research", "internal_read", "draft"]);
  return (definition.allowed_actions || []).includes("draft")
    && (definition.allowed_actions || []).every((action) => safeActions.has(action))
    && (definition.capability_keys || []).length === 0
    && definition.autonomy_mode === "supervised"
    && !(definition.outputs || []).some((field) => field.type === "file")
    && !(definition.inputs || []).some((field) => field.required && field.type === "file");
}

export default function WorkerWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [verification, setVerification] = useState<VerificationRecord | null>(null);
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskGoal, setTaskGoal] = useState("");
  const [taskPayload, setTaskPayload] = useState("{}");

  const definition = (worker?.definition && typeof worker.definition === "object"
    ? worker.definition
    : {}) as WorkerDefinitionView;
  const verificationCurrent = !!worker && !!verification
    && verification.worker_version === worker.version;
  const canPublish = !!worker && worker.status === "draft"
    && worker.permissions?.can_edit === true
    && verificationCurrent && verification?.status === "passed"
    && supportsDraftRunner(definition);

  useEffect(() => {
    if (id) void loadWorker(id);
  }, [id]);

  async function loadTasks(workerId: string) {
    const { data, error } = await supabase.functions.invoke("worker-tasks", {
      body: { action: "list", worker_id: workerId },
    });
    if (error || !data?.ok) {
      setTasks([]);
      return;
    }
    setTasks(Array.isArray(data.tasks) ? data.tasks as WorkerTask[] : []);
  }

  async function loadWorker(workerId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "get", worker_id: workerId },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to load this worker.");
      }
      const record = { ...(data.worker as WorkerDetails), permissions: data.permissions };
      setWorker(record);
      setVerification(data.verification || null);
      setName(record.name);
      setDescription(record.description || "");
      const workerDefinition = record.definition as WorkerDefinitionView;
      setPurpose(workerDefinition?.purpose || "");
      setTaskPayload(defaultPayload(workerDefinition || {}));
      if (record.status === "active" || record.status === "paused") {
        await loadTasks(workerId);
      } else {
        setTasks([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load this worker.");
      navigate("/workers");
    } finally {
      setLoading(false);
    }
  }

  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!worker || worker.status !== "draft") return;
    if (!name.trim() || !purpose.trim()) {
      toast.error("Add a worker name and describe its purpose.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: {
          action: "update_draft",
          worker_id: worker.id,
          name: name.trim(),
          description: description.trim(),
          definition: updateWorkerPurpose(worker.definition, purpose.trim()),
        },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to save worker draft.");
      }
      setWorker((current) => current
        ? { ...(data.worker as WorkerDetails), permissions: current.permissions }
        : data.worker as WorkerDetails);
      toast.success("Worker draft saved. Run verification again for this version.");
      await loadWorker(worker.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save worker draft.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyDraft() {
    if (!worker || worker.status !== "draft" || !worker.permissions?.can_edit) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-verification", {
        body: { action: "verify", worker_id: worker.id },
      });
      if (error || !data?.ok || !data.verification) {
        throw new Error(data?.error || error?.message || "Verification could not complete.");
      }
      setVerification(data.verification as VerificationRecord);
      if (data.verification.status === "passed") toast.success("Verification passed for version " + worker.version + ".");
      else toast.error(data.verification.summary || "Verification failed. Review the checks and update the draft.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function publishWorker() {
    if (!worker || !verification || !canPublish) return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "publish", worker_id: worker.id, verification_run_id: verification.id },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to publish worker.");
      }
      setWorker((current) => current
        ? { ...(data.worker as WorkerDetails), permissions: current.permissions }
        : data.worker as WorkerDetails);
      toast.success("Worker published. Only supervised draft tasks are enabled in this runtime.");
      await loadWorker(worker.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to publish worker.");
    } finally {
      setPublishing(false);
    }
  }

  async function pauseWorker() {
    if (!worker || worker.status !== "active") return;
    setPausing(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "pause", worker_id: worker.id },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to pause worker.");
      }
      setWorker((current) => current
        ? { ...(data.worker as WorkerDetails), permissions: current.permissions }
        : data.worker as WorkerDetails);
      toast.success("Worker paused. No new tasks can be claimed.");
      await loadWorker(worker.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to pause worker.");
    } finally {
      setPausing(false);
    }
  }

  async function resumeWorker() {
    if (!worker || worker.status !== "paused" || !verification || verification.status !== "passed") return;
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "resume", worker_id: worker.id, verification_run_id: verification.id },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to resume worker.");
      }
      setWorker((current) => current
        ? { ...(data.worker as WorkerDetails), permissions: current.permissions }
        : data.worker as WorkerDetails);
      toast.success("Worker resumed with its verified version.");
      await loadWorker(worker.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to resume worker.");
    } finally {
      setPublishing(false);
    }
  }

  async function createAndRunTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!worker || worker.status !== "active" || !worker.permissions?.can_edit) return;
    if (!taskTitle.trim() || !taskGoal.trim()) {
      toast.error("Add a task title and a draft-only goal.");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(taskPayload);
    } catch {
      toast.error("Input payload must be valid JSON.");
      return;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      toast.error("Input payload must be a JSON object matching the worker input schema.");
      return;
    }

    setCreatingTask(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-tasks", {
        body: {
          action: "create",
          worker_id: worker.id,
          title: taskTitle.trim(),
          goal: taskGoal.trim(),
          input_json: { execution_mode: "draft", payload },
          idempotency_key: crypto.randomUUID(),
        },
      });
      if (error || !data?.ok || !data.task?.id) {
        throw new Error(data?.error || error?.message || "Unable to queue task.");
      }
      const taskId = String(data.task.id);
      setTaskTitle("");
      setTaskGoal("");
      setRunningTaskId(taskId);
      const { data: runData, error: runError } = await supabase.functions.invoke("worker-runner", {
        body: { worker_id: worker.id, task_id: taskId },
      });
      await loadTasks(worker.id);
      if (runError || !runData?.ok) {
        toast.error("Task queued, but execution did not finish: " + (runData?.error || runError?.message || "unknown runner error"));
      } else if (runData.status === "done") {
        toast.success("Draft task completed and its output was validated.");
      } else if (runData.status === "blocked") {
        toast.error("Task blocked: " + (runData.reason || "review the task requirements"));
      } else if (runData.status === "failed") {
        toast.error("Task failed: " + (runData.error || "review the task and retry safely"));
      } else if (runData.empty) {
        toast.message("No queued task was available to run.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to run task.");
    } finally {
      setRunningTaskId(null);
      setCreatingTask(false);
    }
  }

  async function archiveWorker() {
    if (!worker) return;
    const confirmed = window.confirm("Archive " + worker.name + "? This hides it from the active list and prevents new tasks from being claimed.");
    if (!confirmed) return;
    setArchiving(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "archive", worker_id: worker.id },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || "Unable to archive worker.");
      }
      toast.success("Worker archived.");
      navigate("/workers");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to archive worker.");
    } finally {
      setArchiving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading worker workspace…
      </div>
    );
  }
  if (!worker) return null;

  const isCurrentVerification = verificationCurrent;
  const draftRunnerReady = supportsDraftRunner(definition);
  const taskFields = (definition.inputs || []).filter((field) => field.type !== "file");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate("/workers")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All workers
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={worker.status === "active" ? "default" : "secondary"}>{worker.status}</Badge>
          <span className="text-xs text-muted-foreground">Version {worker.version}</span>
          {worker.verified_version === worker.version && <Badge variant="outline">Verified v{worker.verified_version}</Badge>}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-border/60 bg-background/60 p-3"><Bot className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{worker.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{worker.description || "No short description."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {worker.organization_id ? "Organization workspace" : "Personal workspace"} · Created {new Date(worker.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {worker.status === "draft" && worker.permissions?.can_edit && (
            <Button variant="outline" onClick={() => void verifyDraft()} disabled={verifying || saving}>
              {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Verify draft
            </Button>
          )}
          {canPublish && (
            <Button onClick={() => void publishWorker()} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Publish verified worker
            </Button>
          )}
          {worker.status === "active" && worker.permissions?.can_edit && (
            <Button variant="outline" onClick={() => void pauseWorker()} disabled={pausing}>
              {pausing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Pause
            </Button>
          )}
          {worker.status === "paused" && worker.permissions?.can_edit && verification?.status === "passed" && verificationCurrent && (
            <Button onClick={() => void resumeWorker()} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Resume verified worker
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Worker definition</CardTitle>
            <CardDescription>
              The specification that defines the worker's job. Changes are versioned while the worker remains a draft.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {worker.status === "draft" && worker.permissions?.can_edit ? (
              <form className="space-y-4" onSubmit={saveDraft}>
                <div className="space-y-2">
                  <Label htmlFor="workspace-worker-name">Worker name</Label>
                  <Input id="workspace-worker-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-worker-purpose">Purpose and responsibilities</Label>
                  <Textarea id="workspace-worker-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={1200} rows={4} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-worker-description">Short description</Label>
                  <Textarea id="workspace-worker-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={2} />
                </div>
                <Button type="submit" disabled={saving || verifying}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save draft
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">{definition.purpose || "No purpose recorded."}</p>
                <p className="text-sm text-muted-foreground">
                  {worker.status !== "draft"
                    ? "This version is immutable. Create a new draft version before changing its behavior."
                    : "You have read-only access to this organization's worker. Ask its creator or an organization administrator to make changes."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> Autonomy and approvals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-medium">Autonomy mode</p>
                <p className="text-sm text-muted-foreground">{definition.autonomy_mode || "supervised"}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Allowed actions</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(definition.allowed_actions || []).map((action) => <Badge key={action} variant="secondary">{action}</Badge>)}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium">Always require approval</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(definition.approval_required_for || []).map((action) => <Badge key={action} variant="outline">{action}</Badge>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Plug className="h-4 w-4" /> Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              {(definition.capability_keys || []).length ? (
                <div className="flex flex-wrap gap-1.5">
                  {definition.capability_keys?.map((capability) => <Badge key={capability} variant="secondary">{capability}</Badge>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No external capabilities are enabled. This initial runtime supports draft generation only.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Verification</CardTitle>
          <CardDescription>Verification uses synthetic inputs and a no-tools draft model call. It validates the declared output schema; it is not a factual-accuracy certification.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {verification ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={verification.status === "passed" && isCurrentVerification ? "default" : "secondary"}>
                  {verification.status}{isCurrentVerification ? "" : " · stale version"}
                </Badge>
                <span className="text-xs text-muted-foreground">Version {verification.worker_version} · {new Date(verification.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-muted-foreground">{verification.summary}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(verification.tests || []).map((test, index) => (
                  <div key={test.name + index} className="flex items-start gap-2 rounded-lg border border-border/60 p-3">
                    {test.passed ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{test.name.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">{test.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This draft has not been verified yet. Verify it before publication.</p>
          )}
          {!draftRunnerReady && worker.status === "draft" && (
            <p className="text-sm text-amber-600">This definition includes actions or capabilities that the current draft-only runner cannot execute. It will not be publishable until a matching capability adapter exists.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Tasks and execution</CardTitle>
          <CardDescription>Published workers currently support supervised draft tasks only. No messages are sent and no external systems are changed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {worker.status === "active" && worker.permissions?.can_edit && draftRunnerReady && (
            <form className="space-y-4 rounded-xl border border-border/60 p-4" onSubmit={createAndRunTask}>
              <div>
                <h3 className="font-medium">Create and run a draft task</h3>
                <p className="mt-1 text-sm text-muted-foreground">The runner uses the declared input/output schema, does not use tools or web access, and returns a draft for review.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-task-title">Task title</Label>
                <Input id="worker-task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={200} placeholder="e.g. Draft an appointment reminder" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-task-goal">Draft goal</Label>
                <Textarea id="worker-task-goal" value={taskGoal} onChange={(event) => setTaskGoal(event.target.value)} maxLength={4000} placeholder="Describe the draft you need. Do not ask it to send, publish or change anything." rows={3} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-task-payload">Input payload (JSON object)</Label>
                <Textarea id="worker-task-payload" value={taskPayload} onChange={(event) => setTaskPayload(event.target.value)} rows={5} className="font-mono text-xs" required />
                <p className="text-xs text-muted-foreground">
                  Declared inputs: {(definition.inputs || []).map((field) => field.key + (field.required ? " (required)" : " (optional)")).join(", ") || "none"}
                </p>
              </div>
              <Button type="submit" disabled={creatingTask || verifying || publishing}>
                {creatingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Create and run draft
              </Button>
              {runningTaskId && <p className="text-xs text-muted-foreground">Running task {runningTaskId}…</p>}
            </form>
          )}

          {worker.status !== "active" && (
            <p className="text-sm text-muted-foreground">Publish a verified draft to enable draft-only tasks. Paused and draft workers cannot claim new tasks.</p>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">Recent tasks</h3>
              {(worker.status === "active" || worker.status === "paused") && (
                <Button variant="ghost" size="sm" onClick={() => void loadTasks(worker.id)}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh
                </Button>
              )}
            </div>
            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
                <ClipboardList className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No tasks yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a draft task above once this worker is published.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{task.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{task.goal}</p>
                      </div>
                      <Badge variant={task.status === "done" ? "default" : task.status === "failed" || task.status === "blocked" ? "destructive" : "secondary"}>{task.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(task.created_at).toLocaleString()} · Attempt {task.attempt_count}
                    </div>
                    {task.error_text && <p className="mt-3 text-sm text-destructive">{task.error_text}</p>}
                    {task.output_json && (
                      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-xs">{JSON.stringify(task.output_json, null, 2)}</pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {worker.status !== "archived" && worker.permissions?.can_archive && (
            <Button variant="outline" onClick={archiveWorker} disabled={archiving || creatingTask || publishing}>
              {archiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              Archive worker
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
