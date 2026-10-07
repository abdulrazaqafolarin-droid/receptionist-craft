/**
 * Snake engine — pure logic for the planning-wait mini-game.
 *
 * Zero DOM, zero network, zero timers: the React component owns the loop
 * and rendering, this module owns the rules. Fully deterministic given an
 * injected rng, so it is unit-tested without a browser.
 */

export interface Vec {
  x: number;
  y: number;
}

export type Dir = "up" | "down" | "left" | "right";

export interface SnakeState {
  /** Grid is size x size cells. */
  size: number;
  /** Head first. */
  snake: Vec[];
  dir: Dir;
  score: number;
  alive: boolean;
  food: Vec;
}

export type Rng = () => number;

const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const DELTA: Record<Dir, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function emptyCell(snake: Vec[], size: number, rng: Rng): Vec {
  const taken = new Set(snake.map((c) => `${c.x},${c.y}`));
  const free: Vec[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!taken.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  // Board full (won): leave the food where it is — unreachable, game won.
  if (free.length === 0) return { x: -1, y: -1 };
  return free[Math.floor(rng() * free.length)];
}

/** Fresh game: short snake centre-left, moving right. */
export function createGame(size = 20, rng: Rng = Math.random): SnakeState {
  const mid = Math.floor(size / 2);
  const snake: Vec[] = [
    { x: 4, y: mid },
    { x: 3, y: mid },
    { x: 2, y: mid },
  ];
  return { size, snake, dir: "right", score: 0, alive: true, food: emptyCell(snake, size, rng) };
}

/** Steering: 180-degree reversals are ignored (instant suicide is no game). */
export function setDirection(s: SnakeState, d: Dir): SnakeState {
  if (!s.alive) return s;
  if (d === s.dir || d === OPPOSITE[s.dir]) return s;
  return { ...s, dir: d };
}

/** One tick: move, maybe eat and grow, maybe die. */
export function step(s: SnakeState, rng: Rng = Math.random): SnakeState {
  if (!s.alive) return s;
  const delta = DELTA[s.dir];
  const head = { x: s.snake[0].x + delta.x, y: s.snake[0].y + delta.y };
  if (head.x < 0 || head.y < 0 || head.x >= s.size || head.y >= s.size) {
    return { ...s, alive: false };
  }
  const eating = head.x === s.food.x && head.y === s.food.y;
  // The tail cell frees up this tick unless we just ate (growth keeps it).
  const body = eating ? s.snake : s.snake.slice(0, -1);
  if (body.some((c) => c.x === head.x && c.y === head.y)) {
    return { ...s, alive: false };
  }
  const snake = eating ? [head, ...s.snake] : [head, ...s.snake.slice(0, -1)];
  return {
    ...s,
    snake,
    score: eating ? s.score + 1 : s.score,
    food: eating ? emptyCell(snake, s.size, rng) : s.food,
  };
}
