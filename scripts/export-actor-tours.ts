/**
 * Export actor tours + registry for the Jev self-QA agent.
 *
 * Jev drives a real browser; it needs the tour scripts and the target map
 * as plain JSON, not TypeScript. Regenerate after changing tours:
 *   deno run --allow-read --allow-write scripts/export-actor-tours.ts
 * CI fails if the committed scripts/actor-tours.json is stale.
 */
import { GOOGLE_WALKTHROUGH } from "../src/lib/actorScripts.ts";
import { ACTOR_TARGETS } from "../supabase/functions/_shared/config/actorRegistry.ts";

const out = {
  version: 1,
  generated_note: "Regenerate with: deno run --allow-read --allow-write scripts/export-actor-tours.ts",
  targets: ACTOR_TARGETS.map((t) => ({ key: t.key, selector: t.selector, label: t.label, kind: t.kind })),
  tours: {
    "walkthrough-google": GOOGLE_WALKTHROUGH,
  },
};

await Deno.writeTextFile(
  new URL("./actor-tours.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`exported ${ACTOR_TARGETS.length} targets, 1 walkthrough -> scripts/actor-tours.json`);
