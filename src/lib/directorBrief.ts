/**
 * Director briefing assembly — pure logic for the morning brief.
 *
 * The buddy's face shows presence; this builds what it says when asked.
 * Every line cites real rows (counts + where to look). Nothing is
 * invented: an empty input produces an explicit all-clear, never filler.
 */

export interface BriefingInput {
  operators: Array<{
    id: string;
    business_name: string | null;
    name: string | null;
    business_model: string | null;
    operator_kind: string | null;
    upcomingBookings: number;
    openEscalations: number;
    stockNeeds: number;
    overdueTasks: number;
  }>;
  failedJobs: number;
  activeJobs: number;
  connectorsNeedingAttention: string[];
}

export interface BriefLine {
  /** Business language, one line, ends with where to look. */
  text: string;
  /** Route the line links to, or null when there is nowhere to go. */
  path: string | null;
}

function opName(o: BriefingInput["operators"][number]): string {
  return o.business_name || o.name || "An operator";
}

/** Assemble the brief. Pure — tested without network or DOM. */
export function assembleBriefing(input: BriefingInput): BriefLine[] {
  const lines: BriefLine[] = [];

  if (input.failedJobs > 0) {
    lines.push({
      text: `${input.failedJobs} background job${input.failedJobs === 1 ? "" : "s"} failed — check Diagnostics to see why.`,
      path: "/diagnostics",
    });
  }

  for (const o of input.operators) {
    const name = opName(o);
    if (o.openEscalations > 0) {
      lines.push({
        text: `${name}: ${o.openEscalations} customer${o.openEscalations === 1 ? "" : "s"} waiting on a human.`,
        path: "/escalations",
      });
    }
    if (o.upcomingBookings > 0) {
      lines.push({
        text: `${name}: ${o.upcomingBookings} booking${o.upcomingBookings === 1 ? "" : "s"} on the schedule.`,
        path: "/appointments",
      });
    }
    if (o.stockNeeds > 0) {
      lines.push({
        text: `${name}: ${o.stockNeeds} stock item${o.stockNeeds === 1 ? "" : "s"} need${o.stockNeeds === 1 ? "s" : ""} attention.`,
        path: "/services",
      });
    }
    if (o.overdueTasks > 0) {
      lines.push({
        text: `${name}: ${o.overdueTasks} overdue task${o.overdueTasks === 1 ? "" : "s"} still open.`,
        path: "/console",
      });
    }
  }

  for (const c of input.connectorsNeedingAttention.slice(0, 3)) {
    lines.push({
      text: `${c} needs reconnecting — its features are paused until then.`,
      path: "/connections",
    });
  }

  if (input.activeJobs > 0 && lines.length === 0) {
    lines.push({
      text: `${input.activeJobs} job${input.activeJobs === 1 ? "" : "s"} still running — nothing needs you yet.`,
      path: null,
    });
  }

  return lines;
}
