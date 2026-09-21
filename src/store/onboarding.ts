import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OperationsConfig } from '@/lib/operationsConfig';

export type ItemType = 'service' | 'product';

export type PrimaryGoal = 'sales' | 'bookings' | 'support' | 'leads';

export type BusinessCapabilities = {
  sells_products: boolean;
  books_appointments: boolean;
  offers_services: boolean;
  delivers: boolean;
  requires_compliance: boolean;
  supports_emergency: boolean;
  deposit_required: boolean;
  deposit_percent: number;
};

export type ServiceOrProduct = {
  name: string;
  duration_minutes: number;
  description?: string;
  active: boolean;
  type: ItemType;
  price?: number;
  // Allow extra fields from AI parsers
  priceSpecified?: boolean;
  noTime?: boolean;
  addPriceChoice?: 'now' | 'later' | null;
  [key: string]: unknown;
};

type AvailabilityRule = {
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
};

type FAQ = {
  question: string;
  answer: string;
  priority: number;
};

type OnboardingState = {
  currentStep: number;
  receptionistId: string | null;
  receptionist: {
    name: string;
    business_name: string;
    business_type: string;
    business_model: 'services' | 'products' | 'both';
    phone: string;
    greeting_message: string;
    goal: string;
    tone: 'friendly' | 'professional' | 'playful';
    language: string;
    // New capability-based fields
    primary_goal: PrimaryGoal;
    capabilities: BusinessCapabilities;
  };
  services: ServiceOrProduct[];
  availabilityRules: AvailabilityRule[];
  faqs: FAQ[];
  timezone: string;
  setStep: (step: number) => void;
  setReceptionistId: (id: string) => void;
  setReceptionist: (data: Partial<OnboardingState['receptionist']>) => void;
  addService: (service: ServiceOrProduct) => void;
  removeService: (index: number) => void;
  setServices: (services: ServiceOrProduct[]) => void;
  addAvailabilityRule: (rule: AvailabilityRule) => void;
  setAvailabilityRules: (rules: AvailabilityRule[]) => void;
  addFAQ: (faq: FAQ) => void;
  removeFAQ: (index: number) => void;
  setFAQs: (faqs: FAQ[]) => void;
  applyOperationsConfig: (config: OperationsConfig) => void;
  reset: () => void;
};

/**
 * Derive store-facing fields from a validated OperationsConfig draft
 * produced by the Business Configuration Agent (Phase 1).
 */
export function deriveReceptionistPatch(config: OperationsConfig) {
  const booking = config.workflows.appointment_booking?.enabled === true;
  const ordering = config.workflows.product_ordering?.enabled === true;
  const delivery = config.workflows.product_ordering?.delivery === true;

  return {
    receptionist: {
      name: config.business.display_name,
      business_name: config.business.display_name,
      business_type: config.business.business_type,
      business_model: (booking && ordering ? 'both' : ordering ? 'products' : 'services') as 'services' | 'products' | 'both',
      phone: config.contact?.phone ?? '',
      greeting_message: config.business.greeting_message ?? '',
      goal: '',
      tone: (config.business.tone ?? 'friendly') as 'friendly' | 'professional' | 'playful',
      language: 'English',
      primary_goal: ((booking && ordering) || (!booking && ordering)
        ? 'sales'
        : booking
        ? 'bookings'
        : 'support') as PrimaryGoal,
      capabilities: {
        sells_products: ordering,
        books_appointments: booking,
        offers_services: booking,
        delivers: delivery,
        requires_compliance: false,
        supports_emergency: false,
        deposit_required: false,
        deposit_percent: 20,
      },
    },
    timezone: config.timezone,
    availabilityRules: config.hours.map((h) => ({
      day_of_week: h.day_of_week,
      start_time: h.start_time,
      end_time: h.end_time,
      timezone: config.timezone,
    })),
  };
}

const DEFAULT_CAPABILITIES: BusinessCapabilities = {
  sells_products: false,
  books_appointments: true,
  offers_services: true,
  delivers: false,
  requires_compliance: false,
  supports_emergency: false,
  deposit_required: false,
  deposit_percent: 20,
};

const initialState = {
  currentStep: 1,
  receptionistId: null,
  receptionist: {
    name: '',
    business_name: '',
    business_type: '',
    business_model: 'services' as const,
    phone: '',
    greeting_message: '',
    goal: '',
    tone: 'friendly' as const,
    language: 'English',
    primary_goal: 'bookings' as PrimaryGoal,
    capabilities: DEFAULT_CAPABILITIES,
  },
  services: [],
  availabilityRules: [],
  faqs: [],
  timezone: '',
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (step) => set({ currentStep: step }),
      setReceptionistId: (id) => set({ receptionistId: id }),
      setReceptionist: (data) =>
        set((state) => ({
          receptionist: { ...state.receptionist, ...data },
        })),
      addService: (service) =>
        set((state) => ({ services: [...state.services, service] })),
      removeService: (index) =>
        set((state) => ({
          services: state.services.filter((_, i) => i !== index),
        })),
      setServices: (services) => set({ services }),
      addAvailabilityRule: (rule) =>
        set((state) => ({
          availabilityRules: [...state.availabilityRules, rule],
        })),
      setAvailabilityRules: (rules) => set({ availabilityRules: rules }),
      addFAQ: (faq) => set((state) => ({ faqs: [...state.faqs, faq] })),
      removeFAQ: (index) =>
        set((state) => ({ faqs: state.faqs.filter((_, i) => i !== index) })),
      setFAQs: (faqs) => set({ faqs }),
      applyOperationsConfig: (config) => set(deriveReceptionistPatch(config)),
      reset: () => set(initialState),
    }),
    {
      name: 'onboarding-storage',
      // Migrate old persisted state that may be missing capabilities
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as OnboardingState;
        if (version < 2 && !state.timezone) {
          state.timezone = '';
        }
        // Ensure capabilities exists
        if (!state.receptionist?.capabilities) {
          return {
            ...state,
            receptionist: {
              ...state.receptionist,
              capabilities: DEFAULT_CAPABILITIES,
              primary_goal: state.receptionist?.primary_goal || 'bookings' as PrimaryGoal,
            }
          };
        }
        return state;
      },
      version: 2, // v2: adds timezone field (Phase 1 configurator)
    }
  )
);
