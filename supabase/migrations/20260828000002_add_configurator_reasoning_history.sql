-- Step 8 / §4.1b — Configurator reasoning-history memory.
--
-- The Configurator must remember the full reasoning trail behind every past
-- plan/change, not just the resulting configuration, so the SAME agent can
-- later explain WHY a setting is what it is (4.1b), not merely restate it.
--
-- config_versions already stores the full config_json (what), plan_text
-- (the plain-language plan) and owner_input (the owner's words). This adds
-- the Configurator's own reasoning_notes (the 'why' — what changed, why, and
-- any uncertainty the agent flagged) so the trail is complete and retrievable.

ALTER TABLE public.config_versions
  ADD COLUMN IF NOT EXISTS reasoning_notes text;
