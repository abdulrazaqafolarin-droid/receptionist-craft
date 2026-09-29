import { useEffect, useState, useMemo } from "react";
import { formatCurrency as fmtCurrency } from "@/lib/currency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { 
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, AlertCircle, CheckCircle, 
  Target, Users, Sparkles, Clock, RefreshCw, Filter, Download, Zap, 
  Brain, Shield, ArrowUpRight, ArrowDownRight, MinusCircle, PlusCircle,
  ExternalLink, ChevronDown, ChevronUp
} from "lucide-react";
import { FloatingBackground } from "@/components/FloatingBackground";
import { toast } from "sonner";

type MEOInsight = {
  id: string;
  type: "revenue_leak" | "capacity_waste" | "channel_decay" | "growth_pattern" | "risk" | "opportunity";
  title: string;
  description: string;
  metric_value: string;
  metric_trend: "up" | "down" | "stable";
  confidence: number;
  urgency: "low" | "medium" | "high" | "critical";
  suggested_action: string;
  action_type: "autonomous" | "suggest" | "alert";
  dismissible: boolean;
  created_at: string;
  amount?: number;
};

type MEOSummary = {
  total_leaked: number;
  total_opportunity: number;
  active_alerts: number;
  conversion_rate: number;
  avg_booking_value: number;
};

type FunnelPoint = {
  stage: string;
  value: number;
  pct: number;
  dropoff_reason?: string;
};

type IntentDist = {
  intent: string;
  count: number;
  avg_score: number;
  conversion_rate: number;
};

type HeatmapPoint = {
  hour: number;
  day: number;
  conversations: number;
  revenue: number;
};

type MEOData = {
  insights: MEOInsight[];
  summary: MEOSummary;
  funnel: FunnelPoint[];
  intent_distribution: IntentDist[];
  heatmap: HeatmapPoint[];
};

const TYPE_ICONS = {
  revenue_leak: "💸",
  capacity_waste: "📅",
  channel_decay: "📱",
  growth_pattern: "📈",
  risk: "⚠️",
  opportunity: "💡",
};

const TYPE_COLORS = {
  revenue_leak: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300",
  capacity_waste: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
  channel_decay: "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
  growth_pattern: "border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300",
  risk: "border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300",
  opportunity: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
};

const URGENCY_COLORS = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const URGENCY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const ACTION_ICONS = {
  autonomous: Zap,
  suggest: Sparkles,
  alert: AlertTriangle,
};

