import { useMemo, useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/currency";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  Zap,
  Target,
  Users,
  Sparkles,
  AlertTriangle,
  Bot,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RevenueEngineProps {
  receptionistId: string;
  currentMode?: string;
  onModeChange?: (mode: string) => void;
}

interface ConversionStats {
  bookings: number;
  leads: number;
  orders: number;
  totalRevenue: number;
  currency: string;
}

interface MoneyModeConfig {
  enabled: boolean;
  threshold: number;
  lastSavedAt: string | null;
}

interface RuntimeMoneyModeState {
  baseMode: "support" | "booking" | "sales";
  effectiveMode: "support" | "booking" | "sales";
  threshold: number;
  holdTimerRemainingSec: number;
  lastAutoSwitchReason: string | null;
  updatedAt: string;
}

interface ModeTransitionEvent {
  at: string;
  fromMode: string | null;
  toMode: string | null;
  reason: string;
  source: "optimization_log" | "conversion_events";
}

interface TimelineBucket {
  label: string;
  count: number;
  reasons: string[];
}

const conversionData = [
  { day: "Mon", revenue: 1200, conversations: 34, bookings: 8 },
  { day: "Tue", revenue: 1850, conversations: 41, bookings: 12 },
  { day: "Wed", revenue: 980, conversations: 28, bookings: 6 },
  { day: "Thu", revenue: 2340, conversations: 55, bookings: 18 },
  { day: "Fri", revenue: 3100, conversations: 62, bookings: 24 },
  { day: "Sat", revenue: 2670, conversations: 48, bookings: 19 },
  { day: "Sun", revenue: 1440, conversations: 31, bookings: 10 },
];

const funnelData = [
  { stage: "Visitors", value: 1240, pct: 100 },
  { stage: "Engaged", value: 744, pct: 60 },
  { stage: "Intent", value: 372, pct: 30 },
  { stage: "Converted", value: 149, pct: 12 },
];

const meoAlerts = [
  { id: 1, type: "lost", msg: "3 hot buyers left without booking", amount: "£840", time: "2h ago" },
  { id: 2, type: "suggest", msg: "Add deposit request - reduces no-shows 40%", amount: "+£220/wk", time: "AI tip" },
  { id: 3, type: "lost", msg: "Missed 7 leads after hours yesterday", amount: "£1,260", time: "Yesterday" },
];

const liveConversations = [
  { id: 1, name: "Sarah M.", intent: 9, status: "HOT", msg: "I'd like to book for next Tuesday", time: "now", mode: "money" },
  { id: 2, name: "James O.", intent: 6, status: "WARM", msg: "What are your prices for whitening?", time: "2m", mode: "booking" },
  { id: 3, name: "Aisha K.", intent: 3, status: "COLD", msg: "Just browsing for now", time: "5m", mode: "support" },
];

const statusClass: Record<string, string> = {
  HOT: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  WARM: "bg-cyan-500/15 text-cyan-600 border-cyan-500/30",
  COLD: "bg-muted text-muted-foreground border-border",
};

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-emerald-600">{sub}</div> : null}
    </div>
  );
}

