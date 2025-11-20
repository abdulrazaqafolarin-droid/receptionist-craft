import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MessageCircle, Calendar, TrendingUp, Clock, Target, Award } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export default function Analytics() {
  const [user, setUser] = useState<any>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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
        body: { userId: user.id }
      });

      if (error) throw error;

      setAnalytics(data.analytics);
      setCached(data.cached);
    } catch (err) {
      console.error("Error loading analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatNumber = (value: number | null) => value != null ? value.toFixed(2) : "—";

  // Prepare chart data
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Analytics Dashboard
            </h1>
            <p className="text-muted-foreground">
              Comprehensive insights into your AI receptionist performance
              {cached && " (cached data)"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-10 w-20" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : !analytics ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">No analytics data available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Key Metrics */}
            <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                  <MessageCircle className="h-4 w-4" style={{ color: "#0000d8" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.conversation_metrics.total_conversations}</div>
                  <p className="text-xs text-muted-foreground">Last 30 days</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Appointments</CardTitle>
                  <Calendar className="h-4 w-4" style={{ color: "#0cddff" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analytics.business_metrics.appointments_booked}</div>
                  <p className="text-xs text-muted-foreground">Total booked</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
                  <Award className="h-4 w-4" style={{ color: "#0000d8" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(analytics.ai_quality_metrics.avg_quality_score)}</div>
                  <p className="text-xs text-muted-foreground">Average rating</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">FAQ Match</CardTitle>
                  <Target className="h-4 w-4" style={{ color: "#0cddff" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatPercent(analytics.ai_quality_metrics.faq_match_rate)}</div>
                  <p className="text-xs text-muted-foreground">Accuracy rate</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Response Time</CardTitle>
                  <Clock className="h-4 w-4" style={{ color: "#0000d8" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {analytics.performance_metrics.average_response_time 
                      ? `${Math.round(analytics.performance_metrics.average_response_time)}ms`
                      : "—"
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">Average latency</p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow border-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion</CardTitle>
                  <TrendingUp className="h-4 w-4" style={{ color: "#0cddff" }} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatPercent(analytics.business_metrics.booking_conversion_rate)}
                  </div>
                  <p className="text-xs text-muted-foreground">Booking rate</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Conversation Trend</CardTitle>
                  <CardDescription>Daily conversations over the last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={conversationTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }} 
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="#0000d8" 
                        strokeWidth={2}
                        dot={{ fill: "#0000d8" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>AI Quality Metrics</CardTitle>
                  <CardDescription>Average scores across quality dimensions</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={qualityMetricsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="metric" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="value" fill="#0cddff" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Match Rate Analysis</CardTitle>
                  <CardDescription>FAQ vs Semantic vs Fallback responses</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={matchRateData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px"
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="rate" fill="#0000d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Business Impact</CardTitle>
                  <CardDescription>Key business metrics at a glance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="font-medium">Total Messages</span>
                    <span className="text-2xl font-bold">{analytics.conversation_metrics.total_messages}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="font-medium">Lead Captures</span>
                    <span className="text-2xl font-bold">{analytics.business_metrics.lead_captures}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="font-medium">Avg Conv. Length</span>
                    <span className="text-2xl font-bold">
                      {analytics.conversation_metrics.average_conversation_length.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="font-medium">Unanswered</span>
                    <span className="text-2xl font-bold text-destructive">
                      {analytics.ai_quality_metrics.unanswered_questions}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Receptionist Breakdown Table */}
            <Card>
              <CardHeader>
                <CardTitle>Receptionist Performance</CardTitle>
                <CardDescription>Detailed breakdown by AI receptionist</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      <TableRow key={rec.id}>
                        <TableCell className="font-medium">{rec.name}</TableCell>
                        <TableCell>{rec.business_name}</TableCell>
                        <TableCell className="text-right">{rec.conversations}</TableCell>
                        <TableCell className="text-right">{rec.appointments}</TableCell>
                        <TableCell className="text-right">{formatNumber(rec.avg_quality_score)}</TableCell>
                        <TableCell className="text-right">{formatPercent(rec.faq_match_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
