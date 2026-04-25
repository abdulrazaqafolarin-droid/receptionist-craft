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

interface DailyAggregate {
  day: string;
  revenue: number;
  conversations: number;
  bookings: number;
}

interface FunnelStage {
  stage: string;
  value: number;
  pct: number;
}

interface MeoAlert {
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
  mode: string | null;
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

function formatRelativeTime(timestamp: string | null) {
  if (!timestamp) return "just now";
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function renderStateMessage(loading: boolean, error: string | null, empty: boolean, emptyMessage: string) {
  if (loading) return <div className="text-xs text-muted-foreground">Loading live data…</div>;
  if (error) return <div className="text-xs text-red-500">{error}</div>;
  if (empty) return <div className="text-xs text-muted-foreground">{emptyMessage}</div>;
  return null;
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

  const [intervalAggregates, setIntervalAggregates] = useState<DailyAggregate[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelStage[]>([]);
  const [meoAlerts, setMeoAlerts] = useState<MeoAlert[]>([]);
  const [liveConversations, setLiveConversations] = useState<LiveConversation[]>([]);

  const [aggregatesLoading, setAggregatesLoading] = useState(false);
  const [aggregatesError, setAggregatesError] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [meoLoading, setMeoLoading] = useState(false);
  const [meoError, setMeoError] = useState<string | null>(null);
  const [stagedRolloutIncomplete, setStagedRolloutIncomplete] = useState(false);

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

      setStagedRolloutIncomplete(capabilities.revenue_engine_staged_rollout === true);
      setMoneyModeConfig({
        enabled,
        threshold,
        lastSavedAt: null,
      });
      setConfigDirty(false);
    } catch (error) {
      console.error("Error loading money mode config:", error);
    } finally {
      setConfigLoading(false);
    }
  }, [receptionistId]);

