-- Fix notifications table column mismatch
-- Add 'severity' column and keep 'priority' for backward compatibility
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info';

-- Add check constraint for severity
ALTER TABLE public.notifications 
  ADD CONSTRAINT notifications_severity_check 
  CHECK (severity IN ('info', 'warning', 'critical', 'error'));

-- Add 'body' as alias for 'message' (we'll keep both for compatibility)
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body text;

-- Update existing rows to have body = message
UPDATE public.notifications SET body = message WHERE body IS NULL;

-- Add notification categories
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- Create default A/B test for receptionist configuration
INSERT INTO public.ab_tests (slug, name, description, active, start_at) 
VALUES (
  'default-receptionist-test',
  'Default Receptionist Configuration Test',
  'Baseline A/B test for receptionist configuration optimization',
  true,
  now()
)
ON CONFLICT (slug) DO NOTHING;

-- Create control variant for the default test
INSERT INTO public.ab_variants (test_id, key, payload, weight)
SELECT 
  id,
  'control',
  '{"temperature": 0.7, "model": "google/gemini-2.5-flash"}'::jsonb,
  100
FROM public.ab_tests
WHERE slug = 'default-receptionist-test'
ON CONFLICT DO NOTHING;

-- Fix RLS policy for notifications to allow user deletions
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
  ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read 
  ON public.notifications(user_id, read);

-- Add index for faster notification queries by receptionist
CREATE INDEX IF NOT EXISTS idx_notifications_receptionist 
  ON public.notifications(receptionist_id) 
  WHERE receptionist_id IS NOT NULL;