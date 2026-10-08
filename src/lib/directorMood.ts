/**
 * Director mood resolver — Bluey's face behavior, our buddy.
 *
 * Moods are engagement states, not data states (presence stays separate):
 * talking beats pointing beats resting beats sleepy beats listening.
 * A briefing conversation or an active guided run always wins over idle
 * timers — attention in the room outranks the clock. Pure: tested.
 */

export type BuddyMood = "listening" | "talking" | "pointing" | "sleepy" | "resting";

export interface MoodInput {
  /** A briefing dialog or chat with the Director is open. */
  briefingOpen: boolean;
  /** Any guided run (tour, walkthrough, goto ride) is active. */
  runsActive: boolean;
  /** Minutes since last pointer/keyboard activity (tab must be open). */
  idleMinutes: number;
}

export function resolveMood(input: MoodInput): BuddyMood {
  if (input.briefingOpen) return "talking";
  if (input.runsActive) return "pointing";
  if (input.idleMinutes >= 15) return "resting";
  if (input.idleMinutes >= 5) return "sleepy";
  return "listening";
}
