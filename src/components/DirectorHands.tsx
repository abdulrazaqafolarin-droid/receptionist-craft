/**
 * DirectorHands — the brain's hands, mounted once at app level.
 *
 * Subscribes to the owner's queued director_commands rows (written by
 * the gateway agent through director-tools), executes each through the
 * normal actor machinery — same guard, same receipts, same kill switch —
 * and posts the result back for the brain's next step. Invisible until
 * a run starts; the cursor ride itself is the visibility.
 *
 * Tools executed here:
 * - look_at_page: this page as a FRESH indexed table ([n] role |
 *   label) plus curated anchors. Indexes die on navigation.
 * - click_target / point_at / goto_page / drag_target: registry path.
 * - type_text: registry inputs only; host refuses credentials live.
  * - live_point / live_click / live_type / live_drag: open-world path — indexes
 *   from the latest table, verified + refusal-checked at resolve.
 *
 * Every execution lands in director_actions (kind 'hands') with the
 * command id and receipts — the audit trail covers hands too.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { findTarget, describeTarget } from "@/lib/actorMap";
import { LIVE_REFUSE_RE, describeLiveLabel } from "@/lib/actorGuard";
import type { ActorAction } from "@/lib/actorGuard";

/** Stamp attribute: live-table indexes live on the elements themselves. */
const LIVE_ATTR = "data-live-idx";

interface HandsCommand {
  id: string;
  user_id: string;
  session_id: string;
  tool: string;
  args: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** This page as a text grid for the brain. Values never included. */
/** Stamp attribute: live-table indexes live on the elements themselves. */

function liveRole(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (tag === "input") return `input[${(el.getAttribute("type") || "text").toLowerCase()}]`;
  if (tag === "button" || tag === "a" || tag === "select" || tag === "textarea") return tag;
  return el.getAttribute("role") || tag;
}

/**
 * This page as a FRESH indexed table (JEV model, not a registry).
 * Every actionable element gets [n]; the brain acts only on indexes
 * from the latest table, and indexes die on navigation or re-render
 * (resolve misses → re-look, never a stale click). Anchors stay as
 * the curated layer with plain-words descriptions.
 */
export function lookAtPage(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    route: window.location.pathname,
    title: document.title.slice(0, 120),
  };
  try {
    document.querySelectorAll(`[${LIVE_ATTR}]`).forEach((el) => el.removeAttribute(LIVE_ATTR));
    const anchors: string[] = [];
    document.querySelectorAll("[data-actor]").forEach((el) => {
      const key = el.getAttribute("data-actor") || "";
      const t = findTarget(key);
      const rect = el.getBoundingClientRect();
      if (t && rect.width > 0 && rect.height > 0) {
        anchors.push(`${key}: ${t.label}`.slice(0, 140));
      }
    });
    out.anchors = anchors.slice(0, 30);
    const table: string[] = [];
    let n = 0;
    const seen = new Set<string>();
    const cands = document.querySelectorAll(
      "button, a[href], input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='checkbox'], [role='switch'], [aria-expanded]",
    );
    cands.forEach((el) => {
      if (n >= 60) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      if (rect.bottom < 0 || rect.top > window.innerHeight + 200) return;

      // Do not offer controls that cannot currently receive an interaction.
      // The brain only sees candidates that the click host can plausibly hit.
      if (
        el.matches(":disabled") ||
        el.getAttribute("aria-disabled") === "true" ||
        el.closest("[inert]") ||
        el.closest('[aria-hidden="true"]')
      ) return;
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.pointerEvents === "none" ||
        Number(style.opacity) === 0
      ) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(hit === el || el.contains(hit))) return;

      const role = liveRole(el);
      const label = describeLiveLabel(el);
      if (!label) return;
      const key = `${role}|${label}|${Math.round(rect.left)}|${Math.round(rect.top)}`;
      if (seen.has(key)) return;
      seen.add(key);
      n += 1;
      el.setAttribute(LIVE_ATTR, String(n));
      // Deeper view, values never included: link destinations ride along as
      // extra segments so the brain can tell same-named targets apart.
      // The label (segment 2) stays clean for expect-verification.
      let extra = "";
      try {
        if (el.tagName.toLowerCase() === "a") {
          const href = (el.getAttribute("href") || "").slice(0, 80);
          if (href) extra = ` | href=${href}`;
        }
      } catch {
        // destination hint best-effort
      }
      table.push(`[${n}] ${role} | ${label}${extra}`);
    });
    out.elements = table;
    out.elements_live = true;
    const text = (sel: string, m: number) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80))
        .filter(Boolean)
        .slice(0, m);
    out.headings = text("h1,h2,h3", 8);
    void describeTarget;
  } catch {
    out.degraded = true;
  }
  return out;
}

