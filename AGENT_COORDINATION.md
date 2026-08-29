# ⚠️ AGENT COORDINATION — READ BEFORE ANY FILE RESTORE

**Audience:** every AI agent (OpenCode tab, Codex, Claude, etc.) working in this repo.

## The incident (2026-08-25/26)

A backup-restore from `C:\Users\HP\AppData\Local\Temp\fd-backup\` was performed
by one agent tab and **silently reverted five security/correctness fixes**
another agent had shipped:

1. `appointment-reminder-runner/index.ts` — owner-attribution fix (`user_id` is NOT NULL)
2. `supabase/functions/setup-reminder-cron/index.ts` — RPC-based cron registration rewrite
3. `whatsapp-webhook/index.ts` — fail-closed HMAC signature verification
4. `AGENTS.md` — plaintext Gemini key + service-role JWT scrub
5. `scripts/smoke-booking.sh` — hardcoded anon JWT removal

Plus an earlier full revert of `src/pages/Widget.tsx` (Phase 0.3 unification).

All were detected by automated tripwires/tests and re-applied — but this class
of accident is preventable.

## Rules for agents in this repo

1. **NEVER wholesale-copy files over the working tree** from backups/zips/other
   checkouts. If a file must come from elsewhere, DIFF it first and merge
   intentionally.
2. **Run the test suite after any bulk operation**: `npx vitest run` — the
   dead-path tripwire + guide-compliance tests will catch reverts instantly.
3. **Canonical newer-than-backup artifacts** (do not regress them):
   - `src/pages/Widget.tsx` — single server-side execution path (no `bookingContext`, no client booking/order)
   - `src/lib/{gateway,operationsConfig,widgetMessages}.ts`
   - `supabase/functions/_shared/rutexMcp.ts`, `_shared/operationsConfigSchema.ts`, `_shared/channelForward.ts`
   - `supabase/functions/onboard-configurator/` and the Configurator set: `_shared/config/enhancedConfigurator.ts`, `propose-operator-plan/`, `request-change/`, `approve-operator-plan/` (all gateway-routed; KB propagation via `receptionists.knowledge_base`)
   - Reminder pipeline fixes listed above; HMAC-gated whatsapp-webhook
4. **Secrets never live in tracked files.** If you see key-shaped strings
   (`AIza…`, `eyJhbGciOi…`, `sb_publishable_`) in any `.md`/script — remove and flag.
5. When both tabs touch the same file: last writer must run `npx vitest run`
   and state the result before moving on.
