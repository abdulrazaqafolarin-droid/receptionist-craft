import { useEffect, useMemo, useState } from "react";

export type ReceptionistScopeMode = "single" | "multi" | "all";

export interface ReceptionistOption {
  id: string;
  name: string;
}

export interface ReceptionistScopeState {
  mode: ReceptionistScopeMode;
  receptionistIds: string[];
}

const DEFAULT_SCOPE: ReceptionistScopeState = {
  mode: "all",
  receptionistIds: [],
};

function sanitizeScope(scope: ReceptionistScopeState, receptionists: ReceptionistOption[]): ReceptionistScopeState {
  const validIds = new Set(receptionists.map((r) => r.id));
  const filteredIds = scope.receptionistIds.filter((id) => validIds.has(id));

  if (receptionists.length === 0) return { mode: "all", receptionistIds: [] };

  if (scope.mode === "single") {
    const singleId = filteredIds[0] || receptionists[0].id;
    return { mode: "single", receptionistIds: [singleId] };
  }

  if (scope.mode === "multi") {
    return {
      mode: "multi",
      receptionistIds: filteredIds.length > 0 ? filteredIds : [receptionists[0].id],
    };
  }

  return { mode: "all", receptionistIds: [] };
}

export function getScopeQueryString(scope: ReceptionistScopeState): string {
  const params = new URLSearchParams();
  params.set("scopeMode", scope.mode);
  if (scope.mode !== "all" && scope.receptionistIds.length > 0) {
    params.set("scopeIds", scope.receptionistIds.join(","));
  }
  return params.toString();
}

export function useReceptionistScope(
  userId: string | null,
  receptionists: ReceptionistOption[],
  initialScope?: ReceptionistScopeState,
) {
  const [scope, setScope] = useState<ReceptionistScopeState>(() => {
    if (initialScope) return sanitizeScope(initialScope, receptionists);
    return receptionists.length > 0 ? { mode: "single", receptionistIds: [receptionists[0].id] } : DEFAULT_SCOPE;
  });

  const storageKey = userId ? `receptionist-scope:${userId}` : null;

  useEffect(() => {
    if (initialScope) {
      setScope(sanitizeScope(initialScope, receptionists));
      return;
    }

    if (!storageKey) {
      setScope(sanitizeScope(DEFAULT_SCOPE, receptionists));
      return;
    }

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        setScope(sanitizeScope(DEFAULT_SCOPE, receptionists));
        return;
      }
      const parsed = JSON.parse(raw) as ReceptionistScopeState;
      setScope(sanitizeScope(parsed, receptionists));
    } catch {
      setScope(sanitizeScope(DEFAULT_SCOPE, receptionists));
    }
  }, [storageKey, receptionists, initialScope]);

  useEffect(() => {
    setScope((prev) => sanitizeScope(prev, receptionists));
  }, [receptionists]);

  useEffect(() => {
    if (!storageKey) return;
    sessionStorage.setItem(storageKey, JSON.stringify(scope));
  }, [scope, storageKey]);

  const activeReceptionistIds = useMemo(() => {
    if (scope.mode === "all") return receptionists.map((r) => r.id);
    return scope.receptionistIds;
  }, [scope, receptionists]);

  return {
    scope,
    setScope,
    activeReceptionistIds,
  };
}
