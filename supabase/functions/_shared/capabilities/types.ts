// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS CAPABILITY GRAPH — TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
// This replaces the static "business type" with a dynamic capability system
// that drives AI behavior based on what the business can actually do.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Primary business goals - what the business wants to optimize for
 */
export type PrimaryGoal = 
  | 'increase_sales'      // Focus on product purchases
  | 'increase_bookings'   // Focus on appointment bookings
  | 'reduce_calls'        // Handle inquiries to reduce phone volume
  | 'capture_leads'       // Collect contact info for follow-up
  | 'general_support';    // Balanced general assistance

/**
 * Universal intent types - what the user is trying to do
 * This is the FIRST classification before detailed intent detection
 */
export type UniversalIntent = 
  | 'ProductPurchase'     // User wants to buy something
  | 'AppointmentBooking'  // User wants to book time
  | 'ServiceRequest'      // User wants a service (now or recurring)
  | 'Information'         // User wants information
  | 'Support'             // User has an issue/complaint
  | 'Unknown';            // Cannot classify

/**
 * Business capabilities - what the business can do
 */
export interface BusinessCapabilities {
  // Core action capabilities
  sells_products: boolean;           // Can sell physical or digital products
  books_appointments: boolean;       // Can book time-based appointments
  offers_services_on_demand: boolean; // Can provide services without appointment
  
  // Modifier capabilities
  delivers: boolean;                 // Can deliver products/services
  requires_compliance: boolean;      // Has legal/medical compliance needs
  supports_urgent_requests: boolean; // Can handle urgent/emergency requests
  has_membership: boolean;           // Has membership/subscription model
  
  // Optional metadata
  industry_category?: string;        // For analytics/suggestions
}

/**
 * Complete business profile including capabilities
 */
export interface BusinessProfile {
  id: string;
  name: string;
  capabilities: BusinessCapabilities;
  primary_goal: PrimaryGoal;
  description?: string;
  category?: string;  // Legacy business_type for presets
}

/**
 * Intent routing result after capability check
 */
export interface CapabilityRoutingResult {
  allowed: boolean;
  flowType: 'SERVICE' | 'PRODUCT' | 'SERVICE_ON_DEMAND' | null;
  reason?: string;
  alternative?: string;
  suggestedAction?: string;
}

/**
 * Capability-aware conversation context
 */
export interface CapabilityContext {
  capabilities: BusinessCapabilities;
  primary_goal: PrimaryGoal;
  universal_intent: UniversalIntent;
  capability_match: boolean;
  fallback_available: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CAPABILITY MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default capability mappings by business type (for backward compatibility)
 * These are used when capabilities aren't explicitly set
 */
export const DEFAULT_CAPABILITY_MAPPINGS: Record<string, BusinessCapabilities> = {
  // Pure appointment-based
  'Dental Clinic': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: true,
    supports_urgent_requests: true,
    has_membership: false,
  },
  'Medical Clinic': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: true,
    supports_urgent_requests: true,
    has_membership: false,
  },
  'Law Office': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: true,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Hair Salon': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Barber Shop': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Spa & Wellness': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: true,
  },
  
  // Pure product-based
  'Grocery Store': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: false,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Retail Store': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: false,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Electronics Store': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Bakery': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Florist': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: true,
    has_membership: false,
  },
  'Auto Parts': {
    sells_products: true,
    books_appointments: false,
    offers_services_on_demand: false,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: true,
    has_membership: false,
  },
  
  // Hybrid businesses
  'Pharmacy': {
    sells_products: true,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: true,
    supports_urgent_requests: true,
    has_membership: false,
  },
  'Restaurant': {
    sells_products: true,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
  'Gym & Fitness': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: true,
  },
  'Car Wash': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: true,
  },
  'Pet Shop': {
    sells_products: true,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: true,
    has_membership: false,
  },
  'Real Estate': {
    sells_products: false,
    books_appointments: true,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: true,
    supports_urgent_requests: false,
    has_membership: false,
  },
  
  // Default fallback
  'General Business': {
    sells_products: true,
    books_appointments: true,
    offers_services_on_demand: true,
    delivers: true,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  },
};

/**
 * Default goal mappings by business type
 */
export const DEFAULT_GOAL_MAPPINGS: Record<string, PrimaryGoal> = {
  'Dental Clinic': 'increase_bookings',
  'Medical Clinic': 'increase_bookings',
  'Law Office': 'capture_leads',
  'Hair Salon': 'increase_bookings',
  'Barber Shop': 'increase_bookings',
  'Spa & Wellness': 'increase_bookings',
  'Grocery Store': 'increase_sales',
  'Retail Store': 'increase_sales',
  'Electronics Store': 'increase_sales',
  'Bakery': 'increase_sales',
  'Florist': 'increase_sales',
  'Auto Parts': 'increase_sales',
  'Pharmacy': 'reduce_calls',
  'Restaurant': 'increase_bookings',
  'Gym & Fitness': 'increase_sales',
  'Car Wash': 'increase_sales',
  'Pet Shop': 'increase_sales',
  'Real Estate': 'capture_leads',
  'General Business': 'general_support',
};

/**
 * Get default capabilities for a business type
 */
export function getDefaultCapabilities(businessType: string): BusinessCapabilities {
  return DEFAULT_CAPABILITY_MAPPINGS[businessType] || DEFAULT_CAPABILITY_MAPPINGS['General Business'];
}

/**
 * Get default goal for a business type
 */
export function getDefaultGoal(businessType: string): PrimaryGoal {
  return DEFAULT_GOAL_MAPPINGS[businessType] || 'general_support';
}

/**
 * Create empty capabilities (all disabled)
 */
export function createEmptyCapabilities(): BusinessCapabilities {
  return {
    sells_products: false,
    books_appointments: false,
    offers_services_on_demand: false,
    delivers: false,
    requires_compliance: false,
    supports_urgent_requests: false,
    has_membership: false,
  };
}
