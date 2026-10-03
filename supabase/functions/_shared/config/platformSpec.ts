/**
 * Platform Spec composer — Tier 1 decision inventory (Phase A).
 *
 * Composes the six Tier 1 spec files plus the light sections map into the
 * single block that joins the file-drop bundle. Each file owns its
 * vocabulary; this file only concatenates. Rules live with the data.
 *
 * Deno-safe: ASCII only, no imports.
 */

import { buildFlowsPrompt } from "./flows.ts";
import { buildActionsPrompt } from "./actions.ts";
import { buildEntitiesPrompt } from "./dataEntities.ts";
import { buildStatesPrompt } from "./states.ts";
import { buildPermissionsPrompt } from "./permissions.ts";
import { buildLogicPrompt } from "./runtimeLogic.ts";
import { buildSectionsPrompt } from "./sectionsMap.ts";

/** Full Tier 1 spec block for the file-drop bundle. */
export function buildSpecPrompt(): string {
  return [
    buildFlowsPrompt(),
    buildActionsPrompt(),
    buildEntitiesPrompt(),
    buildStatesPrompt(),
    buildPermissionsPrompt(),
    buildLogicPrompt(),
    buildSectionsPrompt(),
  ].join("\n\n");
}
