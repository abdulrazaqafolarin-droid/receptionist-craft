/**
 * Actor capability contract — the single authoritative definition of what
 * the Director's cursor can do.
 *
 * One source, three consumers:
 * - actorGuard.ts validates actions against these bounds (frontend).
 * - directorPrompt.ts renders the capability reference the model reads
 *   (edge) — never a second hand-maintained list.
 * - Tests assert the documented bounds hold.
 *
 * Deno-safe: ASCII only, no imports, no DOM, no Node APIs.
 *
 * Design rules enforced here:
 * - Gestures are expressive movement ONLY: they resolve a visible anchor
 *   and move the cursor around it. They can never click, type, drag, or
 *   navigate — the runner has no code path from a gesture to a state
 *   change, and the guard rejects any gesture carrying action payload.
 * - Gestures anchor to resolved targets, never to model-supplied
 *   coordinates. A blind coordinate from a model that cannot see the
 *   screen is a misclick waiting to happen.
 * - Every bound below is a hard cap: the guard refuses over-cap values
 *   before execution, and the host clamps points to the viewport.
 */

export type GestureKind = "move" | "oscillate" | "circle" | "pause";

/** Hard caps for expressive movement. Guard-enforced, receipt-proven. */
export const GESTURE_BOUNDS = {
  /** Max horizontal swing from the anchor center, px. */
  maxAmplitudePx: 120,
  /** Max full swing cycles per oscillate step. */
  maxCycles: 4,
  /** Max circle radius from the anchor center, px. */
  maxRadiusPx: 120,
  /** Fixed circle resolution — smooth enough, bounded always. */
  circleSteps: 12,
  /** Max total time one gesture step may take, ms. */
  maxStepMs: 4000,
  /** Max single pause, ms. */
  maxPauseMs: 2000,
  /** Dwell between gesture sub-movements; also the stop/preempt boundary. */
  subStepMs: 90,
} as const;

export interface GestureStep {
  kind: GestureKind;
  /** Registered anchor key (exactly one of target / index). */
  target?: string;
  /** Live-table index from the latest table (exactly one of target / index). */
  index?: number;
  /** Expected visible label for index resolution (stale = refuse). */
  expect?: string;
  /** Oscillate: horizontal swing px each side (default 24). */
  amplitude?: number;
  /** Oscillate: full cycles (default 2). */
  cycles?: number;
  /** Circle: radius px (default 32). */
  radius?: number;
  /** Pause: dwell ms (default 600). */
  ms?: number;
  /** Narration line, spoken once at the start. */
  say?: string;
}

export interface CapabilityParam {
  name: string;
  type: string;
  required: boolean;
  limits: string;
}

export interface CapabilityDef {
  action: string;
  description: string;
  params: CapabilityParam[];
  constraints: string[];
  result: string;
}

/**
 * Every cursor capability the Director may plan with. The model reads the
 * rendered form of this table; the guard enforces the same bounds in code.
 */
