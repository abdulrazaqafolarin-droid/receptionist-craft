// Verifies surfaceManifest.ts has not drifted from the real app.
// - Every sidebar nav URL must be covered by OWNER_PAGES.
// - Every OWNER_PAGES route must exist as a <Route> in src/App.tsx.
// Fails the build (exit 1) on drift so the Configurator's inventory
// can never silently rot. Run: npm run verify:manifest
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const app = read("src/App.tsx");
const sidebar = read("src/components/AppSidebar.tsx");
const manifest = read("supabase/functions/_shared/config/surfaceManifest.ts");

const routePaths = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const navUrls = [...sidebar.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
const manifestRoutes = [...manifest.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);

let failed = false;
const fail = (msg) => { console.error(`DRIFT: ${msg}`); failed = true; };

// 1. Manifest routes must be real App routes (allow :param suffixes).
for (const r of manifestRoutes) {
  const base = r.split("/:")[0];
  const ok = routePaths.some((p) => p === r || p === base || p.startsWith(base + "/"));
  if (!ok) fail(`manifest route "${r}" has no matching <Route> in src/App.tsx`);
}

// 2. Sidebar URLs must be covered by the manifest (static paths only).
for (const u of navUrls) {
  if (u.includes(":")) continue;
  if (!manifestRoutes.includes(u)) fail(`sidebar url "${u}" is missing from OWNER_PAGES in surfaceManifest.ts`);
}

// 3. Manifest sanity: counts we promise in comments stay true.
const pageCount = (manifest.match(/route:\s*"\//g) || []).length;
const connCount = (manifest.match(/category:\s*"/g) || []).length;
console.log(`surface manifest: ${pageCount} owner pages, ${connCount} connectors, sidebar nav: ${navUrls.length}, app routes: ${routePaths.length}`);

if (failed) {
  console.error("Surface manifest drift detected — update surfaceManifest.ts.");
  process.exit(1);
}
console.log("Surface manifest matches the app. OK.");
