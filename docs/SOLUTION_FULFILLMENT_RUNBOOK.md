# Solution Fulfillment Runbook (lane-2 builder loop)

Who runs this: the builder agent (frontdesk-operator or equivalent) with an
explicit human key. NEVER production traffic, NEVER customer input, NEVER
auto-install. Output re-enters production only via review → tests → CI →
owner approval.

## The loop (per external need, status tracked on the solution)

```
found → fetched → evaluated → integrated
```

Advance status ONLY with evidence attached. A stage without evidence is a
lie; the preview displays the stage, so owners see exactly how far each
need got.

## Stage 1 — FETCHED (from `found`)

- Clone/read the top candidate repo (or open the API docs for services).
- Extract the minimal piece that solves OUR need — not the whole project.
- Evidence: repo URL + commit/tag pinned, license recorded (must be
  compatible: MIT/Apache/BSD/ISC/MPL-approved; GPL/AGPL needs explicit
  human sign-off with the implications stated), files copied or referenced.
- Refuse and record: scam signals (bypass/crack/stealer/phishing),
  dead repos (no commits 12+ months), license walls.

## Stage 2 — EVALUATED (from `fetched`)

- Fit-check against the need in one paragraph: what it solves, what it
  doesn't, what it costs (money, latency, maintenance).
- Spike it: smallest runnable proof (a test, a script, a call) — must
  actually execute, not just read.
- Evidence: spike output pasted in the work log, verdict (adopt / adapt /
  reject with reason). Rejections are first-class results — record them.

## Stage 3 — INTEGRATED (from `evaluated`)

- Adapt into a platform module/connector following existing interfaces
  (`_shared/modules/*`, connector registry patterns).
- MUST pass: `deno check` on touched files, repo eval suite
  (`deno run --allow-read scripts/eval-surface.ts`), and any module smoke
  path. No green checks = no advance, no exceptions.
- Evidence: files changed, checks output, live smoke result.
- Present to the owner with: what it does, what it cost, what could break,
  how to disconnect it. Owner approves or rejects — rejection returns the
  solution to `evaluated` with the reason recorded.

## Standing rules

- Two human approvals per integration (adaptation reviewed, merge approved).
- Secrets never in code, logs, or traces — connector rows only, owner RLS.
- Paid services: owner pays explicitly, free options shown first, always.
- Every stage transition appends to the work log. The Playground trace
  pattern applies: reported actions, never inferred ones.
- When in doubt between speed and honesty: honesty. A need that stays at
  `found` with a clear reason beats a fake `integrated` every time.
