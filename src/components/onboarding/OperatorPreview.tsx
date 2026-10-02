import { useState } from "react";
import {
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  CircleAlert,
  Clock,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Plug,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface PreviewService {
  name: string;
  type: "service" | "product";
  duration_minutes: number;
  price: number | null;
  description: string;
}

export interface PreviewFaq {
  question: string;
  answer: string;
}

interface OperatorPreviewProps {
  businessName: string;
  businessType: string;
  config: Record<string, unknown>;
  services: PreviewService[];
  faqs: PreviewFaq[];
  willDo: string[];
  wontDo: string[];
  externalNeeds: string[];
  approving: boolean;
  onRemoveService: (index: number) => void;
  onApprove: (feedback?: string) => void;
  onAdjust: (feedback: string) => void;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function approvalPill(kind: "suggested" | "approval") {
  return kind === "suggested" ? (
    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-800">
      Suggested
    </Badge>
  ) : (
    <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-800">
      <CircleAlert className="mr-1 h-3 w-3" aria-hidden="true" />
      Requires approval
    </Badge>
  );
}

/**
 * The built operator structure — the right side of the split.
 * Solid content surfaces (no glass-in-glass); the panel owns Glass 2.
 * One screen, one hierarchy: what was understood → what will go live → decision.
 */
export function OperatorPreview({
  businessName,
  businessType,
  config,
  services,
  faqs,
  willDo,
  wontDo,
  externalNeeds,
  approving,
  onRemoveService,
  onApprove,
  onAdjust,
}: OperatorPreviewProps) {
  const [feedback, setFeedback] = useState("");
  const business = (config.business || {}) as Record<string, unknown>;
  const contact = (config.contact || {}) as Record<string, unknown>;
  const capabilities = (config.capabilities || {}) as Record<string, boolean>;
  const policies = (config.policies || {}) as Record<string, unknown>;
  const channels = (config.channels || {}) as Record<string, boolean>;
  const hours = Array.isArray(config.hours) ? (config.hours as Array<Record<string, unknown>>) : [];
  const knowledge = str(config.knowledge_base);
  const timezone = str(config.timezone) || "Africa/Lagos";

  const displayName = str(business.display_name) || businessName || "Your business";
  const tone = str(business.tone) || "friendly";
  const greeting = str(business.greeting_message);

  const canDo: string[] = [];
  const cannotDo: string[] = [];
  if (capabilities.books_appointments) canDo.push("Book appointments");
  else cannotDo.push("Book appointments");
  if (capabilities.sells_products || capabilities.offers_services) canDo.push("Present services and products");
  else cannotDo.push("Present services and products");
  if (capabilities.delivers) canDo.push("Arrange delivery");
  if (capabilities.supports_emergency) canDo.push("Handle urgent requests");
  if (capabilities.deposit_required) canDo.push("Collect deposits");
  cannotDo.push("Refund money", "Change prices");

  const activeChannels = Object.entries(channels)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const hoursByDay = new Map<number, { start: string; end: string }>();
  for (const h of hours) {
    if (typeof h.day_of_week === "number") {
      hoursByDay.set(h.day_of_week, { start: str(h.start_time), end: str(h.end_time) });
    }
  }

  // Dashboard surface the plan proposes (Stage 3 ui_plan). Missing plan ->
  // tab hidden: older plans without a surface show everything by default.
  const uiPlan = (config.ui_plan || {}) as {
    show?: Array<{ key?: unknown; why?: unknown }>;
    hide?: Array<{ key?: unknown; why?: unknown }>;
    modules_on?: Array<{ key?: unknown; why?: unknown }>;
    connectors_needed?: Array<{ key?: unknown; why?: unknown }>;
    retention_on?: Array<{ key?: unknown; why?: unknown }>;
  };
  const planItems = (list: Array<{ key?: unknown; why?: unknown }> | undefined) =>
    (list || [])
      .filter((x) => typeof x?.key === "string" && x.key)
      .map((x) => ({ key: x.key as string, why: typeof x.why === "string" ? x.why : "" }));
  const surfaceShow = planItems(uiPlan.show);
  const surfaceHide = planItems(uiPlan.hide);
  const surfaceModules = planItems(uiPlan.modules_on);
  const surfaceConnectors = planItems(uiPlan.connectors_needed);
  const surfaceRetention = planItems(uiPlan.retention_on);
  const hasSurface = surfaceShow.length > 0 || surfaceHide.length > 0;

  return (
    <div className="flex h-full flex-col gap-4" aria-label="Your AI operator preview">
      {/* Header — identity + decision state */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-contact sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-contact" aria-hidden="true">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="type-metadata">AI OPERATOR · DRAFT</p>
            <h2 className="type-section truncate">{displayName}</h2>
            <p className="type-caption mt-0.5">
              {[businessType || str(business.business_type), tone && `${tone} tone`, timezone].filter(Boolean).join(" · ")}
            </p>
          </div>
          {approvalPill("approval")}
        </div>
        {greeting && (
          <blockquote className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed">
            “{greeting}”
          </blockquote>
        )}
      </div>

      {/* Honest boundaries — what it will/won't do, what needs connecting */}
      {(willDo.length > 0 || wontDo.length > 0 || externalNeeds.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="type-label mb-2">An honest picture before you approve</p>
          {willDo.length > 0 && (
            <ul className="space-y-1.5">
              {willDo.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 finance-positive" aria-hidden="true" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          {wontDo.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {wontDo.map((w) => (
                <li key={w} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]" aria-hidden="true">×</span>
                  {w} — not on its own
                </li>
              ))}
            </ul>
          )}
          {externalNeeds.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <Plug className="h-3.5 w-3.5" aria-hidden="true" />
                Needs a connection later {approvalPill("suggested")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {externalNeeds.map((n) => (
                  <Badge key={n} variant="outline">{n}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Structure */}
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className={hasSurface ? "grid w-full shrink-0 grid-cols-5" : "grid w-full shrink-0 grid-cols-4"} aria-label="Operator structure">
          <TabsTrigger value="overview" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Overview</span>
            <span className="sm:hidden">Info</span>
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Services</span>
            <span className="sm:hidden">Items</span>
            <span className="tnum type-metadata" aria-label={`${services.length} items`}>{services.length}</span>
          </TabsTrigger>
          <TabsTrigger value="hours" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Hours
          </TabsTrigger>
          <TabsTrigger value="answers" className="gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            Answers
          </TabsTrigger>
          {hasSurface && (
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Pages</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-3 space-y-3 overflow-y-auto">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="type-label mb-2">What this operator can do</p>
            <ul className="space-y-1.5">
              {canDo.map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 shrink-0 finance-positive" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
            <p className="type-label mb-2 mt-4">What it will never do without you</p>
            <ul className="space-y-1.5">
              {cannotDo.map((c) => (
                <li key={c} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]" aria-hidden="true">×</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="type-label mb-2">Channels and policies</p>
            <div className="flex flex-wrap gap-1.5">
              {activeChannels.length > 0 ? (
                activeChannels.map((c) => (
                  <Badge key={c} variant="secondary" className="capitalize">{c}</Badge>
                ))
              ) : (
                <span className="type-caption">Chat widget</span>
              )}
              {typeof policies.cancellation_notice_hours === "number" && (
                <Badge variant="outline">{policies.cancellation_notice_hours}h cancellation notice</Badge>
              )}
              {policies.same_day_booking === true && <Badge variant="outline">Same-day booking</Badge>}
              {policies.walk_ins === true && <Badge variant="outline">Walk-ins welcome</Badge>}
            </div>
            {(str(contact.phone) || str(contact.address)) && (
              <p className="type-caption mt-2">
                {[str(contact.phone), str(contact.address)].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {knowledge && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="type-label mb-1.5">What it knows about your business</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{knowledge.slice(0, 420)}{knowledge.length > 420 ? "…" : ""}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="services" className="mt-3 space-y-2 overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="type-caption">Pulled from your description. Remove anything that does not belong.</p>
            {approvalPill("suggested")}
          </div>
          {services.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <p className="type-label">No services detected yet</p>
              <p className="type-caption mt-1">Mention what you sell in the chat and they will appear here for review.</p>
            </div>
          ) : (
            services.map((s, i) => (
              <div key={`${s.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="type-metadata capitalize">
                    {s.type}
                    {s.type === "service" && s.duration_minutes > 0 && ` · ${s.duration_minutes} min`}
                  </p>
                </div>
                {s.price != null ? (
                  <span className="tnum text-sm font-semibold">₦{s.price.toLocaleString()}</span>
                ) : (
                  <span className="type-metadata">Price on request</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label={`Remove ${s.name}`}
                  onClick={() => onRemoveService(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="hours" className="mt-3 space-y-2 overflow-y-auto">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            <p className="type-caption tnum">{timezone}</p>
          </div>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const h = hoursByDay.get(d);
            return (
              <div key={d} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                <span className="text-sm font-medium">{DAY_NAMES[d]}</span>
                {h ? (
                  <span className="tnum text-sm">{h.start} – {h.end}</span>
                ) : (
                  <span className="type-metadata">Closed</span>
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="answers" className="mt-3 overflow-y-auto">
          <Accordion type="multiple" defaultValue={["faq-0"]} className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="rounded-xl border border-border bg-card px-3">
                <AccordionTrigger className="py-2.5 text-left text-sm">{f.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          <p className="type-caption mt-2">
            Full answering instructions are written when you approve — tailored to your tone and policies.
          </p>
        </TabsContent>

        {hasSurface && (
          <TabsContent value="dashboard" className="mt-3 space-y-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="type-caption">The exact pages your dashboard will show after approval.</p>
              {approvalPill("suggested")}
            </div>
            {surfaceShow.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="type-label mb-2">Included pages</p>
                <ul className="space-y-1.5">
                  {surfaceShow.map((p) => (
                    <li key={p.key} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 finance-positive" aria-hidden="true" />
                      <span><span className="font-medium">{p.key}</span>{p.why ? <span className="text-muted-foreground"> — {p.why}</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {surfaceHide.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="type-label mb-2">Hidden to keep things simple</p>
                <ul className="space-y-1.5">
                  {surfaceHide.map((p) => (
                    <li key={p.key} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]" aria-hidden="true">×</span>
                      <span><span className="font-medium">{p.key}</span>{p.why ? ` — ${p.why}` : null}</span>
                    </li>
                  ))}
                </ul>
                <p className="type-caption mt-2">Ask in the chat to bring any of these back before approving.</p>
              </div>
            )}
            {surfaceModules.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="type-label mb-2">Working behind the scenes</p>
                <div className="flex flex-wrap gap-1.5">
                  {surfaceModules.map((m) => (
                    <Badge key={m.key} variant="secondary" title={m.why}>{m.key}</Badge>
                  ))}
                </div>
              </div>
            )}
            {surfaceRetention.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="type-label mb-2">Keeping customers coming back</p>
                <div className="flex flex-wrap gap-1.5">
                  {surfaceRetention.map((r) => (
                    <Badge key={r.key} variant="secondary" title={r.why}>{r.key}</Badge>
                  ))}
                </div>
              </div>
            )}
            {surfaceConnectors.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="type-label mb-2">Worth connecting later</p>
                <div className="flex flex-wrap gap-1.5">
                  {surfaceConnectors.map((c) => (
                    <Badge key={c.key} variant="outline" title={c.why}>{c.key}</Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Decision — approval-first, human in control */}
      <div className={cn("shrink-0 rounded-2xl border border-border bg-card p-3 shadow-contact sm:p-4")}>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          placeholder="Ask for a change first (e.g. “we close Sundays” or “add delivery”)…"
          className="mb-2 resize-none"
          aria-label="Request a change to the plan"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 pressable"
            disabled={approving || !feedback.trim()}
            onClick={() => onAdjust(feedback.trim())}
          >
            Adjust plan
          </Button>
          <Button
            className="flex-1 pressable"
            disabled={approving}
            onClick={() => onApprove(feedback.trim() || undefined)}
          >
            {approving ? (
              "Applying…"
            ) : (
              <>
                <BadgeCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Approve & build
              </>
            )}
          </Button>
        </div>
        <p className="type-metadata mt-2 text-center">You can change everything later in the builder. Nothing is final.</p>
      </div>
    </div>
  );
}
