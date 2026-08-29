-- connector_definitions is a shared catalog (all possible connectors), not user data.
-- RLS is enabled on it but no SELECT policy exists, which silently denies every read
-- for the authenticated owner — breaking the Connector Registry and the inline
-- connect prompts (Step 2 ConnectorRegistry + Step 5 InlineConnectPrompt from
-- FrontDesk-UIUX-Redesign-And-Integration-Prompt.md §2.4).
-- Fix: allow authenticated users to read the catalog. No PII, no per-user rows.

CREATE POLICY "Authenticated users can view connector catalog"
  ON public.connector_definitions
  FOR SELECT
  TO authenticated
  USING (true);
