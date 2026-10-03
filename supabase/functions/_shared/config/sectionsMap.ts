/**
 * Sections Map — page internals inventory, LIGHT version (Tier 1 adjacent).
 *
 * Purpose: future button-level gating needs to know what lives INSIDE each
 * page. This file records ONLY verified structure (tab values and headings
 * read from the page source). Entries marked verified:false carry just the
 * route + purpose (already verified via the surface manifest) and NO
 * invented sections — an unverified map entry is honest, an invented one
 * is a lie the planner would repeat.
 *
 * Rule: mark an entry verified only after reading the page source.
 * The drift script reports unverified coverage so the gap stays visible.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface PageSections {
  key: string; // OWNER_PAGES key in surfaceManifest.ts
  verified: boolean;
  tabs: string[]; // verified TabsTrigger values, empty when none/unknown
  notes: string; // one line on what lives here
}

export const PAGE_SECTIONS: PageSections[] = [
  { key: "dashboard", verified: false, tabs: [], notes: "Home: stats, charts, revenue engine, operator detail." },
  { key: "analytics", verified: false, tabs: [], notes: "Conversation and funnel numbers." },
  { key: "money-mode", verified: false, tabs: [], notes: "Sales acceleration controls and threshold." },
  { key: "meo-dashboard", verified: true, tabs: ["funnel", "heatmap", "insights", "intents"], notes: "Revenue-leak analytics across four views." },
  { key: "operator-management", verified: false, tabs: [], notes: "Conversational operator management." },
  { key: "services", verified: true, tabs: ["products", "services"], notes: "Catalog split across two tabs." },
  { key: "availability", verified: false, tabs: [], notes: "Weekly rules plus exceptions." },
  { key: "staff", verified: false, tabs: [], notes: "Team members and scheduling links." },
  { key: "faqs", verified: false, tabs: [], notes: "Question-and-answer knowledge entries." },
  { key: "conversations", verified: false, tabs: [], notes: "Visitor conversation threads." },
  { key: "quality-review", verified: false, tabs: [], notes: "AI answer review queue." },
  { key: "kb-rewrite", verified: false, tabs: [], notes: "Knowledge improvement suggestions." },
  { key: "escalations", verified: false, tabs: [], notes: "Human-handoff queue." },
  { key: "appointments", verified: true, tabs: ["appointments", "orders"], notes: "Fulfillment list split across two tabs." },
  { key: "calendar", verified: false, tabs: [], notes: "Visual schedule." },
  { key: "customers", verified: false, tabs: [], notes: "Visitor records." },
  { key: "channels", verified: true, tabs: ["payments", "phone", "whatsapp"], notes: "Channel setup across three tabs." },
  { key: "connections", verified: false, tabs: [], notes: "External connector catalog and status." },
];

/** Share of the map verified against page source (drift script reports this). */
export function sectionsCoverage(): { verified: number; total: number } {
  const verified = PAGE_SECTIONS.filter((p) => p.verified).length;
  return { verified, total: PAGE_SECTIONS.length };
}

/** Build the sections block injected into the file-drop bundle. */
export function buildSectionsPrompt(): string {
  const lines = PAGE_SECTIONS.map(
    (p) => `- ${p.key}${p.verified ? ` [tabs: ${p.tabs.join(", ") || "none"}]` : " [structure unverified — do not assume internals]"}: ${p.notes}`,
  ).join("\n");
  const c = sectionsCoverage();
  return `=== PAGE INTERNALS (light map — verified tabs only, ${c.verified}/${c.total} pages mapped) ===
${lines}

INTERNALS RULES:
1. Verified tabs may be referenced; unverified pages are atomic — show or hide the whole page, never assume what is inside.
2. Button-level gating is NOT active: ui_plan addresses pages, never individual controls.`;
}