export const ACTOR_CAPABILITIES: CapabilityDef[] = [
  {
    action: "click",
    description: "Real click on a registered anchor.",
    params: [{ name: "target", type: "anchor key", required: true, limits: "must exist in the registry and be on screen" }],
    constraints: ["credential, lockout, and money keys refuse"],
    result: "done / not-on-screen:<key> / forbidden-target:<key>",
  },
  {
    action: "point",
    description: "Glide the cursor onto a registered anchor. No touch.",
    params: [{ name: "target", type: "anchor key", required: true, limits: "same as click" }],
    constraints: ["read-only gesture"],
    result: "done / not-on-screen:<key>",
  },
  {
    action: "goto",
    description: "Ride to a manifest route (cursor swallows into the nav anchor when one is rendered).",
    params: [{ name: "route", type: "manifest route", required: true, limits: "must be a listed route" }],
    constraints: ["unknown routes refuse; handle mode defers"],
    result: "done / unknown-route:<route>",
  },
  {
    action: "type",
    description: "Type into a registered input.",
    params: [
      { name: "target", type: "input anchor key", required: true, limits: "kind must be input" },
      { name: "text", type: "string", required: true, limits: "non-empty, max 500 chars" },
    ],
    constraints: ["ride-only; password/credential fields refuse live"],
    result: "done / wrong-kind:<key> / empty-text",
  },
  {
    action: "highlight",
    description: "Ring-highlight a registered anchor briefly.",
    params: [
      { name: "target", type: "anchor key", required: true, limits: "same as click" },
      { name: "ms", type: "number", required: false, limits: "default 1200" },
    ],
    constraints: ["read-only gesture"],
    result: "done",
  },
  {
    action: "drag",
    description: "Real drag between two registered ends.",
    params: [
      { name: "from", type: "anchor key", required: true, limits: "both ends known and touchable" },
      { name: "to", type: "anchor key", required: true, limits: "both ends known and touchable" },
    ],
    constraints: ["either end unknown/forbidden fails the whole drag; ride-only"],
    result: "done / not-on-screen:<key>",
  },
  {
    action: "live_click / live_type / live_drag",
    description: "Open-world acts on stamped live-table indexes (no registration).",
    params: [
      { name: "index", type: "positive integer", required: true, limits: "from the LATEST table only; dies on navigation" },
      { name: "expect", type: "visible label", required: false, limits: "changed label refuses instead of misclicking" },
    ],
    constraints: ["credential, lockout, and money labels refuse at resolve time"],
    result: "done-live / not-on-screen:live-<n> / stale-live:<n> / stale-expect:<n> / refused-live-label:<label>",
  },
  {
    action: "gesture",
    description: "Expressive cursor movement around a resolved anchor. Moves only — can never click, type, drag, or navigate.",
    params: [
      { name: "kind", type: "move | oscillate | circle | pause", required: true, limits: "exactly one kind per step" },
      { name: "target", type: "anchor key", required: false, limits: "exactly one of target / index (except pause, which takes neither)" },
      { name: "index", type: "positive integer", required: false, limits: "latest-table index, verified with expect like live_click" },
      { name: "amplitude", type: "number px", required: false, limits: `oscillate swing each side, default 24, max ${GESTURE_BOUNDS.maxAmplitudePx}` },
      { name: "cycles", type: "integer", required: false, limits: `oscillate full cycles, default 2, max ${GESTURE_BOUNDS.maxCycles}` },
      { name: "radius", type: "number px", required: false, limits: `circle radius, default 32, max ${GESTURE_BOUNDS.maxRadiusPx}` },
      { name: "ms", type: "number ms", required: false, limits: `pause dwell, default 600, max ${GESTURE_BOUNDS.maxPauseMs}; whole-step cap ${GESTURE_BOUNDS.maxStepMs}` },
    ],
    constraints: [
      "no model-supplied coordinates — anchors only",
      "over-cap values refuse before execution",
      "STOP/Esc and newer runs preempt between sub-movements",
      "handle mode skips (pure theater)",
      "reduced-motion renders as instant jumps (same cursor element, same CSS rule)",
    ],
    result: "done-gesture:<kind> / stopped-by-owner / preempted-by-newer-run / bad-gesture:<reason>",
  },
];

/** Render the capability reference the model reads. Single-sourced. */
export function describeCapabilities(): string {
  const lines = ACTOR_CAPABILITIES.map((c) => {
    const params = c.params.map((p) => `${p.name}${p.required ? "*" : ""} (${p.type}; ${p.limits})`).join("; ");
    return `- ${c.action}: ${c.description} Params: ${params}. Constraints: ${c.constraints.join("; ")}. Receipts: ${c.result}.`;
  });
  return `CURSOR CAPABILITIES (the ONLY moves that exist — plan inside these, never around them):\n${lines.join("\n")}`;
}

/** Pure bounds check shared by the guard. Returns null when valid. */
export function checkGestureBounds(s: GestureStep): string | null {
  const kinds: readonly string[] = ["move", "oscillate", "circle", "pause"];
  if (!s || typeof s.kind !== "string" || !kinds.includes(s.kind)) return "unknown-kind";
  const hasTarget = typeof s.target === "string" && !!s.target;
  const hasIndex = typeof s.index === "number" && Number.isInteger(s.index) && (s.index as number) > 0;
  if (s.kind === "pause") {
    if (hasTarget || hasIndex) return "pause-takes-no-target";
    const ms = s.ms ?? 600;
    if (typeof ms !== "number" || !(ms > 0) || ms > GESTURE_BOUNDS.maxPauseMs) return "pause-ms-out-of-range";
    return null;
  }
  if ((hasTarget ? 1 : 0) + (hasIndex ? 1 : 0) !== 1) return "need-exactly-one-anchor";
  if (typeof s.amplitude === "number" && (!(s.amplitude > 0) || s.amplitude > GESTURE_BOUNDS.maxAmplitudePx)) {
    return "amplitude-out-of-range";
  }
  if (typeof s.cycles === "number" && (!Number.isInteger(s.cycles) || s.cycles < 1 || s.cycles > GESTURE_BOUNDS.maxCycles)) {
    return "cycles-out-of-range";
  }
  if (typeof s.radius === "number" && (!(s.radius > 0) || s.radius > GESTURE_BOUNDS.maxRadiusPx)) {
    return "radius-out-of-range";
  }
  if (typeof s.ms === "number" && (!(s.ms > 0) || s.ms > GESTURE_BOUNDS.maxStepMs)) {
    return "step-ms-out-of-range";
  }
  return null;
}
