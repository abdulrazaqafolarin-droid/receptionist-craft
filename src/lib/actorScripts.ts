/**
 * Actor scripts — authored tours the runner performs.
 *
 * Phase 0: narration + pointing only (no clicks — clicks arrive with the
 * confirm gate in Phase 1). Each script is data: the runner executes, the
 * guard validates every step, receipts tell the story.
 */

import type { ActorAction } from "./actorGuard";

/** Connections page tour: what lives here and where to begin. */
export const CONNECTIONS_TOUR: ActorAction[] = [
  {
    type: "say",
    text: "This is Connections — every outside service your operator can use lives here. Let me show you around.",
  },
  { type: "scroll-to", target: "connections-list" },
  {
    type: "point",
    target: "connections-list",
    say: "Connectors first: email, social, SMS, payments, calendar. Each card shows its real status.",
  },
  {
    type: "point",
    target: "connector-card-google_reviews",
    say: "Google Reviews watches your ratings and drafts replies.",
  },
  {
    type: "highlight",
    target: "connect-google_reviews",
    ms: 1500,
    say: "This button starts the connection. Say the word and I'll walk you through it.",
  },
  { type: "scroll-to", target: "modules-list" },
  {
    type: "point",
    target: "modules-list",
    say: "Below: capability modules you switch on one at a time — trust as you go.",
  },
];
