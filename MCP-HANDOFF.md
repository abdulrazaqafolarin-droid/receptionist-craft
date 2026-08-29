# 📡 MCP HANDOFF — READ BEFORE RESUMING YOUR PAUSED PLAN

**To:** FrontDesk-side ox-alpha (this repo's active agent)
**From:** Gateway-side ox-alpha
**Date:** 2025-08-25
**Status:** ⚠️ Your plan is still valid — but its foundation changed. Rebuild it on MCP, not the old direct-HTTP assumption.

---

## 1. What happened while you were paused

The Rutex AI Gateway was completed, battle-tested, and **upgraded with a Model Context Protocol (MCP) server**. The full story (every failure + fix, so you don't repeat them) lives in `GATEWAY-BATTLE-LOG.docx` in the gateway repo: `github.com/abdulrazaqafolarin-droid/RuteX-Ai-Gateway`.

Verified live end-to-end from this machine:
```
MCP handshake   ✅ rutex-ai-gateway v1.0.0
tools/list      ✅ rutex_ask · rutex_health · rutex_reset_conversation
real AI call    ✅ via tools/call → "MCP WORKS"
HTTP /v1/ask    ✅ still available (unchanged contract)
95/95 tests     ✅
```

## 2. What already changed in THIS repo (by the other tab)

- `supabase/functions/_shared/rutexMcp.ts` — NEW shared Deno MCP client (no SDK dep; raw JSON-RPC over Streamable HTTP). Exports `askRutex()`, `rutexHealth()`, `resetRutexConversation()`, typed error `RutexMcpError{kind}`.
- `supabase/functions/onboard-configurator/index.ts` — rewired from raw `/v1/ask` fetch to `askRutex()`; identical response/error contract (`gateway_not_configured`, `gateway_timeout`, etc. all preserved).

Do not re-implement these. Build on them.

## 3. The architecture now

```
FrontDesk edge fns ──askRutex()──► {RUTEX_GATEWAY_URL}/mcp ──► gateway ──► OpenCode ──► model
                                    (MCP JSON-RPC)
fallback path      ──POST /v1/ask──► same gateway (unchanged)
```

**Env vars (the only two secrets ever needed):**
| Name | Value |
|---|---|
| `RUTEX_GATEWAY_URL` | **stable** gateway URL (per owner directive, no longer rotating; source of truth: `C:\Users\HP\tunnel-url.txt` on the owner's PC) |
| `RUTEX_GATEWAY_KEY` | owner's `.env` → `RUTEX_PROJECT_KEYS` → `"frontdesk"` value |

## 4. How your paused plan changes — phase-by-phase guidance

- Any phase that waits on "gateway_not_configured resolved by setting one secret" → **unblocked**: set the two env vars above and that phase completes.
- Any phase planning a custom fetch-to-gateway client → **delete it**, import `_shared/rutexMcp.ts` instead. One implementation, one place to fix.
- Phases touching conversation memory → memory is server-side per `(key, conversationId)`; you only choose stable IDs. Reset via `resetRutexConversation()` when prompts change.
- Phases assuming model stability → default model is now pinned to `nemotron-3.5-lightning-free` (stable). If a call fails oddly, retry once, then pass an explicit different model via `/v1/ask` body or ask owner to switch.
- WhatsApp HMAC work you already shipped: untouched, keep it.
- Channel-parity audit / conversion-gap phases: proceed as planned; their data source is now `askRutex()`.

## 5. Non-negotiable rules (paid for in blood — see battle log §Rules)

1. Never deploy/import the gateway repo into this project. It runs on the owner's PC only.
2. From deployed apps, `127.0.0.1` is never the gateway — always `RUTEX_GATEWAY_URL`.
3. Client timeouts ≥ 90 s (gateway caps at 120 s).
4. `conversationId` required, stable per end-user thread.
5. Keys come only from the owner's `.env` — never generate/paste/share keys.
6. If the public URL returns Cloudflare 1033 → the gateway process/OS is behind; verify the gateway is up on the owner's PC. Do NOT hunt for a new tunnel URL — the URL is stable now.
7. Gateway output is untrusted input: keep every `validate*` gate you built.

## 6. Resume checklist

- [ ] Pull/merge this branch state (files in §2)
- [ ] Set `RUTEX_GATEWAY_URL` + `RUTEX_GATEWAY_KEY` as project secrets
- [ ] Run your wizard smoke test: description → onboard-configurator → validated config draft
- [ ] Continue paused phases per §4 mapping
