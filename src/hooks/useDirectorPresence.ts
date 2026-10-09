/**
 * useDirectorPresence — is the Director working right now, where anyone
 * can see it?
 *
 * Subscribes to the director_activity live signal (written by the sweep
 * around every visible autonomous action) and falls back to the latest
 * visible ledger row, so the buddy and the pill show autopilot work the
 * moment it happens — and what it just finished when you arrive late.
 *
 * Session-resolved: no userId prop needed, works at app level too.
 */

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresenceStep {
  type: string;
  target?: string;
  route?: string;
  say?: string;
  ms?: number;
}

export interface PresenceRun {
  id: string;
  label: string;
  steps: PresenceStep[];
  at: string;
}

export function useDirectorPresence(): {
  active: PresenceRun | null;
  lastDone: PresenceRun | null;
} {
  const [active, setActive] = useState<PresenceRun | null>(null);
  const [lastDone, setLastDone] = useState<PresenceRun | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const uid = user.id;

      // Catch-up: the newest row decides what the Director is doing —
      // a 'running' row means in flight, a 'done' row means just finished.
      try {
        const res = await (supabase.from as unknown as (t: string) => {
          select(s: string): {
            eq(c: string, v: string): {
              order(c: string, o: unknown): {
                limit(n: number): Promise<{ data: unknown }>;
              };
            };
          };
        })("director_activity")
          .select("id,phase,label,steps,created_at,action_id")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1);
        const rows = ((res.data || []) as unknown) as Array<{
          id: string; phase: string; label: string; steps: unknown; created_at: string; action_id: string | null;
        }>;
        const latest = rows[0];
        const toRun = (r: { id: string; label: string; steps: unknown; created_at: string }): PresenceRun => ({
          id: r.id,
          label: r.label,
          steps: Array.isArray(r.steps) ? (r.steps as PresenceStep[]) : [],
          at: r.created_at,
        });
        if (latest && latest.phase === "running") {
          activeIdRef.current = latest.action_id;
          if (!cancelled) setActive(toRun(latest));
        } else if (latest && latest.phase === "done") {
          if (!cancelled) setLastDone(toRun(latest));
        }
      } catch {
        // Presence degrades silently — the buddy keeps its own numbers.
      }

      // Live: every new activity row updates presence immediately.
      try {
        channel = supabase
          .channel(`director-presence:${uid}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "director_activity", filter: `user_id=eq.${uid}` },
            (payload: { new: { id: string; phase: string; label: string; steps: unknown; created_at: string; action_id: string | null } }) => {
              const row = payload.new;
              const run: PresenceRun = {
                id: row.id,
                label: row.label,
                steps: Array.isArray(row.steps) ? (row.steps as PresenceStep[]) : [],
                at: row.created_at,
              };
              if (row.phase === "running") {
                activeIdRef.current = row.action_id;
                setActive(run);
              } else {
                if (row.action_id && row.action_id === activeIdRef.current) {
                  activeIdRef.current = null;
                  setActive(null);
                }
                setLastDone(run);
              }
            },
          )
          .subscribe() as unknown as { unsubscribe: () => void };
      } catch {
        // Realtime unavailable — catch-up above still informed the buddy.
      }
    })();
    return () => {
      cancelled = true;
      try {
        channel?.unsubscribe();
      } catch {
        // teardown best-effort
      }
    };
  }, []);

  return { active, lastDone };
}
