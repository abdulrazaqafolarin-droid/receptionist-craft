-- Business Type Mechanics: 5 new capabilities that let the platform
-- configure for 20+ different business types without rebuilding.

-- ═══════════════════════════════════════════════════════════════════
-- 1. SKILL-BASED STAFF MATCHING
-- Junction table: which staff can perform which services.
-- A dental clinic can say "Dr. Amina does cleanings, Dr. Bola does extractions."
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.service_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  
  -- Optional: staff-specific pricing for this service
  price_override NUMERIC,
  
  -- Optional: staff-specific duration override
  duration_override_minutes INT,
  
  -- Priority for auto-assignment (lower = preferred)
  priority INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(service_id, staff_id)
);

ALTER TABLE public.service_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage service_staff"
  ON public.service_staff FOR ALL
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_service_staff_service ON public.service_staff(service_id);
CREATE INDEX IF NOT EXISTS idx_service_staff_staff ON public.service_staff(staff_id);
CREATE INDEX IF NOT EXISTS idx_service_staff_receptionist ON public.service_staff(receptionist_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. PER-SERVICE INTAKE FORMS
-- Each service can have its own set of required fields.
-- A dental clinic: "cleaning" asks for insurance info, "whitening" asks for allergies.
-- ═══════════════════════════════════════════════════════════════════

-- Extend services table with per-service fields
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS service_fields JSONB DEFAULT '[]'::jsonb;
-- Format: [{key: "insurance_provider", label: "Insurance Provider", type: "text", required: true, order: 0},
--          {key: "allergies", label: "Known Allergies", type: "textarea", required: false, order: 1}]

-- Store per-booking field responses
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS service_field_responses JSONB DEFAULT '{}'::jsonb;
-- Format: {insurance_provider: "BlueCross", allergies: "None"}

-- ═══════════════════════════════════════════════════════════════════
-- 3. QUOTE / DYNAMIC PRICING
-- For businesses that give estimates (auto repair, moving, events).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.quote_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  
  -- Customer info
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_id UUID REFERENCES public.customers(id),
  
  -- Service context
  service_id UUID REFERENCES public.services(id),
  service_name TEXT,
  
  -- Quote details (collected conversationally)
  scope_description TEXT,           -- What the customer described
  variables JSONB DEFAULT '{}'::jsonb,  -- Dynamic variables: {sqft: 2000, distance_miles: 15, items_count: 12}
  
  -- Generated quote
  quote_min NUMERIC,                -- Low estimate
  quote_max NUMERIC,                -- High estimate
  quote_notes TEXT,                 -- "Final price after inspection"
  quote_valid_until TIMESTAMPTZ,    -- When this quote expires
  
  -- Status
  status TEXT DEFAULT 'draft',      -- draft, presented, accepted, expired, converted_to_booking
  
  -- Link to resulting booking
  appointment_id UUID REFERENCES public.appointments(id),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage quotes"
  ON public.quote_requests FOR ALL
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_quotes_receptionist ON public.quote_requests(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON public.quote_requests(customer_id);

-- Pricing rules: business defines how quotes are calculated
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS pricing_model JSONB DEFAULT NULL;
-- Format: {type: "fixed"} or
-- {type: "range", min: 50, max: 200} or
-- {type: "per_unit", unit: "sqft", rate: 0.50, minimum: 100} or
-- {type: "quote_based"} or
-- {type: "dynamic", factors: [{name: "distance", unit: "miles", rate: 1.50}, {name: "size", unit: "items", rate: 25}]}

-- ═══════════════════════════════════════════════════════════════════
-- 4. RECURRING BOOKINGS
-- Allow appointments to repeat on a schedule.
-- ═══════════════════════════════════════════════════════════════════

-- Recurring pattern on appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS recurrence JSONB DEFAULT NULL;
-- Format: {frequency: "weekly", interval: 1, days_of_week: ["tuesday"], 
--          end_date: "2026-12-31", max_occurrences: 52, series_id: "uuid"}
-- frequency: daily, weekly, biweekly, monthly
-- interval: every N periods
-- days_of_week: for weekly (array of 0-6, 0=Sunday)
-- series_id: links all occurrences of the same recurring booking

-- Series table: the "template" for a recurring booking
CREATE TABLE IF NOT EXISTS public.booking_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  
  -- What recurs
  service_id UUID REFERENCES public.services(id),
  staff_id UUID REFERENCES public.staff(id),
  start_time TIME NOT NULL,           -- The time slot (e.g., "10:00:00")
  duration_minutes INT,
  
  -- Recurrence pattern
  frequency TEXT NOT NULL,             -- daily, weekly, biweekly, monthly
  interval INT DEFAULT 1,              -- Every N periods
  days_of_week INT[],                 -- For weekly: [1,3] = Mon,Wed
  day_of_month INT,                   -- For monthly: 15 = 15th of each month
  
  -- Boundaries
  start_date DATE NOT NULL,            -- First occurrence
  end_date DATE,                       -- No more after this date
  max_occurrences INT,                 -- Or stop after N occurrences
  
  -- Tracking
  occurrences_created INT DEFAULT 0,
  next_occurrence_date DATE,
  status TEXT DEFAULT 'active',        -- active, paused, completed, cancelled
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.booking_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage booking series"
  ON public.booking_series FOR ALL
  USING (
    receptionist_id IN (
      SELECT id FROM public.receptionists WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_series_receptionist ON public.booking_series(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_series_next_occurrence ON public.booking_series(next_occurrence_date) WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════
-- 5. URGENCY-BASED TRIAGE
-- Priority levels on appointments + routing logic.
-- ═══════════════════════════════════════════════════════════════════

-- Triage level on appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS triage_level TEXT DEFAULT 'routine';
-- Values: routine, urgent, emergency
-- Emergency: bypass queue, notify human immediately
-- Urgent: priority scheduling, earlier slots offered
-- Routine: normal booking flow

-- Triage rules: business defines what keywords/patterns trigger urgency
ALTER TABLE public.receptionists ADD COLUMN IF NOT EXISTS triage_rules JSONB DEFAULT NULL;
-- Format: {
--   urgent_keywords: ["pain", "broken", "leaking", "smoke"],
--   emergency_keywords: ["emergency", "severe bleeding", "chest pain", "fire"],
--   urgent_response_minutes: 60,     -- Respond within 1 hour
--   emergency_response_minutes: 15,  -- Respond within 15 minutes
--   escalate_emergency_to: "human",  -- Always escalate emergencies
--   skip_queue_for_urgent: true      -- Offer earlier slots for urgent
-- }

-- Escalation escalation: urgent/emergency auto-escalates
ALTER TABLE public.escalations ADD COLUMN IF NOT EXISTS urgency_source TEXT;
-- Values: keyword_detection, customer_explicit, staff_flagged, system_triage
