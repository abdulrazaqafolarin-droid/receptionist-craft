import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ItemType = 'service' | 'product';

export type PrimaryGoal = 'sales' | 'bookings' | 'support' | 'leads';

export type BusinessCapabilities = {
  sells_products: boolean;
  books_appointments: boolean;
  offers_services: boolean;
  delivers: boolean;
  requires_compliance: boolean;
  supports_emergency: boolean;
};

type ServiceOrProduct = {
  name: string;
  duration_minutes: number;
  description?: string;
  active: boolean;
  type: ItemType;
  price?: number;
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
  reset: () => void;
};

const DEFAULT_CAPABILITIES: BusinessCapabilities = {
  sells_products: false,
  books_appointments: true,
  offers_services: true,
  delivers: false,
  requires_compliance: false,
  supports_emergency: false,
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
      reset: () => set(initialState),
    }),
    {
      name: 'onboarding-storage',
    }
  )
);
