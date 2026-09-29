import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Gauge, Split, Timer, LifeBuoy, CheckCircle2 } from "lucide-react";

type SignalRow = {
  id: string;
  user_id: string;
  signal: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const MIN = 1000 * 60;

function fmtMinutes(ms: number): string {
  if (!ms || ms <= 0 || !isFinite(ms)) return "—";
  if (ms < MIN) return "< 1 min";
  const mins = Math.round(ms / MIN);
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `~${h}h ${m}m` : `~${h}h`;
}

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="mb-1 text-muted-foreground">{icon}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-2xl font-bold leading-none">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function SuccessSignalsCard() {
  const [forkTotal, setForkTotal] = useState(0);
  const [forkConv, setForkConv] = useState(0);
  const [navHelp, setNavHelp] = useState(0);
  const [timeToConfigured, setTimeToConfigured] = useState<number | null>(null);
  const [configuredCount, setConfiguredCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const table = supabase.from("success_signals" as never);
        const q = table.select("id,user_id,signal,payload,created_at");
        const { data: rows, error } = await (
          q as unknown as Promise<{ data: SignalRow[] | null; error: { message: string } | null }>
        ).catch(() => ({ data: null, error: { message: "query failed" as string } }));

        if (error || !rows) {
          console.error("SuccessSignalsCard load error:", error?.message);
          return;
        }

        const conv = rows.filter((r) => r.signal === "onboarding_path_chosen" && r.payload?.path === "conversational").length;
        const total = rows.filter((r) => r.signal === "onboarding_path_chosen").length;
        const nav = rows.filter((r) => r.signal === "navigation_help").length;
        const configured = rows
          .filter((r) => r.signal === "configured_operator")
          .sort((a, b) => a.created_at.localeCompare(b.created_at));

        setForkTotal(total);
        setForkConv(conv);
        setNavHelp(nav);
        setConfiguredCount(configured.length);

        // Baseline: when the profile was created, to measure time-to-configured.
        const { data: profile } = await supabase
          .from("profiles")
          .select("created_at")
          .eq("id", user.id)
          .maybeSingle();
        const baseline = profile?.created_at ? new Date(profile.created_at as string).getTime() : null;

        let totalMs = 0;
        let n = 0;
        if (baseline) {
          for (const c of configured) {
            const t = new Date(c.created_at).getTime();
            if (t >= baseline) {
              totalMs += t - baseline;
              n++;
            }
          }
        }
        if (n > 0) setTimeToConfigured(totalMs / n);

        if (!cancelled) setReady(true);
      } catch (err) {
        console.error("SuccessSignalsCard:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const convPct =
    forkTotal > 0 ? `${Math.round((forkConv / forkTotal) * 100)}%` : "—";
  const convSub =
    forkTotal > 0 ? `${forkConv} conversational / ${forkTotal - forkConv} form` : "No signups yet";

  return (
    <Card className="glass-1 overflow-hidden">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Gauge className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Success Signals</div>
            <div className="text-xs font-normal text-muted-foreground">
              How new owners are doing with the redesigned setup
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          Feed from the redesign's checkable signals (§5.3). These are captured live as owners set up.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {!ready ? (
          <div className="text-sm text-muted-foreground">Loading signals…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              icon={<Split className="h-4 w-4" />}
              label="Conversational choice"
              value={convPct}
              sub={convSub}
            />
            <Metric
              icon={<Timer className="h-4 w-4" />}
              label="Avg time to configured"
              value={timeToConfigured !== null ? fmtMinutes(timeToConfigured) : "—"}
              sub={configuredCount > 0 ? `${configuredCount} configured` : "No one configured yet"}
            />
            <Metric
              icon={<LifeBuoy className="h-4 w-4" />}
              label="Help questions opened"
              value={String(navHelp)}
              sub="Navigation support signal"
            />
            <Metric
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              label="Fully configured"
              value={String(configuredCount)}
              sub="Reached a live operator"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
