/**
 * What's-this mode (Phase 2b): the platform explains itself.
 *
 * A floating "?" arms the mode; the next click anywhere is intercepted
 * (the element is NEVER activated) and resolved to the nearest
 * data-actor anchor. Described UI gets a cursor point + plain-words
 * bubble from the registry/catalog; undescribed UI gets honesty instead
 * of invention. Esc or tapping "?" again disarms.
 */

import { useCallback, useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { ActorCursor, ActorOverlay, useActorHost } from "@/components/ActorCursor";
import { describeTarget } from "@/lib/actorMap";

export function WhatsThis() {
  const [armed, setArmed] = useState(false);
  const host = useActorHost();

  const disarm = useCallback(() => setArmed(false), []);

  useEffect(() => {
    if (!armed) return;
    const onCapture = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target as Element | null;
      const anchor = el?.closest?.("[data-actor]") as Element | null;
      const key = anchor?.getAttribute("data-actor");
      const explanation = key ? describeTarget(key) : null;
      if (anchor && explanation) {
        void host.start([
          { type: "point", target: key as string },
          { type: "say", text: explanation },
        ]);
      } else {
        void host.start([
          { type: "say", text: "I don't have a description for this part yet — it's on my list to learn." },
        ]);
      }
      setArmed(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(false);
    };
    // Capture phase: intercept before any element activates. Nothing the
    // owner taps while armed can trigger navigation, submits, or dialogs.
    document.addEventListener("click", onCapture, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onCapture, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  return (
    <>
      <button
        onClick={() => (armed ? disarm() : setArmed(true))}
        aria-label={armed ? "Cancel what's-this mode" : "Ask what anything does"}
        title={armed ? "Cancel" : "What's this? Tap anything for an explanation"}
        className={`fixed bottom-6 left-6 z-[80] flex h-11 w-11 items-center justify-center rounded-full border shadow-xl transition-colors ${
          armed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        }`}
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
      </button>
      {armed && (
        <div className="fixed bottom-[4.5rem] left-6 z-[80] rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-xl" role="status">
          Tap anything — nothing will activate while I'm listening.
        </div>
      )}
      <ActorCursor point={host.point} swallow={host.swallow} arriving={host.arriving} />
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
