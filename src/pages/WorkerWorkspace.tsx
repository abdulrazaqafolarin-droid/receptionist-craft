import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bot, Loader2, Save, Archive, ShieldCheck, Plug, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateWorkerPurpose } from "@/lib/workerDefinition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface WorkerDefinitionView {
  purpose?: string;
  responsibilities?: string[];
  inputs?: Array<{ key: string; label: string; type: string; required: boolean }>;
  outputs?: Array<{ key: string; label: string; type: string; required: boolean }>;
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
}

export default function WorkerWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");

  const definition = (worker?.definition && typeof worker.definition === "object"
    ? worker.definition
    : {}) as WorkerDefinitionView;

  useEffect(() => {
    if (id) void loadWorker(id);
  }, [id]);

  async function loadWorker(workerId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "get", worker_id: workerId },
      });
      if (error || !data?.ok || !data.worker) {
        throw new Error(data?.error || error?.message || "Unable to load this worker.");
      }
      const record = data.worker as WorkerDetails;
      setWorker(record);
      setName(record.name);
      setDescription(record.description || "");
      const workerDefinition = record.definition as WorkerDefinitionView;
      setPurpose(workerDefinition?.purpose || "");
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
      setWorker(data.worker as WorkerDetails);
      toast.success("Worker draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save worker draft.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveWorker() {
    if (!worker) return;
    const confirmed = window.confirm(`Archive "${worker.name}"? This hides it from the active worker list and cannot be undone in this draft version.`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate("/workers")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> All workers
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={worker.status === "active" ? "default" : "secondary"}>{worker.status}</Badge>
          <span className="text-xs text-muted-foreground">Version {worker.version}</span>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border/60 bg-background/60 p-3">
          <Bot className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{worker.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{worker.description || "No short description."}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {worker.organization_id ? "Organization workspace" : "Personal workspace"} · Created {new Date(worker.created_at).toLocaleDateString()}
          </p>
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
            {worker.status === "draft" ? (
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
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save draft
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">{definition.purpose || "No purpose recorded."}</p>
                <p className="text-sm text-muted-foreground">This worker is not editable in place because it is no longer a draft. Versioned active-worker updates will be added with the verification pipeline.</p>
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
                <p className="text-sm font-medium">Actions allowed by this draft</p>
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
                <p className="text-sm text-muted-foreground">No external capabilities are enabled. The Director will connect vetted tools during the build workflow.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Tasks and execution</CardTitle>
          <CardDescription>Execution history will appear here when the generic worker runtime is connected.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            This worker is a persistent, validated draft. It will not run tasks yet. The next implementation stage connects the Director to the durable task queue, approvals, checkpoints and evidence-based completion.
          </p>
          {worker.status !== "archived" && (
            <Button variant="outline" onClick={archiveWorker} disabled={archiving}>
              {archiving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
              Archive worker
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
