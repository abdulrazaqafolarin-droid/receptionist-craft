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
import { useNavigate } from "react-router-dom";
import { Square } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runActorScript, type ActorReceipt, type ActorMode } from "@/lib/actorRunner";
import type { ActorAction } from "@/lib/actorGuard";

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
  if (runs.length === 0) return null;
  const takeover = runs.some((r) => r.mode === "takeover");
  const background = runs.every((r) => r.mode === "handle");
  return (
    <div className="fixed bottom-6 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 shadow-xl" role="status">
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <span className="whitespace-nowrap text-xs font-medium">
        {takeover
          ? "Operator in control (granted) — Esc takes it back"
          : background
            ? "Working in the background"
            : "Guide showing you around"}
      </span>
      <button
        onClick={stopAllActorRuns}
        className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground"
        aria-label="Stop all guided runs"
      >
        Stop
      </button>
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
}: {
  point: CursorPoint | null;
  color?: string;
  swallow?: boolean;
  arriving?: boolean;
  /** Body size in px (Bluey range 48–120). */
  size?: CursorSize;
  glow?: boolean;
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
      className={`pointer-events-none fixed left-0 top-0 z-[90] motion-reduce:transition-none ${arriving && !point ? "actor-arrive" : "transition-transform duration-500 ease-out"}`}
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

export interface ConfirmAsk {
  label: string;
  resolve: (granted: boolean) => void;
}

export function useActorHost(handlers?: { onCollect?: (connectorKey: string) => void }) {
  const navigate = useNavigate();
  const [point, setPoint] = useState<CursorPoint | null>(null);
  const [swallow, setSwallow] = useState(false);
  const [arriving, setArriving] = useState(false);
  const [ring, setRing] = useState<RingRect | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseBox | null>(null);
  const [confirmAsk, setConfirmAsk] = useState<ConfirmAsk | null>(null);
  const [running, setRunning] = useState(false);
  const [receipts, setReceipts] = useState<ActorReceipt[]>([]);
  const stopRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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
    setRunning(false);
  }, []);

  const answerConfirm = useCallback((granted: boolean) => {
    setConfirmAsk((ask) => {
      ask?.resolve(granted);
      return null;
    });
  }, []);

  /**
   * Takeover grant ceremony: the ONLY way the takeover mode starts. An
   * inline confirm names exactly what is granted (foreground control, Esc
   * revokes); a "no" (or silence) means ride mode or nothing — the caller
   * decides via onDenied. Nothing proceeds ungranted.
   */
  const requestTakeover = useCallback(
    async (actions: ActorAction[], opts?: { tour?: string; userId?: string; receptionistId?: string; onDenied?: () => void }) => {
      const granted = await new Promise<boolean>((resolve) => {
        setConfirmAsk({
          label: "Hand over foreground control? The operator will move, click, and travel while you watch. Esc takes it back anytime.",
          resolve,
        });
      });
      if (!granted) {
        opts?.onDenied?.();
        return [];
      }
      // start is declared below; this closure only runs on user action,
      // long after the component finished rendering.
      return start(actions, { ...opts, mode: "takeover" as ActorMode });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    opts?: { tour?: string; userId?: string; receptionistId?: string; mode?: ActorMode },
  ) => {
    const mode = opts?.mode ?? "ride";
    stopRef.current = false;
    setRunning(true);
    setReceipts([]);
    const runId = ++runSeq;
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
        setPoint(null);
        try {
          sessionStorage.setItem("rutex-actor-arrival", JSON.stringify({ at: Date.now() }));
        } catch {
          // arrival flourish skipped; navigation still happens
        }
        navigate(route);
      },
      moveCursor: (el) => {
        setPoint(centerOf(el as Element));
      },
      highlight: async (el, ms) => {
        setRing(rectOf(el as Element));
        await new Promise<void>((r) => setTimeout(r, ms));
        setRing(null);
      },
      scrollTo: async (el) => {
        (el as Element).scrollIntoView({ behavior: "smooth", block: "center" });
        await new Promise<void>((r) => setTimeout(r, 650));
        setPoint(centerOf(el as Element));
      },
      click: async (el) => {
        (el as HTMLElement).click();
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
      requestConfirm: (action) => new Promise<boolean>((resolve) => {
        const label = action.type === "click" || action.type === "collect"
          ? `Allow this step on "${action.target}"?`
          : "Allow this step?";
        setConfirmAsk({ label, resolve });
      }),
      isStopped: () => stopRef.current,
      stepDelayMs: 500,
    }, { mode });
    setReceipts(out);
    setRunning(false);
    activeRuns.delete(runId);
    publishRuns();
    // Permanent half of the audit surface: one row per completed run.
    // Fire-and-forget — a failed insert must never disturb a tour.
    if (out.length > 0 && opts?.userId) {
      const failed = out.find((r) => !r.ok);
      void (async () => {
        try {
          // Generated DB types lag behind migrations (never-edit file).
          const table = (supabase.from as unknown as (t: string) => {
            insert(v: unknown): PromiseLike<unknown>;
          })("actor_receipts");
          await table.insert({
            user_id: opts.userId,
            receptionist_id: opts.receptionistId ?? null,
            tour: opts.tour ?? "ad-hoc",
            mode,
            ok: !failed,
            steps: out.length,
            failed_detail: failed ? failed.detail.slice(0, 200) : null,
          });
        } catch {
          // receipts are a courtesy, not a dependency
        }
      })();
    }
    return out;
  }, [navigate]);

  const clear = useCallback(() => {
    setPoint(null);
    setSwallow(false);
    setArriving(false);
    setRing(null);
    setBubble(null);
    setShowcase(null);
    setConfirmAsk(null);
    setReceipts([]);
  }, []);

  const dismissBubble = useCallback(() => {
    setBubble(null);
  }, []);

  const dismissShowcase = useCallback(() => {
    setShowcase(null);
  }, []);

  return { point, ring, bubble, showcase, confirmAsk, running, receipts, start, stop, clear, dismissBubble, dismissShowcase, answerConfirm, swallow, arriving, requestTakeover };
}

