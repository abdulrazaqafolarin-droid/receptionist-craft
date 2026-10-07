/**
 * Module: Task Chaser (Phase C ops module, internal-only).
 *
 * Keeps the operator's task list and computes the chase: overdue first,
 * due-today second, upcoming third. Tasks live under capabilities.ops_tasks
 * (small structured data owned by the operator). Dates are yyyy-mm-dd
 * strings compared lexicographically — chronological without timezone lies.
 *
 * Deno-safe: ASCII only, no Node APIs.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface OpsTask {
  id: string;
  title: string;
  assignee: string | null;
  due: string | null; // yyyy-mm-dd or null (no deadline)
  done: boolean;
  created_at: string;
}

export interface ChaseList {
  overdue: OpsTask[];
  due_today: OpsTask[];
  upcoming: OpsTask[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function newId(): string {
  return `t_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function readTasks(supabase: SupabaseClient, receptionistId: string): Promise<OpsTask[]> {
  const { data, error } = await supabase
    .from("receptionists")
    .select("capabilities")
    .eq("id", receptionistId)
    .maybeSingle();
  if (error) throw new Error(`task read failed: ${error.message}`);
  const caps = (data as { capabilities?: unknown } | null)?.capabilities;
  const raw = caps && typeof caps === "object" ? (caps as Record<string, unknown>).ops_tasks : null;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is OpsTask =>
      !!t && typeof t === "object" &&
      typeof (t as OpsTask).id === "string" &&
      typeof (t as OpsTask).title === "string",
  );
}

async function writeTasks(
  supabase: SupabaseClient,
  receptionistId: string,
  tasks: OpsTask[],
): Promise<void> {
  const { data, error } = await supabase
    .from("receptionists")
    .select("capabilities")
    .eq("id", receptionistId)
    .maybeSingle();
  if (error) throw new Error(`task save read failed: ${error.message}`);
  const caps = (data as { capabilities?: unknown } | null)?.capabilities;
  const base = caps && typeof caps === "object" ? (caps as Record<string, unknown>) : {};
  const { error: wErr } = await supabase
    .from("receptionists")
    .update({ capabilities: { ...base, ops_tasks: tasks } })
    .eq("id", receptionistId);
  if (wErr) throw new Error(`task save failed: ${wErr.message}`);
}

export async function getTasks(supabase: SupabaseClient, receptionistId: string): Promise<OpsTask[]> {
  return readTasks(supabase, receptionistId);
}

/** Add a task. A bad date is rejected rather than stored — a wrong deadline is worse than none. */
export async function addTask(
  supabase: SupabaseClient,
  receptionistId: string,
  input: { title: string; assignee?: string; due?: string },
  now = new Date(),
): Promise<OpsTask> {
  const title = input.title.trim();
  if (!title) throw new Error("task rejected: title is empty");
  if (input.due !== undefined && input.due !== null && !DATE_RE.test(input.due)) {
    throw new Error("task rejected: due must be yyyy-mm-dd");
  }
  const task: OpsTask = {
    id: newId(),
    title: title.slice(0, 200),
    assignee: input.assignee?.trim() ? input.assignee.trim().slice(0, 80) : null,
    due: input.due ?? null,
    done: false,
    created_at: now.toISOString(),
  };
  const tasks = await readTasks(supabase, receptionistId);
  tasks.push(task);
  await writeTasks(supabase, receptionistId, tasks);
  return task;
}

export async function completeTask(
  supabase: SupabaseClient,
  receptionistId: string,
  taskId: string,
): Promise<OpsTask> {
  const tasks = await readTasks(supabase, receptionistId);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error("task not found");
  task.done = true;
  await writeTasks(supabase, receptionistId, tasks);
  return task;
}

/** The chase: open tasks split by urgency. Done tasks never appear — the list is for action, not history. */
export function chaseList(tasks: OpsTask[], today = todayISO()): ChaseList {
  const open = tasks.filter((t) => !t.done);
  const byDue = (list: OpsTask[]) =>
    list.sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
  return {
    overdue: byDue(open.filter((t) => t.due !== null && t.due < today)),
    due_today: byDue(open.filter((t) => t.due === today)),
    upcoming: byDue(open.filter((t) => t.due === null || t.due > today)),
  };
}
