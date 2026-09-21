import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

interface ABTest {
  id: string;
  slug: string;
  start_at: string | null;
  end_at: string | null;
}

interface ABVariant {
  id: string;
  key: string;
  payload: Record<string, unknown>;
  weight: number;
}

interface VariantAssignment {
  variant_key: string;
  payload: Record<string, unknown>;
}

/**
 * Assigns a user to an A/B test variant and returns the variant payload
 * @param supabase - Supabase client (should have service role for full access)
 * @param testSlug - The slug/identifier of the A/B test
 * @param receptionistId - The receptionist ID for scoping
 * @param userId - The user ID (can be null for anonymous)
 * @returns Variant payload to merge into config, or null if no active test
 */
export async function assignVariant(
  supabase: SupabaseClient,
  testSlug: string,
  receptionistId: string,
  userId: string | null
): Promise<Record<string, unknown> | null> {
  try {
    console.log(`[AB] Checking test "${testSlug}" for user ${userId}`);

    // 1. Find active test by slug
    const now = new Date().toISOString();
    const { data: test, error: testError } = await supabase
      .from("ab_tests")
      .select("id, slug, start_at, end_at")
      .eq("slug", testSlug)
      .maybeSingle();

    if (testError || !test) {
      console.log(`[AB] Test "${testSlug}" not found`);
      return null;
    }

    // Check if test is active (within time range)
    const isActive =
      (!test.start_at || test.start_at <= now) &&
      (!test.end_at || test.end_at >= now);

    if (!isActive) {
      console.log(`[AB] Test "${testSlug}" is not active`);
      return null;
    }

    // 2. Check for existing assignment
    if (userId) {
      const { data: existingAssignment } = await supabase
        .from("ab_assignments")
        .select("variant_key")
        .eq("test_id", test.id)
        .eq("user_id", userId)
        .eq("receptionist_id", receptionistId)
        .maybeSingle();

      if (existingAssignment) {
        console.log(`[AB] User already assigned to variant: ${existingAssignment.variant_key}`);
        
        // Get variant payload
        const { data: variant } = await supabase
          .from("ab_variants")
          .select("payload")
          .eq("test_id", test.id)
          .eq("key", existingAssignment.variant_key)
          .maybeSingle();

        return variant?.payload || {};
      }
    }

    // 3. Get all variants for this test
    const { data: variants, error: variantsError } = await supabase
      .from("ab_variants")
      .select("id, key, payload, weight")
      .eq("test_id", test.id);

    if (variantsError || !variants || variants.length === 0) {
      console.log(`[AB] No variants found for test "${testSlug}"`);
      return null;
    }

    // 4. Choose variant based on weights
    const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 100), 0);
    let random = Math.random() * totalWeight;
    let selectedVariant = variants[0]; // fallback

    for (const variant of variants) {
      random -= variant.weight || 100;
      if (random <= 0) {
        selectedVariant = variant;
        break;
      }
    }

    console.log(`[AB] Assigned to variant: ${selectedVariant.key}`);

    // 5. Store assignment (fault-tolerant)
    try {
      await supabase.from("ab_assignments").insert({
        test_id: test.id,
        user_id: userId,
        receptionist_id: receptionistId,
        variant_key: selectedVariant.key,
      });
    } catch (insertError) {
      console.warn(`[AB] Failed to store assignment:`, insertError);
      // Continue anyway - we can still use the variant
    }

    return selectedVariant.payload || {};
  } catch (error) {
    console.error(`[AB] Error in assignVariant:`, error);
    return null;
  }
}

/**
 * Merges variant payload overrides into receptionist config
 * @param baseConfig - Original receptionist configuration
 * @param variantPayload - Variant overrides from A/B test
 * @returns Merged configuration
 */
export function mergeVariantConfig(
  baseConfig: Record<string, unknown>,
  variantPayload: Record<string, unknown> | null
): Record<string, unknown> {
  if (!variantPayload) return baseConfig;

  return {
    ...baseConfig,
    ...variantPayload,
    // Deep merge for nested objects if needed
    business_info: {
      ...(baseConfig.business_info || {}),
      ...(variantPayload.business_info || {}),
    },
  };
}