interface TooltipPayloadEntry {
  color?: string;
  name?: string;
  value?: number | string;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover p-3 text-xs shadow">
      <div className="mb-1 font-semibold text-muted-foreground">{label}</div>
      {payload.map((p, i) => (
        <div key={`${p.name}-${i}`} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.name === "revenue" ? `£${Number(p.value).toLocaleString()}` : p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueEngine({ receptionistId, currentMode = "booking", onModeChange }: RevenueEngineProps) {
  const [aiMode, setAiMode] = useState<"support" | "booking" | "sales">(currentMode as "support" | "booking" | "sales");
  const [loading, setLoading] = useState(false);
  const [moneyModeConfig, setMoneyModeConfig] = useState<MoneyModeConfig>({
    enabled: aiMode === "sales",
    threshold: 7,
    lastSavedAt: null,
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [conversionStats, setConversionStats] = useState<ConversionStats>({
    bookings: 0,
    leads: 0,
    orders: 0,
    totalRevenue: 0,
    currency: "USD",
  });
  const [runtimeState, setRuntimeState] = useState<RuntimeMoneyModeState | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [modeTransitions, setModeTransitions] = useState<ModeTransitionEvent[]>([]);

  const loadConversionStats = useCallback(async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("conversion_events")
        .select("event_type, revenue_value, currency")
        .eq("receptionist_id", receptionistId)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;

      setConversionStats({
        bookings: data?.filter((e) => e.event_type === "booking_completed").length || 0,
        leads: data?.filter((e) => e.event_type === "lead_captured").length || 0,
        orders: data?.filter((e) => e.event_type === "order_completed").length || 0,
        totalRevenue: data?.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) || 0,
        currency: data?.[0]?.currency || "USD",
      });
    } catch (error) {
      console.error("Error loading conversion stats:", error);
    }
  }, [receptionistId]);

  const loadMoneyModeConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { data, error } = await supabase
        .from("receptionists")
        .select("ai_mode, capabilities")
        .eq("id", receptionistId)
        .maybeSingle();
      if (error) throw error;

      const capabilities = (data?.capabilities as Record<string, unknown> | null) || {};
      const enabled =
        typeof capabilities.money_mode_enabled === "boolean"
          ? capabilities.money_mode_enabled
          : data?.ai_mode === "sales";
      const threshold =
        typeof capabilities.money_mode_threshold === "number"
          ? Math.max(1, Math.min(10, capabilities.money_mode_threshold))
          : 7;

      setMoneyModeConfig({
        enabled,
        threshold,
        lastSavedAt: null,
      });
      if (data?.ai_mode) {
        setAiMode(data.ai_mode as "support" | "booking" | "sales");
      }
      setConfigDirty(false);
    } catch (error) {
      console.error("Error loading money mode config:", error);
    } finally {
      setConfigLoading(false);
    }
  }, [receptionistId]);

  useEffect(() => {
    loadConversionStats();
  }, [loadConversionStats]);

  useEffect(() => {
    loadMoneyModeConfig();
  }, [loadMoneyModeConfig]);

