/**
 * ActorCursor — the operator's visible hands.
 *
 * A floating cursor that glides between registered UI elements while a
 * scripted or planner-driven tour runs, with a highlight ring and a
 * narration bubble. The owner always sees what the operator is doing —
 * visibility IS the trust mechanism. Paired with useActorHost, which wires
 * the dependency-injected runner to the real DOM.
 *
 * Safety properties (do not break):
 * - The cursor is pointer-events-none: it can never block real input.
 * - All motion is CSS transitions; reduced-motion jumps instantly.
 * - STOP (button + Esc) halts between actions via the runner's stop flag.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SVGProps } from "react";
import { BlueySpeechBubble } from "@/components/BlueySpeechBubble";
import { useNavigate } from "react-router-dom";
import { Square } from "lucide-react";
import { runActorScript, claimActorRun, type ActorReceipt, type ActorMode } from "@/lib/actorRunner";
import type { ActorAction } from "@/lib/actorGuard";
import { describeLiveLabel } from "@/lib/actorGuard";
import { useDirectorPresence } from "@/hooks/useDirectorPresence";

/**
 * Global run registry: every host run registers here so one indicator can
 * show and stop them all, whatever page started them. The registry holds
 * stop callbacks only — no DOM, no state, nothing to leak.
 */
interface RunEntry {
  stop: () => void;
  mode: ActorMode;
}

let runSeq = 0;
const activeRuns = new Map<number, RunEntry>();
const runListeners = new Set<() => void>();

function publishRuns() {
  runListeners.forEach((l) => l());
}

export function stopAllActorRuns() {
  activeRuns.forEach((r) => r.stop());
}

export function useActorRuns(): Array<{ id: number; mode: ActorMode }> {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    runListeners.add(listener);
    return () => {
      runListeners.delete(listener);
    };
  }, []);
  return [...activeRuns.entries()].map(([id, r]) => ({ id, mode: r.mode }));
}

/** Persistent footprint: what is running, in what mode, with one STOP. */
export function ActorRunIndicator() {
  const runs = useActorRuns();
  // Autonomous Director work is server-side and unstoppable from here —
  // the pill names it instead of offering a stop it cannot honor.
  const presence = useDirectorPresence();
  const presenceLabel = presence.active?.label ?? null;
  if (runs.length === 0 && !presenceLabel) return null;
  const background = runs.length > 0 && runs.every((r) => r.mode === "handle");
  const text = runs.length > 0
    ? background ? "Working in the background" : "Guide showing you around"
    : `Director: ${presenceLabel}`;
  return (
    <div className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-xl" role="status">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="whitespace-nowrap text-xs font-medium">
        {text}
      </span>
      {runs.length > 0 && (
        <button
          onClick={stopAllActorRuns}
          className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
          aria-label="Stop all guided runs"
        >
          Stop
        </button>
      )}
    </div>
  );
}

export interface CursorPoint {
  x: number;
  y: number;
}

/**
 * Global gaze publisher: every host reports the live cursor point so the
 * Director buddy's pupils can look at it (Bluey's gaze behavior). Last
 * writer wins; subscribers get a fresh snapshot, never a stream to leak.
 */
let lastCursorPoint: (CursorPoint & { at: number }) | null = null;
const gazeListeners = new Set<() => void>();

export function publishCursorPoint(p: CursorPoint | null) {
  lastCursorPoint = p ? { ...p, at: Date.now() } : null;
  gazeListeners.forEach((l) => l());
}

export function useCursorGaze(): CursorPoint | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    gazeListeners.add(listener);
    return () => {
      gazeListeners.delete(listener);
    };
  }, []);
  if (!lastCursorPoint || Date.now() - lastCursorPoint.at > 4000) return null;
  return { x: lastCursorPoint.x, y: lastCursorPoint.y };
}

export type CursorSize = 48 | 72 | 96 | 120;

