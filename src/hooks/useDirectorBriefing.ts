/**
 * useDirectorBriefing — gathers the morning brief from live rows.
 *
 * One query fan-out across the owner's operators (bookings, escalations,
 * stock, jobs, connectors) plus in-memory task counts from capabilities.
 * Every number is a real count; failures degrade to an honest partial
 * brief, never to invented lines. See directorBrief.assembleBriefing
 * for the pure assembly (unit-tested).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { assembleBriefing, type BriefLine, type BriefingInput } from "@/lib/directorBrief";

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface OperatorRow {
  id: string;
  business_name: string | null;
  name: string | null;
  business_model: string | null;
  capabilities: unknown;
}

export function useDirectorBriefing(userId: string | undefined, enabled: boolean) {
  const [lines, setLines] = useState<BriefLine[] | null>(null);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: recs } = await supabase
          .from("receptionists")
          .select("id,business_name,name,business_model,capabilities")
          .eq("user_id", userId);
        const operators = ((recs || []) as unknown) as OperatorRow[];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + 30);
        const hstr = dayStr(horizon);
        const todayStr = dayStr(new Date());

        const perOp = await Promise.all(
          operators.map(async (op) => {
            const [apptRes, escRes, stockRes] = await Promise.all([
              supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).gte("start_time", today.toISOString()),
              supabase.from("escalations").select("*", { count: "exact", head: true }).eq("receptionist_id", op.id).is("resolved_at", null),
              supabase.from("services").select("stock_quantity,low_stock_threshold,expiry_date").eq("receptionist_id", op.id).eq("active", true).not("stock_quantity", "is", null),
            ]);
            const rows = (((stockRes as { data?: unknown }).data || []) as unknown) as Array<{
              stock_quantity: number | null; low_stock_threshold: number | null; expiry_date: string | null;
            }>;
            let stockNeeds = 0;
            for (const row of rows) {
              const qty = row.stock_quantity ?? 0;
              if (qty <= 0 || qty <= (row.low_stock_threshold ?? 5)) { stockNeeds++; continue; }
              if (row.expiry_date && row.expiry_date <= hstr) stockNeeds++;
            }
            const caps = ((op.capabilities || {}) as Record<string, unknown>);
            const kind = typeof caps.operator_kind === "string" ? caps.operator_kind : null;
            const tasks = (Array.isArray(caps.ops_tasks) ? caps.ops_tasks : []) as Array<{ due?: string; done?: boolean }>;
            return {
              id: op.id,
              business_name: op.business_name,
              name: op.name,
              business_model: op.business_model,
              operator_kind: kind,
              upcomingBookings: (apptRes as { count?: number }).count || 0,
              openEscalations: (escRes as { count?: number }).count || 0,
              stockNeeds,
              overdueTasks: tasks.filter((t) => !t.done && t.due && t.due <= todayStr).length,
            };
          }),
        );

        const [jobsRes, connRes] = await Promise.all([
          // Generated DB types lag behind migrations (never-edit file).
          ((supabase.from as unknown as (t: string) => {
            select(s: string): { in(c: string, v: string[]): Promise<{ data: unknown }> };
          })("plan_jobs")).select("status").in(
            "receptionist_id",
            operators.map((o) => o.id),
          ),
          supabase.from("connectors").select("display_name,status").eq("user_id", userId),
        ]);
        const jobs = (((jobsRes as { data?: unknown }).data || []) as unknown) as Array<{ status: string }>;
        const conns = (((connRes as { data?: unknown }).data || []) as unknown) as Array<{ display_name: string; status: string }>;

        const input: BriefingInput = {
          operators: perOp,
          failedJobs: jobs.filter((j) => j.status === "failed").length,
          activeJobs: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
          connectorsNeedingAttention: conns
            .filter((c) => c.status === "error" || c.status === "expired")
            .map((c) => c.display_name),
        };
        if (!cancelled) setLines(assembleBriefing(input));
      } catch {
        if (!cancelled) setLines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  return lines;
}
