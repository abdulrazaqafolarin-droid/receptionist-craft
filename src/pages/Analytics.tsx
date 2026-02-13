import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MessageCircle, Calendar, TrendingUp, Clock, Target, Award, BarChart3, RefreshCw, Download, DollarSign, ShoppingCart, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { FloatingBackground } from "@/components/FloatingBackground";

type Analytics = {
  conversation_metrics: {
    total_conversations: number;
    total_messages: number;
    conversations_per_receptionist: number;
    conversations_per_day: Record<string, number>;
    average_conversation_length: number;
  };
  ai_quality_metrics: {
    avg_quality_score: number | null;
    avg_clarity: number | null;
    avg_accuracy: number | null;
    avg_confidence: number | null;
    faq_match_rate: number;
    semantic_match_rate: number;
    fallback_rate: number;
    unanswered_questions: number;
  };
  business_metrics: {
    appointments_booked: number;
    lead_captures: number;
    booking_conversion_rate: number;
  };
  revenue_metrics: {
    total_revenue: number;
    currency: string;
    bookings_revenue: number;
    orders_revenue: number;
    bookings_count: number;
    orders_count: number;
    leads_count: number;
    avg_booking_value: number;
    avg_order_value: number;
    revenue_over_time: Array<{ date: string; amount: number }>;
  };
  conversion_funnel: {
    total_conversations: number;
    engaged_sessions: number;
    bookings_completed: number;
    orders_completed: number;
    leads_captured: number;
    booking_rate: number;
    order_rate: number;
  };
  performance_metrics: {
    average_response_time: number | null;
  };
  receptionist_breakdown: Array<{
    id: string;
    name: string;
    business_name: string;
    conversations: number;
    appointments: number;
    orders: number;
    avg_quality_score: number | null;
    faq_match_rate: number;
    revenue: number;
    bookings_completed: number;
    leads_captured: number;
  }>;
  computed_at: string;
};

