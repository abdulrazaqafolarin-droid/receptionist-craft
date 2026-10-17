# Internal cron authentication rollout

## Scope

The following Edge Functions use a service-role Supabase client and are intended to be scheduler-only:

- `plan-worker`
- `appointment-reminder-runner`
- `director-sweep`
- `setup-reminder-cron` (called internally after an owner approves booking)
- `send-booking-email` (called internally by booking/reminder flows)
- `send-booking-confirmation` (legacy email sender, guarded because it uses service-role access)
- `activate-reminders` (superseded legacy endpoint, guarded so it cannot be triggered publicly)

Their Supabase gateway configuration has JWT verification disabled. The gateway's publishable/anon key is public and cannot prove that a request came from pg_cron. These handlers now fail closed unless the caller supplies `x-rutex-cron-secret` matching the server secret.

## Required secret

Generate a cryptographically random secret with at least 32 bytes of entropy. Do not commit it, paste it into a migration, place it in a cron command literal, or expose it in logs.

Configure the exact same value in both places:

1. Supabase Edge Function secrets: `RUTEX_INTERNAL_CRON_SECRET`.
2. Supabase Vault secret named `rutex_internal_cron_secret`.

The SQL migration reads the value from `vault.decrypted_secrets` when each job runs; the secret itself is not embedded in `cron.job.command`.

## Safe rollout order

1. Reconcile the live Supabase migration ledger with the repository first. Do not use a blind `supabase db push`.
2. Generate the secret locally using a cryptographically secure generator. Store it directly in the Supabase Edge Function secrets UI/CLI and Vault secret manager. Do not include it in tickets, PRs, shell history, or chat.
3. Verify the Vault entry exists and its length is at least 32 bytes without selecting or printing its value.
4. Apply `20261017000001_secure_internal_cron_jobs.sql` in staging first. It reschedules the three jobs to send the header fetched from Vault at runtime.
5. After staging passes, deploy in this order: (a) the updated `approve-operator-plan` caller from PR #64, which sends the internal secret to reminder setup; (b) the guarded functions and updated `book-appointment` caller from this PR. Before the guards are deployed, the existing functions ignore the extra header; after deployment, calls without the secret receive 401, and missing/weak server configuration receives 503. Keep the secret configured throughout.
6. Invoke each internal-only function once with an invalid header and confirm 401; invoke through the scheduler/booking path and confirm successful execution. Do not expose the secret in request logs.
7. Check cron job run history and Edge Function logs for successful invocations before declaring the rollout complete.

## Rollback

Do not roll back to an unauthenticated function merely to restore scheduling. If scheduling fails, correct the Edge Function secret/Vault entry and cron job configuration. Any emergency rollback must keep the internal authorization check in place.

## Important

This migration is deliberately not applied to production from this PR. Production migration history currently has discrepancies that must be reconciled first.
