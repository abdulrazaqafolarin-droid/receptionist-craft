/**
 * Actor map — where everything is.
 *
 * The operator is born with a map instead of needing Vision to find
 * buttons: every entry names a UI element the actor cursor may point at,
 * highlight, scroll to, or (later, behind confirm gates) click. Elements
 * opt in explicitly with data-actor attributes — unlisted UI is
 * unreachable by design, not by accident.
 *
 * Maintenance rule: adding actor-reachable UI means adding the attribute
 * AND registering it here. `scripts/verify-actor-map.mjs` checks both
 * directions in CI (registered keys exist in source; data-actor values in
 * source are registered, including template prefixes for dynamic keys).
 */

import { CONNECTORS } from "../../supabase/functions/_shared/config/surfaceManifest";

// Single source of truth lives edge-side so the planner validator reads
// the exact same entries (see supabase/functions/_shared/config/
// actorRegistry.ts). This module re-exports it plus the UI-side helper.
export {
  ACTOR_TARGETS,
  ACTOR_TEMPLATE_PREFIXES,
  findActorTarget as findTarget,
} from "../../supabase/functions/_shared/config/actorRegistry";
export type {
  ActorTarget,
  ActorTargetKind,
} from "../../supabase/functions/_shared/config/actorRegistry";
import { findActorTarget } from "../../supabase/functions/_shared/config/actorRegistry";

/**
 * "What's this?" explainer. Static entries answer from their own why;
 * dynamic connector entries answer from the connector catalog (the same
 * unlocks text the planner reasons from). Anything else returns null —
 * the UI says it has no description yet rather than inventing one.
 */
export function describeTarget(key: string): string | null {
  const entry = findActorTarget(key);
  if (entry?.why) return entry.why;
  if (key.startsWith("connect-") || key.startsWith("connector-card-")) {
    const connectorKey = key.replace(/^connect(or-card)?-/, "");
    const found = CONNECTORS.find((c) => c.key === connectorKey);
    if (found) return `${found.name}: ${found.unlocks}`;
  }
  return null;
}
