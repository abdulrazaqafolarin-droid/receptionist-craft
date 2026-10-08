/**
 * Versioned manual saves: every hand-edit in the Builder records a version
 * row (change_source manual_edit) so history, revert, and the Playground
 * trail stay complete. Fire-and-forget by design — versioning must never
 * block or fail a save the owner just made.
 */

import { supabase } from "@/integrations/supabase/client";

type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export async function recordManualVersion(receptionistId: string, note: string): Promise<void> {
  if (!receptionistId) return;
  try {
    await (supabase.rpc as unknown as RpcCall)("record_manual_version", {
      p_receptionist_id: receptionistId,
      p_note: note,
    });
  } catch {
    // Versioning failed — the save itself already succeeded.
  }
}
