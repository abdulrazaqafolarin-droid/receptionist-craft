import { useEffect, useState, useCallback } from "react";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, XCircle, AlertCircle, RefreshCw, Activity,
  ShieldCheck, Zap, Database, Bot, Package, Bell, Clock,
  TrendingUp, AlertTriangle, Server
} from "lucide-react";

interface HealthData {
  timestamp: string;
  health: {
    score: number;
    status: "healthy" | "degraded" | "critical";
    issues: string[];
  };
  receptionists: {
    total: number;
    active: number;
    list: Array<{ id: string; name: string; business: string; model: string; active: boolean }>;
  };
  circuitBreakers: Record<string, {
    state: string;
    failures: number;
    successes: number;
    lastFailureTime: number | null;
    lastError: string | null;
    totalRequests: number;
    totalFailures: number;
  }>;
  appointments: {
    total24h: number;
    booked: number;
    confirmed: number;
    cancelled: number;
    bySource: Record<string, number>;
  };
  ai: {
    totalLastHour: number;
    flagged: number;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    avgConfidence: number | null;
  };
  orders: {
    total24h: number;
    totalRevenue: number;
    pending: number;
    completed: number;
  };
  stockAlerts: Array<{
    id: string;
    name: string;
    stock: number;
    threshold: number;
    critical: boolean;
  }>;
  notifications: {
    total24h: number;
    critical: number;
    warnings: number;
    recentErrors: Array<{ title: string; type: string; time: string }>;
  };
  conversations: {
    total24h: number;
  };
}

export default function Diagnostics() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("system-health");
      if (fnErr) throw fnErr;
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch system health";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000); // Auto-refresh every 60s
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const healthColor = health?.health.status === "healthy"
    ? "text-green-500"
    : health?.health.status === "degraded"
    ? "text-yellow-500"
    : "text-red-500";

  const healthBg = health?.health.status === "healthy"
    ? "bg-green-500/10 border-green-500/20"
    : health?.health.status === "degraded"
    ? "bg-yellow-500/10 border-yellow-500/20"
    : "bg-red-500/10 border-red-500/20";

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Diagnostics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time health monitoring & observability
            {lastRefresh && (
              <span className="ml-2 text-xs">
                · Last updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button onClick={fetchHealth} size="sm" variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {health && (
        <>
          {/* Health Score Hero */}
          <Card className={`border ${healthBg}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`text-5xl font-black ${healthColor}`}>
                    {health.health.score}
                  </div>
                  <div>
                    <div className={`text-lg font-semibold uppercase ${healthColor}`}>
                      {health.health.status}
                    </div>
                    <p className="text-sm text-muted-foreground">System Health Score</p>
                  </div>
                </div>
                <Activity className={`h-10 w-10 ${healthColor}`} />
              </div>
              <Progress
                value={health.health.score}
                className="mt-4 h-2"
              />
              {health.health.issues.length > 0 && (
                <div className="mt-4 space-y-1">
                  {health.health.issues.map((issue, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      {issue}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              icon={<Bot className="h-5 w-5" />}
              label="Active Receptionists"
              value={health.receptionists.active}
              sub={`${health.receptionists.total} total`}
            />
            <MetricCard
              icon={<Zap className="h-5 w-5" />}
              label="AI Responses (1h)"
              value={health.ai.totalLastHour}
              sub={health.ai.avgLatencyMs ? `avg ${health.ai.avgLatencyMs}ms` : "no data"}
            />
            <MetricCard
              icon={<Clock className="h-5 w-5" />}
              label="Appointments (24h)"
              value={health.appointments.total24h}
              sub={`${health.appointments.booked} booked`}
            />
            <MetricCard
              icon={<Package className="h-5 w-5" />}
              label="Orders (24h)"
              value={health.orders.total24h}
              sub={health.orders.totalRevenue > 0 ? formatCurrency(health.orders.totalRevenue) : "no revenue"}
            />
          </div>

          {/* Circuit Breakers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5" />
                Circuit Breakers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(health.circuitBreakers).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No circuit breakers have been triggered yet. They activate after the first API call.
                </p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(health.circuitBreakers).map(([key, cb]) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <CircuitStateIcon state={cb.state} />
                        <div>
                          <p className="font-medium text-sm">{key}</p>
                          <p className="text-xs text-muted-foreground">
                            {cb.totalRequests} requests · {cb.totalFailures} failures
                            {cb.lastError && ` · Last: ${cb.lastError.slice(0, 60)}`}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={cb.state === "closed" ? "default" : cb.state === "open" ? "destructive" : "secondary"}
                      >
                        {cb.state.toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Performance & Stock Alerts Row */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* AI Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  AI Performance (Last Hour)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <MiniStat label="Avg Latency" value={health.ai.avgLatencyMs ? `${health.ai.avgLatencyMs}ms` : "—"} />
                  <MiniStat label="P95 Latency" value={health.ai.p95LatencyMs ? `${health.ai.p95LatencyMs}ms` : "—"} />
                  <MiniStat label="Avg Confidence" value={health.ai.avgConfidence ? `${(health.ai.avgConfidence * 100).toFixed(0)}%` : "—"} />
                  <MiniStat
                    label="Flagged"
                    value={String(health.ai.flagged)}
                    alert={health.ai.flagged > 0}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Stock Alerts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="h-5 w-5" />
                  Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {health.stockAlerts.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    All products in stock
                  </div>
                ) : (
                  <div className="space-y-2">
                    {health.stockAlerts.map((alert) => (
                      <div key={alert.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <div className="flex items-center gap-2">
                          {alert.critical ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                          <span className="text-sm font-medium">{alert.name}</span>
                        </div>
                        <Badge variant={alert.critical ? "destructive" : "secondary"}>
                          {alert.stock} left
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Notifications & Appointment Sources */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Errors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bell className="h-5 w-5" />
                  Notifications (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-4">
                  <MiniStat label="Total" value={String(health.notifications.total24h)} />
                  <MiniStat label="Critical" value={String(health.notifications.critical)} alert={health.notifications.critical > 0} />
                  <MiniStat label="Warnings" value={String(health.notifications.warnings)} />
                </div>
                {health.notifications.recentErrors.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Recent Errors</p>
                    {health.notifications.recentErrors.map((err, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-destructive/5 border border-destructive/10">
                        <span className="font-medium">{err.title}</span>
                        <span className="text-muted-foreground ml-2">
                          {new Date(err.time).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Booking Sources */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="h-5 w-5" />
                  Booking Sources (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(health.appointments.bySource).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings in last 24h</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(health.appointments.bySource).map(([source, count]) => (
                      <div key={source} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{source.replace(/_/g, " ")}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Receptionists List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Server className="h-5 w-5" />
                Receptionist Instances
              </CardTitle>
            </CardHeader>
            <CardContent>
              {health.receptionists.list.length === 0 ? (
                <p className="text-sm text-muted-foreground">No receptionists configured</p>
              ) : (
                <div className="space-y-2">
                  {health.receptionists.list.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium text-sm">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.business} · {r.model || "default model"}
                        </p>
                      </div>
                      <Badge variant={r.active ? "default" : "secondary"}>
                        {r.active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {loading && !health && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase">{label}</span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${alert ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

function CircuitStateIcon({ state }: { state: string }) {
  if (state === "closed") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (state === "open") return <XCircle className="h-5 w-5 text-red-500" />;
  return <AlertCircle className="h-5 w-5 text-yellow-500" />;
}
