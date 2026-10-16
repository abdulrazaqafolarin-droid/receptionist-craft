import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Plus, Loader2, ArrowRight, ShieldCheck, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { starterWorkerDefinition } from "@/lib/workerDefinition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WorkerSummary {
  id: string;
  organization_id: string | null;
  created_by: string;
  name: string;
  description: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

interface OrganizationOption {
  id: string;
  name: string;
}

export default function Workers() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("");
  const [organizationId, setOrganizationId] = useState("personal");

  useEffect(() => {
    void loadWorkers();
    void loadOrganizations();
  }, []);

  async function loadWorkers() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-registry", {
        body: { action: "list" },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || error?.message || "Unable to load workers.");
      }
      setWorkers(Array.isArray(data.workers) ? data.workers as WorkerSummary[] : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load workers.");
    } finally {
      setLoading(false);
    }
  }

  async function loadOrganizations() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberships, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", user.id)
        .not("joined_at", "is", null);
      if (membershipError || !memberships?.length) return;
      const ids = [...new Set(memberships.filter((membership) => ["owner", "admin", "member"].includes(membership.role)).map((membership) => membership.organization_id))];
      const { data, error } = await supabase.from("organizations").select("id, name").in("id", ids);
      if (error) throw error;
      setOrganizations((data || []) as OrganizationOption[]);
    } catch {
      // The personal worker option remains available if organization discovery fails.
    }
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    const normalizedPurpose = purpose.trim();
    if (!normalizedName || !normalizedPurpose) {
      toast.error("Add a worker name and describe the job it should do.");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        action: "create_draft",
        name: normalizedName,
        description: description.trim(),
        definition: starterWorkerDefinition(normalizedPurpose),
      };
      if (organizationId !== "personal") body.organization_id = organizationId;

      const { data, error } = await supabase.functions.invoke("worker-registry", { body });
      if (error || !data?.ok || !data.worker?.id) {
        throw new Error(data?.error || error?.message || "Unable to create worker draft.");
      }
      toast.success("Worker draft created.");
      navigate(`/workers/${data.worker.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create worker draft.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border/60 bg-background/60 p-3">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">AI Workers</h1>
              <p className="text-sm text-muted-foreground">Purpose-built workers with their own configuration, permissions and workspace.</p>
            </div>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Create a safe draft from a job description. Drafts do not execute tasks or connect to external services until the Director build and verification workflow is connected.
          </p>
        </div>
        <Button onClick={() => setShowCreate((current) => !current)}>
          <Plus className="mr-2 h-4 w-4" />
          {showCreate ? "Close form" : "Create worker"}
        </Button>
      </div>

      {showCreate && (
        <Card className="border-primary/20 bg-card/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle>Create a worker draft</CardTitle>
            <CardDescription>Describe the job in plain language. Rutex starts with supervised permissions and no external capabilities enabled.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-2" onSubmit={createDraft}>
              <div className="space-y-2">
                <Label htmlFor="worker-name">Worker name</Label>
                <Input id="worker-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Research Analyst" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="worker-scope">Workspace owner</Label>
                <Select value={organizationId} onValueChange={setOrganizationId}>
                  <SelectTrigger id="worker-scope"><SelectValue placeholder="Choose owner scope" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal workspace</SelectItem>
                    {organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>{organization.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="worker-purpose">What job should this worker do?</Label>
                <Textarea id="worker-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={1200} rows={3} placeholder="Describe the outcome, responsibilities and what a good result looks like." required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="worker-description">Short description (optional)</Label>
                <Textarea id="worker-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={2} placeholder="A short summary shown in the worker registry." />
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Create draft
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={saving}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent className="flex items-start gap-3 p-4">
            <ShieldCheck className="mt-1 h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Approval-first autonomy</p>
              <p className="text-sm text-muted-foreground">Consequential actions require approval in the worker contract.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          <CardContent className="flex items-start gap-3 p-4">
            <ClipboardList className="mt-1 h-5 w-5 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Dedicated workspaces</p>
              <p className="text-sm text-muted-foreground">Each worker has its own definition, permissions and lifecycle.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your workers</h2>
          <span className="text-sm text-muted-foreground">{workers.length} shown</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-border/60 py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading workers…
          </div>
        ) : workers.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-card/40">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <Bot className="h-10 w-10 text-muted-foreground" />
              <div className="space-y-1">
                <h3 className="font-semibold">No workers yet</h3>
                <p className="max-w-md text-sm text-muted-foreground">Create your first draft. The Director-driven research, build and task execution stages will be connected next.</p>
              </div>
              <Button variant="outline" onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Create worker draft</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workers.map((worker) => (
              <Card key={worker.id} className="border-border/60 bg-card/70 backdrop-blur-xl">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{worker.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">{worker.description || "No description yet."}</CardDescription>
                    </div>
                    <Badge variant={worker.status === "active" ? "default" : "secondary"}>{worker.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{worker.organization_id ? "Organization worker" : "Personal worker"}</span>
                    <span>v{worker.version}</span>
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => navigate(`/workers/${worker.id}`)}>
                    Open workspace <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
