# Jev Self-QA Runbook — Rutex Actor Hands

The platform dogfoods itself: a browser agent (Jev) drives the dashboard
through the actor flows and files breakage with evidence. This file is the
standing instruction set. Walkthrough script + target map:
`scripts/actor-tours.json` (regenerate after changes; CI enforces freshness).

## Setup

1. Load `scripts/actor-tours.json` (selectors + ordered steps).
2. Log in as the test owner. Never use a real business account.
3. Seed an ops operator if the flow needs one (pharmacy pattern: 2 products,
   1 low stock, 1 staff row, 1 overdue task). Delete it afterwards.

## Flows (run all, in order)

1. **walkthrough-google** — Open Connections with an operator selected.
   Showcase box must open with 3 chain lines, then the REAL Google connect
   dialog must open (do NOT complete OAuth — close the dialog and record
   that it opened with the right fields). Cursor must visibly move,
   narration must appear. PASS = all receipts ok, zero console errors.
2. **console checks** (seeded ops operator) — Click Stock check manually
   and verify the counts match the seed. Open Tasks and mark one done;
   verify it leaves the list.
3. **builder tabs + rail** — Tabs switch, history rail lists past threads,
   no console errors.
4. **whats-this** — Arm the "?" mode, click 3 anchored elements (expect the
   registry explanation) and 1 unanchored element (expect the honest
   no-description message). Verify the clicked element did NOT activate.
5. **Kill switch** — Start the walkthrough, press Esc mid-run. PASS = run
   halts, receipt says stopped-by-owner, page fully interactive after.
6. **Ride / Handle modes** — Run the walkthrough in Handle mode. PASS = no
   cursor moves, no bubbles, no boxes; clicks still execute; goto and
   collect steps defer with honest receipts instead of jumping.

## Breakage report format (file one per failure)

- Flow + step index, expected vs actual (selector resolved? cursor moved?
  narration text?), console errors (verbatim), screenshot path, receipt log.
- Severity: blocker (data loss, wrong action, silent failure) or polish
  (timing, copy, overlap).

## Rules

- Never complete OAuth, payments, publishes, or deletes against real accounts.
- Never invent expected text — quote `scripts/actor-tours.json` verbatim.
- Flaky infra (gateway timeouts, connection drops) is environmental noise,
  not breakage — retry once, note it, move on.
