/**
 * Phase 3 — Payment Provider Factory
 *
 * Resolves the correct PaymentProvider from the integrations table.
 * One function = one place to add a new provider.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { PaymentProvider, ProviderName, ProviderConfig } from "./types.ts";
import { parseProviderConfig } from "./types.ts";
import { StripeProvider } from "./stripe.ts";
import { PaystackProvider } from "./paystack.ts";

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "not_configured"
      | "invalid_config"
      | "provider_not_found",
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Resolve a payment provider for a receptionist.
 * Looks up the integrations table for an active provider config.
 */
export async function resolveProvider(
  supabase: ReturnType<typeof createClient>,
  receptionistId: string,
): Promise<{ provider: PaymentProvider; config: ProviderConfig }> {
  // Find active payment integrations for this user
  // First get the receptionist's user_id
  const { data: receptionist } = await supabase
    .from("receptionists")
    .select("user_id")
    .eq("id", receptionistId)
    .maybeSingle();

  if (!receptionist?.user_id) {
    throw new PaymentProviderError("Receptionist not found", "not_configured");
  }

  // Look for active payment provider integrations
  // Try Stripe first, then Paystack (ordered by preference)
  const providers: ProviderName[] = ["stripe", "paystack"];

  for (const providerName of providers) {
    const { data: integration } = await supabase
      .from("integrations")
      .select("config_json")
      .eq("type", providerName)
      .eq("user_id", receptionist.user_id)
      .eq("enabled", true)
      .maybeSingle();

    if (integration?.config_json) {
      const config = parseProviderConfig(integration.config_json);
      if (config) {
        return {
          provider: createProvider(providerName, config),
          config,
        };
      }
    }
  }

  throw new PaymentProviderError(
    "No active payment provider configured. Connect Stripe or Paystack in Settings → Channels.",
    "not_configured",
  );
}

/** Instantiate a provider by name. */
export function createProvider(
  name: ProviderName,
  config: ProviderConfig,
): PaymentProvider {
  switch (name) {
    case "stripe":
      return new StripeProvider(config);
    case "paystack":
      return new PaystackProvider(config);
    default:
      throw new PaymentProviderError(
        `Unknown provider: ${name}`,
        "provider_not_found",
      );
  }
}

export type { PaymentProvider, ProviderName, ProviderConfig } from "./types.ts";
