import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, MessageSquare, Clock, Download, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";

interface ReceptionistStats {
  total_responses: number;
  avg_quality_score: number;
  flagged_count: number;
  avg_latency: number;
  recent_responses: Array<{
    created_at: string;
    quality_score: number;
    latency_ms: number;
  }>;
  message_volume?: Array<{ date: string; count: number }>;
  match_rates?: { exact: number; semantic: number; fallback: number };
  quality_distribution?: Array<{ range: string; count: number }>;
  latency_over_time?: Array<{ date: string; latency: number }>;
}

type DatePreset = "today" | "7days" | "30days" | "all" | "custom";

interface BuilderAnalyticsPanelProps {
  receptionistId: string;
  userId: string;
}

export function BuilderAnalyticsPanel({ receptionistId, userId }: BuilderAnalyticsPanelProps) {
  const [stats, setStats] = useState<ReceptionistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("30days");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [exporting, setExporting] = useState(false);

  // Update date range when preset changes
  useEffect(() => {
    const now = new Date();
    switch (datePreset) {
      case "today":
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        break;
      case "7days":
        setStartDate(startOfDay(subDays(now, 7)));
        setEndDate(endOfDay(now));
        break;
      case "30days":
        setStartDate(startOfDay(subDays(now, 30)));
        setEndDate(endOfDay(now));
        break;
      case "all":
        setStartDate(undefined);
        setEndDate(undefined);
        break;
      case "custom":
        // Keep existing dates
        break;
    }
  }, [datePreset]);

  useEffect(() => {
    loadStats();
    
    // Set up realtime subscription for analytics updates
    const channel = supabase
      .channel('analytics-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'analytics_cache',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Reload stats when analytics cache is updated
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [receptionistId, userId, startDate, endDate]);

  async function loadStats() {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("analytics/stats", {
        body: { 
          receptionistId,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString()
        }
      });

      if (error) throw error;
      
      setStats(data || null);
    } catch (err: any) {
      console.error("Failed to load analytics stats:", err);
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(format: "json" | "csv") {
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("analytics-export", {
        body: {
          receptionistId,
          format,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString()
        }
      });

      if (error) throw error;

      // Create downloadable file
      const blob = new Blob([format === "csv" ? data : JSON.stringify(data, null, 2)], {
        type: format === "csv" ? "text/csv" : "application/json"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${receptionistId}-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Analytics exported as ${format.toUpperCase()}`);
    } catch (err: any) {
      console.error("Export failed:", err);
      toast.error(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Analytics</h3>
        </div>
        <div className="text-sm text-muted-foreground">Loading stats...</div>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Analytics</h3>
        </div>
        <div className="text-sm text-muted-foreground">
          {error || "No data available yet"}
        </div>
      </Card>
    );
  }

  const COLORS = {
    exact: "hsl(var(--primary))",
    semantic: "hsl(var(--secondary))",
    fallback: "hsl(var(--muted))"
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Real-time Analytics</h3>
        <Badge variant="outline" className="ml-auto text-xs">Live</Badge>
      </div>

      {/* Date Range Filter */}
      <div className="space-y-2">
        <label className="text-xs font-medium">Date Range</label>
        <div className="flex gap-2">
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          
          {datePreset === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="p-3 space-y-2">
                  <div>
                    <label className="text-xs font-medium">Start Date</label>
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      className="pointer-events-auto"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">End Date</label>
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      className="pointer-events-auto"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-2">
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => handleExport("json")}
          disabled={exporting}
        >
          <Download className="h-3 w-3 mr-1" />
          Export JSON
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={() => handleExport("csv")}
          disabled={exporting}
        >
          <Download className="h-3 w-3 mr-1" />
          Export CSV
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span>Total Responses</span>
          </div>
          <div className="text-2xl font-bold">{stats.total_responses}</div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3" />
            <span>Quality Score</span>
          </div>
          <div className="text-2xl font-bold">
            {stats.avg_quality_score ? `${(stats.avg_quality_score * 100).toFixed(0)}%` : "N/A"}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Avg Latency</span>
          </div>
          <div className="text-2xl font-bold">
            {stats.avg_latency ? `${Math.round(stats.avg_latency)}ms` : "N/A"}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>⚠️</span>
            <span>Flagged</span>
          </div>
          <div className="text-2xl font-bold text-destructive">{stats.flagged_count}</div>
        </div>
      </div>

      {/* Charts */}
      {stats.message_volume && stats.message_volume.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Message Volume Over Time</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={stats.message_volume}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip 
                contentStyle={{ 
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px"
                }}
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats.match_rates && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">FAQ Match Rates</h4>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={[
                  { name: "Exact Match", value: stats.match_rates.exact },
                  { name: "Semantic Match", value: stats.match_rates.semantic },
                  { name: "Fallback AI", value: stats.match_rates.fallback }
                ]}
                cx="50%"
                cy="50%"
                outerRadius={50}
                dataKey="value"
                label={(entry) => `${entry.name}: ${entry.value}%`}
              >
                <Cell fill={COLORS.exact} />
                <Cell fill={COLORS.semantic} />
                <Cell fill={COLORS.fallback} />
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px"
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats.quality_distribution && stats.quality_distribution.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Quality Score Distribution</h4>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={stats.quality_distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <Tooltip 
                contentStyle={{ 
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px"
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats.latency_over_time && stats.latency_over_time.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium">Average Response Latency</h4>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={stats.latency_over_time}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                stroke="hsl(var(--muted-foreground))"
                label={{ value: "ms", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <Tooltip 
                contentStyle={{ 
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px"
                }}
              />
              <Line 
                type="monotone" 
                dataKey="latency" 
                stroke="hsl(var(--secondary))" 
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {stats.recent_responses && stats.recent_responses.length > 0 && (
        <div className="pt-4 border-t">
          <div className="text-xs font-medium text-muted-foreground mb-2">Recent Activity</div>
          <div className="space-y-2">
            {stats.recent_responses.slice(0, 3).map((response, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {new Date(response.created_at).toLocaleTimeString()}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(response.latency_ms)}ms
                  </Badge>
                  <Badge 
                    variant={response.quality_score > 0.8 ? "default" : "outline"}
                    className="text-xs"
                  >
                    {(response.quality_score * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
