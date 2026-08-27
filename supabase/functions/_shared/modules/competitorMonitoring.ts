/**
 * Module 15: Competitor / Market Monitoring
 *
 * Tracks competitor pricing, promotions, or news relevant to the business
 * and summarizes it for the owner. Uses web search/fetch — a general tool
 * that likely already exists. Realistically Tier 1 achievable without a
 * bespoke per-business connector.
 *
 * Tier: 1 (web search available)
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface CompetitorAlert {
  id: string;
  type: "pricing_change" | "new_promotion" | "news" | "review" | "social_post";
  competitor_name: string;
  summary: string;
  source_url: string | null;
  severity: "info" | "warning" | "action_needed";
  detected_at: string;
}

export interface MonitoringConfig {
  competitors: Array<{
    name: string;
    website?: string;
    social_handles?: string[];
  }>;
  keywords: string[];           // Business-relevant keywords to monitor
  alert_threshold: "all" | "important_only";
}

/**
 * Analyze competitor data from web search results.
 * Returns structured alerts for the owner.
 */
export async function analyzeCompetitorData(
  supabase: SupabaseClient,
  receptionistId: string,
  searchResults: Array<{ title: string; url: string; snippet: string }>,
): Promise<CompetitorAlert[]> {
  // Load monitoring config
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, business_type, capabilities")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "";
  const alerts: CompetitorAlert[] = [];

  for (const result of searchResults) {
    // Analyze each result for relevant signals
    const text = `${result.title} ${result.snippet}`.toLowerCase();

    // Detect pricing signals
    if (/price|pricing|discount|sale|offer|deal|%\s*off/i.test(text)) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "pricing_change",
        competitor_name: extractCompetitorName(result.title, businessName),
        summary: `${result.title} — ${result.snippet}`,
        source_url: result.url,
        severity: "warning",
        detected_at: new Date().toISOString(),
      });
    }

    // Detect promotion signals
    if (/promo|campaign|launch|new service|new product|grand opening/i.test(text)) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "new_promotion",
        competitor_name: extractCompetitorName(result.title, businessName),
        summary: `${result.title} — ${result.snippet}`,
        source_url: result.url,
        severity: "info",
        detected_at: new Date().toISOString(),
      });
    }

    // Detect news
    if (/announce|partner|expand|hire|invest|acquire/i.test(text)) {
      alerts.push({
        id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: "news",
        competitor_name: extractCompetitorName(result.title, businessName),
        summary: `${result.title} — ${result.snippet}`,
        source_url: result.url,
        severity: "info",
        detected_at: new Date().toISOString(),
      });
    }
  }

  // Save alerts as conversion events for tracking
  for (const alert of alerts) {
    await supabase.from("conversion_events").insert({
      receptionist_id: receptionistId,
      session_id: "monitoring",
      event_type: "competitor_alert",
      revenue_value: 0,
      currency: "USD",
      metadata: {
        alert_type: alert.type,
        competitor: alert.competitor_name,
        severity: alert.severity,
        source: alert.source_url,
      },
    });
  }

  return alerts;
}

/**
 * Generate a monitoring report from saved alerts.
 */
export async function getMonitoringReport(
  supabase: SupabaseClient,
  receptionistId: string,
  days: number = 7,
): Promise<{
  total_alerts: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  recent_alerts: CompetitorAlert[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from("conversion_events")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .eq("event_type", "competitor_alert")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const alerts = (events || []).map((e) => ({
    id: e.id,
    type: e.metadata?.alert_type || "news",
    competitor_name: e.metadata?.competitor || "Unknown",
    summary: `Competitor alert: ${e.metadata?.alert_type}`,
    source_url: e.metadata?.source || null,
    severity: e.metadata?.severity || "info",
    detected_at: e.created_at,
  }));

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  alerts.forEach((a) => {
    byType[a.type] = (byType[a.type] || 0) + 1;
    bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
  });

  return {
    total_alerts: alerts.length,
    by_type: byType,
    by_severity: bySeverity,
    recent_alerts: alerts.slice(0, 10),
  };
}

function extractCompetitorName(title: string, excludeBusiness: string): string {
  // Simple heuristic: first significant words in the title
  const words = title.split(/\s+/).filter((w) => w.length > 2);
  const exclude = excludeBusiness.toLowerCase().split(/\s+/);
  const name = words
    .filter((w) => !exclude.includes(w.toLowerCase()))
    .slice(0, 3)
    .join(" ");
  return name || "Competitor";
}
