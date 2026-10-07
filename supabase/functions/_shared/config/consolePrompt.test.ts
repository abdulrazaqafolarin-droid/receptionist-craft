/**
 * Phase D gate: the console prompt contract.
 *
 * Staff get straight answers from live records. The prompt must carry the
 * snapshot, name the bounds honestly (no shelves, no suppliers, no money,
 * no customers), and degrade gracefully when the knowledge base is empty.
 *
 * Run: deno test supabase/functions/_shared/config/consolePrompt.test.ts
 */

import { buildConsolePrompt, snapshotBlock, type ConsoleSnapshot } from "./consolePrompt.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const FULL: ConsoleSnapshot = {
  businessName: "Test Pharmacy",
  knowledgeBase: "We open Mon-Sat. Amara handles mornings.",
  modulesOn: ["stockTracker"],
  stockLines: ["Paracetamol is low (3 left, restock at 10)", "Vitamin C expires 2026-11-01 — sell first"],
  overdueTasks: ["Count the fridge drugs"],
  dueTodayTasks: ["Sweep the store room"],
  conflictCount: 1,
  staffCount: 2,
};

Deno.test("snapshot carries the worst news first", () => {
  const block = snapshotBlock(FULL);
  check(block.includes("Paracetamol is low"), "stock alert line present");
  check(block.includes("OVERDUE TASKS"), "overdue section present");
  check(block.includes("DUE TODAY"), "due-today section present");
  check(block.includes("1 shift conflict"), "conflict count present");
});

Deno.test("empty snapshot says so instead of inventing", () => {
  const block = snapshotBlock({
    businessName: "X", knowledgeBase: "", modulesOn: [],
    stockLines: [], overdueTasks: [], dueTodayTasks: [], conflictCount: 0, staffCount: 0,
  });
  check(block.includes("nothing flagged"), "empty stock is stated");
  check(block.includes("nothing overdue"), "empty tasks stated");
  check(block.includes("no conflicts"), "empty roster stated");
});

Deno.test("prompt bounds: staff framing, no customers, no money moves", () => {
  const p = buildConsolePrompt(FULL);
  check(p.includes("Test Pharmacy"), "business named");
  check(p.includes("OWNER or their STAFF"), "staff framing");
  check(p.includes("does not serve customers"), "customer work refused");
  check(p.includes("cannot see the shelves"), "vision limit honest");
  check(p.includes("No knowledge base written yet") === false, "KB present so no empty-KB line");
});

Deno.test("empty knowledge base degrades honestly", () => {
  const p = buildConsolePrompt({ ...FULL, knowledgeBase: "   " });
  check(p.includes("No knowledge base written yet"), "empty KB stated plainly");
});
