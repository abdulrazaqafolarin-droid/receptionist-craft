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

import { useCallback, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { runActorScript, type ActorReceipt } from "@/lib/actorRunner";
import type { ActorAction } from "@/lib/actorGuard";

export interface CursorPoint {
  x: number;
  y: number;
}

export function ActorCursor({
  point,
  color = "#2563eb",
}: {
  point: CursorPoint | null;
  color?: string;
}) {
  if (!point) return null;
  return (
    <div
      className="pointer-events-none fixed left-0 top-0 z-[90] transition-transform duration-500 ease-out motion-reduce:transition-none"
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
      aria-hidden="true"
    >
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
        <path
          d="M6 3 L19 13 L12.5 14 L15.5 21 L12.5 22.5 L9.5 15.5 L6 19 Z"
          fill={color}
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
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
export function useActorHost() {
  const [point, setPoint] = useState<CursorPoint | null>(null);
  const [ring, setRing] = useState<RingRect | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [receipts, setReceipts] = useState<ActorReceipt[]>([]);
  const stopRef = useRef(false);

  const stop = useCallback(() => {
    stopRef.current = true;
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

  const start = useCallback(async (actions: ActorAction[]) => {
    stopRef.current = false;
    setRunning(true);
    setReceipts([]);
    const out = await runActorScript(actions, {
      resolve: (selector) => document.querySelector(selector),
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
      isStopped: () => stopRef.current,
      stepDelayMs: 500,
    });
    setReceipts(out);
    setRunning(false);
    return out;
  }, []);

  const clear = useCallback(() => {
    setPoint(null);
    setRing(null);
    setBubble(null);
    setReceipts([]);
  }, []);

  const dismissBubble = useCallback(() => {
    setBubble(null);
  }, []);

  return { point, ring, bubble, running, receipts, start, stop, clear, dismissBubble };
}

/** The highlight ring + narration bubble + STOP control for an active run. */
export function ActorOverlay({
  ring,
  bubble,
  running,
  color = "#2563eb",
  onStop,
  onDismissBubble,
}: {
  ring: RingRect | null;
  bubble: string | null;
  running: boolean;
  color?: string;
  onStop: () => void;
  onDismissBubble: () => void;
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
        <div className="fixed bottom-24 left-1/2 z-[91] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-xl">
          <p className="text-sm">{bubble}</p>
          <button
            onClick={onDismissBubble}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
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