export function DirectorHands() {
  const host = useActorHost();
  const busyRef = useRef(false);
  const hostRef = useRef(host);
  hostRef.current = host;

  useEffect(() => {
    let cancelled = false;
    let channel: { unsubscribe: () => void } | null = null;

    const table = (supabase.from as unknown as (t: string) => any)("director_commands");

    const finish = async (id: string, ok: boolean, result: unknown, error: string | null) => {
      try {
        await table.update({
          status: ok ? "done" : "failed",
          result: result ?? null,
          error,
          finished_at: new Date().toISOString(),
        }).eq("id", id);
      } catch {
        // the brain polls; a missed write surfaces as a timeout there
      }
    };

    const ledger = async (cmd: HandsCommand, summary: string, ok: boolean, detail: unknown) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await (supabase.from as unknown as (t: string) => any)("director_actions").insert({
          user_id: user.id,
          kind: "hands",
          status: ok ? "done" : "failed",
          summary: summary.slice(0, 500),
          before: { command_id: cmd.id, tool: cmd.tool, args: cmd.args },
          after: { receipts: detail },
          visible: true,
          finished_at: new Date().toISOString(),
        });
      } catch {
        // ledger is a courtesy here — the command row is the record
      }
    };

    const toActions = (cmd: HandsCommand): ActorAction[] | null => {
      const a = cmd.args;
      switch (cmd.tool) {
        case "click_target":
          return str(a.target) ? [{ type: "click", target: str(a.target), say: str(a.say) || undefined }] : null;
        case "point_at":
          return str(a.target) ? [{ type: "point", target: str(a.target), say: str(a.say) || undefined }] : null;
        case "goto_page":
          return str(a.route) ? [{ type: "goto", route: str(a.route), say: str(a.say) || undefined }] : null;
        case "type_text":
          return str(a.target) && typeof a.text === "string"
            ? [{ type: "type", target: str(a.target), text: (a.text as string).slice(0, 500), press_return: a.press_return === true }]
            : null;
        case "drag_target":
          return str(a.from) && str(a.to)
            ? [{ type: "drag", from: str(a.from), to: str(a.to), say: str(a.say) || undefined }]
            : null;
        case "live_point":
          return typeof a.index === "number"
            ? [{ type: "live_point", index: a.index, expect: str(a.expect) || undefined, say: str(a.say) || undefined }]
            : null;
        case "live_click":
          return typeof a.index === "number"
            ? [{ type: "live_click", index: a.index, expect: str(a.expect) || undefined, say: str(a.say) || undefined }]
            : null;
        case "live_type":
          return typeof a.index === "number" && typeof a.text === "string"
            ? [{ type: "live_type", index: a.index, text: (a.text as string).slice(0, 500), expect: str(a.expect) || undefined, press_return: a.press_return === true }]
            : null;
        case "live_drag":
          return typeof a.from === "number" && typeof a.to === "number"
            ? [{ type: "live_drag", from: a.from, to: a.to, say: str(a.say) || undefined }]
            : null;
        default:
          return null;
      }
    };

    const execute = async (cmd: HandsCommand) => {
      if (cancelled) return;
      // Claim atomically. Realtime can be delivered to more than one tab,
      // and a SELECT followed by an unconditional UPDATE is not a lock.
      // Only the executor that changes queued -> running may perform the work.
      try {
        const { data: claimed, error: claimError } = await table
          .update({ status: "running" })
          .eq("id", cmd.id)
          .eq("status", "queued")
          .select("id")
          .maybeSingle();
        if (claimError || !claimed) return;
      } catch {
        // Never execute a command unless its claim was confirmed.
        return;
      }
      try {
        if (cmd.tool === "look_at_page") {
          const page = lookAtPage();
          await finish(cmd.id, true, { page }, null);
          await ledger(cmd, "Looked at the current page for the Director", true, page);
          return;
        }
        const actions = toActions(cmd);
        if (!actions) {
          await finish(cmd.id, false, null, `unknown tool or bad args: ${cmd.tool}`);
          await ledger(cmd, `Refused unknown hands tool: ${cmd.tool}`, false, null);
          return;
        }
        const receipts = await hostRef.current.start(actions, { tour: "director-hands", mode: "ride", pace: "human" });
        const failed = receipts.find((r) => !r.ok);
        if (failed) {
          await finish(cmd.id, false, { receipts }, failed.detail);
          await ledger(cmd, `Hands ${cmd.tool} refused: ${failed.detail}`, false, receipts);
        } else {
          await finish(cmd.id, true, { receipts }, null);
          await ledger(cmd, `Hands ${cmd.tool} done`, true, receipts);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 200) : "unknown";
        await finish(cmd.id, false, null, msg);
        await ledger(cmd, `Hands ${cmd.tool} crashed: ${msg}`, false, null);
      }
    };

    const pump = async () => {
      if (busyRef.current || cancelled) return;
      busyRef.current = true;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        const { data } = await table
          .select("id,user_id,session_id,tool,args")
          .eq("user_id", user.id)
          .eq("status", "queued")
          .is("device_id", null)
          .order("created_at", { ascending: true })
          .limit(1);
        const rows = (Array.isArray(data) ? data : []) as HandsCommand[];
        if (rows[0]) await execute(rows[0]);
      } catch {
        // pump retries on the next event
      } finally {
        busyRef.current = false;
      }
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      await pump();
      try {
        channel = supabase
          .channel(`director-hands:${user.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "director_commands", filter: `user_id=eq.${user.id}` },
            () => { void pump(); },
          )
          .subscribe() as unknown as { unsubscribe: () => void };
      } catch {
        // no live channel — the safety net below still picks rows up late.
      }
    })();
    // Safety net: a missed INSERT event (dropped socket, background tab)
    // must never strand a queued command until the brain times out.
    const safety = setInterval(() => {
      if (!cancelled) void pump();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(safety);
      try {
        channel?.unsubscribe();
      } catch {
        // teardown best-effort
      }
    };
  }, []);

  return (
    <>
      <ActorCursor point={host.point} swallow={host.swallow} arriving={host.arriving} size={48} />
      <ActorOverlay
        ring={host.ring}
        bubble={host.bubble}
        showcase={host.showcase}
        running={host.running}
        onStop={host.stop}
        onDismissBubble={host.dismissBubble}
        onDismissShowcase={host.dismissShowcase}
      />
    </>
  );
}