const DATE_PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default function Analytics() {
  const [user, setUser] = useState<any>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);
  const [dateRange, setDateRange] = useState({ days: 30, label: "Last 30 days" });
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("analytics/compute", {
        body: { 
          userId: user.id,
          days: dateRange.days
        }
      });

      if (error) throw error;

      setAnalytics(data.analytics);
      setCached(data.cached);
    } catch (err) {
      console.error("Error loading analytics:", err);
      toast.error("Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  const applyCustomRange = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      setDateRange({ days, label: `${customStart} to ${customEnd}` });
    }
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatNumber = (value: number | null) => value != null ? value.toFixed(2) : "—";
  const formatCurrency = (amount: number, currency: string) => {
    const symbols: Record<string, string> = { NGN: '₦', USD: '$', EUR: '€', GBP: '£' };
    return `${symbols[currency] || currency}${amount.toLocaleString()}`;
  };

  const conversationTrendData = analytics
    ? Object.entries(analytics.conversation_metrics.conversations_per_day)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          conversations: count
        }))
    : [];

  const qualityMetricsData = analytics
    ? [
        { metric: "Quality", value: (analytics.ai_quality_metrics.avg_quality_score || 0) * 100 },
        { metric: "Clarity", value: (analytics.ai_quality_metrics.avg_clarity || 0) * 100 },
        { metric: "Accuracy", value: (analytics.ai_quality_metrics.avg_accuracy || 0) * 100 },
        { metric: "Confidence", value: (analytics.ai_quality_metrics.avg_confidence || 0) * 100 }
      ]
    : [];

  const matchRateData = analytics
    ? [
        { type: "FAQ Match", rate: analytics.ai_quality_metrics.faq_match_rate * 100 },
        { type: "Semantic", rate: analytics.ai_quality_metrics.semantic_match_rate * 100 },
        { type: "Fallback", rate: analytics.ai_quality_metrics.fallback_rate * 100 }
      ]
    : [];

  const StatCard = ({ title, value, subtitle, icon: Icon, color }: any) => (
    <Card className="border-2 border-border/50 hover:border-primary/20 hover:shadow-lg transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl lg:text-3xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-4xl font-bold">Analytics Dashboard</h1>
              <p className="text-muted-foreground">
                {dateRange.label}
                {cached && <Badge variant="outline" className="ml-2 text-xs">Cached</Badge>}
              </p>
            </div>
          </div>

          {/* Date Range Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant={dateRange.days === preset.days ? "default" : "outline"}
                size="sm"
                onClick={() => setDateRange({ days: preset.days, label: preset.label })}
                className="h-9"
              >
                {preset.label}
              </Button>
            ))}
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  <Calendar className="mr-2 h-4 w-4" />
                  Custom
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h4 className="font-medium">Custom Date Range</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="date"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End</Label>
                      <Input
                        type="date"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <Button onClick={applyCustomRange} size="sm" className="w-full">
                    Apply Range
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Button onClick={loadData} variant="outline" size="sm" disabled={loading} className="h-9">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="border-2 border-border/50">
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-24" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : !analytics ? (
          <Card className="border-2 border-border/50">
            <CardContent className="p-16 text-center">
              <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No analytics data available yet</h3>
              <p className="text-muted-foreground">Start conversations with your AI receptionist to see analytics</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Revenue Hero Banner */}
            {analytics.revenue_metrics && analytics.revenue_metrics.total_revenue > 0 && (
              <Card className="border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                        <DollarSign className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">AI-Generated Revenue</p>
                        <p className="text-3xl lg:text-4xl font-bold text-amber-600 dark:text-amber-400">
                          {formatCurrency(analytics.revenue_metrics.total_revenue, analytics.revenue_metrics.currency)}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 lg:gap-6">
                      <div className="text-center p-3 rounded-xl bg-card/50 border border-border/50">
                        <div className="text-xl font-bold text-primary">{analytics.revenue_metrics.bookings_count}</div>
                        <div className="text-xs text-muted-foreground">Bookings</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-card/50 border border-border/50">
                        <div className="text-xl font-bold text-amber-600">{analytics.revenue_metrics.orders_count}</div>
                        <div className="text-xs text-muted-foreground">Orders</div>
                      </div>
                      <div className="text-center p-3 rounded-xl bg-card/50 border border-border/50">
                        <div className="text-xl font-bold text-green-600">{analytics.revenue_metrics.leads_count}</div>
                        <div className="text-xs text-muted-foreground">Leads</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <StatCard 
                title="Conversations" 
                value={analytics.conversation_metrics.total_conversations}
                subtitle={dateRange.label}
                icon={MessageCircle}
                color="bg-primary/10 text-primary"
              />
              <StatCard 
                title="Appointments" 
                value={analytics.business_metrics.appointments_booked}
                subtitle="Total booked"
                icon={Calendar}
                color="bg-secondary/10 text-secondary"
              />
              <StatCard 
                title="Orders" 
                value={analytics.revenue_metrics?.orders_count || 0}
                subtitle="Completed"
                icon={ShoppingCart}
                color="bg-amber-500/10 text-amber-600"
              />
              <StatCard 
                title="Quality Score" 
                value={formatNumber(analytics.ai_quality_metrics.avg_quality_score)}
                subtitle="Average rating"
                icon={Award}
                color="bg-primary/10 text-primary"
              />
              <StatCard 
                title="Response Time" 
                value={analytics.performance_metrics.average_response_time 
                  ? `${Math.round(analytics.performance_metrics.average_response_time)}ms`
                  : "—"
                }
                subtitle="Average latency"
                icon={Clock}
                color="bg-secondary/10 text-secondary"
              />
              <StatCard 
                title="Conversion" 
                value={formatPercent(analytics.business_metrics.booking_conversion_rate)}
                subtitle="Booking rate"
                icon={TrendingUp}
                color="bg-green-500/10 text-green-600"
              />
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card className="border-2 border-border/50">
                <CardHeader>
                  <CardTitle>Conversation Trend</CardTitle>
                  <CardDescription>Daily conversations over the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={conversationTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "2px solid hsl(var(--border))",
                          borderRadius: "12px",
                          boxShadow: "0 10px 40px -10px rgba(0,0,0,0.1)"
                        }} 
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                        activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-border/50">
                <CardHeader>
                  <CardTitle>AI Quality Metrics</CardTitle>
                  <CardDescription>Average scores across quality dimensions</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={qualityMetricsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "2px solid hsl(var(--border))",
                          borderRadius: "12px"
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="value" fill="hsl(var(--secondary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border-2 border-border/50">
                <CardHeader>
                  <CardTitle>Match Rate Analysis</CardTitle>
                  <CardDescription>FAQ vs Semantic vs Fallback responses</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={matchRateData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "2px solid hsl(var(--border))",
                          borderRadius: "12px"
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="rate" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Revenue Over Time */}
              {analytics.revenue_metrics?.revenue_over_time?.length > 0 && (
                <Card className="border-2 border-amber-500/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-amber-500" />
                      Revenue Over Time
                    </CardTitle>
                    <CardDescription>Daily AI-generated revenue</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analytics.revenue_metrics.revenue_over_time}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="date" 
                          stroke="hsl(var(--muted-foreground))" 
                          fontSize={12}
                          tickFormatter={(d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: "hsl(var(--card))", 
                            border: "2px solid hsl(var(--border))",
                            borderRadius: "12px"
                          }}
                          formatter={(value: number) => [formatCurrency(value, analytics.revenue_metrics.currency), "Revenue"]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="amount" 
                          stroke="#f59e0b"
                          strokeWidth={3}
                          dot={{ fill: "#f59e0b", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Business Impact + Conversion Funnel */}
              <Card className="border-2 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Business Impact & Conversion Funnel
                  </CardTitle>
                  <CardDescription>Revenue attribution and conversion metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex justify-between items-center p-4 rounded-xl bg-primary/5 border border-primary/10">
                      <span className="font-medium text-sm">Total Messages</span>
                      <span className="text-xl font-bold text-primary">{analytics.conversation_metrics.total_messages}</span>
                    </div>
                    <div className="flex justify-between items-center p-4 rounded-xl bg-secondary/5 border border-secondary/10">
                      <span className="font-medium text-sm">Lead Captures</span>
                      <span className="text-xl font-bold text-secondary">{analytics.business_metrics.lead_captures}</span>
                    </div>
                  </div>
                  {analytics.revenue_metrics && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex justify-between items-center p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <span className="font-medium text-sm">Avg Booking Value</span>
                        <span className="text-xl font-bold text-amber-600">
                          {analytics.revenue_metrics.avg_booking_value > 0
                            ? formatCurrency(analytics.revenue_metrics.avg_booking_value, analytics.revenue_metrics.currency)
                            : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <span className="font-medium text-sm">Avg Order Value</span>
                        <span className="text-xl font-bold text-amber-600">
                          {analytics.revenue_metrics.avg_order_value > 0
                            ? formatCurrency(analytics.revenue_metrics.avg_order_value, analytics.revenue_metrics.currency)
                            : "—"}
                        </span>
                      </div>
                    </div>
                  )}
                  {analytics.conversion_funnel && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs font-medium text-muted-foreground">Conversion Funnel</p>
                      {[
                        { label: "Conversations", value: analytics.conversion_funnel.total_conversations, pct: 100 },
                        { label: "Engaged Sessions", value: analytics.conversion_funnel.engaged_sessions, pct: analytics.conversion_funnel.total_conversations ? (analytics.conversion_funnel.engaged_sessions / analytics.conversion_funnel.total_conversations * 100) : 0 },
                        { label: "Bookings", value: analytics.conversion_funnel.bookings_completed, pct: analytics.conversion_funnel.total_conversations ? (analytics.conversion_funnel.bookings_completed / analytics.conversion_funnel.total_conversations * 100) : 0 },
                        { label: "Orders", value: analytics.conversion_funnel.orders_completed, pct: analytics.conversion_funnel.total_conversations ? (analytics.conversion_funnel.orders_completed / analytics.conversion_funnel.total_conversations * 100) : 0 },
                      ].map((step) => (
                        <div key={step.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span>{step.label}</span>
                            <span className="font-medium">{step.value} ({step.pct.toFixed(1)}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(step.pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between items-center p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                    <span className="font-medium text-sm">Unanswered</span>
                    <span className="text-xl font-bold text-destructive">
                      {analytics.ai_quality_metrics.unanswered_questions}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Receptionist Breakdown Table */}
            <Card className="border-2 border-border/50">
              <CardHeader>
                <CardTitle>Receptionist Performance</CardTitle>
                <CardDescription>Detailed breakdown by AI receptionist</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead>Name</TableHead>
                        <TableHead>Business</TableHead>
                        <TableHead className="text-right">Conversations</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Orders</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Avg Quality</TableHead>
                        <TableHead className="text-right">Leads</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.receptionist_breakdown.map((rec) => (
                        <TableRow key={rec.id} className="border-border/50 hover:bg-primary/5">
                          <TableCell className="font-medium">{rec.name}</TableCell>
                          <TableCell className="text-muted-foreground">{rec.business_name}</TableCell>
                          <TableCell className="text-right">{rec.conversations}</TableCell>
                          <TableCell className="text-right">{rec.bookings_completed}</TableCell>
                          <TableCell className="text-right">{rec.orders}</TableCell>
                          <TableCell className="text-right font-medium text-amber-600">
                            {rec.revenue > 0 ? formatCurrency(rec.revenue, analytics.revenue_metrics?.currency || 'NGN') : "—"}
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(rec.avg_quality_score)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{rec.leads_captured}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
