import { useMemo, useState, useEffect, useCallback } from "react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatCurrency } from "@/lib/currency";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, Zap, Target, Users, AlertTriangle, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RevenueEngineProps { receptionistId: string; currentMode?: string; onModeChange?: (mode: string) => void; }
interface ConversionStats { bookings: number; leads: number; orders: number; totalRevenue: number; currency: string; sessions: number; }
interface MoneyModeConfig {
  enabled: boolean;
  autoActivationEnabled: boolean;
  threshold: number;
  hysteresisBand: number;
  holdTurns: number;
  missedBookingRecovery: boolean;
  afterHoursLeadCapture: boolean;
  noShowReduction: boolean;
  kpiMinConversionRate: number;
  kpiMinRevenue: number;
  lastSavedAt: string | null;
}

type IntervalOption = "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo";
const INTERVAL_TO_MS: Record<IntervalOption, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1mo": 30 * 24 * 60 * 60 * 1000,
};

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return <div className="rounded-xl border bg-card p-4"><div className="mb-2 text-muted-foreground">{icon}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 font-mono text-2xl font-bold">{value}</div>{sub ? <div className="mt-1 text-xs text-emerald-600">{sub}</div> : null}</div>;
}

function toBucket(date: string, interval: IntervalOption) {
  const ts = new Date(date).getTime();
  const bucket = Math.floor(ts / INTERVAL_TO_MS[interval]) * INTERVAL_TO_MS[interval];
  return new Date(bucket).toISOString();
}

