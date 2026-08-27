# PHASE 1 SPEC — Business Configuration Agent

> Status: IN IMPLEMENTATION | Date: 2026-08-25
> Principle honored: **use what's on ground** — this phase extends the proven
> `generate-system-prompt`/`generate-knowledge-base`/`parse-services` pattern,
> reuses the existing 6-step wizard as the confirm/adjust surface, and writes
> ONLY into structures that already exist (`receptionists`, `services`,
> `availability_rules`, zustand onboarding store). No new runtime engine —
> widget-chat IS the engine and stays untouched.

## 1. Architecture

```
Owner opens /onboarding-wizard
  └─ NEW Step 0 "Describe your business" (textarea)
       └─ src/lib/gateway.ts  askConfigurator(description)
            └─ POST {VITE_GATEWAY_URL}/v1/ask   agent:"configurator"
                 Authorization: Bearer VITE_GATEWAY_ONBOARDING_KEY
            └─ response text → extractJsonBlock() → validateOperationsConfig()
                 ├─ invalid → show exact issues, owner edits description or proceeds manually
                 └─ valid OperationsConfig → store.applyOperationsConfig(cfg)
                      → Steps 1–4 PRE-FILLED → owner confirms/adjusts (wizard unchanged)
```

**Why client-side call (not edge fn):** the gateway runs on the operator's
machine (`127.0.0.1:8787`) during development. The call site is one pure
module; moving it server-side later = swap `askConfigurator()`'s transport
without touching schema/UI/tests. Base URL + key are env vars only.

## 2. The configuration contract (non-negotiable constraint)

`OperationsConfig` v1 — strict zod schema (`.strict()`: unknown workflow types
are REJECTED, so the AI cannot invent engine capabilities):

- Fixed relational core: `business{display_name,business_type,...}`,
  `contact{phone,email,website,address}`, `timezone` (IANA-verified),
  `hours[{day_of_week 0–6, start_time HH:mm, end_time HH:mm}]`
- Workflow parameters (only types the existing engine supports today):
  `workflows.appointment_booking{enabled,default_duration_minutes?}`,
  `workflows.product_ordering{enabled,delivery?}`
- Deliberately NOT included: service/product catalog (Step 2's AI parser
  already owns that on ground), FAQs (Step 4 owns), system prompts
  (generate-system-prompt owns).

## 3. Validation discipline

Gateway proves reachability, nothing more. `extractJsonBlock` handles fenced
or bare JSON; `validateOperationsConfig` returns precise issue lists. Nothing
from a gateway response reaches store state without passing validation.

## 4. Tests (vitest, must pass before UI wiring merges)

- Schema: minimal valid; rejects unknown workflow type; rejects bad time
  format/day range/unknown extra key; timezone reality check.
- Mapping: `applyOperationsConfig` → correct store fields (capabilities
  flags, primary_goal derivation, availability rules × tz).
- Gateway seam: 401 body shape locked; fenced-JSON extraction; malformed
  JSON → typed error; schema-invalid payload → issue list surfaced.

## 5. Out of scope (later phases of this phase after owner review)

Server-side proxy of the gateway call (when deployed URL exists); FAQ
generation via configurator; multi-language descriptions.
