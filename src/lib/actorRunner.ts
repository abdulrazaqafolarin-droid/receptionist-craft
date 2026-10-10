/**
 * Actor runner — executes action scripts against injected dependencies.
 *
 * The runner knows nothing about the DOM, React, or AI. It walks a script,
 * asks the guard about every step, and calls the host's hands. That split
 * is what makes it unit-testable (stub deps in deno) and safe in
 * production (the host owns the real hands and the stop flag).
 *
 * Independence contract (do not break):
 * - A failed step records its receipt and HALTS the run by default —
 *   half-done tours are worse than stopped ones. Callers opt into
 *   continue-on-failure explicitly.
 * - The stop flag is checked before every step, never mid-gesture.
 * - The runner performs zero network calls and starts zero timers.
 */

import { findTarget } from "./actorMap";
import { guardCheck, type ActorAction } from "./actorGuard";

export interface ActorReceipt {
  action: ActorAction;
  ok: boolean;
  detail: string;
  at: string;
}

export interface ActorDeps {
  /** Resolve a registry key to something the hands can use (or null). */
  resolve: (selector: string) => unknown;
  /** Glide the cursor to the resolved element. */
  moveCursor: (el: unknown) => Promise<void> | void;
  /** Ring-highlight the resolved element for ms. */
  highlight: (el: unknown, ms: number) => Promise<void> | void;
  /** Scroll the resolved element into view. */
  scrollTo: (el: unknown) => Promise<void> | void;
  /** Perform a real click on the resolved element. */
  click: (el: unknown) => Promise<void> | void;
  /**
   * Type text into the resolved input, React-compatible (native setter +
   * input/change events). The host refuses password/credential fields —
   * see guardCheck for the kind gate, the host for the DOM inspection.
   */
  typeInto?: (el: unknown, text: string, pressReturn: boolean) => Promise<void> | void;
  /**
   * Drag from one resolved element to another (mouse down, move in
   * steps, mouse up). Ride-only like typing — a blind background drag
   * is obstruction, so handle mode defers it.
   */
  dragInto?: (fromEl: unknown, toEl: unknown) => Promise<void> | void;
  /** Speak a narration line (speech bubble, chat line, aria-live). */
  say: (text: string) => Promise<void> | void;
  /** Open the showcase box beside the resolved element. */
  showcase: (el: unknown, title: string, lines: string[]) => Promise<void> | void;
  /** Open the connector's real collection dialog for this key. */
  collect: (connectorKey: string) => Promise<void> | void;
  /** Find a navigation element leading to this route (or null). */
  resolveNav?: (route: string) => unknown;
  /**
   * Black-hole traverse: shrink the cursor into the element (or fade in
   * place when there is none), record the arrival note, navigate. Owned
   * entirely by the host — the runner only sequences it. Absent means the
   * host cannot stage travel, so goto fails closed rather than jumping
   * blind.
   */
  traverse?: (route: string, el: unknown | null) => Promise<void> | void;
  /** Stop requested (kill switch). Checked before every step. */
  isStopped: () => boolean;
  /** Pause between steps so the owner can follow along. */
  stepDelayMs?: number;
}

export interface RunOptions {
  continueOnFailure?: boolean;
  /**
   * Ride (default) is full theater for watching; handle runs the same work
   * headless — no cursor moves, no bubbles, no boxes, no scroll jumps. The
   * owner keeps working undisturbed.
   */
  mode?: ActorMode;
}