export function RevenueEngine({ receptionistId, currentMode = "booking", onModeChange }: RevenueEngineProps) {
  const [aiMode, setAiMode] = useState<"support" | "booking" | "sales">(currentMode as "support" | "booking" | "sales");
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [interval, setInterval] = useState<IntervalOption>("1d");
  const [conversionStats, setConversionStats] = useState<ConversionStats>({ bookings: 0, leads: 0, orders: 0, totalRevenue: 0, currency: "USD", sessions: 0 });
  const [trendData, setTrendData] = useState<Array<{ bucket: string; revenue: number; bookings: number; conversations: number }>>([]);
  const [liveConversations, setLiveConversations] = useState<Array<{ id: string; name: string; intent: number; status: "HOT" | "WARM" | "COLD"; msg: string; time: string; autoMoneyMode: boolean }>>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState({ missedBookings: 0, afterHoursLeads: 0, noShows: 0 });

  const [moneyModeConfig, setMoneyModeConfig] = useState<MoneyModeConfig>({
    enabled: aiMode === "sales",
    autoActivationEnabled: true,
    threshold: 7,
    hysteresisBand: 1,
    holdTurns: 2,
    missedBookingRecovery: true,
    afterHoursLeadCapture: true,
    noShowReduction: true,
    kpiMinConversionRate: 12,
    kpiMinRevenue: 1000,
    lastSavedAt: null,
  });

  const loadMoneyModeConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const { data, error } = await supabase.from("receptionists").select("ai_mode, capabilities, money_mode_enabled, money_mode_threshold, money_mode_hysteresis_band, money_mode_hold_turns, money_mode_auto_activation_enabled, automation_workflows, kpi_gate_min_conversion_rate, kpi_gate_min_revenue").eq("id", receptionistId).maybeSingle();
      if (error) throw error;
      const capabilities = (data?.capabilities as Record<string, unknown> | null) || {};
      const workflows = (data?.automation_workflows as Record<string, boolean> | null) || (capabilities.automation_workflows as Record<string, boolean> | null) || {};
      setMoneyModeConfig((prev) => ({
        ...prev,
        enabled: (data?.money_mode_enabled as boolean | null) ?? (capabilities.money_mode_enabled as boolean | undefined) ?? data?.ai_mode === "sales",
        autoActivationEnabled: (data?.money_mode_auto_activation_enabled as boolean | null) ?? (capabilities.money_mode_auto_activation_enabled as boolean | undefined) ?? true,
        threshold: Math.max(1, Math.min(10, (data?.money_mode_threshold as number | null) ?? Number(capabilities.money_mode_threshold ?? 7))),
        hysteresisBand: Math.max(0, Math.min(4, (data?.money_mode_hysteresis_band as number | null) ?? Number(capabilities.money_mode_hysteresis_band ?? 1))),
        holdTurns: Math.max(0, Math.min(10, (data?.money_mode_hold_turns as number | null) ?? Number(capabilities.money_mode_hold_turns ?? 2))),
        missedBookingRecovery: workflows.missed_booking_recovery ?? true,
        afterHoursLeadCapture: workflows.after_hours_lead_capture ?? true,
        noShowReduction: workflows.no_show_reduction ?? true,
        kpiMinConversionRate: (data?.kpi_gate_min_conversion_rate as number | null) ?? Number(capabilities.kpi_gate_min_conversion_rate ?? 12),
        kpiMinRevenue: (data?.kpi_gate_min_revenue as number | null) ?? Number(capabilities.kpi_gate_min_revenue ?? 1000),
      }));
      setConfigDirty(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load Money Mode config");
    } finally {
      setConfigLoading(false);
    }
  }, [receptionistId]);

  const loadLiveAnalytics = useCallback(async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const [{ data: conversions }, { data: messages }, { data: appointments }] = await Promise.all([
        supabase.from("conversion_events").select("event_type, revenue_value, currency, created_at, session_id, metadata").eq("receptionist_id", receptionistId).gte("created_at", since.toISOString()),
        supabase.from("chat_messages").select("id, message, sender, session_id, created_at, metadata").eq("receptionist_id", receptionistId).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(500),
        supabase.from("appointments").select("status, created_at").eq("receptionist_id", receptionistId).gte("created_at", since.toISOString()),
      ]);

      const rows = conversions || [];
      const sessions = new Set(rows.map((r) => r.session_id));
      const bookings = rows.filter((e) => e.event_type === "booking_completed").length;
      const orders = rows.filter((e) => e.event_type === "order_completed").length;
      const leads = rows.filter((e) => e.event_type === "lead_captured").length;
      const totalRevenue = rows.reduce((sum, e) => sum + (Number(e.revenue_value) || 0), 0);
      const currency = rows[0]?.currency || "USD";
      setConversionStats({ bookings, leads, orders, totalRevenue, currency, sessions: sessions.size });

      const map = new Map<string, { bucket: string; revenue: number; bookings: number; conversations: number }>();
      for (const row of rows) {
        const key = toBucket(row.created_at, interval);
        const entry = map.get(key) || { bucket: key, revenue: 0, bookings: 0, conversations: 0 };
        entry.revenue += Number(row.revenue_value) || 0;
        if (row.event_type === "booking_completed") entry.bookings += 1;
        map.set(key, entry);
      }
      for (const msg of messages || []) {
        const key = toBucket(msg.created_at, interval);
        const entry = map.get(key) || { bucket: key, revenue: 0, bookings: 0, conversations: 0 };
        if (msg.sender === "user") entry.conversations += 1;
        map.set(key, entry);
      }
      setTrendData(Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket)).slice(-40));

      const sessionLatest = new Map<string, (typeof messages)[number]>();
      for (const msg of messages || []) {
        if (msg.sender !== "user") continue;
        if (!sessionLatest.has(msg.session_id)) sessionLatest.set(msg.session_id, msg);
      }
      const live = Array.from(sessionLatest.values()).slice(0, 6).map((msg) => {
        const inferredIntent = Number((msg.metadata as Record<string, unknown> | null)?.money_mode_intent_score ?? 5);
        const status = inferredIntent >= 8 ? "HOT" : inferredIntent >= 5 ? "WARM" : "COLD";
        return {
          id: msg.id,
          name: ((msg.metadata as Record<string, unknown> | null)?.customer_name as string) || "Visitor",
          intent: Math.max(1, Math.min(10, inferredIntent)),
          status,
          msg: msg.message,
          time: new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          autoMoneyMode: Boolean((msg.metadata as Record<string, unknown> | null)?.money_mode_auto_activated),
        };
      });
      setLiveConversations(live);

      const missedBookings = rows.filter((e) => e.event_type === "workflow_missed_booking_recovery").length;
      const afterHoursLeads = rows.filter((e) => e.event_type === "workflow_after_hours_lead_capture").length;
      const noShows = (appointments || []).filter((a) => String(a.status).toLowerCase() === "no_show").length;
      setWorkflowMetrics({ missedBookings, afterHoursLeads, noShows });
    } catch (error) {
      console.error("Error loading analytics:", error);
    }
  }, [receptionistId, interval]);

  useEffect(() => { loadMoneyModeConfig(); }, [loadMoneyModeConfig]);
  useEffect(() => { loadLiveAnalytics(); }, [loadLiveAnalytics]);
  useEffect(() => { setMoneyModeConfig((prev) => ({ ...prev, enabled: aiMode === "sales" })); }, [aiMode]);

  const saveMoneyModeConfig = async () => {
    setConfigLoading(true);
    try {
      const { data, error: readErr } = await supabase.from("receptionists").select("capabilities").eq("id", receptionistId).maybeSingle();
      if (readErr) throw readErr;
      const capabilities = (data?.capabilities as Record<string, unknown> | null) || {};
      const automationWorkflows = {
        missed_booking_recovery: moneyModeConfig.missedBookingRecovery,
        after_hours_lead_capture: moneyModeConfig.afterHoursLeadCapture,
        no_show_reduction: moneyModeConfig.noShowReduction,
      };

      const updatedCapabilities = {
        ...capabilities,
        money_mode_enabled: moneyModeConfig.enabled,
        money_mode_auto_activation_enabled: moneyModeConfig.autoActivationEnabled,
        money_mode_threshold: moneyModeConfig.threshold,
        money_mode_hysteresis_band: moneyModeConfig.hysteresisBand,
        money_mode_hold_turns: moneyModeConfig.holdTurns,
        automation_workflows: automationWorkflows,
        kpi_gate_min_conversion_rate: moneyModeConfig.kpiMinConversionRate,
        kpi_gate_min_revenue: moneyModeConfig.kpiMinRevenue,
      };

      const { error: writeErr } = await supabase.from("receptionists").update({
        capabilities: updatedCapabilities,
        money_mode_enabled: moneyModeConfig.enabled,
        money_mode_auto_activation_enabled: moneyModeConfig.autoActivationEnabled,
        money_mode_threshold: moneyModeConfig.threshold,
        money_mode_hysteresis_band: moneyModeConfig.hysteresisBand,
        money_mode_hold_turns: moneyModeConfig.holdTurns,
        automation_workflows: automationWorkflows,
        kpi_gate_min_conversion_rate: moneyModeConfig.kpiMinConversionRate,
        kpi_gate_min_revenue: moneyModeConfig.kpiMinRevenue,
      }).eq("id", receptionistId);
      if (writeErr) throw writeErr;
      setMoneyModeConfig((prev) => ({ ...prev, lastSavedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
      setConfigDirty(false);
      toast.success("Money Mode settings saved (dual-write synced)");
    } catch (error) {
      console.error("Error saving Money Mode config:", error);
      toast.error("Failed to save Money Mode settings");
    } finally {
      setConfigLoading(false);
    }
  };

  const handleModeChange = async (newMode: "support" | "booking" | "sales") => {
    setLoading(true);
    try {
      const { error } = await supabase.from("receptionists").update({ ai_mode: newMode }).eq("id", receptionistId);
      if (error) throw error;
      setAiMode(newMode);
      onModeChange?.(newMode);
      toast.success(`Switched to ${newMode === "sales" ? "Money Mode" : `${newMode} mode`}`);
    } catch {
      toast.error("Failed to update AI mode");
    } finally {
      setLoading(false);
    }
  };

  const conversionRate = conversionStats.sessions > 0 ? ((conversionStats.bookings + conversionStats.orders) / conversionStats.sessions) * 100 : 0;
  const kpiPass = conversionRate >= moneyModeConfig.kpiMinConversionRate && conversionStats.totalRevenue >= moneyModeConfig.kpiMinRevenue;

  const leakedRevenue = Math.max(0, (moneyModeConfig.kpiMinRevenue - conversionStats.totalRevenue));

  return (
    <Card className="border-2 border-border/50 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-border/50">
        <CardTitle className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center"><DollarSign className="h-5 w-5 text-amber-600" /></div><div className="flex-1">Revenue Engine {moneyModeConfig.enabled ? <Badge className="ml-2 bg-amber-500 text-white"><Zap className="mr-1 h-3 w-3" /> Money Mode</Badge> : null}</div></CardTitle>
        <CardDescription>Live revenue intelligence, automation workflows, and KPI gates.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs defaultValue="dashboard" className="space-y-5">
          <TabsList className="grid grid-cols-4 w-full"><TabsTrigger value="dashboard">Dashboard</TabsTrigger><TabsTrigger value="moneymode">Money Mode</TabsTrigger><TabsTrigger value="meo">MEO</TabsTrigger><TabsTrigger value="audit">Audit</TabsTrigger></TabsList>

          <TabsContent value="dashboard" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile icon={<TrendingUp className="h-4 w-4" />} label="Revenue (30d)" value={formatCurrency(conversionStats.totalRevenue, conversionStats.currency)} sub={`KPI gate ${kpiPass ? "passed" : "pending"}`} />
              <StatTile icon={<Target className="h-4 w-4" />} label="Conversions" value={`${conversionStats.bookings + conversionStats.orders}`} sub={`${conversionRate.toFixed(1)}% session conversion`} />
              <StatTile icon={<Users className="h-4 w-4" />} label="Sessions" value={`${conversionStats.sessions}`} />
              <StatTile icon={<Bot className="h-4 w-4" />} label="Leads Captured" value={`${conversionStats.leads}`} />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Interval analytics window</div>
              <Select value={interval} onValueChange={(v) => setInterval(v as IntervalOption)}>
                <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["5m", "15m", "1h", "4h", "1d", "1w", "1mo"] as IntervalOption[]).map((it) => <SelectItem key={it} value={it}>{it}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
              <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">Revenue trend ({interval})</div><ResponsiveContainer width="100%" height={180}><AreaChart data={trendData}><defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => new Date(v).toLocaleDateString()} /><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={36} /><Tooltip /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#revGrad)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
              <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">Unified state display</div><div className="space-y-2 text-xs"><div className="flex justify-between"><span className="text-muted-foreground">Operator mode</span><Badge variant="outline" className="capitalize">{aiMode}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">Auto-activation</span><Badge variant={moneyModeConfig.autoActivationEnabled ? "default" : "outline"}>{moneyModeConfig.autoActivationEnabled ? "On" : "Off"}</Badge></div><div className="flex justify-between"><span className="text-muted-foreground">Threshold / hold</span><span>{moneyModeConfig.threshold} / {moneyModeConfig.holdTurns} turns</span></div><div className="flex justify-between"><span className="text-muted-foreground">Hysteresis band</span><span>±{moneyModeConfig.hysteresisBand}</span></div><div className="flex justify-between"><span className="text-muted-foreground">KPI gate</span><Badge className={kpiPass ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}>{kpiPass ? "PASS" : "HOLD"}</Badge></div></div></div>
            </div>

            <div className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center justify-between"><div className="text-sm font-semibold">Live conversations</div><Badge variant="outline">{liveConversations.length} recent</Badge></div><div className="space-y-2">{liveConversations.map((c) => <div key={c.id} className="rounded-lg border bg-muted/30 p-3"><div className="mb-1 flex items-center justify-between gap-2"><div className="truncate text-sm font-semibold">{c.name}</div><div className="flex gap-2"><Badge variant="outline">{c.status}</Badge>{c.autoMoneyMode ? <Badge className="bg-amber-500 text-white">Auto Money</Badge> : null}</div></div><div className="mb-2 truncate text-xs text-muted-foreground">{c.msg}</div><div className="text-[11px] text-muted-foreground">Intent {c.intent}/10 · {c.time}</div></div>)}</div></div>
          </TabsContent>

          <TabsContent value="moneymode" className="space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between"><Label>Money Mode enabled</Label><Switch checked={moneyModeConfig.enabled} onCheckedChange={(v) => { setMoneyModeConfig((p) => ({ ...p, enabled: v })); setConfigDirty(true); }} /></div>
              <div className="flex items-center justify-between"><Label>Widget auto-activation</Label><Switch checked={moneyModeConfig.autoActivationEnabled} onCheckedChange={(v) => { setMoneyModeConfig((p) => ({ ...p, autoActivationEnabled: v })); setConfigDirty(true); }} /></div>
              <div><div className="mb-2 text-xs text-muted-foreground">Intent threshold ({moneyModeConfig.threshold})</div><Slider min={1} max={10} step={1} value={[moneyModeConfig.threshold]} onValueChange={(v) => { setMoneyModeConfig((p) => ({ ...p, threshold: v[0] || 7 })); setConfigDirty(true); }} /></div>
              <div><div className="mb-2 text-xs text-muted-foreground">Hysteresis band ({moneyModeConfig.hysteresisBand})</div><Slider min={0} max={4} step={1} value={[moneyModeConfig.hysteresisBand]} onValueChange={(v) => { setMoneyModeConfig((p) => ({ ...p, hysteresisBand: v[0] || 0 })); setConfigDirty(true); }} /></div>
              <div><div className="mb-2 text-xs text-muted-foreground">Hold turns after hesitation ({moneyModeConfig.holdTurns})</div><Slider min={0} max={10} step={1} value={[moneyModeConfig.holdTurns]} onValueChange={(v) => { setMoneyModeConfig((p) => ({ ...p, holdTurns: v[0] || 0 })); setConfigDirty(true); }} /></div>
              <div className="grid gap-3 sm:grid-cols-3"><Button variant={aiMode === "support" ? "default" : "outline"} onClick={() => handleModeChange("support")} disabled={loading}>Support</Button><Button variant={aiMode === "booking" ? "default" : "outline"} onClick={() => handleModeChange("booking")} disabled={loading}>Booking</Button><Button variant={aiMode === "sales" ? "default" : "outline"} onClick={() => handleModeChange("sales")} disabled={loading}>Sales / Money</Button></div>
              <div className="flex justify-between items-center text-xs"><span className="text-muted-foreground">{moneyModeConfig.lastSavedAt ? `Saved at ${moneyModeConfig.lastSavedAt}` : "Not saved in this session"}</span><Button size="sm" onClick={saveMoneyModeConfig} disabled={!configDirty || configLoading}>{configLoading ? "Saving..." : "Save settings"}</Button></div>
            </div>

            <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">Top automation workflows</div><div className="space-y-3 text-sm"><div className="flex items-center justify-between"><span>Missed booking recovery</span><Switch checked={moneyModeConfig.missedBookingRecovery} onCheckedChange={(v) => { setMoneyModeConfig((p) => ({ ...p, missedBookingRecovery: v })); setConfigDirty(true); }} /></div><div className="flex items-center justify-between"><span>After-hours lead capture</span><Switch checked={moneyModeConfig.afterHoursLeadCapture} onCheckedChange={(v) => { setMoneyModeConfig((p) => ({ ...p, afterHoursLeadCapture: v })); setConfigDirty(true); }} /></div><div className="flex items-center justify-between"><span>No-show reduction</span><Switch checked={moneyModeConfig.noShowReduction} onCheckedChange={(v) => { setMoneyModeConfig((p) => ({ ...p, noShowReduction: v })); setConfigDirty(true); }} /></div></div></div>

            <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">KPI gates</div><div className="grid md:grid-cols-2 gap-4"><div><div className="mb-2 text-xs text-muted-foreground">Min conversion rate ({moneyModeConfig.kpiMinConversionRate.toFixed(0)}%)</div><Slider min={1} max={50} step={1} value={[moneyModeConfig.kpiMinConversionRate]} onValueChange={(v) => { setMoneyModeConfig((p) => ({ ...p, kpiMinConversionRate: v[0] || 1 })); setConfigDirty(true); }} /></div><div><div className="mb-2 text-xs text-muted-foreground">Min revenue ({formatCurrency(moneyModeConfig.kpiMinRevenue, conversionStats.currency)})</div><Slider min={100} max={20000} step={100} value={[moneyModeConfig.kpiMinRevenue]} onValueChange={(v) => { setMoneyModeConfig((p) => ({ ...p, kpiMinRevenue: v[0] || 100 })); setConfigDirty(true); }} /></div></div></div>
          </TabsContent>

          <TabsContent value="meo" className="space-y-4">
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4"><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-500">Revenue leaked vs KPI floor</div><div className="font-mono text-4xl font-bold text-red-500">{formatCurrency(leakedRevenue, conversionStats.currency)}</div><div className="text-xs text-muted-foreground">Calculated from current KPI revenue gate.</div></div>
            <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">Workflow impact counters (30d)</div><div className="grid sm:grid-cols-3 gap-3"><div className="rounded border p-3"><div className="text-xs text-muted-foreground">Missed booking recovery</div><div className="text-xl font-semibold">{workflowMetrics.missedBookings}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">After-hours lead capture</div><div className="text-xl font-semibold">{workflowMetrics.afterHoursLeads}</div></div><div className="rounded border p-3"><div className="text-xs text-muted-foreground">No-show appointments</div><div className="text-xl font-semibold">{workflowMetrics.noShows}</div></div></div></div>
            <div className="rounded-xl border bg-card p-4"><div className="mb-3 text-sm font-semibold">Conversation-to-cash scoring</div><ResponsiveContainer width="100%" height={170}><BarChart data={trendData}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="bucket" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => new Date(v).toLocaleDateString()} /><YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} width={30} /><Tooltip /><Bar dataKey="bookings" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </TabsContent>

          <TabsContent value="audit" className="space-y-3">
            <div className="rounded-xl border bg-card p-4 text-sm"><div className="mb-3 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" /> Money Mode backlog status</div><div className="space-y-2 text-xs text-muted-foreground"><div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Delivered:</strong> Schema-backed config with dual-write sync, interval analytics, multi-receptionist selector, live conversation feed, workflow toggles, and KPI gates.</div><div className="rounded-md border bg-muted/30 p-2"><strong className="text-foreground">Runtime:</strong> Widget-chat auto-activation now supports hysteresis + hold turns, and writes mode state in response metadata.</div></div></div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
