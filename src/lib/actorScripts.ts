/**
 * Actor scripts — authored tours the runner performs.
 *
 * Showcase content reads the surface manifest (the same catalog the
 * planner reasons from), so the boxes describe what is genuinely wired —
 * never marketing copy that drifted from the code.
 */

import type { ActorAction } from "./actorGuard";
import { CONNECTORS, MODULES } from "../../supabase/functions/_shared/config/surfaceManifest";

function connectorLine(key: string): string {
  const c = CONNECTORS.find((x) => x.key === key);
  return c ? `${c.name}: ${c.unlocks}` : key;
}

function moduleLine(key: string): string {
  const m = MODULES.find((x) => x.key === key);
  return m ? `${m.label}: ${m.does}` : key;
}

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

/**
 * Google Reviews walkthrough: the full chain shown as one box, then the
 * real collection dialog presented by the cursor. Connector + module +
 * retention, exactly as the planner assembles them.
 */
export const GOOGLE_WALKTHROUGH: ActorAction[] = [
  {
    type: "say",
    text: "Google Reviews connects in one chain. Here is everything that switches on together.",
  },
  {
    type: "showcase",
    target: "connector-card-google_reviews",
    title: "Google Reviews connection chain",
    lines: [connectorLine("google_reviews"), moduleLine("reviewManagement"), "Retention: review replies keep customers coming back"],
  },
  {
    type: "collect",
    target: "connect-google_reviews",
    connector_key: "google_reviews",
    say: "This opens the real connection form — your credentials go straight to the provider, never through me.",
  },
];