export type ActorMode = "ride" | "handle";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runActorScript(
  actions: ActorAction[],
  deps: ActorDeps,
  opts: RunOptions = {},
): Promise<ActorReceipt[]> {
  const receipts: ActorReceipt[] = [];
  const at = () => new Date().toISOString();

  for (const action of actions) {
    // Handle mode: background execution. Theater calls are skipped with
    // honest receipts; state-changing work still runs. goto/collect never
    // run headless — navigating the owner's tab away and popping dialogs
    // at them IS obstruction, so those steps defer with reasons instead.
    const silent = opts.mode === "handle";
    if (deps.isStopped()) {
      receipts.push({ action, ok: false, detail: "stopped-by-owner", at: at() });
      break;
    }

    if (action.type === "say") {
      if (!silent) await deps.say(action.text);
      receipts.push({ action, ok: true, detail: silent ? "muted-background" : "narrated", at: at() });
      continue;
    }

    const verdict = guardCheck(action);
    if (!verdict.allowed) {
      receipts.push({ action, ok: false, detail: verdict.reason, at: at() });
      if (!opts.continueOnFailure) break;
      continue;
    }

    // drag carries from/to, not a registry target — resolved wholly here.
    if (action.type === "drag") {
      if (silent) {
        receipts.push({ action, ok: false, detail: "deferred-background", at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
      if (!deps.dragInto) {
        receipts.push({ action, ok: false, detail: "no-drag-handling", at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
      const fromTarget = findTarget(action.from);
      const toTarget = findTarget(action.to);
      const fromEl = fromTarget ? deps.resolve(fromTarget.selector) : null;
      const toEl = toTarget ? deps.resolve(toTarget.selector) : null;
      if (!fromEl || !toEl) {
        receipts.push({ action, ok: false, detail: `not-on-screen:${!fromEl ? action.from : action.to}`, at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
      try {
        if (action.say) await deps.say(action.say);
        await deps.moveCursor(fromEl);
        await deps.dragInto(fromEl, toEl);
        receipts.push({ action, ok: true, detail: "done", at: at() });
      } catch (e) {
        receipts.push({
          action, ok: false,
          detail: `execution-failed:${e instanceof Error ? e.message : "unknown"}`.slice(0, 160),
          at: at(),
        });
        if (!opts.continueOnFailure) break;
      }
      if (deps.stepDelayMs) await delay(deps.stepDelayMs);
      continue;
    }

    // goto carries a route, not a registry key — handled wholly here.
    if (action.type === "goto") {
      if (silent) {
        receipts.push({ action, ok: false, detail: "deferred-background", at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
      if (!deps.traverse) {
        receipts.push({ action, ok: false, detail: "no-traverse-handling", at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
      try {
        if (action.say && !silent) await deps.say(action.say);
        const navEl = deps.resolveNav ? deps.resolveNav(action.route) : null;
        if (navEl) await deps.moveCursor(navEl);
        await deps.traverse(action.route, navEl);
        receipts.push({ action, ok: true, detail: "done", at: at() });
      } catch (e) {
        receipts.push({
          action,
          ok: false,
          detail: `execution-failed:${e instanceof Error ? e.message : "unknown"}`.slice(0, 160),
          at: at(),
        });
        if (!opts.continueOnFailure) break;
      }
      continue;
    }

    const target = findTarget((action as { target: string }).target);
    // Guard passed, so the target exists in the registry — but the live
    // page may not render it (surface gating hides pages per operator).
    // A missing element is an honest stop, never a silent skip.
    const el = target ? deps.resolve(target.selector) : null;
    if (!el) {
      receipts.push({ action, ok: false, detail: `not-on-screen:${(action as { target: string }).target}`, at: at() });
      if (!opts.continueOnFailure) break;
      continue;
    }

    try {
      if (action.say && !silent) await deps.say(action.say);
      if (action.type === "scroll-to") {
        if (silent) {
          receipts.push({ action, ok: false, detail: "skipped-background", at: at() });
          if (!opts.continueOnFailure) break;
          continue;
        }
        await deps.scrollTo(el);
      } else if (action.type === "showcase") {
        if (silent) {
          receipts.push({ action, ok: false, detail: "skipped-background", at: at() });
          if (!opts.continueOnFailure) break;
          continue;
        }
        await deps.moveCursor(el);
        await deps.showcase(el, action.title, action.lines);
      } else if (action.type === "collect") {
        if (silent) {
          // Collecting means presenting a form to the owner — meaningless
          // without them. Deferred, never faked.
          receipts.push({ action, ok: false, detail: "needs-owner", at: at() });
          if (!opts.continueOnFailure) break;
          continue;
        }
        await deps.moveCursor(el);
        await deps.collect(action.connector_key);
      } else {
        if (!silent) await deps.moveCursor(el);
        if (action.type === "highlight") {
          if (silent) {
            receipts.push({ action, ok: true, detail: "noted-background", at: at() });
            continue;
          }
          await deps.highlight(el, action.ms ?? 1200);
        } else if (action.type === "click") {
          // Clicks execute in every mode — that IS background work. A click
          // may still surface app behavior (dialogs, navigation); the runner
          // eliminates the theater it controls (cursor, scrolls, popups),
          // never the app's own reactions. That boundary is documented,
          // not hidden.
          await deps.click(el);
        } else if (action.type === "type") {
          if (silent) {
            // Typing blind while the owner may be typing is obstruction —
            // a mistyped field is worse than a deferred one. Ride only.
            receipts.push({ action, ok: false, detail: "deferred-background", at: at() });
            if (!opts.continueOnFailure) break;
            continue;
          }
          if (!deps.typeInto) {
            receipts.push({ action, ok: false, detail: "no-type-handling", at: at() });
            if (!opts.continueOnFailure) break;
            continue;
          }
          await deps.typeInto(el, action.text, action.press_return === true);
        }
        // point = move only (skipped silently in handle mode).
      }
      receipts.push({ action, ok: true, detail: silent ? "done-background" : "done", at: at() });
    } catch (e) {
      receipts.push({
        action,
        ok: false,
        detail: `execution-failed:${e instanceof Error ? e.message : "unknown"}`.slice(0, 160),
        at: at(),
      });
      if (!opts.continueOnFailure) break;
    }

    if (deps.stepDelayMs) await delay(deps.stepDelayMs);
  }

  return receipts;
}
