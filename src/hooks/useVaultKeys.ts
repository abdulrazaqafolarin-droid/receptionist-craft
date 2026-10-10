/**
 * useVaultKeys — the owner's key vault, masked by default.
 *
 * Reads the safe view through the vault-list edge (ciphertext is
 * unreachable by construction). Plaintext exists only in the reveal
 * call's return value, held in component state, never persisted.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VaultKey {
  id: string;
  name: string;
  provider: string;
  key_last4: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

async function callFn(fn: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `${fn} failed`);
  if (!data?.ok) throw new Error(data?.error || `${fn} failed`);
  return data;
}

export function useVaultKeys(enabled: boolean): {
  keys: VaultKey[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createKey: (name: string, provider: string, key: string) => Promise<void>;
  revealKey: (key_id: string) => Promise<string>;
  rotateKey: (key_id: string, key: string) => Promise<void>;
  revokeKey: (key_id: string) => Promise<void>;
} {
  const [keys, setKeys] = useState<VaultKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await callFn("vault-list", {});
      setKeys(Array.isArray(d.keys) ? d.keys : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const createKey = useCallback(async (name: string, provider: string, key: string) => {
    await callFn("vault-create", { name, provider, key });
    await refresh();
  }, [refresh]);

  const revealKey = useCallback(async (key_id: string): Promise<string> => {
    const d = await callFn("vault-reveal", { key_id });
    if (typeof d.key !== "string") throw new Error("reveal failed");
    return d.key;
  }, []);

  const rotateKey = useCallback(async (key_id: string, key: string) => {
    await callFn("vault-rotate", { key_id, key });
    await refresh();
  }, [refresh]);

  const revokeKey = useCallback(async (key_id: string) => {
    await callFn("vault-revoke", { key_id });
    await refresh();
  }, [refresh]);

  return { keys, loading, error, refresh, createKey, revealKey, rotateKey, revokeKey };
}
