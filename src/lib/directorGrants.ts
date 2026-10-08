/**
 * Director standing grants: what the Director may do without asking twice.
 *
 * Fixed scope set (code-enumerated — adding a scope is a deliberate product
 * decision, never a string typed at runtime). checkGrant is pure and is
 * what any future autonomous loop must call before acting solo. Storage is
 * the director_grants table (owner RLS); when the table is missing
 * (migration pending), everything reads as ungranted — deny by default.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type { GrantScope } from "./directorGrantRules";
export { GRANT_SCOPES, checkGrant } from "./directorGrantRules";
import type { GrantScope as GrantScopeType } from "./directorGrantRules";
import { checkGrant as checkGrantFn } from "./directorGrantRules";

interface GrantRow {
  scope: string;
  allowed: boolean;
}

function looseTable(name: string) {
  return (supabase.from as unknown as (t: string) => {
    select(s: string): {
      eq(c: string, v: unknown): Promise<{ data: unknown; error: { message: string } | null }>;
    };
    upsert(v: unknown, o?: unknown): Promise<{ error: { message: string } | null }>;
  })(name);
}

/** Loads grants; available=false when the table is missing (migration pending). */
export function useDirectorGrants(userId: string | undefined, enabled: boolean) {
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await looseTable("director_grants").select("scope,allowed").eq("user_id", userId);
        if (cancelled) return;
        if (error) {
          setAvailable(false);
          return;
        }
        setGrants(((data || []) as unknown) as GrantRow[]);
      } catch {
        if (!cancelled) setAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);

  const setGrant = async (scope: GrantScopeType, allowed: boolean) => {
    if (!userId) return false;
    try {
      const { error } = await looseTable("director_grants").upsert(
        { user_id: userId, scope, allowed },
        { onConflict: "user_id,scope" },
      );
      if (error) return false;
      setGrants((prev) => {
        const rest = prev.filter((g) => g.scope !== scope);
        return [...rest, { scope, allowed }];
      });
      return true;
    } catch {
      return false;
    }
  };

  return { grants, available, setGrant, check: (scope: string) => checkGrantFn(grants, scope) };
}
