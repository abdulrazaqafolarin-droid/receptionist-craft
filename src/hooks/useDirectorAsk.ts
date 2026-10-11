/**
 * useDirectorAsk — pending human-input requests, live.
 *
 * Subscribes to the owner's pending director_requests rows: new ones
 * toast, answers/cancels refresh. Plaintext answers exist only in the
 * answer call's arguments — never stored, never logged here.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AskRequest {
  id: string;
  kind: "credential" | "approval" | "otp" | "choice" | "files";
  title: string;
  service: string;
  reason: string;
  purpose: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "otp" | "file" | "yesno" | "choice";
    required?: boolean;
    options?: string[];
    help?: string;
  }>;
  status: string;
  expires_at: string;
  created_at: string;
}

async function callAsk(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("director-ask", { body });
  if (error) throw new Error(error.message || "ask failed");
  if (!data?.ok) throw new Error(data?.error || "ask failed");
  return data;
}

export function useDirectorAsk(enabled: boolean): {
  pending: AskRequest[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  answer: (id: string, values: Record<string, unknown>, opts?: { store?: boolean; provider?: string; vault_name?: string }) => Promise<void>;
  deny: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
} {
  const [pending, setPending] = useState<AskRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await callAsk({ action: "list" });
      setPending(Array.isArray(d.requests) ? d.requests : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    let channel: { unsubscribe: () => void } | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        channel = supabase
          .channel(`director-ask:${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "director_requests", filter: `user_id=eq.${user.id}` },
            () => { void refresh(); },
          )
          .subscribe() as unknown as { unsubscribe: () => void };
      } catch {
        // list on mount still informed the outlet
      }
    })();
    return () => {
      try {
        channel?.unsubscribe();
      } catch {
        // teardown best-effort
      }
    };
  }, [enabled, refresh]);

  const answer = useCallback(async (
    id: string,
    values: Record<string, unknown>,
    opts?: { store?: boolean; provider?: string; vault_name?: string },
  ) => {
    await callAsk({ action: "answer", request_id: id, values, ...opts });
    await refresh();
  }, [refresh]);

  const deny = useCallback(async (id: string) => {
    await callAsk({ action: "answer", request_id: id, denied: true });
    await refresh();
  }, [refresh]);

  const cancel = useCallback(async (id: string) => {
    await callAsk({ action: "cancel", request_id: id });
    await refresh();
  }, [refresh]);

  return { pending, loading, error, refresh, answer, deny, cancel };
}
