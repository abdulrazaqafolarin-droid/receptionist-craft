/**
 * director-tools — the brain's hands endpoint (Phase A: in-app).
 *
 * The gateway agent (the Director's reasoning loop) POSTs here; the
 * owner's browser executes and posts the result back. One call maps to
 * one tool execution from the agent's view:
 *
 *   { action: "run", user_id, session_id?, tool, args?, wait_ms? }
 *     → enqueues, waits for the browser (default 45s, max 90s),
 *       returns { ok, command_id, status, result, error }.
 *   { action: "poll", command_id, wait_ms? }
 *     → picks up waiting where a timed-out run left off.
 *
 * Auth: shared gateway secret in X-Gateway-Key (the same value both
 * sides know as RUTEX_GATEWAY_KEY — it lives in env on both hosts,
 * never in prompts, never in the browser). The browser side runs as
 * the owner under RLS and enforces the actor guard before touching
 * anything; this endpoint never executes, only queues.
 *
 * Phase A tools (in-app, browser-executed): look_at_page, click_target,
 * type_text, goto_page, point_at. Companion tools (Phase B) ride the
 * same endpoint with a device_id arg: look_at_screen, click, type_text,
 * press_keys, scroll, drag, open_app, open_url. browse_url executes
 * SERVER-SIDE here (no browser, no device needed): the page is fetched
 * with SSRF guards and returned as a numbered grid; acting on it means
 * browsing the next URL or handing a companion open_url. The endpoint
 * checks the device belongs to the user and is enabled; the companion
 * polls and executes. Either side stops it instantly (enabled flag /
 * row delete).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { browseUrl } from "../_shared/browse.ts";
import { ledgerStart, ledgerFinish } from "../_shared/directorLedger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-gateway-key",
};

const INAPP_TOOLS = ["look_at_page", "click_target", "type_text", "goto_page", "point_at", "drag_target"];
const COMPANION_TOOLS = [
  "look_at_screen", "click", "type_text", "press_keys",
  "scroll", "drag", "open_app", "open_url",
];
const MAX_WAIT_MS = 90000;
const POLL_STEP_MS = 1500;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function keysEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const presented = req.headers.get("X-Gateway-Key") || "";
    const expected = Deno.env.get("RUTEX_GATEWAY_KEY") || "";
    if (!keysEqual(presented, expected)) {
      return jsonRes({ ok: false, error: "forbidden" }, 403);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "run";
    const waitMs = Math.min(
      typeof body.wait_ms === "number" && body.wait_ms > 0 ? body.wait_ms : 45000,
      MAX_WAIT_MS,
    );

    let commandId: string;
    if (action === "poll") {
      if (typeof body.command_id !== "string" || !body.command_id) {
        return jsonRes({ ok: false, error: "command_id required" }, 400);
      }
      commandId = body.command_id;
    } else if (action === "run") {
      const user_id = typeof body.user_id === "string" ? body.user_id : "";
      const tool = typeof body.tool === "string" ? body.tool : "";
      if (!user_id) return jsonRes({ ok: false, error: "user_id required" }, 400);
      const device_id = typeof body.device_id === "string" && body.device_id ? body.device_id : null;
      const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;
      if (tool === "browse_url" && device_id) {
        return jsonRes({ ok: false, error: "companions open pages with open_url — browse_url reads server-side" }, 400);
      }
      if (tool === "browse_url") {
        // Server-side read: no browser, no device, no waiting. The ledger
        // records it like any hands run; refusals return honest errors.
        const url = typeof args.url === "string" ? args.url : "";
        if (!url.trim()) return jsonRes({ ok: false, error: "url required" }, 400);
        const page = await browseUrl(url.slice(0, 2000));
        const lid = await ledgerStart(supabase, {
          user_id,
          kind: "hands",
          summary: `Browsed ${url.slice(0, 120)}`,
          before: { tool: "browse_url", session: typeof body.session_id === "string" ? body.session_id.slice(0, 120) : "" },
          visible: false,
        });
        if ("error" in page) {
          await ledgerFinish(supabase, lid, { status: "failed", error: page.error });
          return jsonRes({ ok: false, error: page.error });
        }
        await ledgerFinish(supabase, lid, {
          status: "done",
          after: { url: page.url, title: page.title, links: page.links.length, forms: page.forms.length },
        });
        return jsonRes({ ok: true, status: "done", result: { page } });
      }
      const allowed = device_id ? COMPANION_TOOLS : INAPP_TOOLS;
      if (!allowed.includes(tool)) {
        return jsonRes({ ok: false, error: `unknown tool: ${tool.slice(0, 40)}` }, 400);
      }
      if (device_id) {
        // Route to a live, owned, enabled device — never blind.
        const { data: dev } = await supabase
          .from("companion_devices")
          .select("id,user_id,enabled")
          .eq("id", device_id)
          .maybeSingle();
        const owned = dev as { id: string; user_id: string; enabled: boolean } | null;
        if (!owned || owned.user_id !== user_id) {
          return jsonRes({ ok: false, error: "unknown device" }, 404);
        }
        if (!owned.enabled) {
          return jsonRes({ ok: false, error: "device paused — enable it first" }, 409);
        }
      }
      const { data, error } = await supabase.from("director_commands").insert({
        user_id,
        session_id: typeof body.session_id === "string" ? body.session_id.slice(0, 120) : "",
        device_id,
        tool,
        args,
        status: "queued",
      }).select("id").single();
      if (error || !data) return jsonRes({ ok: false, error: "queue failed" }, 500);
      commandId = (data as { id: string }).id;
    } else {
      return jsonRes({ ok: false, error: "action must be run or poll" }, 400);
    }

    const deadline = Date.now() + waitMs;
    for (;;) {
      const { data } = await supabase
        .from("director_commands")
        .select("status,result,error")
        .eq("id", commandId)
        .maybeSingle();
      const row = data as { status: string; result: unknown; error: string | null } | null;
      if (!row) return jsonRes({ ok: false, error: "command vanished" }, 500);
      if (row.status === "done" || row.status === "failed") {
        return jsonRes({ ok: row.status === "done", command_id: commandId, status: row.status, result: row.result ?? null, error: row.error });
      }
      if (Date.now() >= deadline) {
        return jsonRes({ ok: true, command_id: commandId, status: row.status, waiting: true });
      }
      await sleep(POLL_STEP_MS);
    }
  } catch (e) {
    return jsonRes({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" }, 500);
  }
});
