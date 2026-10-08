/**
 * Recent guided activity — what the operator's cursor actually did lately.
 *
 * Reads actor_receipts (one row per completed tour). Renders nothing when
 * empty: an owner who never ran a tour should never see this panel.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface ReceiptRow {
  id: string;
  tour: string;
  ok: boolean;
  steps: number;
  failed_detail: string | null;
  created_at: string;
}

const TOUR_LABELS: Record<string, string> = {
  "connections-tour": "Connections tour",
  "walkthrough-google": "Google Reviews walkthrough",
  "console-tour": "Console tour",
  "builder-tour": "Builder tour",
  "whats-this": "What's-this answer",
  "ad-hoc": "Guided run",
};

export function GuidedActivity({ userId }: { userId: string | undefined }) {
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        // Generated DB types lag behind migrations (never-edit file).
        const table = (supabase.from as unknown as (t: string) => {
          select(s: string): {
            eq(c: string, v: unknown): {
              order(c: string, o?: unknown): {
                limit(n: number): Promise<{ data: unknown }>;
              };
            };
          };
        })("actor_receipts");
        const { data } = await table
          .select("id,tour,ok,steps,failed_detail,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);
        if (Array.isArray(data)) setRows(data as ReceiptRow[]);
      } catch {
        // panel stays hidden on failure
      }
    })();
  }, [userId]);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="mb-6 sm:mb-8" aria-label="Recent guided activity">
      <Card className="glass-1">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-2 text-sm font-semibold">Recent guided activity</div>
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-emerald-500" : "bg-amber-500"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">
                  {TOUR_LABELS[r.tour] || "Guided run"} · {r.steps} step{r.steps === 1 ? "" : "s"}
                  {!r.ok && r.failed_detail ? ` — stopped: ${r.failed_detail}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
