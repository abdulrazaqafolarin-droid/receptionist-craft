/**
 * DirectorPanel — talk to the Director.
 *
 * Renders INLINE in the dashboard flow (like Manage Operator), never as
 * a modal: opening the chat pushes content down instead of covering it.
 * The chat IS the interface — welcomes, answers from live rows, proposes
 * actions, executes the grant-gated ones. Standing grants and the key
 * vault collapse into header buttons; tap back to keep talking.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DirectorChat } from "@/components/DirectorChat";
import { VaultPanel } from "@/components/VaultPanel";
import { DevicesPanel } from "@/components/DevicesPanel";
import { GRANT_SCOPES, useDirectorGrants, type GrantScope } from "@/lib/directorGrants";
import { ArrowLeft, ChevronUp, KeyRound, Lock, MonitorSmartphone, MousePointer2 } from "lucide-react";

export function DirectorPanel({
  onClose,
  userId,
}: {
  onClose: () => void;
  userId: string | undefined;
}) {
  const [view, setView] = useState<"chat" | "grants" | "keys" | "devices">("chat");
  const navigate = useNavigate();
  const { grants, available, setGrant, check } = useDirectorGrants(userId, true);
  const [saving, setSaving] = useState<string | null>(null);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/60 p-4 sm:p-5" aria-label="Director chat">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {view !== "chat" && (
              <button
                onClick={() => setView("chat")}
                aria-label="Back to chat"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <p className="text-sm font-semibold">{view === "grants" ? "Standing grants" : view === "keys" ? "Key vault" : view === "devices" ? "Computers" : "Director"}</p>
            {/* Cursor perch: the Director cursor's small home on its own chat. */}
            <span
              data-actor="director-cursor-home"
              title="The Director cursor rests here between jobs"
              className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/60 text-muted-foreground"
              aria-hidden="true"
            >
              <MousePointer2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="flex gap-1">
            {view === "chat" && (
              <>
                <button
                  onClick={() => setView("keys")}
                  aria-label="API key vault"
                  title="Provider keys — encrypted, this account only"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Lock className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("devices")}
                  aria-label="Paired computers"
                  title="Computers the Director may drive when you ask"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MonitorSmartphone className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView("grants")}
                  aria-label="Review standing grants"
                  title="What the Director may do solo"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              </>
            )}
            <button
              onClick={() => { onClose(); setView("chat"); }}
              aria-label="Hide Director chat"
              title="Hide chat"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>
        </div>

        {view === "keys" ? (
          <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: "50vh" }}>
            <VaultPanel />
          </div>
        ) : view === "devices" ? (
          <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: "50vh" }}>
            <DevicesPanel />
          </div>
        ) : view === "grants" ? (
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
          <div className="flex min-h-0 flex-col" style={{ height: "62vh", maxHeight: "620px", minHeight: "420px" }}>
            <DirectorChat
              userId={userId}
              check={check}
              onNeedGrant={() => setView("grants")}
            />
          </div>
        )}
    </div>
  );
}
