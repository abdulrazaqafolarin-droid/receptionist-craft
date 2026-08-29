import { useEffect, useState } from "react";
import {
  RotateCcw,
  CheckCircle2,
  FileText,
  Sparkles,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export interface ConfigVersion {
  id: string;
  version_number: number;
  change_source: string;
  owner_input: string | null;
  plan_text: string | null;
  created_at: string;
  approved_at: string | null;
}

interface VersionHistoryProps {
  receptionistId: string;
  /** Highest version_number — the one currently live. */
  currentVersion?: number;
  /** Called after a successful revert so parents can refresh state. */
  onReverted?: (targetVersion: number, newVersion: number) => void;
  compact?: boolean;
}

const CHANGE_SOURCE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  owner_change: "Owner change",
  owner_revert: "Revert",
  auto_revert: "Auto revert",
  platform_update: "Platform update",
};

function changeSourceLabel(source: string) {
  return CHANGE_SOURCE_LABELS[source] || source;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Reusable version-history timeline for a receptionist — the "everything
 * that's ever changed" home (§5.4). Append-only history of every config
 * version (config_versions is never mutated in place; reverts get a NEW
 * version number). Highlights the current live version and offers a one-tap
 * Revert per version with a confirmation gate, since reverting touches the
 * live operator.
 */
export function VersionHistory({
  receptionistId,
  currentVersion,
  onReverted,
  compact = false,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfigVersion | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("config_versions" as any)
      .select(
        "id, version_number, change_source, owner_input, plan_text, created_at, approved_at",
      )
      .eq("receptionist_id", receptionistId)
      .order("version_number", { ascending: false })
      .limit(100);
    setVersions((data as unknown as ConfigVersion[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receptionistId]);

  const liveVersion = currentVersion ?? versions[0]?.version_number;

  async function doRevert(target: ConfigVersion) {
    setConfirmTarget(null);
    setReverting(target.version_number);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc("revert_config_version" as any, {
        p_receptionist_id: receptionistId,
        p_target_version: target.version_number,
      });
      if (error) throw error;

      const result = (data as any) || {};
      if (result.ok === false) throw new Error(result.error || "Failed to revert");

      toast.success(
        `Reverted to version ${target.version_number}. New version ${result.new_version} is now live.`,
      );
      await load();
      onReverted?.(target.version_number, result.new_version);
    } catch (err: any) {
      toast.error(err.message || "Failed to revert");
    } finally {
      setReverting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading version history…
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed p-10 text-center text-muted-foreground">
        <RotateCcw className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No changes recorded yet.</p>
        <p className="text-xs mt-1">
          Every approved change will be saved here with a snapshot you can roll back to.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${compact ? "" : "max-h-[32rem] overflow-auto pr-1"}`}>
      {versions.map((v) => {
        const isLive = v.version_number === liveVersion;
        return (
          <div
            key={v.id}
            className={`flex items-start gap-3 rounded-lg border p-3 ${
              isLive
                ? "border-primary/40 bg-primary/5"
                : "border-border/60 bg-card"
            }`}
          >
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  isLive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {v.version_number}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-sm">Version {v.version_number}</span>
                {isLive && (
                  <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                    <CheckCircle2 className="h-3 w-3" /> Live
                  </Badge>
                )}
                {v.change_source === "owner_revert" && (
                  <Badge variant="outline" className="text-amber-600 gap-1">
                    <RotateCcw className="h-3 w-3" /> {changeSourceLabel(v.change_source)}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {formatDate(v.created_at)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground mt-0.5">
                {changeSourceLabel(v.change_source)}
                {v.approved_at ? " · approved" : ""}
              </p>

              {v.owner_input && (
                <p className="mt-1 text-sm italic text-foreground/80">“{v.owner_input}”</p>
              )}
              {v.plan_text && !v.owner_input && (
                <details className="mt-1 group">
                  <summary className="flex items-center gap-1.5 text-xs text-primary cursor-pointer">
                    <FileText className="h-3 w-3" /> Plan summary
                  </summary>
                  <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                    {v.plan_text}
                  </p>
                </details>
              )}

              {!isLive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1 text-xs"
                  onClick={() => setConfirmTarget(v)}
                  disabled={reverting === v.version_number}
                >
                  {reverting === v.version_number ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Revert to this version
                </Button>
              )}
              {isLive && (
                <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Currently running on the live operator.
                </p>
              )}
            </div>
          </div>
        );
      })}

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Revert to version {confirmTarget?.version_number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This restores the live operator to this older configuration. It is saved as a new
              version, so you can always revert back. Approved changes made after this version
              will no longer be live.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmTarget) doRevert(confirmTarget);
              }}
            >
              Revert operator
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
