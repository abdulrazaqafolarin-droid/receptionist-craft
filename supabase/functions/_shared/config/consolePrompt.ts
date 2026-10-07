/**
 * Operator Console prompt builder (Phase D).
 *
 * The console is where OWNER and STAFF talk to an internal operator — not
 * customers. The prompt frames the AI as the business's back-office helper:
 * it answers from the approved knowledge base, reports the live ops
 * snapshot (stock, tasks, roster), and stays inside honest bounds.
 *
 * Pure functions — tested directly, imported by operator-console-chat.
 * Deno-safe: ASCII only, no Node APIs.
 */

export interface ConsoleSnapshot {
  businessName: string;
  knowledgeBase: string;
  modulesOn: string[];
  stockLines: string[]; // worst-first alert details, top 5
  overdueTasks: string[]; // titles
  dueTodayTasks: string[]; // titles
  conflictCount: number;
  staffCount: number;
}

export function snapshotBlock(s: ConsoleSnapshot): string {
  const lines: string[] = [];
  if (s.stockLines.length > 0) {
    lines.push(`STOCK NEEDS ATTENTION (${s.stockLines.length}):`);
    for (const l of s.stockLines.slice(0, 5)) lines.push(`- ${l}`);
  } else {
    lines.push("STOCK: nothing flagged right now.");
  }
  if (s.overdueTasks.length > 0) {
    lines.push(`OVERDUE TASKS (${s.overdueTasks.length}):`);
    for (const t of s.overdueTasks.slice(0, 5)) lines.push(`- ${t}`);
  } else {
    lines.push("TASKS: nothing overdue.");
  }
  if (s.dueTodayTasks.length > 0) {
    lines.push(`DUE TODAY (${s.dueTodayTasks.length}): ${s.dueTodayTasks.slice(0, 5).join("; ")}`);
  }
  if (s.conflictCount > 0) {
    lines.push(`ROSTER: ${s.conflictCount} shift conflict(s) need fixing on the Staff page.`);
  } else {
    lines.push(`ROSTER: no conflicts (${s.staffCount} staff on record).`);
  }
  return lines.join("\n");
}

/** The staff-facing system prompt. Short, plain, bounded. */
export function buildConsolePrompt(s: ConsoleSnapshot): string {
  const kb = s.knowledgeBase.trim()
    ? s.knowledgeBase.trim().slice(0, 3000)
    : "(No knowledge base written yet — answer from the snapshot and say what you do not know.)";
  return `You are the inside-the-business helper for ${s.businessName}. You are talking to the OWNER or their STAFF — never to customers. Nobody here needs selling to; they need straight answers about their own shop.

WHAT YOU KNOW (approved business knowledge):
${kb}

LIVE SNAPSHOT (computed just now from real records — trust it over memory):
${snapshotBlock(s)}

RULES:
- Answer briefly and concretely. Name items, dates, and people.
- When asked what needs attention, lead with expired/out-of-stock items, then overdue tasks, then expiring stock, then roster conflicts.
- Never invent stock counts, tasks, or shifts. If the snapshot says nothing is flagged, say so — do not fill silence with guesses.
- You cannot see the shelves, the supplier's system, or money. Say that plainly when asked for what you cannot see.
- No bookings, no orders, no customer contact — this operator does not serve customers. If asked for customer-facing work, say it is outside this operator's job.`;
}
