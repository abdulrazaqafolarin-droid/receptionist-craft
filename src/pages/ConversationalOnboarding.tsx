import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Check, Loader2, Send, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { recordSignal } from "@/lib/successSignals";
import { buildLocalPlan, detectProblemType, isSubstantive, nextInterviewTurn } from "@/lib/conversationalInterview";
import { surfaceProfileFromConfig, uiPlanForProfile, widgetPiecesFromConfig } from "@/lib/operatorSurface";
import type { PreviewSolution } from "@/components/onboarding/OperatorPreview";
import { BuildPlayground } from "@/components/BuildPlayground";
import { offlineDraftTrace, parseTrace, type PlayTrace } from "@/lib/buildTrace";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { toast } from "sonner";
import { FloatingBackground } from "@/components/FloatingBackground";
import VoiceInputButton from "@/components/widget/VoiceInputButton";
import { ChatMessage, type AgentVisualState } from "@/components/onboarding/ChatMessage";
import { BuildProgress, type BuildStep } from "@/components/onboarding/BuildProgress";
import { OperatorPreview, type PreviewFaq, type PreviewService } from "@/components/onboarding/OperatorPreview";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: Date;
}

type Phase = "chat" | "planning" | "preview" | "building" | "done";

interface PlanData {
  planText: string;
  config: Record<string, unknown>;
  versionId: string;
  receptionistId: string;
}

let msgSeq = 0;
function nextId() {
  msgSeq += 1;
  return `m-${Date.now()}-${msgSeq}`;
}

function transcriptOf(messages: Message[]): string {
  return messages.map((m) => `${m.role === "user" ? "Owner" : "Assistant"}: ${m.content}`).join("\n");
}

function ownerTexts(messages: Message[]): string[] {
  return messages.filter((m) => m.role === "user").map((m) => m.content);
}

/** Deterministic starter answers derived from the plan config — marked Suggested until approved. */
function deriveFaqs(config: Record<string, unknown>, summary: string): PreviewFaq[] {
  const business = (config.business || {}) as Record<string, unknown>;
  const hours = Array.isArray(config.hours) ? (config.hours as Array<Record<string, unknown>>) : [];
  const policies = (config.policies || {}) as Record<string, unknown>;
  const contact = (config.contact || {}) as Record<string, unknown>;
  const capabilities = (config.capabilities || {}) as Record<string, boolean>;
  const displayName = typeof business.display_name === "string" ? business.display_name : "us";
  const faqs: PreviewFaq[] = [];

  if (hours.length > 0) {
    faqs.push({
      question: "What are your opening hours?",
      answer: `We are open ${hours
        .map((h) => `day ${h.day_of_week} ${h.start_time}–${h.end_time}`)
        .join(", ")} (${typeof config.timezone === "string" ? config.timezone : "local time"}).`,
    });
  }
  if (capabilities.books_appointments) {
    faqs.push({
      question: "How do I book an appointment?",
      answer: `Just tell us what you need and when — ${displayName} confirms your slot right in the chat.`,
    });
  }
  if (typeof policies.cancellation_notice_hours === "number") {
    faqs.push({
      question: "What is your cancellation policy?",
      answer: `Please give us at least ${policies.cancellation_notice_hours} hours notice to cancel or reschedule.`,
    });
  }
  if (typeof contact.phone === "string" && contact.phone) {
    faqs.push({
      question: "How do I reach you directly?",
      answer: `You can reach us on ${contact.phone}${typeof contact.address === "string" && contact.address ? `, or visit us at ${contact.address}` : ""}.`,
    });
  }
  if (summary) {
    faqs.push({ question: `What does ${displayName} offer?`, answer: summary.slice(0, 400) });
  }
  // Helper-operator top-ups: when there are no booking slots to draw from,
  // answer from the agreed scope so the operator still starts useful.
  const willDo = Array.isArray(config.will_do)
    ? (config.will_do as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  const wontDo = Array.isArray(config.wont_do)
    ? (config.wont_do as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  if (faqs.length < 3 && willDo.length > 0) {
    faqs.push({ question: "What can this operator help me with?", answer: willDo.join(" ") });
  }
  if (faqs.length < 3 && wontDo.length > 0) {
    faqs.push({ question: "What can't it do yet?", answer: wontDo.join(" ") });
  }
  const genericTopUps: PreviewFaq[] = [
    {
      question: "How do I get the most out of it?",
      answer: `Talk to ${displayName} in plain words, a little and often. The more it learns about your rhythm, the sharper its ideas and reminders get.`,
    },
    {
      question: "What should I ask it first?",
      answer: `Start with your goal for this week — ${displayName} breaks it into ideas, drafts, and reminders you can act on.`,
    },
    {
      question: "Can it change as my needs change?",
      answer: `Yes. Adjust anything anytime in the builder — tone, knowledge, and behavior stay in your control.`,
    },
  ];
  for (const g of genericTopUps) {
    if (faqs.length >= 3) break;
    faqs.push(g);
  }
  return faqs.slice(0, 5);
}

/** String lists the Configurator may attach (will_do / wont_do / external_needs). */
export function configStrings(config: Record<string, unknown>, key: string): string[] {
  const v = config[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && !!x.trim());
}

/** Researched external solutions (Stage 4) attached to the config. */
export function configSolutions(config: Record<string, unknown>): PreviewSolution[] {
  const v = config.external_solutions;
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).need === "string")
    .map((s) => ({
      need: s.need as string,
      note: typeof s.note === "string" ? s.note : "",
      fulfillment: ["fetched", "evaluated", "integrated"].includes(s.fulfillment as string)
        ? (s.fulfillment as string)
        : "found",
      candidates: (Array.isArray(s.candidates) ? s.candidates : [])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object" && typeof (c as Record<string, unknown>).name === "string" && typeof (c as Record<string, unknown>).url === "string")
        .slice(0, 3)
        .map((c) => ({
          name: c.name as string,
          url: c.url as string,
          stars: typeof c.stars === "number" ? c.stars : 0,
          license: typeof c.license === "string" ? c.license : "unknown",
          open_source: c.open_source === true,
        })),
    }));
}

