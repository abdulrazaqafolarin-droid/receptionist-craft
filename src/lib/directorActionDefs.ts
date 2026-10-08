/**
 * Director action definitions — what the Director may DO, not just read.
 *
 * Every action maps to a standing-grant scope: without the grant the UI
 * routes to the Grants tab instead of running. Executors live beside the
 * UI (they need supabase + navigation); this file stays pure so the
 * scope mapping itself is unit-tested. No imports.
 */

import type { GrantScope } from "./directorGrantRules";

export type DirectorActionKey = "retry-job" | "draft-helper" | "adjust-operator";

export interface DirectorActionDef {
  key: DirectorActionKey;
  title: string;
  /** What happens, in plain words, before the owner taps it. */
  does: string;
  scope: GrantScope;
}

export const DIRECTOR_ACTIONS: DirectorActionDef[] = [
  {
    key: "retry-job",
    title: "Retry failed job",
    does: "Re-queues one failed planning job. It runs again exactly as approved before.",
    scope: "fix_small",
  },
  {
    key: "draft-helper",
    title: "Draft a helper",
    does: "Plans a new internal helper from your words. Saved as a draft version — never live — until you approve it in the Builder.",
    scope: "build_helpers",
  },
  {
    key: "adjust-operator",
    title: "Adjust an operator",
    does: "Regenerates one operator's plan from your change note. Review before anything goes live.",
    scope: "fix_small",
  },
];

export function actionDef(key: DirectorActionKey): DirectorActionDef | null {
  return DIRECTOR_ACTIONS.find((a) => a.key === key) ?? null;
}