  const loadRuntimeState = useCallback(async () => {
    setRuntimeLoading(true);
    try {
      const { data, error } = await supabase
        .from("receptionists")
        .select("ai_mode, capabilities")
        .eq("id", receptionistId)
        .maybeSingle();
      if (error) throw error;
      const capabilities = (data?.capabilities as Record<string, unknown> | null) || {};
      const parseMode = (value: unknown, fallback: "support" | "booking" | "sales") =>
        value === "support" || value === "booking" || value === "sales" ? value : fallback;
      const persistedMode = parseMode(data?.ai_mode, "booking");
      const baseMode = parseMode(capabilities.money_mode_base_mode, persistedMode);
      const effectiveMode = parseMode(capabilities.money_mode_effective_mode, persistedMode);
      const threshold =
        typeof capabilities.money_mode_runtime_threshold === "number"
          ? Math.max(1, Math.min(10, capabilities.money_mode_runtime_threshold))
          : typeof capabilities.money_mode_threshold === "number"
            ? Math.max(1, Math.min(10, capabilities.money_mode_threshold))
            : 7;
      const holdUntil =
        typeof capabilities.money_mode_hold_until === "string"
          ? new Date(capabilities.money_mode_hold_until).getTime()
          : null;
      const holdFromServer =
        typeof capabilities.money_mode_hold_seconds_remaining === "number"
          ? Math.max(0, Math.round(capabilities.money_mode_hold_seconds_remaining))
          : null;
      const computedHold =
        holdUntil && Number.isFinite(holdUntil) ? Math.max(0, Math.round((holdUntil - Date.now()) / 1000)) : 0;
      const holdTimerRemainingSec = holdFromServer ?? computedHold;
      const lastAutoSwitchReason =
        typeof capabilities.money_mode_last_auto_switch_reason === "string"
          ? capabilities.money_mode_last_auto_switch_reason
          : typeof capabilities.money_mode_last_switch_reason === "string"
            ? capabilities.money_mode_last_switch_reason
            : null;

      setRuntimeState({
        baseMode,
        effectiveMode,
        threshold,
        holdTimerRemainingSec,
        lastAutoSwitchReason,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error loading money mode runtime:", error);
    } finally {
      setRuntimeLoading(false);
    }
  }, [receptionistId]);

  const loadModeTransitions = useCallback(async () => {
    try {
      const lookback = new Date();
      lookback.setDate(lookback.getDate() - 7);

      const [{ data: optimizationRows, error: optimizationError }, { data: conversionRows, error: conversionError }] = await Promise.all([
        supabase
          .from("optimization_log")
          .select("created_at, action, decision_reason, metadata")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", lookback.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("conversion_events")
          .select("created_at, event_type, metadata")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", lookback.toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (optimizationError) throw optimizationError;
      if (conversionError) throw conversionError;

      const fromOptimization: ModeTransitionEvent[] = (optimizationRows || [])
        .map((row) => {
          const metadata = (row.metadata as Record<string, unknown> | null) || {};
          const fromMode = typeof metadata.from_mode === "string" ? metadata.from_mode : null;
          const toMode = typeof metadata.to_mode === "string" ? metadata.to_mode : null;
          const reason = row.decision_reason || `Optimization action: ${row.action}`;
          if (!fromMode && !toMode && !reason.toLowerCase().includes("mode")) return null;
          return {
            at: row.created_at,
            fromMode,
            toMode,
            reason,
            source: "optimization_log" as const,
          };
        })
        .filter((entry): entry is ModeTransitionEvent => Boolean(entry));

      const fromConversion: ModeTransitionEvent[] = (conversionRows || [])
        .map((row) => {
          const metadata = (row.metadata as Record<string, unknown> | null) || {};
          const fromMode = typeof metadata.from_mode === "string" ? metadata.from_mode : null;
          const toMode = typeof metadata.to_mode === "string" ? metadata.to_mode : null;
          const reason = typeof metadata.mode_switch_reason === "string" ? metadata.mode_switch_reason : null;
          if (!fromMode && !toMode && !reason) return null;
          return {
            at: row.created_at,
            fromMode,
            toMode,
            reason: reason || `Conversion event: ${row.event_type}`,
            source: "conversion_events" as const,
          };
        })
        .filter((entry): entry is ModeTransitionEvent => Boolean(entry));

      const merged = [...fromOptimization, ...fromConversion].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
      );
      setModeTransitions(merged);
    } catch (error) {
      console.error("Error loading mode transitions:", error);
      setModeTransitions([]);
    }
  }, [receptionistId]);

  useEffect(() => {
    loadRuntimeState();
    loadModeTransitions();
  }, [loadRuntimeState, loadModeTransitions]);

  const saveMoneyModeConfig = async () => {
    setConfigLoading(true);
    try {
      const { data, error: readErr } = await supabase
        .from("receptionists")
        .select("capabilities")
        .eq("id", receptionistId)
        .maybeSingle();
      if (readErr) throw readErr;

      const capabilities = (data?.capabilities as Record<string, unknown> | null) || {};
      const updatedCapabilities = {
        ...capabilities,
        money_mode_enabled: moneyModeConfig.enabled,
        money_mode_threshold: moneyModeConfig.threshold,
      };

      const { error: writeErr } = await supabase
        .from("receptionists")
        .update({ capabilities: updatedCapabilities })
        .eq("id", receptionistId);
      if (writeErr) throw writeErr;

      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMoneyModeConfig((prev) => ({ ...prev, lastSavedAt: stamp }));
      setConfigDirty(false);
      toast.success("Money Mode settings saved");
    } catch (error) {
      console.error("Error saving money mode config:", error);
      toast.error("Failed to save Money Mode settings");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleModeChange = async (newMode: "support" | "booking" | "sales") => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("receptionists")
        .update({ ai_mode: newMode })
        .eq("id", receptionistId);

      if (error) throw error;

      setAiMode(newMode);
      onModeChange?.(newMode);
      await loadRuntimeState();
      await loadModeTransitions();
      toast.success(`Switched to ${newMode === "sales" ? "Money Mode" : `${newMode} mode`}`);
    } catch (error) {
      console.error("Error updating AI mode:", error);
      toast.error("Failed to update AI mode");
    } finally {
      setLoading(false);
    }
  };

  const weekRevenue = useMemo(() => conversionData.reduce((sum, d) => sum + d.revenue, 0), []);
  const leakedRevenue = 2720;
  const fmtCurrency = (amount: number, cur: string) => formatCurrency(amount, cur);
  const formatSeconds = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  const timelineBuckets = useMemo<TimelineBucket[]>(() => {
    if (!modeTransitions.length) return [];
    const map = new Map<string, TimelineBucket>();
    modeTransitions.forEach((event) => {
      const ts = new Date(event.at);
      ts.setMinutes(0, 0, 0);
      const hour = ts.getHours();
      ts.setHours(hour - (hour % 6));
      const key = ts.toISOString();
      const label = ts.toLocaleString([], { month: "short", day: "numeric", hour: "numeric" });
      if (!map.has(key)) {
        map.set(key, { label, count: 0, reasons: [] });
      }
      const bucket = map.get(key)!;
      bucket.count += 1;
      if (!bucket.reasons.includes(event.reason)) {
        bucket.reasons.push(event.reason);
      }
    });
    return Array.from(map.values()).slice(0, 12);
  }, [modeTransitions]);

  return (
    <Card className="border-2 border-border/50 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-border/50">
        <CardTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1">
            Revenue Engine
            {moneyModeConfig.enabled ? (
              <Badge className="ml-2 bg-amber-500 text-white">
                <Zap className="mr-1 h-3 w-3" /> Money Mode
              </Badge>
            ) : null}
          </div>
        </CardTitle>
        <CardDescription>
          Money mode controls + MEO analytics + live conversion intelligence
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-6">
        <Tabs defaultValue="dashboard" className="space-y-5">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="moneymode">Money Mode</TabsTrigger>
            <TabsTrigger value="meo">MEO</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue This Week" value={`£${weekRevenue.toLocaleString()}`} sub="↑ 23% vs last week" />
              <StatTile icon={<Target className="h-4 w-4" />} label="Conversions" value={`${conversionStats.bookings + conversionStats.orders}`} sub="Money mode assisted" />
              <StatTile icon={<Users className="h-4 w-4" />} label="Conversations" value={`${conversionData.reduce((s, d) => s + d.conversations, 0)}`} />
              <StatTile icon={<Sparkles className="h-4 w-4" />} label="AI Revenue (30d)" value={fmtCurrency(conversionStats.totalRevenue, conversionStats.currency)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">LIVE: 30d revenue + conversion counts</Badge>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">DEMO: weekly trend + funnel + live feed</Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 text-sm font-semibold">Revenue trend</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={conversionData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 text-sm font-semibold">Conversion funnel</div>
                <div className="space-y-3">
                  {funnelData.map((item) => (
                    <div key={item.stage}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{item.stage}</span>
                        <span className="font-semibold">{item.value} · {item.pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary/70" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Live conversations</div>
                <Badge variant="outline">{liveConversations.length} active</Badge>
              </div>
              <div className="space-y-2">
                {liveConversations.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <Badge className={statusClass[c.status] || statusClass.COLD}>{c.status}</Badge>
                    </div>
                    <div className="mb-2 truncate text-xs text-muted-foreground">{c.msg}</div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-amber-500" style={{ width: `${c.intent * 10}%` }} />
                      </div>
                      <div className="w-10 text-right text-xs font-semibold">{c.intent}/10</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="moneymode" className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Money Mode activation</div>
                  <div className="text-xs text-muted-foreground">Auto-switch to sales mode by intent score</div>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="money-mode-switch" className="text-xs">Enabled</Label>
                  <Switch
                    id="money-mode-switch"
                    checked={moneyModeConfig.enabled}
                    onCheckedChange={(value) => {
                      setMoneyModeConfig((prev) => ({ ...prev, enabled: value }));
                      setConfigDirty(true);
                    }}
                    disabled={configLoading}
                  />
                </div>
              </div>

              <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 text-xs text-muted-foreground">Intent threshold (1-10)</div>
                <div className="flex items-center gap-3">
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[moneyModeConfig.threshold]}
                    onValueChange={(v) => {
                      setMoneyModeConfig((prev) => ({ ...prev, threshold: v[0] || 7 }));
                      setConfigDirty(true);
                    }}
                    className="flex-1"
                  />
                  <Badge variant="outline">{moneyModeConfig.threshold}</Badge>
                </div>
              </div>

              <div className="mb-4 rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Runtime state (server)</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={loadRuntimeState} disabled={runtimeLoading}>
                    {runtimeLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded border bg-background/70 p-2"><span className="text-muted-foreground">Base mode:</span> <span className="font-semibold capitalize">{runtimeState?.baseMode || "—"}</span></div>
                  <div className="rounded border bg-background/70 p-2"><span className="text-muted-foreground">Effective mode:</span> <span className="font-semibold capitalize">{runtimeState?.effectiveMode || "—"}</span></div>
                  <div className="rounded border bg-background/70 p-2"><span className="text-muted-foreground">Threshold:</span> <span className="font-semibold">{runtimeState?.threshold ?? "—"}</span></div>
                  <div className="rounded border bg-background/70 p-2"><span className="text-muted-foreground">Hold timer remaining:</span> <span className="font-semibold">{runtimeState ? formatSeconds(runtimeState.holdTimerRemainingSec) : "—"}</span></div>
                  <div className="rounded border bg-background/70 p-2 sm:col-span-2"><span className="text-muted-foreground">Last auto-switch reason:</span> <span className="font-semibold">{runtimeState?.lastAutoSwitchReason || "No server reason available"}</span></div>
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/20 p-3 text-xs">
                <div className="text-muted-foreground">
                  {moneyModeConfig.lastSavedAt
                    ? `Saved at ${moneyModeConfig.lastSavedAt}`
                    : "Not saved yet in this session"}
                </div>
                <Button size="sm" onClick={saveMoneyModeConfig} disabled={configLoading || !configDirty}>
                  {configLoading ? "Saving..." : "Save settings"}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Button variant={aiMode === "support" ? "default" : "outline"} onClick={() => handleModeChange("support")} disabled={loading}>Support</Button>
                <Button variant={aiMode === "booking" ? "default" : "outline"} onClick={() => handleModeChange("booking")} disabled={loading}>Booking</Button>
                <Button variant={aiMode === "sales" ? "default" : "outline"} onClick={() => handleModeChange("sales")} disabled={loading}>Sales / Money</Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" /> Directives preview</div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>• Recommend one clear next action.</li>
                <li>• Capture contact before ending conversation.</li>
                <li>• Reduce options and guide to close when intent ≥ {moneyModeConfig.threshold}.</li>
                <li>• If hesitation appears repeatedly, introduce urgency.</li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="meo" className="space-y-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">Revenue leaked this week</div>
              <div className="font-mono text-4xl font-bold text-red-500">£{leakedRevenue.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Across missed leads, abandoned flows and lost upsells.</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => (window.location.href = "/conversations")}>
                Review conversations
              </Button>
              <Button size="sm" variant="outline" onClick={() => (window.location.href = "/analytics")}>
                Open analytics
              </Button>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">AI revenue intelligence feed</div>
              <div className="space-y-2">
                {meoAlerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-xs">
                    <div>
                      <div className="font-semibold">{alert.msg}</div>
                      <div className="text-muted-foreground">{alert.time}</div>
                    </div>
                    <Badge className={alert.type === "lost" ? "bg-red-500/20 text-red-600 border-red-500/30" : "bg-emerald-500/20 text-emerald-600 border-emerald-500/30"}>
                      {alert.amount}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Conversation-to-cash scoring</div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={conversionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-3 flex items-center justify-between gap-3 font-semibold">
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Mode transition audit timeline</div>
                <Button size="sm" variant="outline" onClick={loadModeTransitions}>Refresh timeline</Button>
              </div>
              {timelineBuckets.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">No mode transition events found in the selected interval.</div>
              ) : (
                <div className="space-y-2">
                  {timelineBuckets.map((bucket) => (
                    <div key={bucket.label} className="rounded-md border bg-muted/20 p-3 text-xs">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="font-semibold text-foreground">{bucket.label} (6h bucket)</div>
                        <Badge variant="outline">{bucket.count} transitions</Badge>
                      </div>
                      <ul className="space-y-1 text-muted-foreground">
                        {bucket.reasons.slice(0, 3).map((reason) => (
                          <li key={reason}>• {reason}</li>
                        ))}
                        {bucket.reasons.length > 3 ? <li>• +{bucket.reasons.length - 3} more reasons</li> : null}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> UI / UX production audit</div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Critical:</strong> Money mode is currently manual-first. Intent-threshold persistence is still pending backend wiring.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Required:</strong> Add server-derived MEO metrics (revenue leak by reason) in place of placeholder data.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Done:</strong> Mode switching + conversion attribution + revenue chart surface are now in one operator panel.</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
