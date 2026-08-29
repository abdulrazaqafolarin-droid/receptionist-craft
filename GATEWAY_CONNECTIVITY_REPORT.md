# Rutex Gateway — Wiring & Agent Connectivity Verification Report

> Written by the build agent | Date: 2026-08-28
> Purpose: answer two questions with evidence, not assumption:
>   1. Is this project connected to the Rutex gateway the way it's supposed to?
>   2. Are the agents in Opencode through the gateway the way they're supposed to?

---

## TL;DR

- **The entire Configurator routes through the Rutex gateway → OpenCode:**
  `onboard-configurator`, `propose-operator-plan`, and `request-change` (the
  latter two via `enhancedConfigurator.ts`, consolidated 2026-08-28). The
  **Responder** (`widget-chat`) and content helpers (`kb-rewrite`,
  `generate-knowledge-base`, `chat`, etc.) call **Gemini directly** — they do
  NOT go through the gateway.
- **The gateway is LIVE right now** and its auth gate is up.
- So the answer to question 2 is **partial**: the Configurator is fully wired
  to the gateway/OpenCode; the Responder still bypasses the gateway (Gemini
  direct).

---

## 1. What "the gateway" actually is

Reading `supabase/functions/_shared/rutexMcp.ts`:

- The gateway is a **separate external service** reached at
  `{RUTEX_GATEWAY_URL}/mcp` via **MCP over Streamable HTTP** (raw JSON-RPC,
  no SDK).
- Tool surface exposed by the gateway:
  - `rutex_ask` — ask the Rutex AI with per-conversation memory
  - `rutex_health` — health probe of gateway + its **OpenCode** backend
  - `rutex_reset_conversation`
- The documented architecture (from git history of the codebase):
  ```
  FrontDesk edge fns ──askRutex()──► {RUTEX_GATEWAY_URL}/mcp ──► gateway ──► OpenCode ──► model
  ```
- Required env vars: `RUTEX_GATEWAY_URL` + `RUTEX_GATEWAY_KEY` (the
  `frontdesk` project bearer key).
- Client timeout hard-capped at 120s; `conversationId` required and stable per
  end-user thread.

---

## 2. Which functions actually use the gateway (real call path traced)

Grep across the edge functions for `askRutex` (gateway) vs.
`generativelanguage.googleapis.com` (Gemini direct):

| Function (agent) | Upstream call | Via gateway? |
|---|---|---|
| **`onboard-configurator`** (ACTIVE v10) | `askRutex()` → `rutexMcp.ts` → `{GATEWAY}/mcp` → **gateway → OpenCode** | ✅ **YES** |
| **`propose-operator-plan`** (ACTIVE) | via `enhancedConfigurator` → `askRutex()` → gateway → OpenCode | ✅ **YES** (consolidated 2026-08-28) |
| **`request-change`** (ACTIVE) | via `enhancedConfigurator` → `askRutex()` → gateway → OpenCode | ✅ **YES** (consolidated 2026-08-28) |
| **`widget-chat`** the Responder (ACTIVE v62) | Gemini direct, `gemini-2.5-flash-lite` | ❌ NO |
| **`kb-rewrite`** (ACTIVE v19) | Gemini direct | ❌ NO |
| **`generate-knowledge-base`** (ACTIVE v19) | Gemini direct | ❌ NO |
| **`chat`**, `generate-system-prompt`, `parse-services` | Gemini direct (per AGENTS.md) | ❌ NO |

The `rutexMcp.ts` module is imported by `onboard-configurator`, plus
`propose-operator-plan` and `request-change` (via `enhancedConfigurator.ts`).

---

## 3. Is the gateway configured & live? (verified live)

### Secrets set in live Supabase project `esvrhnlwquunsdduvbnr`
Confirmed via Management API — both exist:
- `RUTEX_GATEWAY_URL`
- `RUTEX_GATEWAY_KEY`

### Gateway reachability (probed 2026-08-28)
- `RUTEX_GATEWAY_URL` resolves to the gateway at
  `https://smitten-unloving-ride.ngrok-free.dev`.
  (Per owner directive 2026-08-28 this URL is now **stable** — no longer
  rotating on tunnel restart. Source of truth: `C:\Users\HP\tunnel-url.txt`.)
- `POST https://smitten-unloving-ride.ngrok-free.dev/mcp` →
  **HTTP 401 `{"error":"Missing or malformed Authorization header"}`** in
  ~2.6s.
  - This proves the tunnel + gateway process are **up** and the **MCP auth gate
    is active** (it refuses requests without the bearer key).
- `GET https://smitten-unloving-ride.ngrok-free.dev/` →
  **HTTP 200, "<title>Rutex · Gateway</title>"** — the gateway web service is
  serving.

### Not verified
- A full authenticated `rutex_ask` round-trip was **not** performed: the
  `RUTEX_GATEWAY_KEY` value is a secret (hashed in the Management API) and is
  not recoverable from the repo, so end-to-end `edge fn → gateway → OpenCode →
  model` was not exercised. Reachability + auth-gate + tunnel-liveness are
  confirmed; the authenticated completion path is assumed from code+config.

---

## 4. Are the "agents in Opencode" through the gateway the way they should be?

**All Configurator agents — `onboard-configurator`, `propose-operator-plan`, and
`request-change` — route through the gateway to OpenCode** (the Configurator
identity was consolidated onto the gateway 2026-08-28; previously only
`onboard-configurator` was wired). `approve-operator-plan` writes config/KB to
the DB and does not call a model.

The **Responder** (`widget-chat`) is **NOT gateway-connected** — it calls Gemini
directly.

**Verdict for Q2: the Configurator is fully wired to the gateway/OpenCode; only
the Responder still bypasses it (Gemini direct).**

---

## 5. Risks / caveats to record

1. **Tunnel dependency:** the Configurator depends on the ngrok tunnel to
   the owner's local machine. If that machine/tunnel is off, the function
   throws (`RutexMcpError: unreachable`) — there is **no fallback to Gemini**
   in the Configurator path.
2. **Stable URL (owner directive 2026-08-28):** `RUTEX_GATEWAY_URL` is no longer
   expected to rotate. If it ever stopped resolving, the gateway process on the
   owner's PC is the thing to check — not the URL secret.
3. **No persistent gateway regression coverage:** the gateway path was not
   exercised end-to-end in this session (no key available).
4. **Inconsistent with AGENTS.md:** AGENTS.md (Part 4) documents that all
   functions migrated to **direct Gemini** and does not describe the Rutex
   gateway/OpenCode as the primary model path. The gateway/OpenCode wiring
   (added for `onboard-configurator`) is not reflected in the handover doc —
   documentation now contradicts observable wiring.
5. **Partial platform:** the "Conversational Revenue Infrastructure" markets a
   single brain, but model execution is split — the Configurator on the
   gateway/OpenCode, the Responder on Gemini. That split should be a conscious
   decision, not an accidental state.

---

## Bottom line

- Project IS connected to the gateway; **the full Configurator uses it** —
  `onboard-configurator`, `propose-operator-plan`, `request-change` (via
  `enhancedConfigurator.ts`). The gateway is live and its auth gate works.
- The **Responder** (`widget-chat`) still bypasses the gateway and runs on
  direct Gemini. That is the remaining decision point, not the Configurator.
- Open actions to consider: decide whether `widget-chat` should be routed
  through the gateway (and what that migration entails), document the
  gateway/OpenCode path in AGENTS.md, and add authenticated end-to-end coverage.
