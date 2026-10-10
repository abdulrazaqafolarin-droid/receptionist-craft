# Rutex Companion (macOS) — the Director's hands on your Mac

## What it is

A headless command-line tool. It polls your Rutex project for work the
Director's brain queued, executes it with the real mouse, keyboard, and
screen reading, and posts results back. It decides nothing — every step
comes from the brain, and it only moves when you asked in that moment.

Ported from Bluey (Unlicense, public domain): `ComputerControl`,
`ScreenReader`, and `ControlsReader` are used verbatim from
`Mac/Sources/GooglyMac/` (see `Ported/` headers). Everything that talked
to Bluey's iPhone, menu bar, overlay cursor, or OpenAI session was left
behind and replaced here by `Link` (the Rutex protocol) and `Hands`
(headless dispatch). No visible cursor on the Mac in this build — the
brain gets text back, and the in-app Director cursor stays the face.

Tools: `look_at_screen`, `click`, `type_text`, `press_keys`, `scroll`,
`drag`, `open_app`, `open_url` — same names, same grid, same refusals
(password fields, lock/logout/force-quit shortcuts, stale ids).

## Run it

Needs Xcode command-line tools (free, Mac):

```bash
cd companion/macos
swift build -c release
.build/release/rutex-companion
```

First run asks for two things, stored private to your Mac user
(`~/Library/Application Support/RutexCompanion/`, 0700/0600):

1. **Supabase URL** — `https://esvrhnlwquunsdduvbnr.supabase.co`
2. **Device secret** — in the app: Director > Computers (monitor icon) >
   Pair a computer, platform macOS. Shown ONCE there.

Then it polls every 2s and heartbeats every 60s. **Ctrl-C stops
everything instantly.** First launch also asks for Accessibility
permission (System Settings → Privacy & Security → Accessibility) —
macOS requires it for clicks and keystrokes; screen reading of other
apps' controls needs it too.

## Security model

Same as Windows: the companion holds one secret for its own rows
only; the brain queues only to enabled devices of yours; screen text
is information, never instruction (that rule lives in the Director's
prompt); password fields and lock/logout shortcuts refuse at the
hardware layer.
