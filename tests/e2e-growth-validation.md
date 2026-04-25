# E2E Growth Validation Matrix

This validation pack covers:

- auto-switch correctness with hysteresis rules
- interval analytics continuity across all windows
- automation execution and dedupe behavior
- single/multi selector correctness
- KPI success on all target families:
  - conversion
  - revenue
  - leak reduction
  - lead capture
  - no-show
- deploy-time smoke checks
- post-deploy live checks

## Runner

Use:

```bash
E2E_BASE_URL="https://<project-ref>.supabase.co" \
E2E_ANON_KEY="<anon-key>" \
E2E_SINGLE_SELECTOR_ID="<id-a>" \
E2E_MULTI_SELECTOR_IDS="<id-a>,<id-b>,<id-c>" \
python3 scripts/e2e_validate_growth_engine.py
```

## Endpoint Contracts

The runner is endpoint-configurable via env vars (defaults shown):

- `E2E_AUTO_SWITCH_PATH=/functions/v1/auto-switch-evaluate`
  - Request: `{ samples: [...], expectHysteresis: true }`
  - Response: `{ switchCount: number, hysteresisStable: boolean }`
- `E2E_INTERVAL_ANALYTICS_PATH=/functions/v1/interval-analytics`
  - Request: `{ window: "5m" | "15m" | "1h" | ... }`
  - Response: `{ points: [{ start, end, ... }] }`
- `E2E_AUTOMATION_EXEC_PATH=/functions/v1/automation-execute`
  - Request: `{ requestId, action }`
  - Response: `{ executionId, deduped? }`
- `E2E_SELECTOR_PATH=/functions/v1/selector-resolve`
  - Request: `{ selectorIds: string[] }`
  - Response: `{ items: any[] }`
- `E2E_KPI_PATH=/functions/v1/kpi-summary`
  - Request: `{ family }`
  - Response: `{ successRate }`
- `E2E_LIVE_HEALTH_PATH=/functions/v1/live-health`
  - Request: `{ probe }`
  - Response: `{ errorRate, eventsLast5m }`

If your deployment uses different endpoints or fields, set the env vars and align responses before running in CI.

## CI/Gate Recommendations

- **Pre-deploy gate:** run this against staging and require 100% pass.
- **Deploy-time smoke:** run immediately after release trigger against production.
- **Post-deploy live:** keep default 3 probes; increase to 6 probes if traffic is bursty.

## Optional Strictness Controls

- `E2E_WINDOWS` default: `5m,15m,1h,24h,7d,30d`
- `E2E_KPI_FAMILIES` default: `conversion,revenue,leak_reduction,lead_capture,no_show`
- `E2E_MIN_SUCCESS_RATE` default: `0.90`
- `E2E_LIVE_CHECK_LOOPS` default: `3`
- `E2E_LIVE_CHECK_SLEEP_SECONDS` default: `20`

## Quick Troubleshooting

- `http=401/403`: wrong `E2E_ANON_KEY` or missing edge function auth settings.
- `insufficient_points`: analytics window has sparse data; rerun with longer window or seed data.
- `deduped=false` and differing `executionId`: idempotency key not wired through execution layer.
- `no_live_events`: validate ingestion pipeline and event source health before rollout.
