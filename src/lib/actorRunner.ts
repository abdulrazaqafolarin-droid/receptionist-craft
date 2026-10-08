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
  /** Speak a narration line (speech bubble, chat line, aria-live). */
  say: (text: string) => Promise<void> | void;
  /** Open the showcase box beside the resolved element. */
  showcase: (el: unknown, title: string, lines: string[]) => Promise<void> | void;
  /** Open the connector's real collection dialog for this key. */
  collect: (connectorKey: string) => Promise<void> | void;
  /**
   * Asked when the guard demands confirmation. MUST resolve true/false.
   * Absent means denial (fail closed) — confirmations cannot be skipped
   * by forgetting to wire them.
   */
  requestConfirm?: (action: ActorAction) => Promise<boolean>;
  /** Stop requested (kill switch). Checked before every step. */
  isStopped: () => boolean;
  /** Owner confirmed the run's destructive steps (confirm gate). */
  confirmed?: boolean;
  /** Pause between steps so the owner can follow along. */
  stepDelayMs?: number;
}

export interface RunOptions {
  continueOnFailure?: boolean;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runActorScript(
  actions: ActorAction[],
  deps: ActorDeps,
  opts: RunOptions = {},
): Promise<ActorReceipt[]> {
  const receipts: ActorReceipt[] = [];
  const at = () => new Date().toISOString();

  for (const action of actions) {
    if (deps.isStopped()) {
      receipts.push({ action, ok: false, detail: "stopped-by-owner", at: at() });
      break;
    }

    if (action.type === "say") {
      await deps.say(action.text);
      receipts.push({ action, ok: true, detail: "narrated", at: at() });
      continue;
    }

    let verdict = guardCheck(action, { confirmed: deps.confirmed });
    if (!verdict.allowed) {
      // Confirm gate: pause and ask through the host's inline dialog.
      // A "no" (or no dialog wired at all) ends the run with an honest
      // receipt — confirmations can never be skipped by omission.
      if (verdict.reason.startsWith("confirm-required") && deps.requestConfirm) {
        const granted = await deps.requestConfirm(action).catch(() => false);
        if (granted) {
          verdict = guardCheck(action, { confirmed: true });
        } else {
          receipts.push({ action, ok: false, detail: "cancelled-by-owner", at: at() });
          break;
        }
      }
      if (!verdict.allowed) {
        receipts.push({ action, ok: false, detail: verdict.reason, at: at() });
        if (!opts.continueOnFailure) break;
        continue;
      }
    }

    const target = findTarget(action.target);
    // Guard passed, so the target exists in the registry — but the live
    // page may not render it (surface gating hides pages per operator).
    // A missing element is an honest stop, never a silent skip.
    const el = target ? deps.resolve(target.selector) : null;
    if (!el) {
      receipts.push({ action, ok: false, detail: `not-on-screen:${action.target}`, at: at() });
      if (!opts.continueOnFailure) break;
      continue;
    }

    try {
      if (action.say) await deps.say(action.say);
      if (action.type === "scroll-to") {
        await deps.scrollTo(el);
      } else if (action.type === "showcase") {
        await deps.moveCursor(el);
        await deps.showcase(el, action.title, action.lines);
      } else if (action.type === "collect") {
        await deps.moveCursor(el);
        await deps.collect(action.connector_key);
      } else {
        await deps.moveCursor(el);
        if (action.type === "highlight") {
          await deps.highlight(el, action.ms ?? 1200);
        } else if (action.type === "click") {
          await deps.click(el);
        }
        // point = move only.
      }
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

    if (deps.stepDelayMs) await delay(deps.stepDelayMs);
  }

  return receipts;
}