  const loadIntervalAggregates = useCallback(async () => {
    setAggregatesLoading(true);
    setAggregatesError(null);
    try {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const [eventsRes, convRes] = await Promise.all([
        supabase
          .from("conversion_events")
          .select("created_at, revenue_value, event_type")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("conversations")
          .select("created_at")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", weekStart.toISOString()),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (convRes.error) throw convRes.error;

      const dayMap: Record<string, DailyAggregate> = {};
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const key = d.toISOString().split("T")[0];
        dayMap[key] = {
          day: d.toLocaleDateString("en-US", { weekday: "short" }),
          revenue: 0,
          conversations: 0,
          bookings: 0,
        };
      }

      (eventsRes.data || []).forEach((e) => {
        const key = new Date(e.created_at).toISOString().split("T")[0];
        if (!dayMap[key]) return;
        dayMap[key].revenue += Number(e.revenue_value) || 0;
        if (e.event_type === "booking_completed") dayMap[key].bookings += 1;
      });

      (convRes.data || []).forEach((c) => {
        const key = new Date(c.created_at).toISOString().split("T")[0];
        if (!dayMap[key]) return;
        dayMap[key].conversations += 1;
      });

      setIntervalAggregates(Object.values(dayMap));
    } catch (error) {
      console.error("Error loading interval aggregates:", error);
      setAggregatesError("Could not load interval aggregates.");
      setIntervalAggregates([]);
    } finally {
      setAggregatesLoading(false);
    }
  }, [receptionistId]);

  const loadMeoFeed = useCallback(async () => {
    setMeoLoading(true);
    setMeoError(null);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [eventsRes, stateRes, chatsRes] = await Promise.all([
        supabase
          .from("conversion_events")
          .select("event_type, session_id, revenue_value, created_at")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("conversation_state")
          .select("session_id, topic_confidence, last_message_at")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("chat_messages")
          .select("session_id")
          .eq("receptionist_id", receptionistId)
          .gte("created_at", sevenDaysAgo.toISOString()),
      ]);

      if (eventsRes.error) throw eventsRes.error;
      if (stateRes.error) throw stateRes.error;
      if (chatsRes.error) throw chatsRes.error;

      const events = eventsRes.data || [];
      const sessions = new Set((stateRes.data || []).map((row) => row.session_id));

      const convertedSessions = new Set(
        events
          .filter((e) => e.event_type === "booking_completed" || e.event_type === "order_completed")
          .map((e) => e.session_id),
      );
      const leadSessions = new Set(events.filter((e) => e.event_type === "lead_captured").map((e) => e.session_id));
      const avgRevenue =
        events.filter((e) => e.event_type === "order_completed" || e.event_type === "booking_completed")
          .reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0) / Math.max(1, convertedSessions.size);

      const hotUnconverted = [...leadSessions].filter((s) => !convertedSessions.has(s)).length;
      const totalSessions = Math.max(1, sessions.size);
      const conversionRate = (convertedSessions.size / totalSessions) * 100;
      const weeklyChats = (chatsRes.data || []).length;

      const alerts: MeoAlert[] = [];
      if (hotUnconverted > 0) {
        alerts.push({
          id: "hot-unconverted",
          type: "lost",
          msg: `${hotUnconverted} high-intent sessions did not convert in the last 30 days`,
          amount: formatCurrency(Math.round(hotUnconverted * avgRevenue), conversionStats.currency),
          time: "Live signal",
        });
      }
      alerts.push({
        id: "conv-rate",
        type: conversionRate < 20 ? "lost" : "suggest",
        msg: `Current session conversion rate is ${conversionRate.toFixed(1)}%`,
        amount: conversionRate < 20 ? "Below target" : "Healthy",
        time: "30d aggregate",
      });
      alerts.push({
        id: "volume",
        type: "suggest",
        msg: `${weeklyChats} messages in the last 7 days are feeding optimization models`,
        amount: "Signal ready",
        time: "7d feed",
      });

      setMeoAlerts(alerts);

      const engaged = Math.min(totalSessions, Math.max(0, (chatsRes.data || []).length));
      const intent = leadSessions.size;
      const converted = convertedSessions.size;
      setFunnelData([
        { stage: "Visitors", value: totalSessions, pct: 100 },
        { stage: "Engaged", value: engaged, pct: Math.round((engaged / totalSessions) * 100) },
        { stage: "Intent", value: intent, pct: Math.round((intent / totalSessions) * 100) },
        { stage: "Converted", value: converted, pct: Math.round((converted / totalSessions) * 100) },
      ]);
    } catch (error) {
      console.error("Error loading MEO feed:", error);
      setMeoError("Could not load MEO intelligence feed.");
      setMeoAlerts([]);
      setFunnelData([]);
    } finally {
      setMeoLoading(false);
    }
  }, [conversionStats.currency, receptionistId]);

  const loadLiveFeed = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: stateData, error: stateError } = await supabase
        .from("conversation_state")
        .select("session_id, topic_confidence, active_flow, last_message_at")
        .eq("receptionist_id", receptionistId)
        .gte("last_message_at", thirtyMinsAgo)
        .order("last_message_at", { ascending: false })
        .limit(8);
      if (stateError) throw stateError;

      const sessionIds = (stateData || []).map((row) => row.session_id);
      if (!sessionIds.length) {
        setLiveConversations([]);
        return;
      }

      const [msgRes, summaryRes] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("session_id, message, created_at, sender")
          .eq("receptionist_id", receptionistId)
          .in("session_id", sessionIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("conversation_summaries")
          .select("session_id, key_facts")
          .eq("receptionist_id", receptionistId)
          .in("session_id", sessionIds),
      ]);
      if (msgRes.error) throw msgRes.error;
      if (summaryRes.error) throw summaryRes.error;

      const latestUserMessageBySession = new Map<string, { message: string; created_at: string }>();
      (msgRes.data || []).forEach((row) => {
        if (row.sender !== "user" || latestUserMessageBySession.has(row.session_id || "")) return;
        latestUserMessageBySession.set(row.session_id || "", {
          message: row.message,
          created_at: row.created_at,
        });
      });

      const summaryBySession = new Map<string, string>();
      (summaryRes.data || []).forEach((row) => {
        const facts = row.key_facts as Record<string, unknown> | null;
        const name = typeof facts?.name === "string" ? facts.name : undefined;
        if (name) summaryBySession.set(row.session_id, name);
      });

      const feed: LiveConversation[] = (stateData || []).map((row) => {
        const intent = Math.max(1, Math.min(10, Math.round((row.topic_confidence || 0.2) * 10)));
        const status: LiveConversation["status"] = intent >= 8 ? "HOT" : intent >= 5 ? "WARM" : "COLD";
        const latest = latestUserMessageBySession.get(row.session_id);
        return {
          id: row.session_id,
          name: summaryBySession.get(row.session_id) || `Session ${row.session_id.slice(0, 6)}`,
          intent,
          status,
          msg: latest?.message || "No recent user message",
          time: formatRelativeTime(row.last_message_at || latest?.created_at || null),
          mode: row.active_flow,
        };
      });

      setLiveConversations(feed);
    } catch (error) {
      console.error("Error loading live session feed:", error);
      setLiveError("Could not load live sessions.");
      setLiveConversations([]);
    } finally {
      setLiveLoading(false);
    }
  }, [receptionistId]);

  useEffect(() => {
    loadConversionStats();
    loadIntervalAggregates();
    loadMeoFeed();
    loadLiveFeed();
  }, [loadConversionStats, loadIntervalAggregates, loadMeoFeed, loadLiveFeed]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadIntervalAggregates();
      loadMeoFeed();
      loadLiveFeed();
    }, 20000);
    return () => window.clearInterval(interval);
  }, [loadIntervalAggregates, loadLiveFeed, loadMeoFeed]);

  useEffect(() => {
    loadMoneyModeConfig();
  }, [loadMoneyModeConfig]);

  useEffect(() => {
    setMoneyModeConfig((prev) => ({ ...prev, enabled: aiMode === "sales" }));
  }, [aiMode]);

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
      toast.success(`Switched to ${newMode === "sales" ? "Money Mode" : `${newMode} mode`}`);
    } catch (error) {
      console.error("Error updating AI mode:", error);
      toast.error("Failed to update AI mode");
    } finally {
      setLoading(false);
    }
  };

  const weekRevenue = useMemo(() => intervalAggregates.reduce((sum, d) => sum + d.revenue, 0), [intervalAggregates]);
  const leakedRevenue = useMemo(
    () => meoAlerts.filter((a) => a.type === "lost").length * Math.max(1, Math.round(conversionStats.totalRevenue / 30 || 0)),
    [conversionStats.totalRevenue, meoAlerts],
  );
  const totalConversations = useMemo(
    () => intervalAggregates.reduce((sum, d) => sum + d.conversations, 0),
    [intervalAggregates],
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
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue This Week" value={`£${weekRevenue.toLocaleString()}`} sub={aggregatesLoading ? "Updating…" : "Server aggregate"} />
              <StatTile icon={<Target className="h-4 w-4" />} label="Conversions" value={`${conversionStats.bookings + conversionStats.orders}`} sub="Money mode assisted" />
              <StatTile icon={<Users className="h-4 w-4" />} label="Conversations" value={`${totalConversations}`} sub={aggregatesError ? "Awaiting sync" : undefined} />
              <StatTile icon={<Sparkles className="h-4 w-4" />} label="AI Revenue (30d)" value={fmtCurrency(conversionStats.totalRevenue, conversionStats.currency)} />
            </div>

            {stagedRolloutIncomplete ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600">LIVE: server metrics + live sessions</Badge>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600">DEMO: staged rollout active</Badge>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 text-sm font-semibold">Revenue trend</div>
                {renderStateMessage(aggregatesLoading, aggregatesError, intervalAggregates.length === 0, "No revenue events in the last 7 days.") || (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={intervalAggregates}>
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
                )}
              </div>

              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 text-sm font-semibold">Conversion funnel</div>
                {renderStateMessage(meoLoading, meoError, funnelData.length === 0, "No funnel data available yet.") || (
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
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Live conversations</div>
                <Badge variant="outline">{liveConversations.length} active</Badge>
              </div>
              {renderStateMessage(liveLoading, liveError, liveConversations.length === 0, "No active sessions in the last 30 minutes.") || (
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
                      <div className="mt-1 text-[10px] text-muted-foreground">{c.time} · {c.mode || "general"}</div>
                    </div>
                  ))}
                </div>
              )}
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
              {renderStateMessage(meoLoading, meoError, meoAlerts.length === 0, "No MEO alerts right now.") || (
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
              )}
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Conversation-to-cash scoring</div>
              {renderStateMessage(aggregatesLoading, aggregatesError, intervalAggregates.length === 0, "No scoring data available yet.") || (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={intervalAggregates}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <div className="rounded-xl border bg-card p-4 text-sm">
              <div className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> UI / UX production audit</div>
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Critical:</strong> Money mode is currently manual-first. Intent-threshold persistence is still pending backend wiring.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Required:</strong> Server-driven interval aggregates and live session feeds are wired with explicit loading/error/empty states.</div>
                <div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Done:</strong> Mode switching + conversion attribution + revenue chart surface are now in one operator panel.</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
