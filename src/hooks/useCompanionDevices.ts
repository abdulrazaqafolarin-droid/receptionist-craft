/**
 * useCompanionDevices — pair and manage the Director's computers.
 *
 * Pairing is owner-initiated: create_device returns the secret ONCE
 * (shown once, never stored client-side, never listed again). The
 * companion polls with it; either side stops everything instantly
 * (enabled toggle here, row delete, or the companion simply exits).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CompanionDevice {
  id: string;
  name: string;
  platform: "windows" | "macos" | "android";
  enabled: boolean;
  last_seen: string | null;
  created_at: string;
}

async function callLink(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("companion-link", { body });
  if (error) throw new Error(error.message || "companion-link failed");
  if (!data?.ok) throw new Error(data?.error || "companion-link failed");
  return data;
}

export function useCompanionDevices(enabled: boolean): {
  devices: CompanionDevice[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  pairDevice: (name: string, platform: string) => Promise<{ device_id: string; secret: string }>;
  setEnabled: (device_id: string, on: boolean) => Promise<void>;
  revokeDevice: (device_id: string) => Promise<void>;
} {
  const [devices, setDevices] = useState<CompanionDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await callLink({ action: "list_devices" });
      setDevices(Array.isArray(d.devices) ? d.devices : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const pairDevice = useCallback(async (name: string, platform: string) => {
    const d = await callLink({ action: "create_device", name, platform });
    await refresh();
    return { device_id: d.device_id as string, secret: d.secret as string };
  }, [refresh]);

  const setEnabled = useCallback(async (device_id: string, on: boolean) => {
    await callLink({ action: "set_enabled", device_id, enabled: on });
    await refresh();
  }, [refresh]);

  const revokeDevice = useCallback(async (device_id: string) => {
    await callLink({ action: "revoke_device", device_id });
    await refresh();
  }, [refresh]);

  return { devices, loading, error, refresh, pairDevice, setEnabled, revokeDevice };
}
