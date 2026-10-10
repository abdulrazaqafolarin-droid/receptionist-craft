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
 * - look_at_page: serialize this page as a text grid (route, title,
 *   on-screen registered anchors, headings, buttons, input labels —
 *   never input values). Read-only, always allowed.
 * - click_target / point_at / goto_page: straight through runActorScript.
 * - type_text: through runActorScript; the guard allows registered
 *   inputs only and the host refuses credential fields at the live DOM.
 *
 * Every execution lands in director_actions (kind 'hands') with the
 * command id and receipts — the audit trail covers hands too.
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { findTarget, describeTarget } from "@/lib/actorMap";
import type { ActorAction } from "@/lib/actorGuard";

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
function lookAtPage(): Record<string, unknown> {
  const out: Record<string, unknown> = {
    route: window.location.pathname,
    title: document.title.slice(0, 120),
  };
  try {
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
    const text = (sel: string, n: number) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80))
        .filter(Boolean)
        .slice(0, n);
    out.headings = text("h1,h2,h3", 12);
    out.buttons = text("button", 20);
    const inputs: string[] = [];
    document.querySelectorAll("input,textarea,select").forEach((el) => {
      if (inputs.length >= 10) return;
      const input = el as HTMLInputElement;
      const label = input.getAttribute("placeholder") || input.getAttribute("aria-label") || input.name || input.type || input.tagName;
      inputs.push(`${input.tagName.toLowerCase()}[${(input.getAttribute("type") || "").toLowerCase()}]: ${label}`.slice(0, 100));
    });
    out.inputs = inputs;
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
        default:
          return null;
      }
    };

    const execute = async (cmd: HandsCommand) => {
      if (cancelled) return;
      try {
        await table.update({ status: "running" }).eq("id", cmd.id);
      } catch {
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
        const receipts = await hostRef.current.start(actions, { tour: "director-hands", mode: "ride" });
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
        // no live channel — the edge's wait loop still gets results late,
        // or the next navigation pumps. Degraded, not dead.
      }
    })();
    return () => {
      cancelled = true;
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