export function ActorCursor({
  point,
  color = "#2563eb",
  swallow = false,
  arriving = false,
  size = 72,
  glow = true,
  bouncing = false,
}: {
  point: CursorPoint | null;
  color?: string;
  swallow?: boolean;
  arriving?: boolean;
  /** Body size in px (Bluey range 48–120). */
  size?: CursorSize;
  glow?: boolean;
  /** Talk-test bounce in progress. */
  bouncing?: boolean;
}) {
  // Mirror the live point for gaze subscribers; clear on unmount-ish hides.
  useEffect(() => {
    if (point && !swallow) publishCursorPoint(point);
    if (!point && !arriving) publishCursorPoint(null);
  }, [point, swallow, arriving]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!point && !arriving) return null;
  // Arrival: emerge top-center scaling up (black-hole exit). Position is
  // fixed theater, not a claim about page content.
  const at = point ?? { x: 0, y: 0 };
  const k = size / 72;
  const gid = `actor-teardrop-${uid}`;
  const g1 = `actor-glow1-${uid}`;
  const g2 = `actor-glow2-${uid}`;
  return (
    <div
      className={`pointer-events-none fixed left-0 top-0 z-[90] motion-reduce:transition-none ${arriving && !point ? "actor-arrive" : "transition-transform duration-500 ease-out"} ${bouncing ? "bluey-bounce" : ""}`}
      style={
        arriving && !point
          ? { left: "50%", top: "96px" }
          : {
              transform: `translate(${at.x}px, ${at.y}px)${swallow ? " scale(0.05)" : ""}`,
              opacity: swallow ? 0 : 1,
              transition: swallow
                ? "transform 0.45s ease-in, opacity 0.45s ease-in"
                : undefined,
            }
      }
      aria-hidden="true"
    >
      {/* Teardrop body (Bluey geometry, original art): rounded square with
          one sharp tip corner, berry gradient, shine, white rim, double
          soft glow. Drawn fresh each render — cheap SVG, no assets. */}
      <svg width={Math.round(30 * k)} height={Math.round(30 * k)} viewBox="0 0 72 72" fill="none">
        <defs>
          <linearGradient id={gid} x1="12" y1="8" x2="60" y2="64" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.7" />
          </linearGradient>
          <filter id={g1} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={10 * k} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id={g2} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation={5 * k} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <g filter={glow ? `url(#${g1})` : undefined} opacity={glow ? 0.7 : 0}>
          <TeardropPath fill={color} />
        </g>
        <g filter={glow ? `url(#${g2})` : undefined} opacity={glow ? 0.45 : 0}>
          <TeardropPath fill={color} />
        </g>
        <TeardropPath fill={`url(#${gid})`} stroke="white" strokeWidth={2.5 * k} strokeLinejoin="round" />
        <ellipse cx={26} cy={20} rx={10 * k} ry={6 * k} fill="white" opacity="0.35" transform={`rotate(-24 26 20)`} />
      </svg>
    </div>
  );
}

function TeardropPath(props: SVGProps<SVGPathElement>) {
  // Square with three fully rounded corners, one sharp tip (top-left).
  return (
    <path
      d="M14 4 H48 Q64 4 64 20 V48 Q64 64 48 64 H20 Q4 64 4 48 V20 Q4 4 14 4 Z"
      {...props}
    />
  );
}

export interface RingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function centerOf(el: Element): CursorPoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function rectOf(el: Element): RingRect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * Hosts a tour: cursor + ring + narration + STOP, driven by the runner.
 * Returns everything a page needs to offer a "watch" experience.
 */
export interface ShowcaseBox {
  title: string;
  lines: string[];
}

