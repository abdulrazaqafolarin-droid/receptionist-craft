// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS CAPABILITY SYSTEM — MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
// This module replaces static business types with dynamic capabilities
// that drive AI behavior based on what businesses can actually do.
// ═══════════════════════════════════════════════════════════════════════════

// Type exports
export {
  type PrimaryGoal,
  type UniversalIntent,
  type BusinessCapabilities,
  type BusinessProfile,
  type CapabilityRoutingResult,
  type CapabilityContext,
  DEFAULT_CAPABILITY_MAPPINGS,
  DEFAULT_GOAL_MAPPINGS,
  getDefaultCapabilities,
  getDefaultGoal,
  createEmptyCapabilities,
} from './types.ts';

// Intent classification exports
export {
  classifyUniversalIntent,
  validateIntentAgainstCapabilities,
  getGoalBias,
  buildCapabilityPrompt,
} from './intentClassifier.ts';

// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITY RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

import type { BusinessCapabilities, PrimaryGoal } from './types.ts';
import { getDefaultCapabilities, getDefaultGoal } from './types.ts';

/**
 * Resolve capabilities from receptionist record
 * Handles: explicit capabilities > derived from services/products > business_type default
 */
export function resolveCapabilities(
  receptionist: {
    business_type?: string | null;
    capabilities?: BusinessCapabilities | null;
    ai_mode?: string | null;
  },
  services: Array<{ is_product?: boolean | null }> = []
): BusinessCapabilities {
  // Priority 1: Explicit capabilities stored on receptionist
  if (receptionist.capabilities) {
    return receptionist.capabilities;
  }
  
  // Priority 2: Derive from services/products
  const hasProducts = services.some(s => s.is_product === true);
  const hasServices = services.some(s => s.is_product !== true);
  
  if (hasProducts || hasServices) {
    return {
      sells_products: hasProducts,
      books_appointments: hasServices,
      offers_services: hasServices,
      delivers: false,
      requires_compliance: false,
      supports_emergency: false,
    };
  }
  
  // Priority 3: Default based on business_type
  return getDefaultCapabilities(receptionist.business_type || 'General Business');
}

/**
 * Resolve primary goal from receptionist record
 */
export function resolvePrimaryGoal(
  receptionist: {
    business_type?: string | null;
    ai_mode?: string | null;
  }
): PrimaryGoal {
  // Map legacy ai_mode to primary_goal
  if (receptionist.ai_mode) {
    switch (receptionist.ai_mode) {
      case 'sales':
        return 'increase_sales';
      case 'booking':
        return 'increase_bookings';
      case 'support':
        return 'reduce_calls';
    }
  }
  
  // Use business_type default
  return getDefaultGoal(receptionist.business_type || 'General Business');
}

/**
 * Check if a specific action is allowed by capabilities
 */
export function canPerformAction(
  action: 'sell_product' | 'book_appointment' | 'provide_service' | 'deliver',
  capabilities: BusinessCapabilities
): boolean {
  switch (action) {
    case 'sell_product':
      return capabilities.sells_products;
    case 'book_appointment':
      return capabilities.books_appointments;
    case 'provide_service':
      return capabilities.offers_services_on_demand || capabilities.books_appointments;
    case 'deliver':
      return capabilities.delivers;
    default:
      return false;
  }
}

/**
 * Get suggested alternative when action is not available
 */
export function getSuggestedAlternative(
  requestedAction: 'sell_product' | 'book_appointment' | 'provide_service',
  capabilities: BusinessCapabilities
): string | null {
  if (requestedAction === 'sell_product' && !capabilities.sells_products) {
    if (capabilities.books_appointments) {
      return 'book an appointment to discuss our services';
    }
    return null;
  }
  
  if (requestedAction === 'book_appointment' && !capabilities.books_appointments) {
    if (capabilities.offers_services_on_demand) {
      return 'come in anytime - no appointment needed';
    }
    if (capabilities.sells_products) {
      return 'browse our products';
    }
    return null;
  }
  
  if (requestedAction === 'provide_service') {
    if (capabilities.books_appointments) {
      return 'book an appointment for this service';
    }
  }
  
  return null;
}
