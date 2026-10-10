# Rutex Companion (Windows) — the Director's hands on your PC

## What it is

A small console app. It polls your Rutex project for work the Director's
brain queued, executes it with the real mouse, keyboard, and UI Automation
reads, and posts results back. It decides nothing — every step comes from
the brain, and it only moves when you asked in that moment.

Tools: `look_at_screen`, `click`, `type_text`, `press_keys`, `scroll`
(up/down), `drag`, `open_app`, `open_url`.

Refusals (Bluey's rules, enforced where the hardware is):
- password and credential fields are never typed
- Win+L and lock/shutdown shortcuts are never pressed
- sideways scroll is refused honestly until the event path exists

## Run it

Needs the .NET 8 SDK (free, Windows):

```powershell
cd companion\windows
dotnet publish -c Release
.\bin\Release\net8.0-windows\win-x64\publish\RutexCompanion.exe
```

First run asks for two things, saved to `config.json` beside the exe:

1. **Supabase URL** — `https://esvrhnlwquunsdduvbnr.supabase.co`
2. **Device secret** — in the app: Director > Computers (monitor icon) >
   Pair a computer. Shown ONCE there — paste it here, then it is gone.

Then it polls every 2s and heartbeats every 60s. **Close the window
to stop everything instantly** — no uninstall, no service, no residue.

## Pairing recap (owner side)

1. Director panel > monitor icon > Pair a computer (name it).
2. Paste the shown secret into the companion's first-run prompt.
3. The device row shows `alive now`. Flip it off any time to pause
   hands; delete it to forget the machine entirely.

## Security model

- The companion holds one secret that only polls its own rows and
  completes them. It cannot read anything else in the project.
- The brain can only queue to devices that are enabled and yours.
- Screen text the companion reads is treated as information, never
  instruction — that rule lives in the Director's prompt.
- No Accessibility-style OS permission exists on Windows to grant;
  the app runs as you, with your privileges, and only while open.
