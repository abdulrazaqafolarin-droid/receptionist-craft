/**
 * DirectorPanel — the morning brief plus standing grants, behind one dialog.
 *
 * Opened by tapping the Director buddy. Brief tab: every line cites real
 * rows and links where to look; empty means all-clear, never filler.
 * Grants tab: what the Director may do solo — everything else always
 * comes back as a proposal. Deny-by-default when the grants table is
 * missing (migration pending): the tab says so instead of pretending.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDirectorBriefing } from "@/hooks/useDirectorBriefing";
import { GRANT_SCOPES, useDirectorGrants, type GrantScope } from "@/lib/directorGrants";
import { DirectorBuildTab } from "@/components/DirectorBuildTab";
import { Sunrise, KeyRound, Hammer } from "lucide-react";

export function DirectorPanel({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}) {
  const navigate = useNavigate();
  const lines = useDirectorBriefing(userId, open);
  const { grants, available, setGrant, check } = useDirectorGrants(userId, open);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState("brief");

  const go = (path: string | null) => {
    if (!path) return;
    onClose();
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" aria-label="Director briefing and grants">
        <DialogHeader>
          <DialogTitle>Director</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="brief" className="gap-1.5">
              <Sunrise className="h-3.5 w-3.5" aria-hidden="true" /> Morning brief
            </TabsTrigger>
            <TabsTrigger value="build" className="gap-1.5">
              <Hammer className="h-3.5 w-3.5" aria-hidden="true" /> Build
            </TabsTrigger>
            <TabsTrigger value="grants" className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> Standing grants
            </TabsTrigger>
          </TabsList>
          <TabsContent value="brief" className="mt-3">
            {lines === null && <p className="py-4 text-sm text-muted-foreground">Reading your businesses…</p>}
            {lines !== null && lines.length === 0 && (
              <p className="py-4 text-sm text-muted-foreground">All clear across every operator. Nothing needs you.</p>
            )}
            <ul className="space-y-2">
              {(lines || []).map((l, i) => (
                <li key={i}>
                  {l.path ? (
                    <button onClick={() => go(l.path)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary/5">
                      {l.text}
                    </button>
                  ) : (
                    <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{l.text}</p>
                  )}
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="build" className="mt-3">
            <DirectorBuildTab userId={userId} check={check} onNeedGrant={() => setTab("grants")} />
          </TabsContent>
          <TabsContent value="grants" className="mt-3">
            {!available && (
              <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                Standing grants activate with the next platform update. Until then, everything comes to you as a proposal — nothing moves solo.
              </p>
            )}
            <ul className="mt-2 space-y-2">
              {GRANT_SCOPES.map((s) => {
                const granted = grants.some((g) => g.scope === s.scope && g.allowed);
                return (
                  <li key={s.scope} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.impact}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={granted}
                      aria-label={`${s.title} grant`}
                      disabled={!available || saving === s.scope}
                      onClick={async () => {
                        setSaving(s.scope);
                        await setGrant(s.scope as GrantScope, !granted);
                        setSaving(null);
                      }}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${granted ? "bg-primary" : "bg-muted"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${granted ? "left-[22px]" : "left-0.5"}`}
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
