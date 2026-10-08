import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Calendar, CalendarDays, BarChart3, Plus, Phone, CheckCircle2, Sparkles, ArrowRight, Zap, DollarSign, ShoppingBag, LayoutDashboard, Bot, TrendingUp, TrendingDown, Users, Target, ChevronUp, ChevronDown, Package, ListChecks, AlertTriangle, Terminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatingBackground } from "@/components/FloatingBackground";
import { RevenueEngine } from "@/components/RevenueEngine";
import { DashboardCharts } from "@/components/DashboardCharts";
import { OwnerChat } from "@/components/OwnerChat";
import { ConversationalManagement } from "@/components/ConversationalManagement";
import { SpotlightCard } from "@/components/SpotlightCard";
import { toast } from "sonner";
import { useActiveOperatorStore } from "@/store/activeOperator";
import { isRouteVisible, visiblePagesFromCapabilities } from "@/lib/operatorSurface";
import { GuidedActivity } from "@/components/GuidedActivity";
import { DirectorBuddy } from "@/components/DirectorBuddy";
import { DirectorPanel } from "@/components/DirectorPanel";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; business_name: string; active: boolean; mock_mode?: boolean; ai_mode?: string; business_model?: string; capabilities?: unknown }>>([]);
  // Active operator is global (sidebar + route gates follow it). Dashboard
  // owns selection: picking here switches the whole dashboard surface.
  const selectedReceptionistId = useActiveOperatorStore((s) => s.receptionistId);
  const visiblePages = useActiveOperatorStore((s) => s.visiblePages);
  const setActive = useActiveOperatorStore((s) => s.setActive);
  // Stable id list: a fresh array every render retriggers every chart
  // fetch loop downstream (the dashboard "shaking"). Memoize on the rows.
  const chartReceptionistIds = useMemo(() => receptionists.map((r) => r.id), [receptionists]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [stats, setStats] = useState({
    conversations: 0,
    appointments: 0,
    orders: 0,
    activeReceptionists: 0,
  });
  // Attention numbers: what needs the owner NOW (not all-time museum
  // stats). Degrades to zeros on any failure — never breaks the page.
  const [attention, setAttention] = useState({
    upcomingBookings: 0,
    openEscalations: 0,
    stockNeeds: 0,
  });
  const [showOperatorDetail, setShowOperatorDetail] = useState(false);

  // The active operator's shape drives the whole page: a pharmacy sees
  // stock and tasks, a salon sees bookings — never each other's numbers.
  const activeRow = receptionists.find((r) => r.id === selectedReceptionistId);
  const activeKind = (() => {
    const caps = ((activeRow?.capabilities || {}) as Record<string, unknown>);
    if (caps.operator_kind === "ops" || caps.operator_kind === "assistant" || caps.operator_kind === "both") {
      return caps.operator_kind as string;
    }
    if ((activeRow as { business_model?: string } | undefined)?.business_model === "internal") return "ops";
    return "receptionist";
  })();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (dataLoaded && receptionists.length === 0 && user) {
      navigate("/onboarding");
    }
  }, [dataLoaded, receptionists, user, navigate]);

  useEffect(() => {
    if (receptionists.length > 0 && !selectedReceptionistId) {
      const first = receptionists[0];
      setActive(first.id, first.business_name || first.name, visiblePagesFromCapabilities(first.capabilities));
    } else if (receptionists.length > 0 && selectedReceptionistId) {
      // Refresh the surface in case approval updated it since selection.
      const current = receptionists.find((r) => r.id === selectedReceptionistId);
      if (current) setActive(current.id, current.business_name || current.name, visiblePagesFromCapabilities(current.capabilities));
    }
  }, [receptionists, selectedReceptionistId, setActive]);

  useEffect(() => {
    if (selectedReceptionistId) loadAttention(selectedReceptionistId);
  }, [selectedReceptionistId]);

  const dayStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const loadAttention = async (id: string) => {
    try {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const [apptRes, escRes, stockRes] = await Promise.all([
        supabase.from("appointments").select("*", { count: "exact", head: true }).eq("receptionist_id", id).gte("start_time", midnight.toISOString()),
        supabase.from("escalations").select("*", { count: "exact", head: true }).eq("receptionist_id", id).is("resolved_at", null),
        supabase.from("services").select("stock_quantity,low_stock_threshold,expiry_date").eq("receptionist_id", id).eq("active", true).not("stock_quantity", "is", null),
      ]);
      // Stock math runs client-side (small catalog): out, low, expired, or
      // expiring within 30 days all count as "needs you".
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 30);
      const horizonStr = dayStr(horizon);
      let stockNeeds = 0;
      // Generated DB types predate the expiry_date migration — cast
      // through unknown rather than touching the never-edit types file.
      const rows = ((stockRes.data || []) as unknown) as Array<{ stock_quantity: number | null; low_stock_threshold: number | null; expiry_date: string | null }>;
      for (const row of rows) {
        const qty = row.stock_quantity ?? 0;
        const threshold = row.low_stock_threshold ?? 5;
        if (qty <= 0 || qty <= threshold) { stockNeeds++; continue; }
        if (row.expiry_date && row.expiry_date <= horizonStr) stockNeeds++;
      }
      setAttention((a) => ({ ...a, upcomingBookings: apptRes.count || 0, openEscalations: escRes.count || 0, stockNeeds }));
    } catch {
      // Attention degrades silently — the dashboard stays up with zeros.
    }
  };

  // Director presence: working while background jobs run, needs-you on
  // failures or open attention items, idle otherwise. Real rows only.
  const [directorJobs, setDirectorJobs] = useState({ active: 0, failed: 0 });
  const [directorOpen, setDirectorOpen] = useState(false);
  useEffect(() => {
    if (!user || receptionists.length === 0) return;
    (async () => {
      try {
        const ids = receptionists.map((r) => r.id);
        // Generated DB types lag behind migrations (never-edit file).
        const table = (supabase.from as unknown as (t: string) => {
          select(s: string): {
            in(c: string, v: string[]): Promise<{ data: unknown }>;
          };
        })("plan_jobs");
        const { data } = await table.select("status").in("receptionist_id", ids);
        const rows = ((data || []) as unknown) as Array<{ status: string }>;
        setDirectorJobs({
          active: rows.filter((r) => r.status === "queued" || r.status === "running").length,
          failed: rows.filter((r) => r.status === "failed").length,
        });
      } catch {
        // buddy falls back to attention numbers alone
      }
    })();
  }, [user, receptionists]);
  // Tasks + shifts live in capabilities (already in memory — no query).
  // overdue/due-today compare yyyy-mm-dd strings: chronological, no TZ lies.
  const opsCounts = (() => {
    const caps = ((activeRow?.capabilities || {}) as Record<string, unknown>);
    const tasks = (Array.isArray(caps.ops_tasks) ? caps.ops_tasks : []) as Array<{ due?: string; done?: boolean }>;
    const shifts = (Array.isArray(caps.ops_shifts) ? caps.ops_shifts : []) as unknown[];
    const today = dayStr(new Date());
    return {
      overdue: tasks.filter((t) => !t.done && t.due && t.due < today).length,
      dueToday: tasks.filter((t) => !t.done && t.due === today).length,
      shifts: shifts.length,
    };
  })();

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (!user) {
      setDataLoaded(true);
      return;
    }

    const { data: recs } = await supabase
      .from("receptionists")
      .select("*")
      .eq("user_id", user.id);

    setReceptionists((recs || []) as Array<{ id: string; name: string; business_name: string; active: boolean; mock_mode?: boolean; ai_mode?: string; capabilities?: unknown }>);

    if (recs && recs.length > 0) {
      const receptionistIds = recs.map(r => r.id);

      const [convRes, apptRes, ordersRes] = await Promise.all([
        supabase.from("conversations").select("*", { count: "exact", head: true }).in("receptionist_id", receptionistIds),
        supabase.from("appointments").select("*", { count: "exact", head: true }).in("receptionist_id", receptionistIds),
        supabase.from("orders").select("*", { count: "exact", head: true }).in("receptionist_id", receptionistIds),
      ]);

      setStats({
        conversations: convRes.count || 0,
        appointments: apptRes.count || 0,
        orders: ordersRes.count || 0,
        activeReceptionists: recs.filter(r => r.active).length,
      });
    }

    setDataLoaded(true);
  };

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="default" />
      {/* Owner Chat Sidebar - Persistent on Dashboard */}
      <OwnerChat />
      <main id="main-content" className="relative z-10 container mx-auto px-4 pt-16 pb-6 sm:pt-20 sm:pb-8 lg:py-12">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <h1 className="type-display mb-2 text-foreground">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">AI operators for your business — customers served, shop work handled</p>
          </div>
          <Button
            onClick={() => navigate("/onboarding?returning=1")}
            size="lg"
            className="group touch-target w-full sm:w-auto"
            aria-label="Create a new AI operator"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" aria-hidden="true" /> 
            Create Operator
          </Button>
        </header>

        {/* Getting Started Guide */}
        {receptionists.length === 0 && (
          <section
            className="mb-8 sm:mb-10 glass-1 overflow-hidden relative rounded-xl p-6 sm:p-8"
            aria-labelledby="getting-started-title"
          >
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary flex items-center justify-center shadow-contact">
                  <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="getting-started-title" className="text-xl sm:text-2xl font-bold">Getting Started</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">Follow these steps to set up your AI operator</p>
                </div>
              </div>
              <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4" role="list">
                {[
                  { num: 1, title: "Create Operator", desc: "Describe your business problem" },
                  { num: 2, title: "Add Services", desc: "Define your offerings" },
                  { num: 3, title: "Set Availability", desc: "Configure business hours" },
                  { num: 4, title: "Test AI Chat", desc: "Chat with your AI" },
                  { num: 5, title: "View Calendar", desc: "See all appointments" },
                ].map((step, idx) => (
                  <li 
                    key={step.num} 
                    className="group p-3 sm:p-4 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 mb-2">
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-primary text-primary-foreground font-bold flex items-center justify-center text-xs sm:text-sm shadow-contact" aria-hidden="true">
                        {step.num}
                      </div>
                      <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold text-xs sm:text-sm mb-1">{step.title}</h3>
                    <p className="text-xs text-muted-foreground hidden sm:block">{step.desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}


        {/* Director — the face lives here now. Tap it for the briefing. */}
        {receptionists.length > 0 && selectedReceptionistId && (() => {
          const openItems = attention.upcomingBookings + attention.openEscalations + attention.stockNeeds + opsCounts.overdue;
          const state = directorJobs.failed > 0 || openItems > 0 ? "needs-you" : directorJobs.active > 0 ? "working" : "idle";
          const line = directorJobs.failed > 0
            ? `${directorJobs.failed} background job${directorJobs.failed === 1 ? "" : "s"} failed — tap in to see`
            : directorJobs.active > 0
              ? `${directorJobs.active} job${directorJobs.active === 1 ? "" : "s"} running in the background`
              : openItems > 0
                ? `${openItems} thing${openItems === 1 ? "" : "s"} need${openItems === 1 ? "s" : ""} you — tap in to see`
                : "Watching your operators.";
          return (
            <section className="mb-6 sm:mb-8" aria-label="Director">
              <Card className="glass-1">
                <CardContent className="p-4 sm:p-5">
                  <button onClick={() => setDirectorOpen(true)} aria-label="Open Director briefing" className="rounded-2xl text-left transition-transform active:scale-95">
                    <DirectorBuddy state={state as "idle" | "working" | "needs-you"} line={line} />
                  </button>
                </CardContent>
              </Card>
              <DirectorPanel open={directorOpen} onClose={() => setDirectorOpen(false)} userId={user?.id} />
            </section>
          );
        })()}

        {/* Recent guided activity — the permanent half of the cursor's work.
            Renders only when tours actually ran; no empty-state noise. */}
        <GuidedActivity userId={user?.id} />

        {/* AI Operator Centerpiece */}
        {receptionists.length > 0 && selectedReceptionistId && (
          <section className="mb-8" aria-label="Your AI Operator">
            <SpotlightCard className="glass-2 overflow-hidden rounded-[16px] border">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center shadow-contact">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Your AI Operator
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {receptionists.find(r => r.id === selectedReceptionistId)?.business_name || "Active"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={receptionists.find(r => r.id === selectedReceptionistId)?.active ? "default" : "secondary"} 
                      className={receptionists.find(r => r.id === selectedReceptionistId)?.active ? "bg-success" : ""}
                    >
                      {receptionists.find(r => r.id === selectedReceptionistId)?.active ? "Live" : "Paused"}
                    </Badge>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      Mode: {receptionists.find(r => r.id === selectedReceptionistId)?.ai_mode || 'booking'}
                    </Badge>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowOperatorDetail(!showOperatorDetail)}
                      className="gap-1"
                    >
                      {showOperatorDetail ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {showOperatorDetail ? "Hide Details" : "Manage Operator"}
                    </Button>
                    <Button 
                      onClick={() => navigate('/money-mode')} 
                      size="sm"
                      className="bg-amber-500 text-white hover:bg-amber-600"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Money Mode
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {/* Executive Summary Card */}
              <CardContent className="pb-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  {(activeKind === "ops"
                    ? [
                      { icon: Package, label: "Stock needs", value: attention.stockNeeds, sub: "low, out, expiring" },
                      { icon: ListChecks, label: "Overdue tasks", value: opsCounts.overdue, sub: "past due" },
                      { icon: ListChecks, label: "Due today", value: opsCounts.dueToday, sub: "on today's list" },
                      { icon: Users, label: "Shifts saved", value: opsCounts.shifts, sub: "on the roster" },
                    ]
                    : [
                      { icon: MessageCircle, label: "Conversations", value: stats.conversations, sub: "all time" },
                      { icon: Calendar, label: "Upcoming bookings", value: attention.upcomingBookings, sub: "scheduled" },
                      { icon: AlertTriangle, label: "Open escalations", value: attention.openEscalations, sub: "need a human" },
                      { icon: ShoppingBag, label: "Orders", value: stats.orders, sub: "all time" },
                    ]
                  ).map((card) => (
                    <div key={card.label} className="p-3 rounded-xl finance-surface">
                      <div className="flex items-center gap-2 mb-1">
                        <card.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                        <span className="text-xs font-medium visual-secondary">{card.label}</span>
                      </div>
                      <div className="text-2xl font-bold tnum visual-primary">{card.value}</div>
                      <div className="text-xs visual-tertiary">{card.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Conversational Management - Expanded */}
                {showOperatorDetail && (
                  <div className="border-t border-border/50 pt-4">
                    <ConversationalManagement receptionistId={selectedReceptionistId} />
                  </div>
                )}
              </CardContent>
            </SpotlightCard>
          </section>
        )}

        {/* Charts Section */}
        {receptionists.length > 0 && (
          <section className="mb-8 sm:mb-10" aria-label="Activity charts">
            <DashboardCharts receptionistIds={chartReceptionistIds} />
          </section>
        )}

        {/* Receptionists List */}
        <section aria-labelledby="receptionists-title">
          <Card className="mb-6 sm:mb-8">
            <CardHeader>
                <CardTitle id="receptionists-title" className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
                  Your Operators
                </CardTitle>
                <CardDescription>Manage your AI operators</CardDescription>
            </CardHeader>
            <CardContent>
              {receptionists.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
                    <Phone className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
                  </div>
                    <h3 className="text-base sm:text-lg font-semibold mb-2">No operators yet</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">Create your first AI operator to get started</p>
                    <Button
                      onClick={() => navigate("/onboarding?returning=1")}
                      className="touch-target"
                    >
                      <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create Your First Operator
                    </Button>
                </div>
              ) : (
                <ul className="space-y-3" role="list">
                  {receptionists.map((receptionist) => (
                    <li key={receptionist.id}>
                      <Card
                        className="card-hover group"
                      >
                        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 gap-4">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                              <Phone className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-base sm:text-lg truncate">{receptionist.name}</h3>
                              <p className="text-xs sm:text-sm text-muted-foreground truncate">{receptionist.business_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <Badge 
                              variant={receptionist.active ? "default" : "secondary"} 
                              className={receptionist.active ? "bg-success" : ""}
                            >
                              {receptionist.active ? "Active" : "Inactive"}
                            </Badge>
                            {receptionist.mock_mode && (
                              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                Demo Mode
                              </Badge>
                            )}
                            <Button 
                              onClick={() => navigate(`/builder/${receptionist.id}`)} 
                              size="sm"
                              className="touch-target"
                              aria-label={`Edit ${receptionist.name}`}
                            >
                              Edit
                            </Button>
                            {selectedReceptionistId === receptionist.id ? (
                              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                                Active
                              </Badge>
                            ) : (
                              <Button
                                onClick={() => {
                                  setActive(
                                    receptionist.id,
                                    receptionist.business_name || receptionist.name,
                                    visiblePagesFromCapabilities(receptionist.capabilities),
                                  );
                                  toast.success(`${receptionist.business_name || receptionist.name} is now active — dashboard updated.`);
                                }}
                                size="sm"
                                variant="outline"
                                className="touch-target"
                                aria-label={`Set ${receptionist.name} as active operator`}
                              >
                                Set active
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Quick Actions — filtered by the active operator's approved
            surface, so an ops owner never gets booking dead-ends. */}
        <section aria-label="Quick actions">
          <nav className="grid grid-cols-2 lg:grid-cols-7 gap-3 sm:gap-4 lg:gap-6">
            {[
              { title: "Money Mode", desc: "Revenue control center", icon: DollarSign, path: "/money-mode" },
              { title: "Conversations", desc: "View chat transcripts", icon: MessageCircle, path: "/conversations" },
              { title: "Calendar", desc: "Full schedule view", icon: CalendarDays, path: "/calendar" },
              { title: "Appointments", desc: "Manage bookings", icon: Calendar, path: "/appointments" },
              { title: "Orders", desc: "Manage orders", icon: ShoppingBag, path: "/orders" },
              { title: "Analytics", desc: "Performance insights", icon: BarChart3, path: "/analytics" },
              { title: "Quality Review", desc: "Improve AI responses", icon: CheckCircle2, path: "/quality-review" },
              { title: "Operator Console", desc: "Talk to your helper", icon: Terminal, path: "/console" },
            ].filter((item) => isRouteVisible(item.path, visiblePages)).map((item) => (
              <Card 
                key={item.path}
                className="cursor-pointer card-hover group focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                onClick={() => navigate(item.path)}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(item.path)}
                aria-label={`${item.title}: ${item.desc}`}
              >
                <CardHeader className="p-4 sm:p-6">
                  <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2 sm:mb-3 group-hover:bg-primary/20 transition-colors" aria-hidden="true">
                    <item.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <CardTitle className="text-sm sm:text-base">{item.title}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">{item.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </nav>
        </section>

        {/* Revenue Engine Section — only when the active operator moves
            money or bookings. An ops helper gets none of this. */}
        {(isRouteVisible("/appointments", visiblePages) || isRouteVisible("/orders", visiblePages)) && (
          <section className="mt-6 sm:mt-8" aria-labelledby="revenue-engine-title">
            <div className="mb-4">
              <h2 id="revenue-engine-title" className="sr-only">Revenue Engine</h2>
            </div>
            <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
              {/* Revenue Engine for first receptionist */}
              <RevenueEngine
                receptionistIds={receptionists[0]?.id ? [receptionists[0].id] : []}
                receptionistNames={receptionists[0]?.id ? { [receptionists[0].id]: receptionists[0].name } : {}}
                scopeLabel={receptionists[0]?.name}
                currentMode={receptionists[0]?.ai_mode || 'booking'}
              />

              {/* Setup Quick Actions */}
              <div className="space-y-4">
                {isRouteVisible("/services", visiblePages) && (
                <Card
                  className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-300 focus-within:ring-2 focus-within:ring-ring"
                  onClick={() => navigate("/services")}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate("/services")}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Plus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden="true" />
                      Manage Services
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Add and manage the services customers can book</CardDescription>
                  </CardHeader>
                </Card>
                )}

                {isRouteVisible("/availability", visiblePages) && (
                <Card
                  className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-300 focus-within:ring-2 focus-within:ring-ring"
                  onClick={() => navigate("/availability")}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && navigate("/availability")}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-primary" aria-hidden="true" />
                      Set Business Hours
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm">Configure when your AI can accept bookings</CardDescription>
                  </CardHeader>
                </Card>
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