/** The highlight ring + narration bubble + STOP control for an active run. */
export function ActorOverlay({
  ring,
  bubble,
  showcase,
  confirmAsk,
  running,
  color = "#2563eb",
  onStop,
  onDismissBubble,
  onDismissShowcase,
  onAnswerConfirm,
}: {
  ring: RingRect | null;
  bubble: string | null;
  showcase: ShowcaseBox | null;
  confirmAsk: ConfirmAsk | null;
  running: boolean;
  color?: string;
  onStop: () => void;
  onDismissBubble: () => void;
  onDismissShowcase: () => void;
  onAnswerConfirm: (granted: boolean) => void;
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
        <div className="fixed bottom-24 left-1/2 z-[91] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2" role="status">
          <div className="relative rounded-2xl border-2 border-primary/40 bg-card p-3 shadow-xl">
            <p className="text-sm">{bubble}</p>
            <button
              onClick={onDismissBubble}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
            <span
              className="absolute -bottom-[7px] left-8 h-3.5 w-3.5 rotate-45 border-b-2 border-r-2 border-primary/40 bg-card"
              aria-hidden="true"
            />
          </div>
        </div>
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
      {confirmAsk && (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center bg-background/70 p-4"
          role="alertdialog"
          aria-label="Confirm guided step"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-medium">The guide wants to take this step:</p>
            <p className="mt-1 text-sm text-muted-foreground">{confirmAsk.label}</p>
            <p className="mt-2 text-xs text-muted-foreground">Nothing happens until you approve. Declining stops the tour.</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onAnswerConfirm(true)}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Approve step
              </button>
              <button
                onClick={() => onAnswerConfirm(false)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Stop tour
              </button>
            </div>
          </div>
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
