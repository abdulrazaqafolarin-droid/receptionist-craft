/**
 * Snake engine gate: rules hold without a browser.
 *
 * Run: deno test --no-check --unstable-sloppy-imports src/lib/snakeEngine.test.ts
 */

import { createGame, setDirection, step } from "./snakeEngine.ts";

// Minimal ambient so tsc (which typechecks src/) accepts the Deno runner.
declare const Deno: { test(name: string, fn: () => void): void };

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

// Deterministic rng: always the first free cell.
const first: () => number = () => 0;

Deno.test("fresh game moves right with 3 segments", () => {
  const g = createGame(20, first);
  check(g.alive && g.score === 0 && g.snake.length === 3, "fresh game sane");
  const moved = step(g, first);
  check(moved.snake[0].x === 5 && moved.snake.length === 3, "moves right, no growth");
});

Deno.test("180-degree reversal ignored", () => {
  const g = createGame(20, first);
  const turned = setDirection(g, "left");
  check(turned.dir === "right", "reversal refused");
  check(setDirection(g, "up").dir === "up", "legal turn accepted");
});

Deno.test("eating grows and scores, food respawns off-snake", () => {
  let g = createGame(6, first);
  // Drive onto the food deterministically: place head next to it.
  g = { ...g, snake: [{ x: 1, y: 1 }, { x: 0, y: 1 }], dir: "right", food: { x: 2, y: 1 } };
  const after = step(g, first);
  check(after.score === 1, "scores on eat");
  check(after.snake.length === 3, "grows on eat");
  check(!after.snake.some((c) => c.x === after.food.x && c.y === after.food.y), "food respawns off the snake");
});

Deno.test("walls kill", () => {
  const g = { ...createGame(6, first), snake: [{ x: 5, y: 2 }], dir: "right" as const };
  check(step(g, first).alive === false, "right wall kills");
});

Deno.test("self collision kills, tail chase is safe", () => {
  // Headed into own neck: dead.
  const neck = {
    ...createGame(6, first),
    snake: [{ x: 2, y: 2 }, { x: 2, y: 1 }, { x: 1, y: 1 }],
    dir: "up" as const,
    food: { x: 0, y: 0 },
  };
  check(step(neck, first).alive === false, "neck collision kills");
  // Headed into the cell the tail vacates: alive.
  const chase = {
    ...createGame(6, first),
    snake: [{ x: 1, y: 2 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    dir: "right" as const,
    food: { x: 0, y: 0 },
  };
  const after = step(chase, first);
  check(after.alive === true, "tail-chase survives");
});

Deno.test("dead games stay dead", () => {
  const g = { ...createGame(6, first), alive: false };
  check(step(g, first) === g, "no ticks after death");
  check(setDirection(g, "up") === g, "no steering after death");
});
