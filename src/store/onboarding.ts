import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Service = {
  name: string;
  duration_minutes: number;
  description?: string;
  active: boolean;
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
    phone: string;
    greeting_message: string;
    goal: string;
    tone: 'friendly' | 'professional' | 'playful';
    language: string;
  };
  services: Service[];
  availabilityRules: AvailabilityRule[];
  faqs: FAQ[];
  setStep: (step: number) => void;
  setReceptionistId: (id: string) => void;
  setReceptionist: (data: Partial<OnboardingState['receptionist']>) => void;
  addService: (service: Service) => void;
  removeService: (index: number) => void;
  setServices: (services: Service[]) => void;
  addAvailabilityRule: (rule: AvailabilityRule) => void;
  setAvailabilityRules: (rules: AvailabilityRule[]) => void;
  addFAQ: (faq: FAQ) => void;
  removeFAQ: (index: number) => void;
  setFAQs: (faqs: FAQ[]) => void;
  reset: () => void;
};

const initialState = {
  currentStep: 1,
  receptionistId: null,
  receptionist: {
    name: '',
    business_name: '',
    business_type: '',
    phone: '',
    greeting_message: '',
    goal: '',
    tone: 'friendly' as const,
    language: 'English',
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
