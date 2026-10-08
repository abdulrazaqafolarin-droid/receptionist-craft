/**
 * Director mood gate: engagement beats the clock, in order.
 *
 * Run: deno test --no-check --unstable-sloppy-imports src/lib/directorMood.test.ts
 */

import { resolveMood } from "./directorMood.ts";

// Minimal ambient so tsc (which typechecks src/) accepts the Deno runner.
declare const Deno: { test(name: string, fn: () => void): void };

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

Deno.test("engagement outranks idle timers", () => {
  check(resolveMood({ briefingOpen: true, runsActive: true, idleMinutes: 99 }) === "talking", "briefing wins everything");
  check(resolveMood({ briefingOpen: false, runsActive: true, idleMinutes: 99 }) === "pointing", "guiding beats the clock");
});

Deno.test("drowsiness escalates with silence", () => {
  check(resolveMood({ briefingOpen: false, runsActive: false, idleMinutes: 0 }) === "listening", "fresh is listening");
  check(resolveMood({ briefingOpen: false, runsActive: false, idleMinutes: 7 }) === "sleepy", "sleepy at five");
  check(resolveMood({ briefingOpen: false, runsActive: false, idleMinutes: 20 }) === "resting", "resting at fifteen");
});
