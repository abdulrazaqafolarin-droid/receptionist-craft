/**
 * useBuildThreads — one history system, two doors.
 *
 * The talk-it-through chat and the Builder's Improve chat share the same
 * build_threads / build_messages tables. This hook owns all access so both
 * UIs list, resume, and delete identically. Generated DB types lag behind
 * migrations (never-edit file), so table access goes through a narrow
 * untyped handle; rows are cast on read, never trusted.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BuildThread {
  id: string;
  title: string;
  business_name: string;
  business_type: string;
  receptionist_id: string | null;
  status: "chatting" | "planned" | "approved";
  updated_at: string;
}

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface LooseQuery {
  select(s: string): LooseQuery;
  eq(c: string, v: unknown): LooseQuery;
  order(c: string, o?: unknown): LooseQuery;
  limit(n: number): LooseQuery;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
  then(onf: (v: { data: unknown; error: { message: string } | null }) => unknown): Promise<unknown>;
}

interface LooseTable {
  insert(v: unknown): LooseQuery;
  select(s: string): LooseQuery;
  update(v: unknown): LooseQuery;
  delete(): LooseQuery;
}

function looseTable(name: string): LooseTable {
  return (supabase.from as unknown as (t: string) => LooseTable)(name);
}

const THREAD_COLS = "id,title,business_name,business_type,receptionist_id,status,updated_at";

/**
 * @param receptionistId when set, lists only that operator's threads (Builder);
 * when null, lists the owner's threads across operators (talk-it-through).
 * @param tables override for other chat domains (Director) — same row shape.
 */
export function useBuildThreads(
  receptionistId: string | null | undefined,
  // Callers never switch tables mid-mount; the first value wins for the
  // memoised callbacks below (deliberate — avoids refetch loops).
  tables: { threads: string; messages: string } = { threads: "build_threads", messages: "build_messages" },
) {
  const [threads, setThreads] = useState<BuildThread[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let q = looseTable(tables.threads).select(THREAD_COLS).order("updated_at", { ascending: false }).limit(30);
      q = receptionistId ? q.eq("receptionist_id", receptionistId) : q.eq("user_id", user.id);
      const { data } = await q;
      if (data) setThreads(data as BuildThread[]);
    } catch {
      // list stays as it was; chat works regardless
    }
  }, [receptionistId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureThread = useCallback(async (
    firstText: string,
    opts: { businessName?: string; businessType?: string; receptionistId?: string | null } = {},
  ): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await looseTable(tables.threads).insert({
        user_id: user.id,
        receptionist_id: opts.receptionistId ?? null,
        title: firstText.trim().slice(0, 42) || "New build",
        business_name: opts.businessName ?? "",
        business_type: opts.businessType ?? "",
      }).select(THREAD_COLS).single();
      if (error || !data) return null;
      const t = data as BuildThread;
      setThreads((prev) => [t, ...prev]);
      return t.id;
    } catch {
      return null;
    }
  }, []);

  const saveMsg = useCallback(async (tid: string, role: "user" | "assistant", content: string) => {
    try {
      await looseTable(tables.messages).insert({ thread_id: tid, role, content });
      setThreads((prev) => {
        const t = prev.find((x) => x.id === tid);
        return t ? [t, ...prev.filter((x) => x.id !== tid)] : prev;
      });
    } catch {
      // history is a courtesy — the change itself already happened
    }
  }, []);

  const touch = useCallback(async (tid: string, patch: Partial<Pick<BuildThread, "receptionist_id" | "status" | "title" | "business_name" | "business_type">>) => {
    try {
      await looseTable(tables.threads).update(patch).eq("id", tid);
      setThreads((prev) => prev.map((t) => (t.id === tid ? { ...t, ...patch } : t)));
    } catch {
      // ignore
    }
  }, []);

  const loadMessages = useCallback(async (tid: string): Promise<ThreadMessage[]> => {
    const { data } = await looseTable(tables.messages)
      .select("role,content,created_at").eq("thread_id", tid).order("created_at", { ascending: true }).limit(200);
    return (((data || []) as Array<{ role: string; content: string; created_at: string }>)
      .filter((m) => m.role === "user" || m.role === "assistant") as ThreadMessage[]);
  }, []);

  const remove = useCallback(async (tid: string) => {
    try {
      await looseTable(tables.threads).delete().eq("id", tid);
    } catch {
      // list state is the truth
    }
    setThreads((prev) => prev.filter((t) => t.id !== tid));
  }, []);

  return { threads, refresh, ensureThread, saveMsg, touch, loadMessages, remove };
}
