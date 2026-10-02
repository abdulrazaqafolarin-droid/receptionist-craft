// TS error ratchet: fails only on NEW type errors, never on the 45
// pre-existing ones. Compares normalized signatures (file + error code +
// message, no line/col) against scripts/tsc-baseline.txt.
// Usage: npm run typecheck > tsc.log; node scripts/check-tsc-ratchet.mjs tsc.log
// When pre-existing errors get FIXED, delete their lines from the baseline.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logFile = process.argv[2];
if (!logFile) {
  console.error("usage: check-tsc-ratchet.mjs <tsc-log>");
  process.exit(2);
}

const normalize = (line) => line.replace(/\(\d+,\d+\):/, ":").trim();

let log = "";
try {
  log = readFileSync(logFile, "utf8");
} catch {
  console.error(`cannot read ${logFile}`);
  process.exit(2);
}

const baseline = new Set(
  readFileSync(join(root, "scripts/tsc-baseline.txt"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);

const current = log
  .split("\n")
  .filter((l) => l.includes("error TS"))
  .map(normalize);

const seen = new Set();
const fresh = [...new Set(current)].filter((s) => !baseline.has(s));
const fixed = [...baseline].filter((s) => !new Set(current).has(s));
void seen;

if (fresh.length > 0) {
  console.error(`NEW type errors (${fresh.length}) — fix these:`);
  for (const f of fresh) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`No new type errors. Current: ${new Set(current).size}, baseline: ${baseline.size}.`);
if (fixed.length > 0) {
  console.log(`Note: ${fixed.length} baseline error(s) no longer occur — remove them from scripts/tsc-baseline.txt:`);
  for (const f of fixed) console.log(`  FIXED: ${f}`);
}