export function useActorHost(handlers?: { onCollect?: (connectorKey: string) => void }) {
  const navigate = useNavigate();
  const [point, setPoint] = useState<CursorPoint | null>(null);
  const [swallow, setSwallow] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [ring, setRing] = useState<RingRect | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseBox | null>(null);
  const [running, setRunning] = useState(false);
  const [receipts, setReceipts] = useState<ActorReceipt[]>([]);
  // Bluey life: follow mode trails the owner's mouse when idle; the cursor
  // rests at its home (the Director chat perch when open, else the
  // bottom-right corner dock) after work and when hidden it
  // stays hidden until asked back. Preferences persist locally per user.
  const [follow, setFollow] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rutex-cursor-follow") === "1";
    } catch {
      return false;
    }
  });
  const [cursorHidden, setCursorHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rutex-cursor-hidden") === "1";
    } catch {
      return false;
    }
  });
  const [bouncing, setBouncing] = useState(false);
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const runSeqRef = useRef(0);
  // Synchronous mirror of the cursor point for humanized path planning
  // (state updates are async; the planner needs the origin NOW).
  const pointRef = useRef<CursorPoint | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const dockPoint = useCallback((): CursorPoint => {
    // Home is the Director chat perch when it exists (the cursor lives on
    // its own chat); otherwise the bottom-right corner dock. Queried live
    // so opening/closing the chat moves home with it.
    try {
      const perch = document.querySelector('[data-actor="director-cursor-home"]');
      if (perch) {
        const r = perch.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }
      }
    } catch {
      // no DOM access — corner dock below
    }
    const w = typeof window !== "undefined" ? window.innerWidth : 1280;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return { x: Math.max(16, w - 96), y: Math.max(16, h - 150) };
  }, []);

  const goHome = useCallback(() => {
    const p = dockPoint();
    pointRef.current = p;
    setPoint(p);
  }, [dockPoint]);

  const toggleFollow = useCallback((on?: boolean) => {
    setFollow((v) => {
      const next = on ?? !v;
      try {
        localStorage.setItem("rutex-cursor-follow", next ? "1" : "0");
      } catch {
        // preference stays session-local
      }
      return next;
    });
  }, []);

  const setVisible = useCallback((visible: boolean) => {
    try {
      localStorage.setItem("rutex-cursor-hidden", visible ? "0" : "1");
    } catch {
      // ignore
    }
    setCursorHidden(!visible);
    if (!visible) {
      pointRef.current = null;
      setPoint(null);
      publishCursorPoint(null);
    }
  }, []);

  const bounce = useCallback(() => {
    setBouncing(true);
    setTimeout(() => setBouncing(false), 2800);
  }, []);

  // Follow engine: while enabled and no run is active, the cursor trails
  // the owner's mouse (rAF-throttled, CSS lag does the smoothing). Tours
  // take precedence instantly; when they end, the cursor glides home and
  // follow resumes from the live mouse.
  useEffect(() => {
    if (!follow || cursorHidden) return;
    let raf = 0;
    let pending: CursorPoint | null = null;
    const onMove = (e: MouseEvent) => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (pending && !runningRef.current) {
            // Keep the synchronous planner origin aligned with the visible cursor,
            // including follow mode; React state alone can lag behind a new run.
            pointRef.current = pending;
            setPoint(pending);
          }
          pending = null;
        });
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [follow, cursorHidden]);

  // Black-hole arrival: a traverse on the previous page leaves a note; a
  // host on the new page picks it up and emerges the cursor. Cross-page
  // script continuation arrives with actor_sessions (Director item 5) —
  // until then, arrival is a flourish that ends the ride, stated as such.
  useEffect(() => {
    let alive = true;
    try {
      const raw = sessionStorage.getItem("rutex-actor-arrival");
      if (raw) {
        const note = JSON.parse(raw) as { at?: number };
        if (note.at && Date.now() - note.at < 8000) {
          sessionStorage.removeItem("rutex-actor-arrival");
          setArriving(true);
          setTimeout(() => {
            if (alive) {
              setArriving(false);
              setPoint(null);
            }
          }, 1600);
        }
      }
    } catch {
      // storage unavailable — no arrival flourish, tour still works
    }
    return () => {
      alive = false;
    };
  }, []);

  const stop = useCallback(() => {
    stopRef.current = true;
    runningRef.current = false;
    setRunning(false);
  }, []);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stopRef.current === false) {
        // Only stops an active run; harmless otherwise.
        setRunning((r) => {
          if (r) stopRef.current = true;
          return false;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = useCallback(async (
    actions: ActorAction[],
    opts?: { tour?: string; userId?: string; receptionistId?: string; mode?: ActorMode; pace?: "brisk" | "human" },
  ) => {
    const mode = opts?.mode ?? "ride";
    const pace = opts?.pace ?? "brisk";
    stopRef.current = false;
    runningRef.current = true;
    const mySeq = ++runSeqRef.current;
    setRunning(true);
    setReceipts([]);
    // Ownership: the newest run wins. Claim the token first, then stop any
    // OTHER active run so two hosts can never fight over one cursor — the
    // older run observes the token mismatch (or its stop flag) and stands
    // down with an honest receipt instead of interleaving moves.
    const token = claimActorRun();
    const runId = ++runSeq;
    activeRuns.forEach((r, id) => {
      if (id !== runId) {
        try {
          r.stop();
        } catch {
          // a dead run entry stops nothing; the token check still holds
        }
      }
    });
    activeRuns.set(runId, { stop: () => { stopRef.current = true; setRunning(false); }, mode });
    publishRuns();
    const out = await runActorScript(actions, {
      resolve: (selector) => {
        try {
          return document.querySelector(selector);
        } catch {
          return null;
        }
      },
      resolveNav: (route) => {
        try {
          return document.querySelector(`a[href="${route}"]`);
        } catch {
          return null;
        }
      },
      traverse: async (route) => {
        // Swallow into the anchor when there is one; otherwise fade the
        // cursor out in place. Never glide to an unrelated button just
        // to have somewhere to disappear into.
        setSwallow(true);
        await new Promise<void>((r) => setTimeout(r, 480));
        setSwallow(false);
        pointRef.current = null;
        setPoint(null);
        try {
          sessionStorage.setItem("rutex-actor-arrival", JSON.stringify({ at: Date.now() }));
        } catch {
          // arrival flourish skipped; navigation still happens
        }
        navigate(route);
      },
      moveCursor: (el) => {
        const p = centerOf(el as Element);
        pointRef.current = p;
        setPoint(p);
      },
      locate: (el) => {
        try {
          return centerOf(el as Element);
        } catch {
          return null;
        }
      },
      moveTo: (x, y) => {
        // Viewport clamp lives here, with the screen knowledge: the
        // runner's plan is advisory, this is the enforced boundary.
        const w = typeof window !== "undefined" ? window.innerWidth : 1280;
        const h = typeof window !== "undefined" ? window.innerHeight : 800;
        const p = {
          x: Math.max(8, Math.min(w - 8, x)),
          y: Math.max(8, Math.min(h - 8, y)),
        };
        pointRef.current = p;
        setPoint(p);
      },
      cursorPos: () => pointRef.current,
      viewport: () => {
        if (typeof window === "undefined") return null;
        let reducedMotion = false;
        try {
          reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
        } catch {
          // media query unavailable — assume full motion
        }
        return { w: window.innerWidth, h: window.innerHeight, reducedMotion };
      },
      highlight: async (el, ms) => {
        setRing(rectOf(el as Element));
        await new Promise<void>((r) => setTimeout(r, ms));
        setRing(null);
      },
      scrollTo: async (el) => {
        (el as Element).scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise<void>((r) => setTimeout(r, 650));
        const p = centerOf(el as Element);
        pointRef.current = p;
        setPoint(p);
      },
      click: async (el) => {
        (el as HTMLElement).click();
      },
      describe: (el) => describeLiveLabel(el as Element),
      dragInto: async (fromEl, toEl) => {
        // Real drag: pointer presses at the source center, travels in
        // steps so sortable lists and sliders track it, releases at the
        // target center. Mouse events (not HTML5 DnD) — covers the
        // overwhelmingly common custom implementations.
        const r1 = (fromEl as Element).getBoundingClientRect();
        const r2 = (toEl as Element).getBoundingClientRect();
        const x1 = r1.left + r1.width / 2;
        const y1 = r1.top + r1.height / 2;
        const x2 = r2.left + r2.width / 2;
        const y2 = r2.top + r2.height / 2;
        const at = (x: number, y: number) => ({
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, button: 0, buttons: 1,
        });
        const src = document.elementFromPoint(x1, y1) || (fromEl as Element);
        src.dispatchEvent(new PointerEvent("pointerdown", { ...at(x1, y1), pointerId: 1, isPrimary: true }));
        (fromEl as HTMLElement).dispatchEvent(new MouseEvent("mousedown", at(x1, y1)));
        const steps = 12;
        for (let i = 1; i <= steps; i++) {
          const x = x1 + ((x2 - x1) * i) / steps;
          const y = y1 + ((y2 - y1) * i) / steps;
          document.dispatchEvent(new PointerEvent("pointermove", { ...at(x, y), pointerId: 1, isPrimary: true }));
          document.dispatchEvent(new MouseEvent("mousemove", at(x, y)));
          await new Promise<void>((r) => setTimeout(r, 16));
        }
        const dst = document.elementFromPoint(x2, y2) || (toEl as Element);
        document.dispatchEvent(new PointerEvent("pointerup", { ...at(x2, y2), pointerId: 1, isPrimary: true }));
        dst.dispatchEvent(new MouseEvent("mouseup", { ...at(x2, y2), button: 0, buttons: 0 }));
        (toEl as HTMLElement).dispatchEvent(new MouseEvent("click", at(x2, y2)));
      },
      typeInto: async (el, text, pressReturn) => {
        const input = el as HTMLInputElement | HTMLTextAreaElement;
        const tag = (input.tagName || "").toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          throw new Error("not-typable-element");
        }
        const typeAttr = (input.getAttribute("type") || "text").toLowerCase();
        const auto = (input.getAttribute("autocomplete") || "").toLowerCase();
        const nameId = `${input.getAttribute("name") || ""} ${input.id || ""}`.toLowerCase();
        // Credential fields are refused at the live DOM, where they can
        // actually be inspected — Bluey's rule, enforced in code.
        if (
          typeAttr === "password" ||
          auto.includes("current-password") || auto.includes("new-password") ||
          /password|passwd|secret|api[-_ ]?key|credit[-_ ]?card|cvv|cvc/.test(nameId)
        ) {
          throw new Error("refused-password-field");
        }
        input.focus();
        // Native setter + events so React-controlled inputs accept the value.
        const proto = tag === "textarea"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        setter ? setter.call(input, text) : (input.value = text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (pressReturn) {
          await new Promise<void>((r) => setTimeout(r, 120));
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        }
      },
      say: async (text) => {
        setBubble(text);
      },
      showcase: async (_el, title, lines) => {
        setShowcase({ title, lines });
      },
      collect: async (connectorKey) => {
        handlersRef.current?.onCollect?.(connectorKey);
      },
      isStopped: () => stopRef.current,
      stepDelayMs: 500,
    }, { mode, pace, runToken: token });
    setReceipts(out);
    setRunning(false);
    runningRef.current = false;
    activeRuns.delete(runId);
    publishRuns();
    // Resting place: when no follow mode is waiting to take over, glide
    // home after a beat so the cursor visibly finishes its work.
    if (!follow) {
      const seq = mySeq;
      setTimeout(() => {
        if (runSeqRef.current === seq && !runningRef.current) goHome();
      }, 2200);
    }
    return out;
  }, [navigate, follow, goHome]);

  const clear = useCallback(() => {
    setPoint(null);
    setSwallow(false);
    setArriving(false);
    setRing(null);
    setBubble(null);
    setShowcase(null);
    setReceipts([]);
  }, []);

  const dismissBubble = useCallback(() => {
    setBubble(null);
  }, []);

  const dismissShowcase = useCallback(() => {
    setShowcase(null);
  }, []);

  return { point, ring, bubble, showcase, running, receipts, start, stop, clear, dismissBubble, dismissShowcase, swallow, arriving, follow, toggleFollow, setVisible, cursorHidden, goHome, bounce, bouncing };
}

/** The highlight ring + narration bubble + STOP control for an active run. */
export function ActorOverlay({
  ring,
  bubble,
  showcase,
  running,
  color = "#2563eb",
  onStop,
  onDismissBubble,
  onDismissShowcase,
}: {
  ring: RingRect | null;
  bubble: string | null;
  showcase: ShowcaseBox | null;
  running: boolean;
  color?: string;
  onStop: () => void;
  onDismissBubble: () => void;
  onDismissShowcase: () => void;
}) {
  return (
    <>
      {ring && (
        <div
          className="pointer-events-none fixed z-[89] rounded-xl motion-reduce:transition-none"
          style={{
            left: ring.x - 6,
            top: ring.y - 6,
            width: ring.w + 12,
            height: ring.h + 12,
            border: `2px solid ${color}`,
            boxShadow: `0 0 0 4px ${color}22, 0 0 24px ${color}44`,
            transition: "all 0.3s ease-out",
          }}
          aria-hidden="true"
        />
      )}
      {bubble && (
        <BlueySpeechBubble text={bubble} onDismiss={onDismissBubble} />
      )}
      {showcase && (
        <div
          className="fixed bottom-24 right-4 z-[91] w-[calc(100%-2rem)] max-w-xs rounded-2xl border border-primary/25 bg-card p-4 shadow-xl"
          role="status"
          aria-label={showcase.title}
        >
          <p className="text-sm font-semibold">{showcase.title}</p>
          <ul className="mt-2 space-y-1.5">
            {showcase.lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                {line}
              </li>
            ))}
          </ul>
          <button
            onClick={onDismissShowcase}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
      {running && (
        <button
          onClick={onStop}
          className="fixed bottom-6 left-6 z-[91] flex items-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground shadow-xl"
          aria-label="Stop the guided tour"
        >
          <Square className="h-3.5 w-3.5" aria-hidden="true" /> Stop
        </button>
      )}
    </>
  );
}
