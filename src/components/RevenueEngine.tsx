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
  receptionistIds: string[];
  receptionistNames?: Record<string, string>;
  scopeLabel?: string;
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

interface TrendPoint {
  day: string;
  revenue: number;
  conversations: number;
  bookings: number;
}

interface FunnelPoint {
  stage: string;
  value: number;
  pct: number;
}

interface MEOAlert {
  id: string;
  type: "lost" | "suggest";
  msg: string;
  amount: string;
  time: string;
}

interface LiveConversation {
  id: string;
  name: string;
  intent: number;
  status: "HOT" | "WARM" | "COLD";
  msg: string;
  time: string;
  mode: string;
}

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

function getRelativeTimeLabel(isoTime: string) {
  const elapsedMs = Date.now() - new Date(isoTime).getTime();
  const mins = Math.max(0, Math.floor(elapsedMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function RevenueEngine({ receptionistIds, receptionistNames = {}, scopeLabel = "current scope", currentMode = "booking", onModeChange }: RevenueEngineProps) {
  const safeInitialMode: "support" | "booking" | "sales" =
    currentMode === "support" || currentMode === "sales" ? currentMode : "booking";
  const [aiMode, setAiMode] = useState<"support" | "booking" | "sales">(safeInitialMode);
  const [loading, setLoading] = useState(false);
  const [moneyModeConfig, setMoneyModeConfig] = useState<MoneyModeConfig>({
    enabled: aiMode === "sales",
    threshold: 7,
    lastSavedAt: null,
  });
  const [configLoading, setConfigLoading] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [mixedConfig, setMixedConfig] = useState(false);
  const [conversionStats, setConversionStats] = useState<ConversionStats>({
    bookings: 0,
    leads: 0,
    orders: 0,
    totalRevenue: 0,
    currency: "USD",
  });
  const [conversionData, setConversionData] = useState<TrendPoint[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelPoint[]>([]);
  const [meoAlerts, setMeoAlerts] = useState<MEOAlert[]>([]);
  const [liveConversations, setLiveConversations] = useState<LiveConversation[]>([]);

  const loadLiveFeeds = useCallback(async () => {
    if (!receptionistIds.length) {
      setConversionStats({
        bookings: 0,
        leads: 0,
        orders: 0,
        totalRevenue: 0,
        currency: "USD",
      });
      setConversionData([]);
      setFunnelData([]);
      setMeoAlerts([]);
      setLiveConversations([]);
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const [
        { data: events, error: eventsError },
        { data: aggregateConversations, error: aggregateConvoError },
        { data: recentConversationsFeed, error: recentConvoError },
      ] = await Promise.all([
        supabase
          .from("conversion_events")
          .select("event_type, revenue_value, currency, created_at, receptionist_id, metadata, session_id")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("conversations")
          .select("id, created_at, receptionist_id")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", sevenDaysAgo.toISOString()),
        supabase
          .from("conversations")
          .select("id, created_at, user_message, receptionist_id, metadata")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", sevenDaysAgo.toISOString())
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (eventsError) throw eventsError;
      if (aggregateConvoError) throw aggregateConvoError;
      if (recentConvoError) throw recentConvoError;

      const eventRows = events || [];
      const conversationRows = aggregateConversations || [];
      const liveConversationRows = recentConversationsFeed || [];

      const totalRevenue = eventRows.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0);
      const converted = eventRows.filter((e) => ["booking_completed", "order_completed"].includes(e.event_type)).length;
      setConversionStats({
        bookings: eventRows.filter((e) => e.event_type === "booking_completed").length,
        leads: eventRows.filter((e) => e.event_type === "lead_captured").length,
        orders: eventRows.filter((e) => e.event_type === "order_completed").length,
        totalRevenue,
        currency: eventRows[0]?.currency || "USD",
      });

      const dayKeys = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return d;
      });

      const trendRows = dayKeys.map((date) => {
        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const dayEvents = eventRows.filter((e) => {
          const t = new Date(e.created_at).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        const dayConversations = conversationRows.filter((c) => {
          const t = new Date(c.created_at).getTime();
          return t >= dayStart.getTime() && t <= dayEnd.getTime();
        });

        return {
          day: date.toLocaleDateString(undefined, { weekday: "short" }),
          revenue: dayEvents.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0),
          conversations: dayConversations.length,
          bookings: dayEvents.filter((e) => e.event_type === "booking_completed").length,
        };
      });

      setConversionData(trendRows);

      const visitors = conversationRows.length;
      const engaged = eventRows.filter((e) => e.event_type === "lead_captured").length;
      const intent = eventRows.filter((e) => ["booking_started", "order_started"].includes(e.event_type)).length;
      const pct = (value: number) => (visitors > 0 ? Math.round((value / visitors) * 100) : 0);

      setFunnelData([
        { stage: "Visitors", value: visitors, pct: 100 },
        { stage: "Engaged", value: engaged, pct: pct(engaged) },
        { stage: "Intent", value: intent, pct: pct(intent) },
        { stage: "Converted", value: converted, pct: pct(converted) },
      ]);

      const recentConversations = liveConversationRows.slice(0, 6).map((c) => {
        const md = (c.metadata as Record<string, unknown> | null) || {};
        const rawIntent = typeof md.intent_score === "number" ? md.intent_score : 5;
        const intent = Math.max(1, Math.min(10, Math.round(rawIntent)));
        return {
          id: c.id,
          name: receptionistNames[c.receptionist_id] || "Visitor",
          intent,
          status: intent >= 8 ? "HOT" : intent >= 5 ? "WARM" : "COLD",
          msg: c.user_message,
          time: getRelativeTimeLabel(c.created_at),
          mode: typeof md.mode === "string" ? md.mode : "booking",
        } as LiveConversation;
      });
      setLiveConversations(recentConversations);

      const sessionsWithLead = new Set(eventRows.filter((e) => e.event_type === "lead_captured").map((e) => e.session_id));
      const sessionsConverted = new Set(eventRows.filter((e) => ["booking_completed", "order_completed"].includes(e.event_type)).map((e) => e.session_id));
      const droppedLeads = Array.from(sessionsWithLead).filter((s) => !sessionsConverted.has(s)).length;
      const avgConversionValue = converted > 0 ? Math.round(totalRevenue / converted) : 120;
      const leakageEstimate = droppedLeads * avgConversionValue;

      const afterHoursMissed = conversationRows.filter((c) => {
        const hour = new Date(c.created_at).getHours();
        return hour < 8 || hour > 19;
      }).length;

      setMeoAlerts([
        {
          id: "dropped-leads",
          type: "lost",
          msg: `${droppedLeads} lead sessions exited before conversion in selected scope`,
          amount: `£${Math.max(0, leakageEstimate).toLocaleString()}`,
          time: "7d window",
        },
        {
          id: "suggestion",
          type: "suggest",
          msg: "Enable proactive deposit nudges in high-intent chats to improve close rate",
          amount: `+£${Math.round(Math.max(0, leakageEstimate) * 0.2).toLocaleString()}/wk`,
          time: "AI tip",
        },
        {
          id: "after-hours",
          type: "lost",
          msg: `${afterHoursMissed} after-hours conversations detected in this scope`,
          amount: `£${Math.round(afterHoursMissed * (avgConversionValue * 0.5)).toLocaleString()}`,
          time: "last 7d",
        },
      ]);
    } catch (error) {
      console.error("Error loading live revenue feeds:", error);
    }
  }, [receptionistIds, receptionistNames]);

  const loadMoneyModeConfig = useCallback(async () => {
    if (!receptionistIds.length) return;

    setConfigLoading(true);
    try {
      const { data, error } = await supabase
        .from("receptionists")
        .select("ai_mode, capabilities")
        .in("id", receptionistIds);
      if (error) throw error;

      const configs = (data || []).map((row) => {
        const capabilities = (row.capabilities as Record<string, unknown> | null) || {};
        const enabled = typeof capabilities.money_mode_enabled === "boolean" ? capabilities.money_mode_enabled : row.ai_mode === "sales";
        const threshold = typeof capabilities.money_mode_threshold === "number" ? Math.max(1, Math.min(10, capabilities.money_mode_threshold)) : 7;
        return { enabled, threshold, ai_mode: row.ai_mode };
      });

      const first = configs[0];
      if (!first) return;

      setMixedConfig(configs.some((c) => c.enabled !== first.enabled || c.threshold !== first.threshold));
      setMoneyModeConfig({
        enabled: first.enabled,
        threshold: first.threshold,
        lastSavedAt: null,
      });
      setAiMode((first.ai_mode || "booking") as "support" | "booking" | "sales");
      setConfigDirty(false);
    } catch (error) {
      console.error("Error loading money mode config:", error);
    } finally {
      setConfigLoading(false);
    }
  }, [receptionistIds]);

  useEffect(() => {
    loadLiveFeeds();
    const id = window.setInterval(loadLiveFeeds, 30000);
    return () => window.clearInterval(id);
  }, [loadLiveFeeds]);

  useEffect(() => {
    loadMoneyModeConfig();
  }, [loadMoneyModeConfig]);

  useEffect(() => {
    if (currentMode === "support" || currentMode === "booking" || currentMode === "sales") {
      setAiMode(currentMode);
    }
  }, [currentMode]);

  useEffect(() => {
    setMoneyModeConfig((prev) => ({ ...prev, enabled: aiMode === "sales" }));
  }, [aiMode]);

  const saveMoneyModeConfig = async () => {
    if (!receptionistIds.length) return;

    setConfigLoading(true);
    try {
      const { data, error: readErr } = await supabase
        .from("receptionists")
        .select("id, capabilities")
        .in("id", receptionistIds);
      if (readErr) throw readErr;

      for (const row of data || []) {
        const capabilities = (row.capabilities as Record<string, unknown> | null) || {};
        const updatedCapabilities = {
          ...capabilities,
          money_mode_enabled: moneyModeConfig.enabled,
          money_mode_threshold: moneyModeConfig.threshold,
        };

        const { error: writeErr } = await supabase
          .from("receptionists")
          .update({ capabilities: updatedCapabilities })
          .eq("id", row.id);
        if (writeErr) throw writeErr;
      }

      const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setMoneyModeConfig((prev) => ({ ...prev, lastSavedAt: stamp }));
      setMixedConfig(false);
      setConfigDirty(false);
      toast.success(`Money Mode settings saved for ${scopeLabel}`);
    } catch (error) {
      console.error("Error saving money mode config:", error);
      toast.error("Failed to save Money Mode settings");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleModeChange = async (newMode: "support" | "booking" | "sales") => {
    if (!receptionistIds.length) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("receptionists")
        .update({ ai_mode: newMode })
        .in("id", receptionistIds);

      if (error) throw error;

      setAiMode(newMode);
      onModeChange?.(newMode);
      toast.success(`Switched ${scopeLabel} to ${newMode === "sales" ? "Money Mode" : `${newMode} mode`}`);
    } catch (error) {
      console.error("Error updating AI mode:", error);
      toast.error("Failed to update AI mode");
    } finally {
      setLoading(false);
    }
  };

  const weekRevenue = useMemo(() => conversionData.reduce((sum, d) => sum + d.revenue, 0), [conversionData]);
  const leakedRevenue = useMemo(
    () => meoAlerts
      .filter((a) => a.type === "lost")
      .reduce((sum, a) => sum + Number(a.amount.replace(/[^0-9.-]/g, "") || 0), 0),
    [meoAlerts],
  );
  const fmtCurrency = (amount: number, cur: string) => formatCurrency(amount, cur);

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
          Scoped to: <span className="font-semibold">{scopeLabel}</span> • live interval conversion intelligence
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
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue This Week" value={`£${weekRevenue.toLocaleString()}`} sub="Live rolling 7-day total" />
              <StatTile icon={<Target className="h-4 w-4" />} label="Conversions" value={`${conversionStats.bookings + conversionStats.orders}`} sub="Scoped conversion events" />
              <StatTile icon={<Users className="h-4 w-4" />} label="Conversations" value={`${conversionData.reduce((s, d) => s + d.conversations, 0)}`} />
              <StatTile icon={<Sparkles className="h-4 w-4" />} label="AI Revenue (30d)" value={fmtCurrency(conversionStats.totalRevenue, conversionStats.currency)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">LIVE: updates every 30s</Badge>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">Scope: {scopeLabel}</Badge>
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
                  {mixedConfig ? <div className="mt-1 text-xs text-amber-600">Selected receptionists currently have mixed settings.</div> : null}
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
              <div className="text-xs text-muted-foreground">Across missed leads, abandoned flows and lost upsells in selected scope.</div>
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
              <div className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> UI / UX production audit</div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Live:</strong> All dashboard cards are fed by interval-based scoped data.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Scoped:</strong> Selector applies to Money Mode, MEO, and dashboard feeds consistently.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Next:</strong> Move leakage heuristics into server-generated MEO insight records.</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