const DONE_STEPS: BuildStep[] = [];

/**
 * Sync-first planning call with async fallback (fallback C).
 *
 * Tries the live call; when it falls over (timeout, gateway errors), queues
 * a background job and polls plan_jobs until done/failed (~10 min cap).
 * Validation errors pass straight through — only capacity failures reroute.
 * Returns the response body shape in both paths ({ok, ...}).
 */
async function invokePlanFn(
  fn: "propose-operator-plan" | "request-change",
  body: Record<string, unknown>,
  onBackground: () => void,
): Promise<{ data: unknown; error: unknown }> {
  let first: { data: unknown; error: unknown };
  try {
    first = await supabase.functions.invoke(fn, { body });
  } catch (e) {
    // Network/timeout throw — definitely a capacity failure, not validation.
    first = { data: null, error: e };
  }
  const firstErr = ((first.data as { error?: string } | null)?.error || "") as string;
  const ok = ((first.data as { ok?: boolean } | null)?.ok) === true;
  if (ok) return { data: first.data, error: null };
  // Only capacity failures reroute: gateway/timeout/internal/empty.
  // Validation errors (missing_*, not_found, ...) pass straight through —
  // even though supabase also sets an error object on 4xx responses.
  const capacityCode =
    firstErr === "" || firstErr.startsWith("gateway_") || firstErr === "internal_error";
  const thrown = !!first.error && !first.data;
  if (!capacityCode && !thrown) return { data: first.data, error: first.error };

  // Background path: queue + poll the owner's own job row (RLS-scoped).
  onBackground();
  const queued = await supabase.functions.invoke(fn, { body: { ...body, async: true } });
  const jobId = (queued.data as { job_id?: string } | null)?.job_id;
  if (queued.error || !jobId) {
    return { data: first.data, error: first.error };
  }
  const jobs = (supabase.from as unknown as (
    t: string,
  ) => {
    select(c: string): {
      eq(c: string, v: string): {
        maybeSingle(): Promise<{ data: unknown }>;
      };
    };
  })("plan_jobs");
  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    const { data: row } = await jobs.select("status,result_json,error_text,trace_json").eq("id", jobId).maybeSingle();
    const j = (row || {}) as {
      status?: string;
      result_json?: Record<string, unknown> | null;
      error_text?: string | null;
      trace_json?: unknown;
    };
    if (j.status === "done" && j.result_json) {
      return {
        data: { ok: true, ...j.result_json, trace: j.trace_json || [], trace_summary: "" },
        error: null,
      };
    }
    if (j.status === "failed") {
      return {
        data: { ok: false, error: j.error_text || "background planning failed", trace: j.trace_json || [] },
        error: null,
      };
    }
    if (Date.now() > deadline) break;
  }
  return { data: first.data, error: first.error };
}

