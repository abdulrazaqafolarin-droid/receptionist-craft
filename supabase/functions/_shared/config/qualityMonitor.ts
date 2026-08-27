/**
 * Config Quality Monitor
 *
 * Real operational capability: monitors AI response quality after config
 * changes and auto-reverts to the last known-good config if quality
 * degrades below a threshold.
 *
 * This is not a promise — it's a real monitoring system that protects
 * business owners from breaking their operator with bad config changes.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { revertToVersion, getLatestVersion, getVersionHistory } from "./versioning.ts";

export interface QualityMetrics {
  avg_confidence: number;
  escalation_rate: number;
  fallback_rate: number;
  sample_size: number;
  window_minutes: number;
}

export interface QualityGateResult {
  healthy: boolean;
  metrics: QualityMetrics;
  action: "none" | "warn" | "auto_revert";
  reverted_to_version?: number;
  reason?: string;
}

const QUALITY_THRESHOLDS = {
  min_confidence: 0.5,       // Below this → auto-revert
  max_escalation_rate: 0.4,  // Above this → auto-revert
  max_fallback_rate: 0.5,    // Above this → auto-revert
  min_sample_size: 5,        // Need at least N responses to evaluate
  monitoring_window: 30,     // Minutes to look back
  grace_period: 5,           // Minutes after config change before checking
};

/**
 * Check quality metrics for a receptionist after a config change.
 * Returns whether the config is healthy or should be reverted.
 */
export async function checkConfigQuality(
  supabase: SupabaseClient,
  receptionistId: string,
): Promise<QualityGateResult> {
  const windowStart = new Date(
    Date.now() - QUALITY_THRESHOLDS.monitoring_window * 60 * 1000,
  ).toISOString();

  // Get recent AI responses
  const { data: responses } = await supabase
    .from("ai_responses")
    .select("confidence, quality_score, flagged, tags")
    .eq("receptionist_id", receptionistId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (!responses || responses.length < QUALITY_THRESHOLDS.min_sample_size) {
    return {
      healthy: true,
      metrics: {
        avg_confidence: 0,
        escalation_rate: 0,
        fallback_rate: 0,
        sample_size: responses?.length || 0,
        window_minutes: QUALITY_THRESHOLDS.monitoring_window,
      },
      action: "none",
    };
  }

  // Compute metrics
  const avgConfidence =
    responses.reduce((sum, r) => sum + (r.confidence || 0), 0) /
    responses.length;

  const escalationCount = responses.filter(
    (r) => r.tags?.includes("escalation"),
  ).length;
  const escalationRate = escalationCount / responses.length;

  const fallbackCount = responses.filter(
    (r) => r.quality_score?.fallback || r.tags?.includes("low_confidence"),
  ).length;
  const fallbackRate = fallbackCount / responses.length;

  const metrics: QualityMetrics = {
    avg_confidence: avgConfidence,
    escalation_rate: escalationRate,
    fallback_rate: fallbackRate,
    sample_size: responses.length,
    window_minutes: QUALITY_THRESHOLDS.monitoring_window,
  };

  // Check thresholds
  const problems: string[] = [];

  if (avgConfidence < QUALITY_THRESHOLDS.min_confidence) {
    problems.push(
      `Avg confidence ${avgConfidence.toFixed(2)} below threshold ${QUALITY_THRESHOLDS.min_confidence}`,
    );
  }
  if (escalationRate > QUALITY_THRESHOLDS.max_escalation_rate) {
    problems.push(
      `Escalation rate ${(escalationRate * 100).toFixed(0)}% above threshold ${(QUALITY_THRESHOLDS.max_escalation_rate * 100)}%`,
    );
  }
  if (fallbackRate > QUALITY_THRESHOLDS.max_fallback_rate) {
    problems.push(
      `Fallback rate ${(fallbackRate * 100).toFixed(0)}% above threshold ${(QUALITY_THRESHOLDS.max_fallback_rate * 100)}%`,
    );
  }

  if (problems.length === 0) {
    return { healthy: true, metrics, action: "none" };
  }

  // Quality degraded — check if we should auto-revert
  const versionHistory = await getVersionHistory(supabase, receptionistId);
  const configChanges = versionHistory.filter(
    (v) =>
      v.change_source === "onboard_approve" ||
      v.change_source === "owner_revert" ||
      v.change_source === "conversation_change",
  );

  // Only auto-revert if there was a recent config change (within grace period)
  if (configChanges.length < 2) {
    return {
      healthy: false,
      metrics,
      action: "warn",
      reason: problems.join("; "),
    };
  }

  // Find the last known-good version (one before the most recent change)
  const lastGoodVersion = configChanges[1]; // Second most recent
  const latestVersion = configChanges[0];   // Most recent

  // Check if the latest version is recent (within grace period)
  const latestAge =
    (Date.now() - new Date(latestVersion.created_at).getTime()) / 60000;
  if (latestAge > QUALITY_THRESHOLDS.grace_period) {
    return {
      healthy: false,
      metrics,
      action: "warn",
      reason: problems.join("; "),
    };
  }

  // Auto-revert
  try {
    await revertToVersion(
      supabase,
      receptionistId,
      lastGoodVersion.version_number,
      "system_auto_revert",
    );

    return {
      healthy: false,
      metrics,
      action: "auto_revert",
      reverted_to_version: lastGoodVersion.version_number,
      reason: `Auto-reverted: ${problems.join("; ")}`,
    };
  } catch (revertErr) {
    console.error("[QualityMonitor] Auto-revert failed:", revertErr);
    return {
      healthy: false,
      metrics,
      action: "warn",
      reason: `Auto-revert failed: ${problems.join("; ")}`,
    };
  }
}

/**
 * Record a config change event for monitoring.
 * Called after every config update to establish the monitoring window.
 */
export async function recordConfigChange(
  supabase: SupabaseClient,
  receptionistId: string,
  versionNumber: number,
): Promise<void> {
  // Store the change timestamp for grace period calculation
  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: "system",
    event_type: "config_changed",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      version_number: versionNumber,
      changed_at: new Date().toISOString(),
    },
  });
}
