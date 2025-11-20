import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, MessageSquare, Clock } from "lucide-react";

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
}

interface BuilderAnalyticsPanelProps {
  receptionistId: string;
  userId: string;
}

export function BuilderAnalyticsPanel({ receptionistId, userId }: BuilderAnalyticsPanelProps) {
  const [stats, setStats] = useState<ReceptionistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [receptionistId, userId]);

  async function loadStats() {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke("analytics/stats", {
        body: { receptionistId }
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

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Real-time Analytics</h3>
        <Badge variant="outline" className="ml-auto text-xs">Live</Badge>
      </div>

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

      {stats.recent_responses && stats.recent_responses.length > 0 && (
        <div className="mt-4 pt-4 border-t">
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
