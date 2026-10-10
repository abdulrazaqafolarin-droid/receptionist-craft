-- API Key Vault: server-side encrypted provider keys, one owner only.
--
-- This vault exists for a single account (emperorguyzee21@gmail.com).
-- No other user can read, write, or even see these rows: RLS policies
-- pin every access to that one UUID, and the base table grants nothing
-- to anon/authenticated. Clients read only the masked safe view.
-- Plaintext keys never touch the database — Edge Functions encrypt with
-- AES-256-GCM (WebCrypto) using VAULT_MASTER_KEY from Supabase secrets
-- before insert, and decrypt only inside vault-reveal / vault-proxy
-- paths. Every touch writes a vault_audit_logs row (service role).

-- One owner. This UUID is an identifier, not a secret.
-- emperorguyzee21@gmail.com
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL,
  encrypted_key text NOT NULL,
  iv text NOT NULL,
  key_last4 text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.vault_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'reveal', 'rotate', 'revoke', 'use')),
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_provider
  ON public.api_keys(user_id, provider, status);
CREATE INDEX IF NOT EXISTS idx_vault_audit_user_time
  ON public.vault_audit_logs(user_id, created_at DESC);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_audit_logs ENABLE ROW LEVEL SECURITY;

-- Base tables: no access for anon/authenticated at all (no policies =
-- deny). Service role bypasses RLS for the Edge Functions. Clients use
-- the masked view below.
-- (Deliberately zero policies on api_keys and vault_audit_logs.)

-- Masked view: everything the UI may show. Never the ciphertext or iv.
-- Row filtering lives IN the view (policies cannot attach to views):
-- the caller's own rows only, AND only the one vault-owner account.
-- The view runs as its privileged owner past the base table's deny-all
-- RLS; auth.uid() still evaluates as the caller. Clients get SELECT on
-- the view only — never the table.
CREATE OR REPLACE VIEW public.vault_keys_safe AS
  SELECT id, user_id, name, provider, key_last4, status,
         created_at, last_used_at, expires_at
  FROM public.api_keys
  WHERE user_id = auth.uid()
    AND user_id = '0a249488-e3aa-4fbc-80be-93cc3e2d2fca';

GRANT SELECT ON public.vault_keys_safe TO authenticated;
REVOKE ALL ON public.api_keys FROM anon, authenticated;
REVOKE ALL ON public.vault_audit_logs FROM anon, authenticated;
