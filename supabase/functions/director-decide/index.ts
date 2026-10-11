/**
 * director-decide — one browser decision per call, brain only.
 *
 * The browser lane observes and executes but never decides. Each step
 * it sends goal + element table + history here (authenticated by its
 * device secret — the only credential it holds); this function asks
 * the gateway agent and returns one strict-JSON decision. No browser,
 * no execution, no side effects: pure judgment, parse-or-fail.
 *
 * The goal is re-screened here too (logins/payments refuse) so a
 * compromised runner cannot launder a forbidden goal through the brain.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { askRutex, RutexMcpError } from "../_shared/rutexMcp.ts";
import { buildDecidePrompt, parseDecision, parsePlan } from "../_shared/directorDecide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REFUSE_GOAL =
  /log\s*[-_\s]*in|sign\s*[-_\s]*in|password|passcode|pay(ment|ing)?|checkout|credit\s*card|2fa|\botp\b|verify.*(code|identity)/i;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!bearer.startsWith("rcd_")) return jsonRes({ ok: false, error: "forbidden" }, 403);
    const hash = await sha256hex(bearer);
    const { data: devRows } = await supabase
      .from("companion_devices")
      .select("id,enabled")
      .eq("secret_hash", hash)
      .limit(1);
    const dev = (Array.isArray(devRows) ? devRows : [])[0] as
      | { id: string; enabled: boolean } | undefined;
    if (!dev) return jsonRes({ ok: false, error: "forbidden" }, 403);
    if (!dev.enabled) return jsonRes({ ok: false, error: "device paused" }, 409);

    const body = await req.json().catch(() => ({}));
    const goal = typeof body.goal === "string" ? body.goal.trim().slice(0, 1000) : "";
    const url = typeof body.url === "string" ? body.url.trim().slice(0, 2000) : "";
    const table = typeof body.table === "string" ? body.table.slice(0, 6000) : "";
    const history = Array.isArray(body.history)
      ? (body.history as unknown[]).filter((h): h is string => typeof h === "string").slice(-10).map((h) => h.slice(0, 200))
      : [];
    const mode = body.mode === "plan" ? "plan" : "loop";
    if (!goal) return jsonRes({ ok: false, error: "goal required" }, 400);
    if (REFUSE_GOAL.test(goal)) {
      return jsonRes({ ok: false, error: "refused (logins and payments need the owner)" }, 400);
    }

    let text: string;
    try {
      const r = await askRutex(
        `decide-${dev.id.slice(0, 8)}`,
        buildDecidePrompt({ goal, url, table, history, mode }),
        { timeoutMs: 60000 },
      );
      text = r.text || "";
    } catch (e) {
      if (e instanceof RutexMcpError) {
        return jsonRes({ ok: false, error: `gateway_${e.kind}`, details: String(e.message).slice(0, 200) }, 502);
      }
      throw e;
    }
    try {
      const decision = mode === "plan" ? parsePlan(text) : parseDecision(text);
      return jsonRes({ ok: true, mode, decision });
    } catch {
      return jsonRes({ ok: true, mode, decision: null, error: "brain answered off-contract — runner should re-observe and ask again" });
    }
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }
});
