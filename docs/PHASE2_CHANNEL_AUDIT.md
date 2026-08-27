# PHASE 2 — Channel Parity Audit & Hardening (COMPLETE)

> Date: 2026-08-26 | Scope: WhatsApp, Phone (Twilio), Web widget | Basis: FRONTDESK-INTEGRATION-GUIDE.md + MCP-HANDOFF.md

## Findings → Actions taken

| # | Finding | Severity | Action |
|---|---|---|---|
| F1 | Identical ~15-line "forward to widget-chat" block duplicated in whatsapp-webhook + ai-phone-call (drift-prone) | Medium | **`_shared/channelForward.ts`** created: one `forwardToWidgetChat()` with typed errors (`timeout/unreachable/bad_response`) and per-channel timeout budgets. Both functions refactored onto it; deployed. |
| F2 | **Session parity gap**: phone sessions keyed on Twilio `CallSid` (per-CALL) → returning callers lost all history, unlike WhatsApp (`whatsapp_<number>`, per-human). Blocks Phase 4 memory on phone channel. | High (for memory goals) | Phone sessions now key on sanitized caller number (`phone_<From digits>`); CallSid fallback only for anonymous/hidden numbers. Deployed. |
| F3 | Phone forward had no timeout budget — Twilio aborts at ~15s waiting for TwiML while AI turns can run longer → callers heard silence on slow turns. | Medium | Forwarder called with `timeoutMs: 13_000`; graceful retry-prompt reply on timeout. (True fix for long AI turns = Twilio async pattern — future work, noted.) |
| F4 | WhatsApp timeouts previously surfaced raw fallback text; Meta re-delivers after ~60s. | Low | Forwarder uses 55s budget with distinct timeout vs error copy. |
| F5 | Adding channel #4 (SMS/Instagram): blocked only by `integration_type` enum value + a new thin function mirroring this pattern (~100 lines). Enum: `{twilio, openai, google_calendar, stripe, whatsapp, phone}` — one-line `ALTER TYPE` migration when needed. | Info | Documented; no premature abstraction. |
| F6 | Cross-channel identity: same human on web vs WhatsApp = two sessions (no merge). | Info | Deferred to Phase 4 (customer memory) where contact-based identity lands anyway. |
| F7 | Media messages (images/audio) ignored by WhatsApp webhook (text-only). | Info | Existing documented behavior; revisit with Phase 3 payments/receipts needs. |

## Security regression caught & re-fixed (see AGENT_COORDINATION.md)

A backup-restore by a parallel agent tab reverted five P0 artifacts
(reminder-runner user_id fix, setup-cron RPC rewrite, WhatsApp HMAC gate,
AGENTS.md secret scrub, smoke-script creds). All were detected (tripwires +
this audit's probes), re-applied, redeployed, and re-verified:

- WhatsApp security matrix **5/5**: wrong-token GET 403 · valid-token GET 200+challenge · unsigned POST 401 · bad-sig POST 401 · valid-HMAC POST 200.
- Reminder cron job still registered (`appointment-reminders-24h`, hourly, active).
- Repo-wide credential sweep: CLEAN.

## Operational notes

- Stale edge-isolate env can shadow updated secrets until the next secret
  write/deploy cycle — if positive-path auth suddenly fails after negative
  paths pass, re-post secrets before suspecting code.
- Owner machine disk neared capacity during deploys (`ENOSPC` from npx cache):
  clear `%LOCALFILES%\npm-cache` / run `npm cache clean --force` soon.
- DNS hardening (admin PowerShell per gateway agent) remains the root-cause fix for tunnel churn.
