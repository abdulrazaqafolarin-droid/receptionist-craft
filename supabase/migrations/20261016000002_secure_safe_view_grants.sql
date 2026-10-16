-- Safe metadata views are read-only API surfaces.
-- These views are currently updatable PostgreSQL views, and their owners can
-- bypass underlying-table RLS. Never allow client roles to mutate through them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.companion_devices_safe, public.plan_limits, public.vault_keys_safe
  FROM anon, authenticated;

-- Keep the intended read path explicit after revoking mutation privileges.
GRANT SELECT
  ON TABLE public.companion_devices_safe, public.plan_limits, public.vault_keys_safe
  TO anon, authenticated;
