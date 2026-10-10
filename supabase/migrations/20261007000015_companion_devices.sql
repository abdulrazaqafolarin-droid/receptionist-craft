-- Companion devices + device-routed commands (Phase B).
--
-- A companion is an app on the owner's own machine (Windows first)
-- that lends the Director real mouse, keyboard, and screen reading.
-- Pairing is owner-initiated: the app creates the device row and shows
-- the secret ONCE; the secret lives in the companion's local config,
-- hashed here. The companion polls with its secret; the brain queues
-- with the gateway key. Either side can stop it instantly (enabled
-- flag / row delete / the companion simply exits).
-- The master switch IS the enabled flag: disabled devices get no work.

CREATE TABLE IF NOT EXISTS public.companion_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'My computer',
  platform text NOT NULL DEFAULT 'windows' CHECK (platform IN ('windows', 'macos', 'android')),
  secret_hash text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companion_devices_user
  ON public.companion_devices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companion_devices_secret
  ON public.companion_devices(secret_hash);

ALTER TABLE public.companion_devices ENABLE ROW LEVEL SECURITY;

-- Base table: deny-all for anon/authenticated (no policies = deny).
-- Clients read the masked view only — secret hashes never leave the
-- service role. The pairing secret is shown ONCE at creation, in the
-- edge response, and never again.
CREATE OR REPLACE VIEW public.companion_devices_safe AS
  SELECT id, user_id, name, platform, enabled, last_seen, created_at
  FROM public.companion_devices
  WHERE user_id = auth.uid();

GRANT SELECT ON public.companion_devices_safe TO authenticated;
REVOKE ALL ON public.companion_devices FROM anon, authenticated;

-- Commands gain device routing. NULL device_id = in-app (the browser
-- executor owns those rows and ignores device rows; companions ignore
-- NULL rows). One queue, two kinds of hands.
ALTER TABLE public.director_commands
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.companion_devices(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_director_commands_device
  ON public.director_commands(device_id, status, created_at)
  WHERE status = 'queued';
