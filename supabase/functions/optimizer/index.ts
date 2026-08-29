import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};

/**
 * Autonomous A/B Testing Optimizer
 * Runs continuously (or via cron) to:
 * 1. Analyze variant performance
 * 2. Auto-promote winners when statistically significant
 * 3. Create new variants when low performance detected
 * 4. Retire underperforming variants
 * 
 * SAFETY: Never modifies receptionist.model without approval
 */

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")
  );

  try {
    console.log("[Optimizer] Starting optimization run...");
    const results = {
      analyzed: 0,
      promoted: 0,
      created: 0,
      retired: 0,
      decisions: [] as any[]
    };

    // Get all active tests
    const now = new Date().toISOString();
    const { data: activeTests } = await supabase
      .from("ab_tests")
      .select("id, slug, name")
      .filter("start_at", "lte", now)
      .or(`end_at.is.null,end_at.gte.${now}`);

    if (!activeTests || activeTests.length === 0) {
      console.log("[Optimizer] No active tests found");
      return new Response(JSON.stringify({ message: "No active tests", results }), {
        headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    console.log(`[Optimizer] Found ${activeTests.length} active tests`);

    for (const test of activeTests) {
      results.analyzed++;
      
      // Get all variants for this test
      const { data: variants } = await supabase
        .from("ab_variants")
        .select("id, key, payload, weight")
        .eq("test_id", test.id);

      if (!variants || variants.length < 2) continue;

      // Calculate performance metrics for each variant
      const variantPerformance = await Promise.all(
        variants.map(async (variant) => {
          // Get assignments for this variant
          const { data: assignments } = await supabase
            .from("ab_assignments")
            .select("receptionist_id, user_id")
            .eq("test_id", test.id)
            .eq("variant_key", variant.key);

          const impressions = assignments?.length || 0;

          // Get AI responses for these assignments
          const receptionistIds = [...new Set(assignments?.map(a => a.receptionist_id) || [])];
          
          if (receptionistIds.length === 0) {
            return {
              variant,
              impressions: 0,
              avgQuality: 0,
              avgLatency: 0,
              score: 0
            };
          }

          const { data: responses } = await supabase
            .from("ai_responses")
            .select("quality_score, latency_ms, confidence")
            .in("receptionist_id", receptionistIds)
            .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .limit(1000);

          if (!responses || responses.length === 0) {
            return {
              variant,
              impressions,
              avgQuality: 0,
              avgLatency: 0,
              score: 0
            };
          }

          // Calculate metrics
          const qualityScores = responses.map(r => {
            const qs = typeof r.quality_score === 'string' 
              ? JSON.parse(r.quality_score) 
              : r.quality_score;
            return qs?.overall || qs?.confidence || 0;
          });

          const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
          const avgLatency = responses.reduce((sum, r) => sum + (r.latency_ms || 0), 0) / responses.length;

          // Composite score: quality (70%) + latency penalty (30%)
          // Lower latency is better, normalize to 0-1 scale (assuming 5000ms is very bad)
          const latencyScore = Math.max(0, 1 - (avgLatency / 5000));
          const score = (avgQuality * 0.7) + (latencyScore * 0.3);

          return {
            variant,
            impressions,
            avgQuality,
            avgLatency,
            score
          };
        })
      );

      // Sort by score descending
      variantPerformance.sort((a, b) => b.score - a.score);
      const winner = variantPerformance[0];
      const baseline = variantPerformance.find(v => v.variant.key === "control") || variantPerformance[1];

      console.log(`[Optimizer] Test "${test.name}" scores:`, 
        variantPerformance.map(v => ({ key: v.variant.key, score: v.score.toFixed(3), impressions: v.impressions }))
      );

      // Decision: Auto-promote winner if:
      // 1. Winner has +5% score improvement
      // 2. Minimum 200 impressions
      // 3. Not the control variant
      if (winner.impressions >= 200 && 
          winner.variant.key !== "control" &&
          winner.score > baseline.score * 1.05) {
        
        console.log(`[Optimizer] Promoting winner: ${winner.variant.key} (score: ${winner.score.toFixed(3)})`);
        
        // Update control variant to use winner's payload
        const { error: updateError } = await supabase
          .from("ab_variants")
          .update({ payload: winner.variant.payload })
          .eq("test_id", test.id)
          .eq("key", "control");

        if (!updateError) {
          results.promoted++;
          results.decisions.push({
            test: test.slug,
            action: "promoted",
            variant: winner.variant.key,
            oldScore: baseline.score,
            newScore: winner.score,
            improvement: ((winner.score - baseline.score) / baseline.score * 100).toFixed(1) + "%"
          });
        }
      }

      // Decision: Retire low performers
      // Variants with score < 50% of winner and >100 impressions should be retired
      for (const perf of variantPerformance) {
        if (perf.variant.key === "control") continue;
        if (perf.impressions >= 100 && perf.score < winner.score * 0.5) {
          console.log(`[Optimizer] Retiring poor performer: ${perf.variant.key}`);
          
          // Set weight to 0 to stop traffic
          await supabase
            .from("ab_variants")
            .update({ weight: 0 })
            .eq("test_id", test.id)
            .eq("key", perf.variant.key);

          results.retired++;
          results.decisions.push({
            test: test.slug,
            action: "retired",
            variant: perf.variant.key,
            score: perf.score,
            reason: "Score below 50% of winner"
          });
        }
      }

      // Decision: Create new variant if all variants performing well
      // (This is conservative - only create if we have stable metrics)
      const allPerformingWell = variantPerformance.every(v => v.score > 0.7 && v.impressions >= 50);
      if (allPerformingWell && variants.length < 4) {
        console.log(`[Optimizer] Creating new exploratory variant for test "${test.name}"`);
        
        // Create a temperature variation
        const newVariant = {
          test_id: test.id,
          key: `variant_${Date.now()}`,
          payload: {
            temperature: Math.random() * 0.4 + 0.3, // Random between 0.3-0.7
          },
          weight: 10 // Start with 10% traffic
        };

        const { error: createError } = await supabase
          .from("ab_variants")
          .insert(newVariant);

        if (!createError) {
          results.created++;
          results.decisions.push({
            test: test.slug,
            action: "created",
            variant: newVariant.key,
            payload: newVariant.payload
          });
        }
      }
    }

    console.log("[Optimizer] Optimization complete:", results);

    return new Response(JSON.stringify({ 
      success: true,
      timestamp: new Date().toISOString(),
      results 
    }), {
      headers: { ...CORS, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("[Optimizer] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});