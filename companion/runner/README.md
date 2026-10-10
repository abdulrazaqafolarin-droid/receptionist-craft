# Rutex Runner — the Director's shell on your machine

## What it is

A single Python file (stdlib only — no pip install). It polls your
Rutex project for `run_cli` work the brain queued, executes it in a
subprocess, and posts structured results back
(`exit_code`, `stdout`, `stderr`, timeouts, truncation flags). It
decides nothing — every command comes from the brain, and it only
runs when you asked in that moment.

## Run it

Python 3.9+ (Windows, macOS, or Linux — same file everywhere):

```bash
cd companion/runner
python3 runner.py
```

First run asks for two things (saved to `config.json` beside it,
chmod 0600 where supported):

1. **Supabase URL** — `https://esvrhnlwquunsdduvbnr.supabase.co`
2. **Device secret** — in the app: Director > Computers (monitor icon) >
   Pair a computer, platform **Runner**. Shown ONCE there.

Then it polls every 2.5s. **Ctrl-C stops everything instantly.**

## What it executes (and refuses)

Runs through the platform shell (`cmd` on Windows, `sh` elsewhere)
with a 60s default timeout (command may ask up to 300s) and 32KB
output caps per stream. Refused before execution, no exceptions:
filesystem wipes (`rm -rf /`, `mkfs`, raw disk writes), power control
(shutdown/reboot/halt and Windows equivalents), disk tools
(`diskpart`, `format`), recursive Windows deletes, registry deletes,
system-directory targets, fork bombs. Anything else runs — network
pipes included, because installs need them — and every execution is
ledgered with the full command for the owner to audit.

## How connectors use it

A connector with a `cli_command` verifies through your runner:
`verify-connector` queues the check on your enabled Runner device,
waits up to 60s, and reports `connected` only on exit 0 — real
stderr on failure, honest pending when no runner is paired. No
runner impersonates anything: commands carry your user id to your
device or they do not run.

## Security model

Same as companions: one secret for its own rows only, enabled flag
is the master switch, revoke forgets instantly, ask-every-time per
the Director's prompt (with rephrased refusals explicitly banned).
The runner never sees the browser, the DOM, or any other device.
