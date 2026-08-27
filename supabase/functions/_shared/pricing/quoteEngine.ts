/**
 * Quote / Dynamic Pricing System
 *
 * For businesses that give estimates instead of fixed prices:
 * - Auto repair shops (diagnostic → rough quote)
 * - Moving companies (inventory → truck size + crew)
 * - Event venues (date + guests → dynamic pricing)
 * - Home services (issue + distance → estimate)
 *
 * Generates quotes from conversationally-collected variables,
 * using the service's pricing_model rules.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface PricingModel {
  type: "fixed" | "range" | "per_unit" | "quote_based" | "dynamic";
  // Fixed
  price?: number;
  // Range
  min?: number;
  max?: number;
  // Per unit
  unit?: string;
  rate?: number;
  minimum?: number;
  // Dynamic
  factors?: Array<{
    name: string;
    unit: string;
    rate: number;
    min_value?: number;
    max_value?: number;
  }>;
}

export interface QuoteResult {
  quote_min: number;
  quote_max: number;
  notes: string;
  valid_days: number;
  pricing_model_used: string;
}

/**
 * Generate a quote from collected variables using the service's pricing model.
 */
export function generateQuote(
  pricingModel: PricingModel | null,
  variables: Record<string, number>,
  serviceName: string,
): QuoteResult {
  // No pricing model = can't generate a quote
  if (!pricingModel) {
    return {
      quote_min: 0,
      quote_max: 0,
      notes: "Please contact us for a custom quote.",
      valid_days: 7,
      pricing_model_used: "none",
    };
  }

  switch (pricingModel.type) {
    case "fixed": {
      const price = pricingModel.price || 0;
      return {
        quote_min: price,
        quote_max: price,
        notes: `Fixed price for ${serviceName}.`,
        valid_days: 30,
        pricing_model_used: "fixed",
      };
    }

    case "range": {
      return {
        quote_min: pricingModel.min || 0,
        quote_max: pricingModel.max || 0,
        notes: `Estimated range for ${serviceName}. Final price may vary based on specifics.`,
        valid_days: 14,
        pricing_model_used: "range",
      };
    }

    case "per_unit": {
      const unit = pricingModel.unit || "unit";
      const rate = pricingModel.rate || 0;
      const minimum = pricingModel.minimum || 0;

      // Find the relevant variable value
      const unitValue = variables[unit] || variables[`${unit}s`] || 0;
      const total = Math.max(minimum, unitValue * rate);

      return {
        quote_min: total,
        quote_max: total,
        notes: `${unitValue} ${unit} × $${rate}/${unit} (minimum $${minimum}). Final count confirmed on-site.`,
        valid_days: 14,
        pricing_model_used: "per_unit",
      };
    }

    case "dynamic": {
      if (!pricingModel.factors || pricingModel.factors.length === 0) {
        return {
          quote_min: 0,
          quote_max: 0,
          notes: "Please contact us for a custom quote.",
          valid_days: 7,
          pricing_model_used: "dynamic",
        };
      }

      let totalMin = 0;
      let totalMax = 0;
      const breakdowns: string[] = [];

      for (const factor of pricingModel.factors) {
        const value = variables[factor.name] || variables[factor.unit] || 0;
        const minVal = Math.max(factor.min_value || 0, value);
        const maxVal = value;

        const costMin = minVal * factor.rate;
        const costMax = maxVal * factor.rate;

        totalMin += costMin;
        totalMax += costMax;
        breakdowns.push(`${factor.name}: ${value} ${factor.unit} × $${factor.rate}`);
      }

      return {
        quote_min: totalMin,
        quote_max: totalMax,
        notes: `Estimate based on: ${breakdowns.join(", ")}. Final price after inspection.`,
        valid_days: 7,
        pricing_model_used: "dynamic",
      };
    }

    case "quote_based":
    default:
      return {
        quote_min: 0,
        quote_max: 0,
        notes: `A custom quote will be prepared for your ${serviceName} request. You'll receive it within 24 hours.`,
        valid_days: 7,
        pricing_model_used: "quote_based",
      };
  }
}

/**
 * Save a quote request to the database.
 */
export async function saveQuoteRequest(
  supabase: SupabaseClient,
  params: {
    receptionist_id: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_id?: string;
    service_id?: string;
    service_name?: string;
    scope_description?: string;
    variables: Record<string, number>;
    quote: QuoteResult;
  },
): Promise<string> {
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + params.quote.valid_days);

  const { data, error } = await supabase
    .from("quote_requests")
    .insert({
      receptionist_id: params.receptionist_id,
      customer_name: params.customer_name,
      customer_email: params.customer_email,
      customer_phone: params.customer_phone,
      customer_id: params.customer_id,
      service_id: params.service_id,
      service_name: params.service_name,
      scope_description: params.scope_description,
      variables: params.variables,
      quote_min: params.quote.quote_min,
      quote_max: params.quote.quote_max,
      quote_notes: params.quote.notes,
      quote_valid_until: validUntil.toISOString(),
      status: "presented",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Get the pricing model for a service.
 */
export async function getServicePricingModel(
  supabase: SupabaseClient,
  serviceId: string,
): Promise<PricingModel | null> {
  const { data } = await supabase
    .from("services")
    .select("pricing_model, price")
    .eq("id", serviceId)
    .maybeSingle();

  if (!data) return null;

  if (data.pricing_model) {
    return data.pricing_model as PricingModel;
  }

  // Fall back to fixed price
  if (data.price) {
    return { type: "fixed", price: data.price };
  }

  return { type: "quote_based" };
}