export default function MEODashboard() {
  const [data, setData] = useState<MEOData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ days: 30, label: "Last 30 days" });
  const [selectedReceptionistIds, setSelectedReceptionistIds] = useState<string[]>([]);
  const [allReceptionists, setAllReceptionists] = useState<Array<{ id: string; name: string; business_name: string }>>([]);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(new Set());

  const DATE_PRESETS = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    loadData();
  }, [dateRange, selectedReceptionistIds]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setAllReceptionists(data as Array<{ id: string; name: string; business_name: string }>);
      if (data.length > 0) {
        setSelectedReceptionistIds(data.slice(0, 3).map(r => r.id));
      }
    }
  }

  const loadData = useCallback(async () => {
    if (selectedReceptionistIds.length === 0) {
      setData({ insights: [], summary: { total_leaked: 0, total_opportunity: 0, active_alerts: 0, conversion_rate: 0, avg_booking_value: 0 }, funnel: [], intent_distribution: [], heatmap: [] });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meo-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          receptionist_ids: selectedReceptionistIds,
          days: dateRange.days,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to load MEO insights");

      setData(result);
    } catch (err) {
      console.error("MEO Dashboard error:", err);
      toast.error("Failed to load MEO analytics");
    } finally {
      setLoading(false);
    }
  }, [dateRange, selectedReceptionistIds]);

  const dismissInsight = (id: string) => {
    setDismissedInsights(prev => new Set([...prev, id]));
    toast.success("Insight dismissed");
  };

  const visibleInsights = data?.insights.filter(i => !dismissedInsights.has(i.id)) || [];

  const totalLeaked = data?.summary.total_leaked || 0;
  const totalOpportunity = data?.summary.total_opportunity || 0;
  const activeAlerts = data?.summary.active_alerts || 0;
  const conversionRate = data?.summary.conversion_rate || 0;
  const avgBookingValue = data?.summary.avg_booking_value || 0;

  const formatCurrency = (amount: number) => fmtCurrency(amount, "USD");

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <main className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-warning/15 flex items-center justify-center">
              <Brain className="h-7 w-7 text-warning" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">MEO Analytics Dashboard</h1>
              <p className="text-muted-foreground">
                Money Engine Optimization — Revenue intelligence & conversion optimization
                <Badge variant="outline" className="ml-2 border-amber-500/30 bg-amber-500/10 text-amber-600">{dateRange.label}</Badge>
              </p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* Receptionist Selector */}
            {allReceptionists.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9 gap-2">
                    <Filter className="h-4 w-4" />
                    {selectedReceptionistIds.length === allReceptionists.length ? "All" : `${selectedReceptionistIds.length} selected`}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded">
                      <input type="checkbox" checked={selectedReceptionistIds.length === allReceptionists.length} onChange={(e) => e.target.checked ? setSelectedReceptionistIds(allReceptionists.map(r => r.id)) : setSelectedReceptionistIds([])} className="rounded border-border" />
                      <span className="text-sm font-medium">All receptionists</span>
                    </label>
                    <hr className="border-border my-1" />
                    {allReceptionists.map(r => (
                      <label key={r.id} className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded cursor-pointer">
                        <input type="checkbox" checked={selectedReceptionistIds.includes(r.id)} onChange={(e) => setSelectedReceptionistIds(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))} className="rounded border-border" />
                        <span className="text-sm">{r.business_name || r.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* Date Range */}
            <Select value={String(dateRange.days)} onValueChange={(days: string) => {
              const preset = DATE_PRESETS.find(p => p.days === parseInt(days));
              if (preset) setDateRange(preset);
            }}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                {DATE_PRESETS.map(p => (
                  <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadData} disabled={loading} className="h-9 gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => (
                <Card key={i} className="border-2 border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle><div className="h-4 w-24 bg-muted animate-pulse rounded" /></CardTitle>
                  </CardHeader>
                  <CardContent><div className="h-8 w-16 bg-muted animate-pulse rounded" /></CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : data ? (
          <div className="space-y-6 animate-fade-in">
            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card className="glass-1 border-red-500/30 relative overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-2 right-2 opacity-20">
                    <DollarSign className="h-12 w-12 text-red-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-red-600">Revenue Leaked</span>
                    </div>
                    <div className="text-3xl font-bold text-red-600">{formatCurrency(totalLeaked)}</div>
                    <div className="text-xs text-muted-foreground">Estimated lost revenue</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-1 border-amber-500/30 relative overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-2 right-2 opacity-20">
                    <ArrowUpRight className="h-12 w-12 text-amber-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-amber-600" />
                      <span className="text-sm font-medium text-amber-700">Opportunity Value</span>
                    </div>
                    <div className="text-3xl font-bold text-amber-700">{formatCurrency(totalOpportunity)}</div>
                    <div className="text-xs text-muted-foreground">High-intent conversions</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-1 border-green-500/30 relative overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-2 right-2 opacity-20">
                    <TrendingUp className="h-12 w-12 text-green-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">Conversion Rate</span>
                    </div>
                    <div className="text-3xl font-bold text-green-700">{conversionRate}%</div>
                    <div className="text-xs text-muted-foreground">Visitor → Converted</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-1 border-orange-500/30 relative overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-2 right-2 opacity-20">
                    <AlertTriangle className="h-12 w-12 text-orange-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-700">Active Alerts</span>
                    </div>
                    <div className="text-3xl font-bold text-orange-700">{activeAlerts}</div>
                    <div className="text-xs text-muted-foreground">Requires attention</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-1 border-blue-500/30 relative overflow-hidden">
                <CardContent className="p-4 relative">
                  <div className="absolute top-2 right-2 opacity-20">
                    <DollarSign className="h-12 w-12 text-blue-500" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700">Avg Booking Value</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-700">{formatCurrency(avgBookingValue)}</div>
                    <div className="text-xs text-muted-foreground">Per conversion</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="insights" className="space-y-4">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="insights">AI Intelligence Feed</TabsTrigger>
                <TabsTrigger value="funnel">Conversion Funnel</TabsTrigger>
                <TabsTrigger value="heatmap">Activity Heatmap</TabsTrigger>
                <TabsTrigger value="intents">Intent Analysis</TabsTrigger>
              </TabsList>

              {/* INSIGHTS TAB */}
              <TabsContent value="insights" className="space-y-4">
                {visibleInsights.length === 0 ? (
                  <Card className="border-2 border-green-500/20 bg-green-500/5">
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-green-700 mb-2">No revenue leaks detected</h3>
                      <p className="text-sm text-green-600">Your AI is converting efficiently. Keep it up!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {visibleInsights.map((insight) => (
                      <Card key={insight.id} className={`${TYPE_COLORS[insight.type]} shadow-lg border-2 hover:shadow-xl transition-shadow`}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-2xl">{TYPE_ICONS[insight.type]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-foreground">{insight.title}</h4>
                                  <Badge variant="outline" className={URGENCY_COLORS[insight.urgency] + " text-white"}>
                                    {URGENCY_LABELS[insight.urgency]}
                                  </Badge>
                                </div>
                                {insight.dismissible && (
                                  <Button variant="ghost" size="icon" onClick={() => dismissInsight(insight.id)} className="text-muted-foreground hover:text-foreground">
                                    <span className="h-4 w-4">✕</span>
                                  </Button>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                                <Badge variant="outline" className="gap-1">
                                  <TrendingUp className={`h-3 w-3 ${insight.metric_trend === 'up' ? 'text-green-600' : insight.metric_trend === 'down' ? 'text-red-600' : 'text-muted-foreground'}`} />
                                  {insight.metric_value}
                                </Badge>
                                <Badge variant="outline">
                                  {Math.round(insight.confidence * 100)}% confidence
                                </Badge>
                                {insight.amount && (
                                  <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">
                                    ${Math.round(insight.amount).toLocaleString()} at risk
                                  </Badge>
                                )}
                              </div>
                              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  {(() => {
                                    const Icon = ACTION_ICONS[insight.action_type];
                                    return <Icon className="h-4 w-4 text-primary" />;
                                  })()}
                                  <span className="font-medium text-primary">{insight.suggested_action}</span>
                                </div>
                                <Badge variant="secondary" className="text-xs capitalize">{insight.type.replace('_', ' ')}</Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* FUNNEL TAB */}
              <TabsContent value="funnel" className="space-y-4">
                <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
                  <Card className="border-2 border-border/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5 text-primary" />
                        Conversion Funnel
                      </CardTitle>
                      <CardDescription>Drop-off analysis with root cause attribution</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {data?.funnel.map((step, idx) => (
                        <div key={step.stage} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <span className="font-bold text-primary text-sm">{idx + 1}</span>
                              </div>
                              <span className="font-medium">{step.stage}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg">{step.value}</span>
                              <Badge variant="outline">{step.pct}%</Badge>
                            </div>
                          </div>
                          <div className="h-3 rounded-full bg-muted overflow-hidden">
                            <div className="h-3 rounded-full bg-primary transition-all duration-500" style={{ width: `${step.pct}%` }} />
                          </div>
                          {step.dropoff_reason && (
                            <div className="text-xs text-red-600 flex items-center gap-1 ml-10">
                              <MinusCircle className="h-3 w-3" />
                              Dropoff: {step.dropoff_reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-border/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ArrowDownRight className="h-5 w-5 text-red-500" />
                        Revenue Leakage Breakdown
                      </CardTitle>
                      <CardDescription>Where revenue is being lost</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium text-red-700">Dropped Leads</span>
                          </div>
                          <div className="text-2xl font-bold text-red-600">
                            {data?.insights.find(i => i.id.startsWith('leak_dropped_leads'))?.amount 
                              ? formatCurrency(data.insights.find(i => i.id.startsWith('leak_dropped_leads'))!.amount!)
                              : "$0"}
                          </div>
                          <div className="text-xs text-red-500">{data?.insights.find(i => i.id.startsWith('leak_dropped_leads'))?.metric_value || "—"}</div>
                        </div>
                        <div className="p-4 rounded-xl bg-orange-50 border border-orange-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium text-orange-700">After Hours</span>
                          </div>
                          <div className="text-2xl font-bold text-orange-600">
                            {data?.insights.find(i => i.id.startsWith('leak_after_hours'))?.amount 
                              ? formatCurrency(data.insights.find(i => i.id.startsWith('leak_after_hours'))!.amount!)
                              : "$0"}
                          </div>
                          <div className="text-xs text-orange-500">{data?.insights.find(i => i.id.startsWith('leak_after_hours'))?.metric_value || "—"}</div>
                        </div>
                        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                          <div className="flex items-center gap-2 mb-1">
                            <MinusCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-sm font-medium text-amber-700">No-Shows</span>
                          </div>
                          <div className="text-2xl font-bold text-amber-600">
                            {data?.insights.find(i => i.id.startsWith('waste_no_shows'))?.metric_value || "—"}
                          </div>
                          <div className="text-xs text-amber-500">Capacity waste</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* HEATMAP TAB */}
              <TabsContent value="heatmap" className="space-y-4">
                <Card className="border-2 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      Activity Heatmap
                    </CardTitle>
                    <CardDescription>Conversations & revenue by hour × day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-muted-foreground border-b">
                            <th className="p-2 text-left font-medium">Hour</th>
                            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
                              <th key={i} className="p-2 text-center font-medium">{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 24 }, (_, h) => (
                            <tr key={h} className="border-b border-border/50">
                              <td className="p-2 font-mono text-muted-foreground">{h.toString().padStart(2, '0')}:00</td>
                              {[0,1,2,3,4,5,6].map(day => {
                                const point = data?.heatmap.find(p => p.hour === h && p.day === day);
                                const convs = point?.conversations || 0;
                                const rev = point?.revenue || 0;
                                const intensity = convs > 0 ? Math.min(convs / 10, 1) : 0;
                                return (
                                  <td key={day} className="p-1 text-center">
                                    <div 
                                      className={`h-8 rounded transition-colors flex items-center justify-center ${
                                        intensity > 0.7 ? 'bg-amber-500 text-white' :
                                        intensity > 0.4 ? 'bg-amber-300 text-amber-900' :
                                        intensity > 0.1 ? 'bg-amber-100 text-amber-800' :
                                        'bg-muted/50 text-muted-foreground'
                                      }`}
                                      title={`${convs} conv • ${formatCurrency(rev)}`}>
                                      {convs > 0 ? convs : '—'}
                                    </div>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-amber-500" />
                        <span>High activity</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-amber-100 text-amber-800" />
                        <span>Moderate</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-muted/50" />
                        <span>Low/None</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* INTENTS TAB */}
              <TabsContent value="intents" className="space-y-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <Card className="border-2 border-border/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-purple-500" />
                        Intent Distribution
                      </CardTitle>
                      <CardDescription>Top intents by volume, quality & conversion</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={data?.intent_distribution.slice(0, 6) || []}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="count"
                            label={({ intent, count, percent }) => `${intent} ${(percent * 100).toFixed(0)}%`}
                          >
                            {(data?.intent_distribution.slice(0, 6) || []).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={`hsl(${index * 60}, 70%, 50%)`} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [value, "Conversations"]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-border/50">
                    <CardHeader>
                      <CardTitle>Intent Performance Table</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {data?.intent_distribution.slice(0, 8).map((intent, i) => (
                          <div key={intent.intent} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-primary">{i + 1}</span>
                              </div>
                              <div>
                                <div className="font-medium text-sm truncate max-w-[150px]">{intent.intent}</div>
                                <div className="text-xs text-muted-foreground">{intent.count} conversations</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <Badge variant="outline" className="gap-1">
                                <Sparkles className="h-3 w-3" />
                                {intent.avg_score}/100 quality
                              </Badge>
                              <Badge variant={intent.conversion_rate > 20 ? "default" : "outline"} className="gap-1">
                                <Target className="h-3 w-3" />
                                {intent.conversion_rate}% conv
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <Card className="border-2 border-border/50">
            <CardContent className="p-16 text-center">
              <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Brain className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No MEO data available yet</h3>
              <p className="text-muted-foreground">Select receptionists and wait for conversations to generate insights</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];