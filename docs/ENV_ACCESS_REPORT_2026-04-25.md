# Environment Access Report

Date: 2026-04-25 (UTC)
Repo: `receptionist-craft`

## Scope requested
1. Supabase migration/apply access
2. Supabase Edge Function deployment access
3. Vercel deployment verification access
4. Live smoke testing against production-like endpoints

## Findings

### 1) Supabase migration/apply
- Supabase CLI is runnable via `npx` (`supabase@2.95.3`).
- Access to Supabase account/project is **not configured** in this environment.
- `npx --yes supabase@latest projects list` returns: access token not provided.

**Status:** Blocked (missing `SUPABASE_ACCESS_TOKEN` or prior `supabase login`).

### 2) Edge function deployment
- Deploy command path is present through Supabase CLI via `npx`.
- Because Supabase authentication is missing, deploy capability cannot be executed.

**Status:** Blocked (same auth dependency as migrations).

### 3) Vercel deploy verification
- Vercel CLI is runnable via `npx` (`vercel@52.0.0`).
- No existing Vercel credentials found in environment.
- Login/init attempt fails with network route errors (`ENETUNREACH`) to `vercel.com`.

**Status:** Blocked (credentials + network reachability to Vercel).

### 4) Live smoke testing against production-like endpoints
- `.env` includes Supabase URL and publishable key variables.
- Direct HTTPS checks to:
  - `/rest/v1/`
  - `/functions/v1/widget-chat`
  both fail in this environment with `Tunnel connection failed: 403 Forbidden`.
- Since production-like endpoints are not reachable from this runtime, smoke tests cannot be executed here.

**Status:** Blocked (outbound tunnel/proxy restriction to Supabase endpoints).

## What is ready now
- Local toolchain for Node/Python scripts is available.
- Repo smoke test scripts and verification helpers exist and are ready once network/auth blockers are removed.

## Minimum requirements to unblock
- Supabase:
  - `SUPABASE_ACCESS_TOKEN` in environment (or complete `supabase login`).
  - Project linked or explicit `--project-ref` usage for migration/deploy commands.
- Vercel:
  - `VERCEL_TOKEN` (or successful `vercel login`).
  - Outbound connectivity to `https://vercel.com`.
- Smoke tests:
  - Outbound connectivity to `https://<project-ref>.supabase.co`.
  - Required test identifiers/secrets (e.g., receptionist/test IDs where scripts require them).

