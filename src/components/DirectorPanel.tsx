/**
 * DirectorPanel — talk to the Director.
 *
 * The morning-brief and build tabs are gone: the chat IS the interface.
 * It welcomes, answers from live rows, proposes actions, and executes the
 * grant-gated ones — drafts link to the Builder, approval stays human.
 * Standing grants collapsed into the corner key button: tap to review
 * what the Director may do solo, tap back to keep talking.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DirectorChat } from "@/components/DirectorChat";
import { GRANT_SCOPES, useDirectorGrants, type GrantScope } from "@/lib/directorGrants";
import { ArrowLeft, KeyRound } from "lucide-react";

export function DirectorPanel({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | undefined;
}) {
  const [view, setView] = useState<"chat" | "grants">("chat");
  const navigate = useNavigate();
  const { grants, available, setGrant, check } = useDirectorGrants(userId, open);
  const [saving, setSaving] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setView("chat"); } }}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg" aria-label="Director chat">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {view === "grants" && (
                <button
                  onClick={() => setView("chat")}
                  aria-label="Back to chat"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <DialogTitle>{view === "grants" ? "Standing grants" : "Director"}</DialogTitle>
            </div>
            {view === "chat" && (
              <button
                onClick={() => setView("grants")}
                aria-label="Review standing grants"
                title="What the Director may do solo"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        {view === "grants" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
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
            <button
              onClick={() => { onClose(); navigate("/director-lab"); }}
              className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Open Director lab (cursor playground — touches nothing)
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: "50vh" }}>
            <DirectorChat
              userId={userId}
              check={check}
              onNeedGrant={() => setView("grants")}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
