# Jev Self-QA Runbook — Rutex Actor Tours

The platform dogfoods itself: a browser agent (Jev) drives the dashboard
through the actor tours and files breakage with evidence. This file is the
standing instruction set. Tour scripts + target map: `scripts/actor-tours.json`
(regenerate after tour changes; CI enforces freshness).

## Setup

1. Load `scripts/actor-tours.json` (selectors + ordered steps per tour).
2. Log in as the test owner. Never use a real business account.
3. Seed an ops operator if the flow needs one (pharmacy pattern: 2 products,
   1 low stock, 1 staff row, 1 overdue task). Delete it afterwards.

## Flows (run all, in order)

1. **connections-tour** — Open Connections with an operator selected. Every
   step must resolve its selector, cursor must visibly move, narration must
   appear. PASS = all receipts ok, zero console errors.
2. **walkthrough-google** — Showcase box must open with 3 chain lines, then
   the REAL Google connect dialog must open (do NOT complete OAuth — close
   the dialog and record that it opened with the right fields).
3. **console-tour** (seeded ops operator) — All four points land. Then click
   Stock check manually and verify the counts match the seed.
4. **builder-tour** — Tabs switch, history rail lists, no console errors.
5. **whats-this** — Arm the "?" mode, click 3 anchored elements (expect the
   registry explanation) and 1 unanchored element (expect the honest
   no-description message). Verify the clicked element did NOT activate.
6. **Kill switch** — Start any tour, press Esc mid-run. PASS = run halts,
   receipt says stopped-by-owner, page fully interactive after.

## Breakage report format (file one per failure)

- Flow + step index, expected vs actual (selector resolved? cursor moved?
  narration text?), console errors (verbatim), screenshot path, receipt log.
- Severity: blocker (data loss, wrong action, silent failure) or polish
  (timing, copy, overlap).

## Rules

- Never complete OAuth, payments, publishes, or deletes against real accounts.
- Never invent expected text — quote `scripts/actor-tours.json` verbatim.
- A tour that changed without `actor-tours.json` regenerating is itself a
  breakage (stale export) — report it, do not work around it.
- Flaky infra (gateway timeouts, connection drops) is environmental noise,
  not breakage — retry once, note it, move on.