export default function ConversationalOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const businessName = searchParams.get("businessName") || "";
  const businessType = searchParams.get("businessType") || "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentState, setAgentState] = useState<AgentVisualState>("idle");
  const [phase, setPhase] = useState<Phase>("chat");
  const [ready, setReady] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);
  const [summary, setSummary] = useState("");
  const [planData, setPlanData] = useState<PlanData | null>(null);
  // Playground trace: backend receipts for the current run (plan/adjust/
  // approval). Ephemeral — clears when a new run starts, never stored.
  const [playTraces, setPlayTraces] = useState<PlayTrace[]>([]);
  const [services, setServices] = useState<PreviewService[]>([]);
  const [faqs, setFaqs] = useState<PreviewFaq[]>([]);
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>(DONE_STEPS);
  const [mobileTab, setMobileTab] = useState<"chat" | "build">("chat");
  const [approving, setApproving] = useState(false);
  // True when a reply takes longer than ~8s — reassures instead of silence
  // (the "Okay????" moment: long OpenCode turns with only typing dots).
  const [thinkingLong, setThinkingLong] = useState(false);
  // True while the gateway interviewer answers; false when running on the
  // built-in guided questions (gateway down). Shown honestly in the header.
  const [smartMode, setSmartMode] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const receptionistIdRef = useRef<string | null>(null);
  const greetedRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Readiness and counts use substantive messages only — greetings, stray
  // taps, and "??" never inflate progress or trigger planning.
  const substantiveCount = useMemo(
    () => messages.filter((m) => m.role === "user" && isSubstantive(m.content)).length,
    [messages],
  );
  const showSplit = phase === "preview" || phase === "building" || phase === "done";

  // Greet once — never re-greet (platform rule).
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    const greeting = businessType
      ? `Welcome${businessName ? ` to ${businessName}` : ""}! I help set up AI operators for businesses like yours. In your own words — what do you offer, and where does it hurt most: serving customers, or work inside the business?`
      : "Welcome! Tell me about your business in your own words — what you offer, and where it hurts most: serving customers, or work inside the business?";
    setMessages([{ id: nextId(), role: "assistant", content: greeting, at: new Date() }]);
    setAgentState("watching");
  }, [businessName, businessType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, phase]);

  // Long-thinking reassurance: after ~8s of waiting, say so plainly.
  useEffect(() => {
    if (!sending) {
      setThinkingLong(false);
      return;
    }
    const t = setTimeout(() => setThinkingLong(true), 8000);
    return () => clearTimeout(t);
  }, [sending]);

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content, at: new Date() }]);
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || phase === "planning" || phase === "building") return;
    setInput("");
    setCtaDismissed(false);
    const userMsg: Message = { id: nextId(), role: "user", content: text, at: new Date() };
    const next = [...messages, userMsg];
    setMessages(next);
    setSending(true);
    setAgentState("thinking");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        messages: next.slice(-12).map((m) => ({ role: m.role, content: m.content })),
        businessName,
        businessType,
        conversationId: user?.id,
      };
      const ask = () => supabase.functions.invoke("configurator-chat", { body: payload });
      type ChatOk = { assistant_message: string; ready: boolean; summary: string };
      const good = (d: unknown): d is { ok: true } & ChatOk =>
        !!d && (d as { ok?: boolean }).ok === true;

      let { data, error } = await ask();
      if (error || !good(data)) {
        // One silent retry — the gateway flaps under load. Still failing after
        // that means it is really down, so fall through to guided questions.
        await new Promise((r) => setTimeout(r, 1500));
        ({ data, error } = await ask());
      }

      if (!error && good(data)) {
        appendAssistant(data.assistant_message);
        if (data.summary) setSummary(data.summary);
        if (data.ready === true) setReady(true);
        setSmartMode(true);
      } else {
        throw new Error((data as { error?: string } | null)?.error || error?.message || "interview_unavailable");
      }
    } catch {
      // Offline-safe fallback: the chat never dead-ends even if the gateway is down.
      const turn = nextInterviewTurn(ownerTexts(next), businessName, businessType);
      appendAssistant(turn.assistant_message);
      setSummary(turn.summary);
      if (turn.ready) setReady(true);
      setSmartMode(false);
    } finally {
      setSending(false);
      setAgentState(ready ? "waiting" : "watching");
    }
  }

  function markSteps(updater: (s: BuildStep[]) => BuildStep[]) {
    setBuildSteps((prev) => updater(prev));
  }

  function setStepStatus(id: string, status: BuildStep["status"], evidence?: string) {
    markSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, evidence: evidence ?? s.evidence } : s)));
  }

  async function handlePlan() {
    if (phase === "planning" || phase === "building" || messages.length === 0) return;
    setPhase("planning");
    setAgentState("thinking");
    setPlayTraces([]);
    setBuildSteps([
      { id: "understand", label: "Understanding your description", status: "active" },
      { id: "design", label: "Designing your operator", status: "pending" },
      { id: "structure", label: "Structuring services, hours, and answers", status: "pending" },
    ]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        navigate("/auth");
        return;
      }

      // One placeholder receptionist per run — created at plan time, not per message.
      if (!receptionistIdRef.current) {
        const { data: rec, error: recErr } = await supabase
          .from("receptionists")
          .insert({
            user_id: user.id,
            name: "Setting up...",
            business_name: businessName || "Setting up...",
            business_type: businessType || "General Business",
            tone: "friendly",
          })
          .select("id")
          .single();
        if (recErr || !rec) throw new Error("Failed to create receptionist");
        receptionistIdRef.current = (rec as { id: string }).id;
      }
      const recId = receptionistIdRef.current;

      // Phase B: deterministic problem-type detection over the full
      // transcript — covers both the gateway interview and the offline
      // fallback. Stamped into the description (planner reads it) and the
      // body (edge stamps it onto the config for derivation + Phase C).
      const detectedType = detectProblemType(transcriptOf(messages), businessType);
      const description = [
        businessName ? `Business name: ${businessName}.` : "",
        businessType ? `Business type: ${businessType}.` : "",
        detectedType ? `Interview detected problem type: ${detectedType}.` : "",
        summary ? `Interview summary: ${summary}.` : "",
        "Full discussion:",
        transcriptOf(messages),
      ].filter(Boolean).join("\n");

      setStepStatus("understand", "done", `You shared ${substantiveCount} message${substantiveCount === 1 ? "" : "s"} → Discussion captured → Ready to design`);
      setStepStatus("design", "active");

      const { data, error } = await invokePlanFn(
        "propose-operator-plan",
        { description, receptionist_id: recId, user_id: user.id, ...(detectedType ? { problem_type: detectedType } : {}) },
        () => {
          setStepStatus("design", "active", "Live call timed out → Continuing in background — I'll pick it up automatically");
          appendAssistant("Taking longer than usual — I'm working on your plan in the background and will bring it here the moment it's ready. Nothing for you to do.");
        },
      );
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string; plan?: { full_text?: string }; config?: Record<string, unknown>; version_id?: string };
      if (!d?.ok) throw new Error(d?.error || "Failed to generate plan");

      const config = (d.config || {}) as Record<string, unknown>;
      { const t = parseTrace(d, "Plan"); setPlayTraces(t ? [t] : []); }
      // Surface fallback: if the planner predates ui_plan (not yet deployed),
      // derive the dashboard surface locally from the config so the preview
      // Dashboard tab and approval still work. Never overrides a real ui_plan.
      if (!config.ui_plan || typeof config.ui_plan !== "object") {
        const profile = surfaceProfileFromConfig(config);
        const local = uiPlanForProfile(profile);
        config.ui_plan = {
          show: local.show,
          hide: local.hide,
          modules_on: [],
          connectors_needed: [],
          retention_on: [],
          widget_pieces: widgetPiecesFromConfig(config),
        };
      }
      setStepStatus("design", "done", `Plan drafted → You review before anything goes live`);
      setStepStatus("structure", "active");

      // Candidate services pulled from the discussion (Suggested — removable before approval).
      let candidates: PreviewService[] = [];
      try {
        const parsed = await supabase.functions.invoke("parse-services", {
          body: { text: transcriptOf(messages).slice(0, 4000), businessType: businessType || undefined },
        });
        const items = ((parsed.data as { items?: unknown[] } | null)?.items || []) as Array<Record<string, unknown>>;
        candidates = items.slice(0, 12).map((it) => ({
          name: typeof it.name === "string" ? it.name : "Untitled item",
          type: it.type === "product" ? "product" : "service",
          duration_minutes: typeof it.duration_minutes === "number" ? it.duration_minutes : 0,
          price: typeof it.price === "number" ? it.price : null,
          description: typeof it.description === "string" ? it.description : "",
        }));
      } catch {
        candidates = [];
      }

      setServices(candidates);
      setFaqs(deriveFaqs(config, summary));
      setPlanData({
        planText: d.plan?.full_text || "",
        config,
        versionId: d.version_id || "",
        receptionistId: recId,
      });
      setStepStatus("structure", "done", `${candidates.length} item${candidates.length === 1 ? "" : "s"} found → Hours mapped → Answers prepared`);
      setPhase("preview");
      setMobileTab("build");
      setAgentState("approval");
      appendAssistant("Your operator plan is ready on the right. Review it — remove anything that doesn't belong — then approve to make it live.");
    } catch (err) {
      console.error("Plan error:", err);
      // Gateway planner unreachable: fall back to an honest offline draft
      // instead of dead-ending. It is conservative, clearly labelled, and
      // goes through the same approval review as an AI plan.
      try {
        const local = buildLocalPlan(ownerTexts(messages), businessName, businessType);
        setServices([]);
        setFaqs(deriveFaqs(local.config, summary));
        setPlayTraces([offlineDraftTrace(substantiveCount)]);
        // recId is only set when the placeholder receptionist was created;
        // without it there is nothing to approve onto, so rethrow.
        if (!receptionistIdRef.current) throw err;
        setPlanData({ planText: local.planText, config: local.config, versionId: "", receptionistId: receptionistIdRef.current });
        setStepStatus("design", "done", "AI planner unreachable → Offline draft prepared");
        setStepStatus("structure", "done", "Review carefully → Approve only what is right");
        setPhase("preview");
        setMobileTab("build");
        setAgentState("approval");
        appendAssistant("The AI planner is unreachable right now, so I prepared a careful offline draft on the right. It only switches on what you actually mentioned. Review it — approve only what is right, and we can regenerate the full plan anytime.");
      } catch {
        toast.error(err instanceof Error ? err.message : "Failed to generate plan");
        setPhase("chat");
        // Attention is transient — flag it, then settle back to listening so the
        // pill never gets stuck on "Needs attention" across the whole thread.
        setAgentState("error");
        setTimeout(() => setAgentState("watching"), 4000);
      }
    }
  }

  async function handleApprove(feedback?: string) {
    if (!planData || approving) return;
    setApproving(true);
    setPhase("building");
    setAgentState("acting");
    const config = planData.config;
    const hours = Array.isArray(config.hours) ? (config.hours as Array<Record<string, unknown>>) : [];
    const timezone = typeof config.timezone === "string" && config.timezone ? config.timezone : "Africa/Lagos";

    setBuildSteps([
      { id: "apply", label: "Applying your approved plan", status: "active" },
      { id: "services", label: services.length > 0 ? `Saving ${services.length} service${services.length === 1 ? "" : "s"}` : "Checking offerings", status: "pending" },
      { id: "hours", label: "Setting opening hours", status: "pending" },
      { id: "answers", label: "Preparing helpful answers", status: "pending" },
      { id: "brain", label: "Writing operator instructions", status: "pending" },
      { id: "live", label: "Making your operator live", status: "pending" },
    ]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Please log in first");
      const recId = planData.receptionistId;

      const { data: approveData, error: approveErr } = await supabase.functions.invoke("approve-operator-plan", {
        body: {
          version_id: planData.versionId,
          receptionist_id: recId,
          user_id: user.id,
          config,
          plan_text: planData.planText,
          owner_feedback: feedback,
        },
      });
      if (approveErr) throw approveErr;
      if (!(approveData as { ok?: boolean })?.ok) throw new Error((approveData as { error?: string })?.error || "Failed to apply plan");
      { const t = parseTrace(approveData, "Approval"); if (t) setPlayTraces((prev) => [...prev, t]); }
      setStepStatus("apply", "done", "Plan approved → Business profile live → Details still to come");

      // Services (same shape as the step-by-step wizard — no invented columns).
      if (services.length > 0) {
        const toInsert = services.map((s) => ({
          receptionist_id: recId,
          user_id: user.id,
          name: s.name,
          duration_minutes: s.type === "service" ? s.duration_minutes : 0,
          description: s.description || null,
          price: s.price,
          active: true,
        }));
        const { error } = await supabase.from("services").insert(toInsert);
        if (error) throw error;
        const hasServices = services.some((s) => s.type === "service");
        const hasProducts = services.some((s) => s.type === "product");
        await supabase
          .from("receptionists")
          .update({ business_model: hasServices && hasProducts ? "both" : hasProducts ? "products" : hasServices ? "services" : "internal" })
          .eq("id", recId);
      }
      setStepStatus("services", "done", services.length > 0
        ? `${services.length} item${services.length === 1 ? "" : "s"} saved → Bookable in chat`
        : "No fixed offerings needed → Knowledge-first operator");

      // Hours + timezone propagation (wizard Step 3 pattern).
      if (hours.length > 0) {
        const rules = hours
          .filter((h) => typeof h.day_of_week === "number")
          .map((h) => ({
            receptionist_id: recId,
            day_of_week: h.day_of_week as number,
            start_time: typeof h.start_time === "string" ? h.start_time : "09:00",
            end_time: typeof h.end_time === "string" ? h.end_time : "17:00",
            timezone,
          }));
        if (rules.length > 0) {
          const { error } = await supabase.from("availability_rules").insert(rules);
          if (error) throw error;
        }
        await supabase.from("receptionists").update({ timezone }).eq("id", recId);
        await supabase.from("profiles").update({ timezone }).eq("id", user.id);
      }
      setStepStatus("hours", "done", hours.length > 0
        ? `${hours.length} day${hours.length === 1 ? "" : "s"} set → Correct slots in ${timezone}`
        : "No fixed hours needed → Always-on helper");

      // Answers (wizard Step 4 pattern — min 3).
      const faqRows = faqs.slice(0, 5).map((f, i) => ({
        receptionist_id: recId,
        question: f.question,
        answer: f.answer,
        priority: i,
      }));
      if (faqRows.length >= 3) {
        const { error } = await supabase.from("receptionist_faqs").insert(faqRows);
        if (error) throw error;
      }
      setStepStatus("answers", "done", `${faqRows.length} answers saved → Instant replies from day one`);

      // Operator instructions: system prompt + knowledge base (Gemini-direct helpers).
      const { data: rec } = await supabase.from("receptionists").select("*").eq("id", recId).maybeSingle();
      if (rec) {
        try {
          const sp = await supabase.functions.invoke("generate-system-prompt", { body: { receptionistData: rec } });
          const promptText = (sp.data as { system_prompt?: string } | null)?.system_prompt;
          if (promptText) await supabase.from("receptionists").update({ system_prompt: promptText }).eq("id", recId);
        } catch (e) {
          console.warn("System prompt generation failed (non-fatal):", e);
        }
        try {
          const kb = await supabase.functions.invoke("generate-knowledge-base", { body: { receptionistData: rec } });
          const kbText = (kb.data as { knowledge_base?: string } | null)?.knowledge_base;
          if (kbText) await supabase.from("receptionists").update({ knowledge_base: kbText }).eq("id", recId);
        } catch (e) {
          console.warn("Knowledge base generation failed (non-fatal):", e);
        }
      }
      setStepStatus("brain", "done", "Instructions written → Consistent tone and memory");

      await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
      recordSignal("configured_operator", { path: "conversational", receptionist_id: recId });
      setStepStatus("live", "done", "Operator live → Opening your builder");
      setPhase("done");
      setAgentState("completed");
      toast.success("Your AI operator is live!");
      setTimeout(() => navigate(`/builder/${recId}`), 1800);
    } catch (err) {
      console.error("Approval error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to apply plan");
      setPhase("preview");
      setAgentState("approval");
    } finally {
      setApproving(false);
    }
  }

  async function handleAdjust(feedback: string) {
    if (!planData || !feedback) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await invokePlanFn(
        "request-change",
        {
          change_request: `Original discussion summary: "${summary}". The owner wants this adjustment: "${feedback}". Regenerate the plan with this change.`,
          receptionist_id: planData.receptionistId,
          user_id: user.id,
        },
        () => {
          appendAssistant("This change needs a little longer — working in the background, I'll update the plan here automatically.");
        },
      );
      if (error) throw error;
      const d = data as { ok?: boolean; error?: string; config?: Record<string, unknown>; plan?: { full_text?: string }; version_id?: string };
      if (!d?.ok) throw new Error(d?.error || "Failed to update plan");
      const config = (d.config || planData.config) as Record<string, unknown>;
      setPlanData({ ...planData, config, planText: d.plan?.full_text || planData.planText, versionId: d.version_id || planData.versionId });
      { const t = parseTrace(d, "Adjustment"); if (t) setPlayTraces((prev) => [...prev, t]); }
      setFaqs(deriveFaqs(config, summary));
      appendAssistant("Plan updated with your change. Review the right side again when ready.");
      toast.success("Plan updated with your feedback");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update plan");
    } finally {
      setSending(false);
    }
  }

  const phaseLabel = phase === "chat" ? 1 : phase === "planning" || phase === "preview" ? 2 : 3;

  const chatPanel = (
    <div className="glass-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
      <ScrollArea className="min-h-0 flex-1 px-4 py-4 sm:px-5" aria-live="polite">
        <div className="space-y-4">
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              role={m.role}
              content={m.content}
              timestamp={m.at}
              agentState={m.role === "assistant" ? agentState : undefined}
            />
          ))}
          {sending && <ChatMessage role="assistant" content="" typing agentState="thinking" />}
          {sending && thinkingLong && (
            <p className="type-caption animate-enter px-11 motion-reduce:animate-none" role="status">
              Still thinking — working through the details, nearly there…
            </p>
          )}
          {phase === "planning" && (
            <div className="animate-enter motion-reduce:animate-none">
              <BuildProgress steps={buildSteps} title="Understanding your business" />
            </div>
          )}
          {ready && phase === "chat" && !ctaDismissed && (
            <div className="animate-enter rounded-2xl border border-primary/25 bg-primary/5 p-4 motion-reduce:animate-none" role="group" aria-label="Ready to plan">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                I have enough to design your operator
              </p>
              <p className="type-caption mt-1">
                You shared {substantiveCount} message{substantiveCount === 1 ? "" : "s"} → I design the plan → you review before anything goes live.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="flex-1 pressable" onClick={handlePlan}>
                  Plan my operator
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCtaDismissed(true)}>
                  Keep chatting
                </Button>
              </div>
            </div>
          )}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </ScrollArea>

      {phase === "chat" && (
        <div className="shrink-0 border-t border-border/60 bg-card/60 p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <VoiceInputButton
              onTranscript={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))}
              disabled={sending}
            />
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Describe your business… (Enter to send)"
              className="min-h-[56px] resize-none"
              aria-label="Message the setup assistant"
            />
            <Button
              size="icon"
              className="h-11 w-11 shrink-0 pressable"
              disabled={!input.trim() || sending}
              onClick={handleSend}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <p className="type-metadata">The mic dictates into the box — review before sending.</p>
            {substantiveCount >= 3 && (ctaDismissed || !ready) && (
              <button
                type="button"
                onClick={handlePlan}
                className="type-metadata font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Plan my operator now
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const previewPanel = planData && (
    <div className="glass-2 min-h-0 flex-1 overflow-hidden rounded-2xl p-3 sm:p-4">
      <div className="h-full min-h-0 space-y-3 overflow-y-auto">
        <BuildPlayground traces={playTraces} />
        {phase === "building" || phase === "done" ? (
          <div className="space-y-4">
            <BuildProgress steps={buildSteps} title={phase === "done" ? "Your operator is live" : "Building your AI operator"} />
            {phase === "done" && (
              <div className="animate-scale-in rounded-2xl border border-border bg-card p-6 text-center motion-reduce:animate-none">
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Check className="h-6 w-6 text-primary" aria-hidden="true" />
                </span>
                <p className="type-section">Your AI operator is live</p>
                <p className="type-caption mt-1">Opening your builder for a test run…</p>
              </div>
            )}
          </div>
        ) : (
          <OperatorPreview
            businessName={businessName}
            businessType={businessType}
            config={planData.config}
            services={services}
            faqs={faqs}
            willDo={configStrings(planData.config, "will_do")}
            wontDo={configStrings(planData.config, "wont_do")}
            externalNeeds={configStrings(planData.config, "external_needs")}
            externalSolutions={configSolutions(planData.config)}
            approving={approving}
            onRemoveService={(i) => setServices((prev) => prev.filter((_, x) => x !== i))}
            onApprove={handleApprove}
            onAdjust={handleAdjust}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
        {/* Header — what matters, what you can do, what is happening */}
        <header className="flex flex-wrap items-center gap-3 animate-fade-in motion-reduce:animate-none">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Go back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-contact" aria-hidden="true">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="type-page truncate">Build your AI operator</h1>
            <p className="type-caption">
              {smartMode || messages.length <= 1
                ? "Talk it through — watch the operator take shape beside the chat."
                : "Guided mode — quick structured questions while smart replies reconnect. Nothing you share is lost."}
            </p>
          </div>
          <ol className="flex items-center gap-1.5" aria-label={`Setup progress: step ${phaseLabel} of 3`}>
            {["Chat", "Plan", "Live"].map((label, i) => (
              <li
                key={label}
                aria-current={phaseLabel === i + 1 ? "step" : undefined}
                className={
                  phaseLabel > i + 1
                    ? "flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                    : phaseLabel === i + 1
                      ? "flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                      : "flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                }
              >
                {phaseLabel > i + 1 && <Check className="h-3 w-3" aria-hidden="true" />}
                {label}
              </li>
            ))}
          </ol>
        </header>

        {/* Body — single chat until the plan exists, then a smooth split */}
        {!showSplit ? (
          <main className="flex min-h-0 flex-1 flex-col" aria-label="Setup conversation">
            {chatPanel}
          </main>
        ) : (
          <>
            {/* Mobile: stacked tabs (thumb-friendly, progressive disclosure) */}
            <div className="flex min-h-0 flex-1 flex-col lg:hidden">
              <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as "chat" | "build")} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="grid w-full shrink-0 grid-cols-2" aria-label="Setup views">
                  <TabsTrigger value="chat">Conversation</TabsTrigger>
                  <TabsTrigger value="build">Operator build</TabsTrigger>
                </TabsList>
                <TabsContent value="chat" className="mt-3 flex min-h-0 flex-1 flex-col">
                  {chatPanel}
                </TabsContent>
                <TabsContent value="build" className="mt-3 flex min-h-0 flex-1 flex-col">
                  {previewPanel}
                </TabsContent>
              </Tabs>
            </div>

            {/* Desktop: resizable split — chat left, built structure right */}
            <main className="hidden min-h-0 flex-1 lg:block" aria-label="Setup conversation and operator build">
              <ResizablePanelGroup direction="horizontal" className="min-h-[560px] gap-3">
                <ResizablePanel defaultSize={44} minSize={32} className="flex min-h-0 flex-col">
                  {chatPanel}
                </ResizablePanel>
                <ResizableHandle withHandle aria-label="Resize conversation and preview" />
                <ResizablePanel defaultSize={56} minSize={36} className="flex min-h-0 flex-col">
                  <div key="preview-enter" className="flex min-h-0 flex-1 flex-col animate-panel motion-reduce:animate-none">
                    {previewPanel}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
