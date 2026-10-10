# Rutex Hands (Android) — the Director's hands on your phone

## What it is

An AccessibilityService app. It polls your Rutex project for work the
Director's brain queued, executes it with taps, text setting, gestures,
and node-tree reads, and posts results back. It decides nothing — every
step comes from the brain, and it only moves when you asked in that
moment. Same eight tool names as the desktop companions
(`look_at_screen`, `click`, `type_text`, `press_keys`, `scroll`, `drag`,
`open_app`, `open_url`), adapted to touch and nodes: no mouse, no
keyboard shortcuts, `press_keys` covers back/home/recents/notifications
and refuses the rest honestly.

Refusals: password fields are never typed, lock/power/shutdown are
refused by name, stale ids fail closed, input values are never read
into results (labels only).

## Run it

Needs Android Studio or the command-line SDK (free). No wrapper is
checked in — open the `companion/android` folder in Android Studio
(it generates one) or run with a local Gradle 8.x:

```bash
cd companion/android
gradle :app:assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

Zero code dependencies (Android SDK + Kotlin stdlib only). minSdk 26
(Android 8, 2017).

Setup, in the app:

1. Paste the Supabase URL + device secret (Director > Computers >
   monitor icon > Pair a computer, platform Android — secret shown once).
2. Open accessibility settings, enable **Rutex Hands**.
3. Exempt it from battery optimization (button in the app) or Doze
   will slow polls down.
4. **Turn the service off any time to stop everything.** No residue.

## Two honest constraints

- **Distribution.** Play Store policy restricts accessibility-based
  automation, so this ships sideload/dev-first (`adb install`). Store
  listing needs a separate policy route — not started.
- **First compile happens on a Gradle machine.** No Android SDK on the
  build box, so this code got a line-by-line API review instead of a
  compiler run. The risky surface (IME-enter via reflection, gesture
  callbacks, node recycling) is written defensively: reflection falls
  back, gestures time out, every obtained node is recycled.
