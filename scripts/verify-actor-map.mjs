// Actor map drift check: registry <-> data-actor attributes must agree.
//
// - Every registered key must resolve: either a literal data-actor="key" in
//   source, or a template (data-actor={`prefix-${...}`}) whose prefix is a
//   registered ACTOR_TEMPLATE_PREFIXES entry.
// - Every literal data-actor="..." in source must be a registered key.
// - Dynamic templates must use a registered prefix.
//
// Fails the build instead of letting the cursor point at removed UI.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let ROOT = new URL("..", import.meta.url).pathname;
if (/^\/[A-Za-z]:\//.test(ROOT)) ROOT = ROOT.slice(1); // Windows file URL
ROOT = decodeURIComponent(ROOT);
let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`ACTOR MAP DRIFT: ${msg}`);
};

function sources() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e === "node_modules" || e === "dist") continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(e)) {
        // Test fixtures stage synthetic anchors (e.g. the staged dangerous
        // entry) — they are not real UI and must not pollute the check.
        if (/\.test\.(ts|tsx|js|jsx)$/.test(e)) continue;
        out.push(p);
      }
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "supabase", "functions"));
  return out;
}

// Registry entries: key: "..." + selector: '[data-actor="..."]'.
// Single source of truth is edge-side so the planner validator reads the
// same list (frontend re-exports it).
const mapSrc = readFileSync(join(ROOT, "supabase/functions/_shared/config/actorRegistry.ts"), "utf8");
const registered = new Map();
for (const m of mapSrc.matchAll(/key:\s*"([^"]+)"[\s\S]*?selector:\s*'\[data-actor="([^"]+)"\]'/g)) {
  registered.set(m[1], m[2]);
}
const prefixesBlock = (mapSrc.match(/ACTOR_TEMPLATE_PREFIXES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || "";
const prefixes = [...prefixesBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
if (registered.size === 0) fail("no targets parsed from actorMap.ts — regex or file broken");

const files = sources();
const allSrc = files.map((f) => readFileSync(f, "utf8")).join("\n");

// 1. Registered keys resolve in source.
for (const [key] of registered) {
  const literal = `data-actor="${key}"`;
  if (allSrc.includes(literal)) continue;
  const prefix = prefixes.find((p) => key.startsWith(p));
  if (prefix && allSrc.includes(`data-actor={\`${prefix}`)) continue;
  fail(`registered key "${key}" has no anchor in source (no literal, no template)`);
}

// 2. Literal attributes in source are registered.
for (const m of allSrc.matchAll(/data-actor="([^"]+)"/g)) {
  if (!registered.has(m[1])) fail(`source anchors unregistered key "${m[1]}"`);
}

// 3. Template usages reference registered prefixes.
for (const m of allSrc.matchAll(/data-actor=\{`([^`$]+)/g)) {
  const used = m[1];
  if (!prefixes.some((p) => used.startsWith(p))) {
    fail(`template data-actor={\`${used}...} uses no registered prefix`);
  }
}

if (failures > 0) {
  console.error(`actor map: ${failures} drift(s) — fix registry or anchors`);
  process.exit(1);
}
console.log(`actor map: ${registered.size} targets, ${prefixes.length} template prefixes, no drift. OK.`);
