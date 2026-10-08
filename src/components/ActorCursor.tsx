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
import { supabase } from "@/integrations/supabase/client";
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
export interface ShowcaseBox {
  title: string;
  lines: string[];
}

export interface ConfirmAsk {
  label: string;
  resolve: (granted: boolean) => void;
}

export function useActorHost(handlers?: { onCollect?: (connectorKey: string) => void }) {
  const [point, setPoint] = useState<CursorPoint | null>(null);
  const [ring, setRing] = useState<RingRect | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<ShowcaseBox | null>(null);
  const [confirmAsk, setConfirmAsk] = useState<ConfirmAsk | null>(null);
  const [running, setRunning] = useState(false);
  const [receipts, setReceipts] = useState<ActorReceipt[]>([]);
  const stopRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

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

  const start = useCallback(async (
    actions: ActorAction[],
    opts?: { tour?: string; userId?: string; receptionistId?: string },
  ) => {
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
    });
    setReceipts(out);
    setRunning(false);
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
  }, []);

  const clear = useCallback(() => {
    setPoint(null);
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

  const answerConfirm = useCallback((granted: boolean) => {
    setConfirmAsk((ask) => {
      ask?.resolve(granted);
      return null;
    });
  }, []);

  return { point, ring, bubble, showcase, confirmAsk, running, receipts, start, stop, clear, dismissBubble, dismissShowcase, answerConfirm };
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
