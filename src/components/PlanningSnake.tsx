/**
 * PlanningSnake — the planning-wait mini-game.
 *
 * Shows while a long AI planning/build job runs: Rutex-branded Snake on a
 * small canvas, live score, the REAL planning status handed in from above,
 * minimize + close controls. Completely independent from the planner:
 * no props flow back, no network, no timers shared. Unmounting (job done
 * or failed, user closes it) changes nothing about the job.
 *
 * Independence contract (do not break):
 * - The planner never reads anything from here.
 * - Closing/minimizing/losing/ignoring never touches the job.
 * - Appears only after a grace delay (fast jobs never flash it).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Play, RotateCcw, X } from "lucide-react";
import { createGame, setDirection, step, type Dir, type SnakeState } from "@/lib/snakeEngine";

const TICK_MS = 135;
const GRACE_MS = 6000;
const CELLS = 20;
const PIXELS = 220;

function primaryHsl(): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    return v ? `hsl(${v})` : "#2563eb";
  } catch {
    return "#2563eb";
  }
}

export function PlanningSnake({ statusText }: { statusText: string }) {
  const [game, setGame] = useState<SnakeState>(() => createGame(CELLS));
  const [playing, setPlaying] = useState<boolean>(() => {
    try {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return true;
    }
  });
  // Grace delay: mount instantly would flash the game on fast jobs.
  const [warmed, setWarmed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef("#2563eb");

  useEffect(() => {
    primaryRef.current = primaryHsl();
    const t = setTimeout(() => setWarmed(true), GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  // Pause while the tab is hidden — dying because you looked away is no game.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!playing || !game.alive || !warmed || minimized) return;
    const id = setInterval(() => {
      setGame((g) => step(g));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, game.alive, warmed, minimized]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = PIXELS / CELLS;
    const primary = primaryRef.current;
    ctx.clearRect(0, 0, PIXELS, PIXELS);
    // Faint grid — structure without noise.
    ctx.strokeStyle = "rgba(127,127,127,0.12)";
    ctx.lineWidth = 1;
    for (let i = 1; i < CELLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, PIXELS);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(PIXELS, i * cell);
      ctx.stroke();
    }
    // Food.
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(game.food.x * cell + cell / 2, game.food.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // Snake: head solid, body fading.
    game.snake.forEach((c, i) => {
      ctx.globalAlpha = Math.max(0.35, 1 - i * 0.045);
      ctx.fillStyle = primary;
      const pad = i === 0 ? 1 : 2;
      const x = c.x * cell + pad;
      const y = c.y * cell + pad;
      const w = cell - pad * 2;
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, w, w, 4);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, w, w);
      }
    });
    ctx.globalAlpha = 1;
  }, [game]);

  useEffect(() => {
    draw();
  }, [draw]);

  const steer = (d: Dir) => {
    setGame((g) => {
      const turned = setDirection(g, d);
      // A first input starts a paused game (reduced-motion, tab-hidden).
      if (!playing && turned.alive) setPlaying(true);
      return turned;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, Dir> = {
      ArrowUp: "up", w: "up", W: "up",
      ArrowDown: "down", s: "down", S: "down",
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      steer(dir);
    }
  };

  // Touch: swipe steers; the canvas alone claims the gesture so page
  // scrolling elsewhere is untouched.
  const touchFrom = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchFrom.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const from = touchFrom.current;
    if (!from) return;
    const t = e.touches[0];
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    touchFrom.current = { x: t.clientX, y: t.clientY };
  };

  if (dismissed || !warmed) return null;

  return (
    <div
      ref={wrapRef}
      className="rounded-2xl border border-primary/25 bg-primary/5 p-3 motion-reduce:animate-none"
      aria-label="Planning activity game"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          {game.alive ? "Building your operator" : "Round over — planning continues"}
        </p>
        <span className="shrink-0 rounded-md bg-card px-2 py-0.5 text-xs font-semibold tabular-nums" aria-label={`Score ${game.score}`}>
          {game.score}
        </span>
        <button
          type="button"
          onClick={() => setMinimized((v) => !v)}
          aria-label={minimized ? "Expand game" : "Minimize game"}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {minimized ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Close game (planning keeps running)"
          title="Close game (planning keeps running)"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!minimized && (
        <>
          <div
            className="mx-auto mt-2 w-full max-w-[240px] outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            tabIndex={0}
            role="application"
            aria-label="Snake game. Use arrow keys or swipe to steer. Play while Rutex works."
            onKeyDown={onKeyDown}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          >
            <canvas
              ref={canvasRef}
              width={PIXELS}
              height={PIXELS}
              className="h-auto w-full touch-none rounded-xl bg-card"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" role="status">
              {statusText}
            </p>
            {!game.alive ? (
              <button
                type="button"
                onClick={() => { setGame(createGame(CELLS)); setPlaying(true); }}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Play again
              </button>
            ) : !playing ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" /> Play
              </button>
            ) : (
              <p className="shrink-0 text-[11px] text-muted-foreground">play while Rutex works</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
