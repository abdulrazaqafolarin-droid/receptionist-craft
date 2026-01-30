-- STEP 4: Create operational intelligence tables (dashboard only)
-- These separate business intelligence from public catalog data

-- 1. Service Inventory - stock management
CREATE TABLE public.service_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  stock_quantity integer DEFAULT 0,
  low_stock_threshold integer DEFAULT 5,
  reorder_point integer DEFAULT 10,
  last_restocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Service Scheduling Rules - operational timing
CREATE TABLE public.service_scheduling_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  buffer_before_minutes integer NOT NULL DEFAULT 5,
  buffer_after_minutes integer NOT NULL DEFAULT 5,
  prep_time_minutes integer DEFAULT 0,
  cleanup_time_minutes integer DEFAULT 0,
  max_daily_bookings integer,
  min_advance_booking_hours integer DEFAULT 1,
  max_advance_booking_days integer DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Service Costs - internal pricing/margins
CREATE TABLE public.service_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  cost_price numeric,
  wholesale_price numeric,
  margin_percentage numeric,
  tax_rate numeric DEFAULT 0,
  discount_max_percentage numeric DEFAULT 0,
  currency text DEFAULT 'NGN',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_service_inventory_service_id ON service_inventory(service_id);
CREATE INDEX idx_service_scheduling_rules_service_id ON service_scheduling_rules(service_id);
CREATE INDEX idx_service_costs_service_id ON service_costs(service_id);

-- Add unique constraints (one record per service)
ALTER TABLE service_inventory ADD CONSTRAINT unique_service_inventory UNIQUE (service_id);
ALTER TABLE service_scheduling_rules ADD CONSTRAINT unique_service_scheduling UNIQUE (service_id);
ALTER TABLE service_costs ADD CONSTRAINT unique_service_costs UNIQUE (service_id);

-- Add updated_at triggers
CREATE TRIGGER handle_service_inventory_updated_at
  BEFORE UPDATE ON service_inventory
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_service_scheduling_rules_updated_at
  BEFORE UPDATE ON service_scheduling_rules
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER handle_service_costs_updated_at
  BEFORE UPDATE ON service_costs
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Enable RLS on all tables
ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_scheduling_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: DASHBOARD ONLY (owner access via service ownership)

-- Service Inventory policies
CREATE POLICY "Business owners can manage their inventory"
ON service_inventory FOR ALL TO authenticated
USING (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
))
WITH CHECK (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
));

-- Service Scheduling Rules policies
CREATE POLICY "Business owners can manage their scheduling rules"
ON service_scheduling_rules FOR ALL TO authenticated
USING (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
))
WITH CHECK (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
));

-- Service Costs policies
CREATE POLICY "Business owners can manage their costs"
ON service_costs FOR ALL TO authenticated
USING (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
))
WITH CHECK (service_id IN (
  SELECT s.id FROM services s WHERE s.user_id = auth.uid()
));

-- NO public/anon access - these are strictly internal business data