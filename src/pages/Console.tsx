/**
 * Operator Console (Phase D) — where owner and staff talk to an internal
 * operator. The customer widget serves visitors; this page serves the shop:
 * stock questions, task chases, roster gaps, answered from live records.
 *
 * Gated by the approved surface (internal tag) via SurfaceGate + sidebar.
 * A non-internal operator landing here directly gets an honest explainer,
 * never a dead chat box.
 */

import { useEffect, useRef, useState } from "react";
import { Terminal, Send, Loader2, Package, ListChecks, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveOperatorStore } from "@/store/activeOperator";
import { isRouteVisible } from "@/lib/operatorSurface";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

type QuickAction = "stock" | "tasks" | "roster";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Console() {
  const receptionistId = useActiveOperatorStore((s) => s.receptionistId);
  const operatorName = useActiveOperatorStore((s) => s.operatorName);
  const visiblePages = useActiveOperatorStore((s) => s.visiblePages);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [acting, setActing] = useState<QuickAction | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  if (!receptionistId) {
    return (
      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> Operator Console</CardTitle>
            <CardDescription>Select an operator first — the console talks to one specific operator.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isRouteVisible("/console", visiblePages)) {
    return (
      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> Operator Console</CardTitle>
            <CardDescription>
              The console is home to inside-the-business operators — stock, staff, and tasks.
              {operatorName ? ` ${operatorName} serves customers, so its home is the dashboard and widget instead.` : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  async function callFn(body: Record<string, unknown>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please log in first");
    const { data, error } = await supabase.functions.invoke("operator-console-chat", {
      body: { receptionist_id: receptionistId, user_id: user.id, ...body },
    });
    if (error) throw new Error(error.message || "console_unreachable");
    const d = data as { ok?: boolean; error?: string; detail?: string };
    if (!d?.ok) throw new Error(d?.detail || d?.error || "console_failed");
    return d as Record<string, unknown>;
  }

  function formatAction(action: QuickAction, d: Record<string, unknown>): string {
    if (action === "stock") {
      const alerts = (d.alerts || []) as Array<{ detail?: string }>;
      const sugg = (d.suggestions || []) as string[];
      if (alerts.length === 0) return "Stock check: nothing flagged. No low stock, no expiring items on record.";
      return `Stock check (${alerts.length} flagged):\n` +
        alerts.map((a) => `- ${a.detail || ""}`).join("\n") +
        (sugg.length > 0 ? `\nReorder suggestion: ${sugg.join("; ")}` : "");
    }
    if (action === "tasks") {
      const chase = (d.chase || {}) as { overdue?: Array<{ title?: string }>; due_today?: Array<{ title?: string }>; upcoming?: Array<{ title?: string }> };
      const over = chase.overdue || [];
      const today = chase.due_today || [];
      const up = chase.upcoming || [];
      if (over.length === 0 && today.length === 0 && up.length === 0) return "Task list is empty — nothing to chase. Add tasks and I will keep them here.";
      const parts: string[] = [];
      if (over.length > 0) parts.push(`Overdue (${over.length}): ${over.map((t) => t.title).join("; ")}`);
      if (today.length > 0) parts.push(`Due today (${today.length}): ${today.map((t) => t.title).join("; ")}`);
      if (up.length > 0) parts.push(`Upcoming (${up.length}): ${up.map((t) => t.title).join("; ")}`);
      return parts.join("\n");
    }
    const staff = (d.staff || []) as Array<{ name?: string }>;
    const conflicts = (d.conflicts || []) as Array<{ staff_name?: string; day?: number }>;
    const uncovered = d.uncovered as number[] | null;
    const lines = [`Roster: ${staff.length} staff on record${staff.length > 0 ? ` (${staff.map((s) => s.name).join(", ")})` : ""}.`];
    if (conflicts.length > 0) {
      lines.push(`Conflicts (${conflicts.length}): ${conflicts.map((c) => `${c.staff_name} on ${DAY_NAMES[c.day ?? 0] ?? "?"}`).join("; ")}. Fix them on the Staff page.`);
    } else {
      lines.push("No shift conflicts.");
    }
    if (uncovered === null) {
      lines.push("No shifts saved yet — add shifts on the Staff page and I will watch for gaps.");
    } else if (uncovered.length > 0) {
      lines.push(`Uncovered days (assuming Mon-Sat): ${uncovered.map((n) => DAY_NAMES[n]).join(", ")}.`);
    } else {
      lines.push("Every working day is covered.");
    }
    return lines.join("\n");
  }

  async function runAction(action: QuickAction) {
    if (acting || sending) return;
    setActing(action);
    try {
      const d = await callFn({ action });
      setMessages((m) => [...m, { role: "assistant", content: formatAction(action, d) }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `That check failed (${e instanceof Error ? e.message : "unknown error"}). Your records are untouched — try again in a moment.` }]);
    } finally {
      setActing(null);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending || acting) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);
    try {
      const d = await callFn({
        action: "chat",
        message: text,
        history: next.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages((m) => [...m, { role: "assistant", content: String(d.reply || "No reply — try again.") }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `I could not answer that just now (${e instanceof Error ? e.message : "unknown error"}). The quick checks above still work on your live records.` }]);
    } finally {
      setSending(false);
    }
  }

  const busy = sending || acting !== null;

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" /> Operator Console</CardTitle>
          <CardDescription>
            {operatorName ? `Talking to ${operatorName} — your inside-the-business helper. ` : ""}
            Ask about stock, tasks, or shifts. Answers come from your live records, not guesses.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction("stock")}>
            {acting === "stock" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            <span className="ml-1">Stock check</span>
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction("tasks")}>
            {acting === "tasks" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
            <span className="ml-1">Today's tasks</span>
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction("roster")}>
            {acting === "roster" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            <span className="ml-1">Roster gaps</span>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 flex flex-col gap-3 min-h-[240px]">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No questions yet. Try a quick check above, or ask e.g. "what needs my attention today?"
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "self-end bg-primary text-primary-foreground rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap" : "self-start bg-muted rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap"}>
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="self-start bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking your records…
            </div>
          )}
          <div ref={bottomRef} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder='Ask about your shop, e.g. "what is running low?"'
          disabled={busy}
        />
        <Button onClick={send} disabled={busy || !input.trim()}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
