import { supabase } from "@/integrations/supabase/client";

export type SignalName = "onboarding_path_chosen" | "configured_operator" | "navigation_help";

export type SignalPayload = Record<string, unknown>;

/**
 * Step 9 (§5.3): record a success signal for the current authenticated owner.
 * Non-fatal — the product flow must never break because telemetry failed.
 * RLS-scoped so an owner can only ever write their own rows.
 */
export async function recordSignal(
  signal: SignalName,
  payload: SignalPayload = {},
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const table = supabase.from("success_signals" as never);
    await (table as never as {
      insert: (rows: Array<Record<string, unknown>>) => Promise<unknown>;
    }).insert([{ user_id: user.id, signal, payload }]);
  } catch (err) {
    console.error("recordSignal failed (non-fatal):", err);
  }
}
