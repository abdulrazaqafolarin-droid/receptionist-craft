import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Calendar, ArrowRight } from "lucide-react";

interface DashboardChartsProps {
  receptionistIds: string[];
}

interface DailyData {
  date: string;
  conversations: number;
  appointments: number;
  orders: number;
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

export function DashboardCharts({ receptionistIds }: DashboardChartsProps) {
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (receptionistIds.length > 0) loadChartData();
  }, [receptionistIds]);

  async function loadChartData() {
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const since = thirtyDaysAgo.toISOString();

      // Fetch conversations and appointments in parallel
      const [convRes, apptRes, ordersRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("created_at")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", since),
        supabase
          .from("appointments")
          .select("created_at, status")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", since),
        supabase
          .from("orders")
          .select("created_at, status")
          .in("receptionist_id", receptionistIds)
          .gte("created_at", since),
      ]);

      const conversations = convRes.data || [];
      const appointments = apptRes.data || [];
      const ordersData = ordersRes.data || [];

      // Build daily buckets
      const dayMap: Record<string, { conversations: number; appointments: number }> = {};
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const key = d.toISOString().split("T")[0];
        dayMap[key] = { conversations: 0, appointments: 0, orders: 0 };
      }

      conversations.forEach((c) => {
        const key = new Date(c.created_at).toISOString().split("T")[0];
        if (dayMap[key]) dayMap[key].conversations++;
      });

      appointments.forEach((a) => {
        const key = new Date(a.created_at).toISOString().split("T")[0];
        if (dayMap[key]) dayMap[key].appointments++;
      });

      ordersData.forEach((o) => {
        const key = new Date(o.created_at).toISOString().split("T")[0];
        if (dayMap[key]) dayMap[key].orders++;
      });

      const daily = Object.entries(dayMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({
          date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          ...vals,
        }));

      setDailyData(daily);

      // Conversion funnel
      const totalConversations = conversations.length;
      const totalAppointments = appointments.length;
      const totalOrders = ordersData.length;
      const completedAppointments = appointments.filter((a) => a.status === "completed").length;
      const completedOrders = ordersData.filter((o) => o.status === "completed").length;

      setFunnel([
        { label: "Conversations", value: totalConversations, color: "hsl(var(--primary))" },
        { label: "Bookings", value: totalAppointments, color: "hsl(var(--chart-2))" },
        { label: "Orders", value: totalOrders, color: "hsl(var(--chart-4, 280 65% 60%))" },
        { label: "Completed", value: completedAppointments + completedOrders, color: "hsl(var(--success))" },
      ]);
    } catch (err) {
      console.error("Chart data error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-2 border-border/50">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[180px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
      {/* Conversation Trend */}
      <Card className="border-2 border-border/50 lg:col-span-1">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Conversations</CardTitle>
          </div>
          <CardDescription className="text-xs">Last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="convGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} />
              <Area
                type="monotone"
                dataKey="conversations"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#convGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Appointments Trend */}
      <Card className="border-2 border-border/50 lg:col-span-1">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-chart-2" />
            <CardTitle className="text-sm">Appointments</CardTitle>
          </div>
          <CardDescription className="text-xs">Last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar
                dataKey="appointments"
                fill="hsl(var(--chart-2))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card className="border-2 border-border/50 lg:col-span-1">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <CardTitle className="text-sm">Conversion Funnel</CardTitle>
          </div>
          <CardDescription className="text-xs">Last 30 days</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3 py-4">
            {funnel.map((step, idx) => {
              const maxVal = funnel[0]?.value || 1;
              const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
              const dropOff = idx > 0 && funnel[idx - 1].value > 0
                ? ((funnel[idx - 1].value - step.value) / funnel[idx - 1].value * 100).toFixed(0)
                : null;

              return (
                <div key={step.label}>
                  {idx > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 ml-2">
                      <ArrowRight className="h-3 w-3" />
                      <span>{dropOff}% drop-off</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{step.label}</span>
                    <span className="font-bold">{step.value}</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: step.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
