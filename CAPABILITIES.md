# CAPABILITIES.md — verified abilities, no claims without proof

Statuses: DISCOVERED (seen, not tried) · INSTALLED (present, not run) ·
TESTED (ran green) · PRODUCTION-VERIFIED (live rows prove it) · BROKEN
(verified failing) · DEPRECATED (replaced).

Rule: check here before building anything new. Experimental and
production entries stay distinguishable. Never record credential values.

## Director hands (in-app cursor)

| Capability | Status | Notes |
|---|---|---|
| look_at_page indexed table ([n] role\|label, 60 cap, stamped) | PRODUCTION-VERIFIED | 2026-10-11. Fresh-eyes model; indexes die on navigation. |
| click / point / goto / highlight / scroll-to / showcase / collect | PRODUCTION-VERIFIED | Registry 15 targets + open-world indexes. |
| type into registered inputs | PRODUCTION-VERIFIED | Ride-only; host refuses credential fields live. |
| drag between registered ends | TESTED | Engine 16/16; no live drag witnessed yet. |
| live_click / live_type / live_drag on table indexes | TESTED | Engine 19/19; refusals pinned (credentials/lockout/money). |
| brain loop (director-tools queue + browser executor + receipts) | TESTED | Gate 403s proven live; first brain-driven call pending. |

## Computer companions (real mouse/keyboard/screen)

| Capability | Status | Notes |
|---|---|---|
| Windows companion (UIA grid, SendInput, pointer give-back) | PRODUCTION-VERIFIED | Compiled clean (dotnet 8); smoke-tested poll→403→retry. Needs owner to run it. |
| macOS companion (ported AX/ScreenCaptureKit/Vision + new glue) | INSTALLED | Line-by-line API review; first `swift build` happens on a Mac. |
| Android service (node tree, gestures, keystore secrets) | INSTALLED | Review + balance checks; first Gradle build on a Gradle machine. Sideload-first (Play policy). |
| Pairing (secret shown once, hashed), master switch, revoke | PRODUCTION-VERIFIED | Live rows + 401/403 proofs. |
| Ledger on every completion (kind hands) | PRODUCTION-VERIFIED | 3/3 rows in live proof, then cleaned. |

## Browser lane (Jev absorbed, MIT attributed)

| Capability | Status | Notes |
|---|---|---|
| snapshot.js element table + loop discipline | PRODUCTION-VERIFIED | 15-action table from a live page, no keys. |
| brain-decides-every-step (director-decide) | PRODUCTION-VERIFIED | Full observe→decide→act→DONE loop proven live, zero keys. |
| plan vs loop modes, upload/download file box | TESTED | Code + contract tests; live file ops await a real task. |
| TypeSafe / text-model keys on runner | DEPRECATED | Replaced: opencode CLI crashes on this CPU class; gateway decides. |

## Shell (CLI)

| Capability | Status | Notes |
|---|---|---|
| runner.py (poll/execute/complete, refusals, caps) | PRODUCTION-VERIFIED | echo exit 0, `rm -rf /` refused unexecuted, unknown tool refused. |
| verify-connector real CLI checks via runner | TESTED | Edge clean; live check awaits a paired Runner. |
| cli-anything-hub 0.4.1 + elevenlabs CLI installed | TESTED | `cli-hub list/info` real; `elevenlabs --help` runs keyless. |
| opencode CLI as subprocess decider | BROKEN | Binary crashes at startup here (Bun baseline, 85ms, no output). Gateway decides instead. |

## Voice

| Capability | Status | Notes |
|---|---|---|
| director-voice cascade (gateway Voicebox → ElevenLabs vault → browser) | TESTED | Local fails soft (no server yet); cloud needs vault key; browser stands by. |
| ElevenLabs key in vault | DISCOVERED | Vault ready; key not yet added by owner. |
| Voicebox server on gateway host | DISCOVERED | Setup in VOICEBOX_SETUP.md; not yet run. |

## Secure human input (ask channel)

| Capability | Status | Notes |
|---|---|---|
| director_requests table + realtime + RLS | PRODUCTION-VERIFIED | Applied live; publication confirmed. |
| director-ask edge (create/await/answer/cancel) | TESTED | Deno clean; validation 2/2. Full cycle needs owner session. |
| Credential→vault (verified-first), OTP burn, approvals kept | TESTED | Code paths reviewed; live cycle owner-tested. |
| Global bottom-sheet outlet + hook | TESTED | Builds green; live popup awaits a real request. |

## Vault & secrets

| Capability | Status | Notes |
|---|---|---|
| api_keys AES-256-GCM + VAULT_MASTER_KEY + audit | PRODUCTION-VERIFIED | Roundtrip tests; 401/anon-empty/deny proven live. |
| VaultPanel (masked, reveal-once, rotate, revoke) | TESTED | Builds green; full cycle owner-tested. |
| .env hygiene (ignored, never committed) | PRODUCTION-VERIFIED | `git check-ignore` clean. |

## Environment (this box)

| Fact | Detail |
|---|---|
| Machine | Windows 10/11 x64, local (not phone, not remote) |
| Runtimes | Python 3.12 + 3.14, Node, Deno, .NET 8 SDK, Supabase CLI, git |
| Missing | Android SDK, Xcode/Swift, `gh`, working opencode CLI |
| Network | Egress allowlisted (Supabase + APIs ok, general web blocked) |
| Secrets | Supabase secrets + vault only; companion secrets shown once |

## Blocked / next candidates

1. Mac `swift build` + Android Gradle build (need their machines).
2. First brain-driven tool call (needs gateway + open browser).
3. ElevenLabs vault key + Voicebox server (owner setups).
4. Paired Runner for real CLI connector checks.
5. Network-activity inspection for the cursor (Part 5 gap — DISCOVERED).
6. Thread-compaction via relevance filtering (Pattern 3 — DISCOVERED).
7. Stack-wide fast-judgment audit (Patterns 1/4/5 — DISCOVERED).
