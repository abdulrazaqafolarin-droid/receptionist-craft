-- Create function for updated_at if not exists
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create orders table for product orders from chat widget
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  total_amount NUMERIC,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for orders
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create orders" ON public.orders
  FOR INSERT WITH CHECK (receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own orders" ON public.orders
  FOR UPDATE USING (receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete own orders" ON public.orders
  FOR DELETE USING (receptionist_id IN (
    SELECT id FROM receptionists WHERE user_id = auth.uid()
  ));

-- RLS policies for order items
CREATE POLICY "Users can view own order items" ON public.order_items
  FOR SELECT USING (order_id IN (
    SELECT id FROM orders WHERE receptionist_id IN (
      SELECT id FROM receptionists WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can manage own order items" ON public.order_items
  FOR ALL USING (order_id IN (
    SELECT id FROM orders WHERE receptionist_id IN (
      SELECT id FROM receptionists WHERE user_id = auth.uid()
    )
  ));

-- Create trigger for updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create indexes for performance
CREATE INDEX idx_orders_receptionist_id ON public.orders(receptionist_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);