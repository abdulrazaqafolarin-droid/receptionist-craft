/**
 * operator-console-chat — Phase D.
 *
 * The staff side of an internal operator: the owner/staff talk to their
 * ops helper here (stock, tasks, roster), the way customers use the widget.
 * Two modes:
 *   - action ("stock" | "tasks" | "roster"): structured ops data, no AI call.
 *   - chat (default): staff message answered from knowledge_base + a live
 *     ops snapshot, Gemini-direct with gateway-responder fallback.
 *
 * Console-only: refuses non-internal operators honestly. Never books,
 * orders, or contacts customers — this operator has no customer side.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { askRutex } from "../_shared/rutexMcp.ts";
import { buildConsolePrompt, type ConsoleSnapshot } from "../_shared/config/consolePrompt.ts";
import { getStockAlerts, reorderSuggestions, type StockAlert } from "../_shared/modules/stockTracker.ts";
import { getTasks, chaseList } from "../_shared/modules/taskChaser.ts";
import { getRoster, findConflicts, uncoveredDays } from "../_shared/modules/staffRoster.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(text: unknown, max = 2000): string {
  if (!text || typeof text !== "string") return "";
  return text.slice(0, max).replace(/[<>]/g, "").trim();
}

interface ChatMsg {
  role: string;
  content: string;
}

async function callGemini(system: string, history: ChatMsg[], apiKey: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: history.map((m, idx) => {
          let text = m.content;
          if (idx === 0) text = `${system}\n\n---\n\n${text}`;
          return { role: m.role === "assistant" ? "model" : "user", parts: [{ text }] };
        }),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text.trim()) throw new Error("Gemini returned empty text");
  return text.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const receptionist_id = typeof body.receptionist_id === "string" ? body.receptionist_id : "";
    const user_id = typeof body.user_id === "string" ? body.user_id : "";
    const action = typeof body.action === "string" ? body.action : "chat";
    if (!receptionist_id || !user_id) {
      return jsonRes({ ok: false, error: "missing_receptionist_id_or_user_id" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("RUTEX_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    );

    const { data: rec, error: recErr } = await supabase
      .from("receptionists")
      .select("id, user_id, business_name, business_model, capabilities, knowledge_base")
      .eq("id", receptionist_id)
      .maybeSingle();
    if (recErr || !rec) {
      return jsonRes({ ok: false, error: "operator_not_found" }, 404);
    }
    if ((rec as { user_id: string }).user_id !== user_id) {
      return jsonRes({ ok: false, error: "not_your_operator" }, 403);
    }

    const caps = ((rec as { capabilities?: unknown }).capabilities || {}) as Record<string, unknown>;
    const kind = caps.operator_kind;
    const model = (rec as { business_model?: string }).business_model;
    if (kind !== "ops" && model !== "internal") {
      return jsonRes({
        ok: false,
        error: "console_is_for_internal_operators",
        detail: "This operator serves customers — its home is the widget and dashboard, not the console.",
      }, 400);
    }

    const businessName = (rec as { business_name?: string }).business_name || "Your business";
    const knowledgeBase = typeof (rec as { knowledge_base?: unknown }).knowledge_base === "string"
      ? (rec as { knowledge_base?: string }).knowledge_base as string
      : "";

    // Live snapshot — each source degrades to empty, never fails the call.
    // The snapshot handed to the AI only ever contains counts and names the
    // owner already owns; nothing leaves the operator's own records.
    let alerts: StockAlert[] = [];
    try {
      alerts = await getStockAlerts(supabase, receptionist_id);
    } catch (e) {
      console.warn("[console] stock snapshot failed:", e instanceof Error ? e.message : String(e));
    }
    let chase = { overdue: [] as Array<{ title: string }>, due_today: [] as Array<{ title: string }>, upcoming: [] as Array<{ title: string }> };
    try {
      chase = chaseList(await getTasks(supabase, receptionist_id));
    } catch (e) {
      console.warn("[console] task snapshot failed:", e instanceof Error ? e.message : String(e));
    }
    let roster = { staff: [] as Array<{ id: string; name: string; role: string | null }>, shifts: [] as Array<{ staff_name: string; day: number; start: string; end: string }> };
    let conflicts: Array<{ staff_name: string; day: number }> = [];
    try {
      roster = await getRoster(supabase, receptionist_id);
      conflicts = findConflicts(roster.shifts);
    } catch (e) {
      console.warn("[console] roster snapshot failed:", e instanceof Error ? e.message : String(e));
    }

    if (action === "stock") {
      return jsonRes({ ok: true, action, alerts, suggestions: reorderSuggestions(alerts) });
    }
    if (action === "tasks") {
      return jsonRes({ ok: true, action, chase });
    }
    if (action === "roster") {
      return jsonRes({
        ok: true,
        action,
        staff: roster.staff,
        shifts: roster.shifts,
        conflicts,
        // Working days are assumed Mon-Sat and labelled as such — the
        // operator keeps no opening hours of its own. An empty shift plan
        // reports itself instead of inventing coverage.
        uncovered: roster.shifts.length > 0 ? uncoveredDays(roster.shifts, [1, 2, 3, 4, 5, 6]) : null,
        uncovered_assumes: roster.shifts.length > 0 ? "Mon-Sat working days" : null,
      });
    }
    if (action !== "chat") {
      return jsonRes({ ok: false, error: "unknown_action" }, 400);
    }

    const message = clean(body.message);
    if (!message) {
      return jsonRes({ ok: false, error: "missing_message" }, 400);
    }
    const rawHistory: unknown[] = Array.isArray(body.history) ? body.history : [];
    const history: ChatMsg[] = rawHistory
      .filter((m: unknown): m is ChatMsg => !!m && typeof m === "object")
      .map((m) => ({
        role: (m as ChatMsg).role === "assistant" ? "assistant" : "user",
        content: clean((m as ChatMsg).content, 2000),
      }))
      .filter((m) => m.content.length > 0)
      .slice(-10);
    history.push({ role: "user", content: message });

    const snapshot: ConsoleSnapshot = {
      businessName,
      knowledgeBase,
      modulesOn: [],
      stockLines: alerts.map((a) => a.detail),
      overdueTasks: chase.overdue.map((t) => t.title),
      dueTodayTasks: chase.due_today.map((t) => t.title),
      conflictCount: conflicts.length,
      staffCount: roster.staff.length,
    };
    try {
      const ui = (caps.ui_surface || {}) as Record<string, unknown>;
      const mods = (caps.ui_plan || {}) as Record<string, unknown>;
      const list = (Array.isArray((ui as Record<string, unknown>).modules_on)
        ? (ui as Record<string, unknown>).modules_on
        : mods.modules_on) as Array<{ key?: string }> | undefined;
      if (Array.isArray(list)) {
        snapshot.modulesOn = list.map((m) => String(m?.key || "")).filter(Boolean);
      }
    } catch {
      snapshot.modulesOn = [];
    }

    const system = buildConsolePrompt(snapshot);
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY") ?? Deno.env.get("AI_API_KEY") ?? "";

    let reply = "";
    let via: string = "gemini";
    try {
      if (!apiKey) throw new Error("AI key missing");
      reply = await callGemini(system, history, apiKey);
    } catch (geminiErr) {
      console.warn("[console] Gemini failed, trying gateway responder:",
        geminiErr instanceof Error ? geminiErr.message : String(geminiErr).slice(0, 150));
      try {
        const flat = [`STAFF CONSOLE INSTRUCTIONS:\n${system}`, ...history.map((m) =>
          `${m.role === "assistant" ? "ASSISTANT" : "STAFF"}: ${m.content}`)].join("\n\n");
        const r = await askRutex(`console-${receptionist_id}`, `${flat}\n\nReply as the inside-the-business helper, continuing this exact conversation. Answer ONLY with the reply text — no commentary, no JSON.`, { timeoutMs: 60000 });
        reply = (r.text || "").trim();
        if (!reply) throw new Error("gateway responder returned empty text");
        via = (r as { model?: string }).model ? `responder(${(r as { model?: string }).model})` : "responder";
      } catch (respErr) {
        console.error("[console] all AI paths failed:", respErr instanceof Error ? respErr.message : String(respErr));
        return jsonRes({
          ok: true,
          reply: "I could not reach the AI just now, but your records are fine — use the quick actions above for stock, tasks, and roster, and try asking again in a moment.",
          via: "static-fallback",
          snapshot_counts: {
            stock: alerts.length,
            overdue: chase.overdue.length,
            due_today: chase.due_today.length,
            conflicts: conflicts.length,
          },
        });
      }
    }

    return jsonRes({
      ok: true,
      reply,
      via,
      snapshot_counts: {
        stock: alerts.length,
        overdue: chase.overdue.length,
        due_today: chase.due_today.length,
        conflicts: conflicts.length,
      },
    });
  } catch (e) {
    console.error("[operator-console-chat] Error:", e);
    return jsonRes({ ok: false, error: "internal_error" }, 500);
  }
});
