import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MessageCircle, Calendar, TrendingUp, Clock, Target, Award, BarChart3, RefreshCw, Download } from "lucide-react";
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
  performance_metrics: {
    average_response_time: number | null;
  };
  receptionist_breakdown: Array<{
    id: string;
    name: string;
    business_name: string;
    conversations: number;
    appointments: number;
    avg_quality_score: number | null;
    faq_match_rate: number;
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
            {/* Key Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <StatCard 
                title="Conversations" 
                value={analytics.conversation_metrics.total_conversations}
                subtitle="Last 30 days"
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
                title="Quality Score" 
                value={formatNumber(analytics.ai_quality_metrics.avg_quality_score)}
                subtitle="Average rating"
                icon={Award}
                color="bg-primary/10 text-primary"
              />
              <StatCard 
                title="FAQ Match" 
                value={formatPercent(analytics.ai_quality_metrics.faq_match_rate)}
                subtitle="Accuracy rate"
                icon={Target}
                color="bg-secondary/10 text-secondary"
              />
              <StatCard 
                title="Response Time" 
                value={analytics.performance_metrics.average_response_time 
                  ? `${Math.round(analytics.performance_metrics.average_response_time)}ms`
                  : "—"
                }
                subtitle="Average latency"
                icon={Clock}
                color="bg-primary/10 text-primary"
              />
              <StatCard 
                title="Conversion" 
                value={formatPercent(analytics.business_metrics.booking_conversion_rate)}
                subtitle="Booking rate"
                icon={TrendingUp}
                color="bg-secondary/10 text-secondary"
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

              <Card className="border-2 border-border/50">
                <CardHeader>
                  <CardTitle>Business Impact</CardTitle>
                  <CardDescription>Key business metrics at a glance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-4 rounded-xl bg-primary/5 border border-primary/10">
                    <span className="font-medium">Total Messages</span>
                    <span className="text-2xl font-bold text-primary">{analytics.conversation_metrics.total_messages}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-xl bg-secondary/5 border border-secondary/10">
                    <span className="font-medium">Lead Captures</span>
                    <span className="text-2xl font-bold text-secondary">{analytics.business_metrics.lead_captures}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-xl bg-muted/50 border border-border">
                    <span className="font-medium">Avg Conv. Length</span>
                    <span className="text-2xl font-bold">
                      {analytics.conversation_metrics.average_conversation_length.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-xl bg-destructive/5 border border-destructive/10">
                    <span className="font-medium">Unanswered</span>
                    <span className="text-2xl font-bold text-destructive">
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
                        <TableHead className="text-right">Appointments</TableHead>
                        <TableHead className="text-right">Avg Quality</TableHead>
                        <TableHead className="text-right">FAQ Match</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analytics.receptionist_breakdown.map((rec) => (
                        <TableRow key={rec.id} className="border-border/50 hover:bg-primary/5">
                          <TableCell className="font-medium">{rec.name}</TableCell>
                          <TableCell className="text-muted-foreground">{rec.business_name}</TableCell>
                          <TableCell className="text-right">{rec.conversations}</TableCell>
                          <TableCell className="text-right">{rec.appointments}</TableCell>
                          <TableCell className="text-right">{formatNumber(rec.avg_quality_score)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{formatPercent(rec.faq_match_rate)}</Badge>
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
