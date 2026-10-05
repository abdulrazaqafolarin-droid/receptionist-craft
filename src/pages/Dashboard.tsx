import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Calendar, CalendarDays, BarChart3, Plus, Phone, CheckCircle2, Sparkles, ArrowRight, Zap, DollarSign, ShoppingBag, LayoutDashboard, Bot, TrendingUp, TrendingDown, Users, Target, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatingBackground } from "@/components/FloatingBackground";
import { RevenueEngine } from "@/components/RevenueEngine";
import { DashboardCharts } from "@/components/DashboardCharts";
import { SuccessSignalsCard } from "@/components/SuccessSignalsCard";
import { OwnerChat } from "@/components/OwnerChat";
import { ConversationalManagement } from "@/components/ConversationalManagement";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SpotlightCard } from "@/components/SpotlightCard";
import { toast } from "sonner";
import { useActiveOperatorStore } from "@/store/activeOperator";
import { visiblePagesFromCapabilities } from "@/lib/operatorSurface";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [receptionists, setReceptionists] = useState<Array<{ id: string; name: string; business_name: string; active: boolean; mock_mode?: boolean; ai_mode?: string; capabilities?: unknown }>>([]);
  // Active operator is global (sidebar + route gates follow it). Dashboard
  // owns selection: picking here switches the whole dashboard surface.
  const selectedReceptionistId = useActiveOperatorStore((s) => s.receptionistId);
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
  const [showOperatorDetail, setShowOperatorDetail] = useState(false);

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
      <main id="main-content" className="relative z-10 container mx-auto px-4 py-6 sm:py-8 lg:py-12">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-10 animate-fade-in">
          <div>
            <h1 className="type-display mb-2 text-foreground">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">Your AI-powered appointment booking system</p>
            <p className="text-[10px] text-muted-foreground/80 mt-1">Build {import.meta.env.VITE_APP_BUILD_SHA || "unknown"}</p>
          </div>
          <Button
            onClick={() => navigate("/onboarding?returning=1")}
            size="lg"
            className="group touch-target w-full sm:w-auto"
            aria-label="Create a new AI receptionist"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" aria-hidden="true" /> 
            Create Receptionist
          </Button>
        </header>

        {/* Getting Started Guide */}
        {receptionists.length === 0 && (
          <section
            className="mb-8 sm:mb-10 glass-1 animate-scale-in overflow-hidden relative rounded-xl p-6 sm:p-8"
            aria-labelledby="getting-started-title"
          >
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-primary flex items-center justify-center shadow-contact">
                  <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="getting-started-title" className="text-xl sm:text-2xl font-bold">Getting Started</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">Follow these steps to set up your AI receptionist</p>
                </div>
              </div>
              <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4" role="list">
                {[
                  { num: 1, title: "Create Receptionist", desc: "Set up name, business details" },
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


        {receptionists.length > 0 && (
          <section className="mb-6 animate-fade-in" aria-label="Revenue control center">
            <Card className="glass-1">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <DollarSign className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    Money Mode & Revenue Engine
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Open the dedicated workspace to control AI mode, threshold, and conversion performance.
                  </p>
                </div>
                <Button onClick={() => navigate('/money-mode')} className="bg-amber-500 text-white hover:bg-amber-600">
                  Open Money Mode
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* AI Operator Centerpiece */}
        {receptionists.length > 0 && selectedReceptionistId && (
          <section className="mb-8 animate-fade-in" aria-label="Your AI Operator">
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
                  <div className="p-3 rounded-xl finance-surface">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 finance-positive" />
                      <span className="text-xs font-medium visual-secondary">Revenue This Week</span>
                    </div>
                    <div className="text-2xl font-bold tnum visual-primary">$0</div>
                    <div className="text-xs visual-tertiary">vs last week</div>
                  </div>
                  <div className="p-3 rounded-xl finance-surface">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-warning" />
                      <span className="text-xs font-medium visual-secondary">Missed Opportunities</span>
                    </div>
                    <div className="text-2xl font-bold tnum visual-primary">0</div>
                    <div className="text-xs visual-tertiary">Ghosted quotes</div>
                  </div>
                  <div className="p-3 rounded-xl finance-surface">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium visual-secondary">AI Conversion</span>
                    </div>
                    <div className="text-2xl font-bold tnum visual-primary">0%</div>
                    <div className="text-xs visual-tertiary">Chat to booking</div>
                  </div>
                  <div className="p-3 rounded-xl finance-surface">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-4 w-4 visual-secondary" />
                      <span className="text-xs font-medium visual-secondary">Team Utilization</span>
                    </div>
                    <div className="text-2xl font-bold tnum visual-primary">0%</div>
                    <div className="text-xs visual-tertiary">Staff capacity</div>
                  </div>
                </div>

                {/* Conversational Management - Expanded */}
                {showOperatorDetail && (
                  <div className="border-t border-border/50 pt-4 animate-enter">
                    <ConversationalManagement receptionistId={selectedReceptionistId} />
                  </div>
                )}
              </CardContent>
            </SpotlightCard>
          </section>
        )}

        {/* Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-8 sm:mb-10" aria-label="Statistics overview">
          {[
            { title: "Total Conversations", value: stats.conversations, icon: MessageCircle, desc: "All time" },
            { title: "Appointments Booked", value: stats.appointments, icon: Calendar, desc: "All time" },
            { title: "Orders", value: stats.orders, icon: ShoppingBag, desc: "All time" },
            { title: "Active Receptionists", value: stats.activeReceptionists, icon: Zap, desc: "Ready to serve" },
          ].map((stat, idx) => (
            <Card
              key={stat.title}
              className="group card-hover animate-fade-in overflow-hidden relative"
              style={{ animationDelay: `${idx * 80}ms` }}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className="h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
                  <stat.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1" aria-label={`${stat.value} ${stat.title.toLowerCase()}`}>
                  <NumberTicker value={stat.value} />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">{stat.desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Success Signals */}
        <section className="mb-8 sm:mb-10 animate-fade-in" aria-label="Success signals">
          <SuccessSignalsCard />
        </section>

        {/* Charts Section */}
        {receptionists.length > 0 && (
          <section className="mb-8 sm:mb-10 animate-fade-in" aria-label="Activity charts">
            <DashboardCharts receptionistIds={chartReceptionistIds} />
          </section>
        )}

        {/* Receptionists List */}
        <section aria-labelledby="receptionists-title">
          <Card className="mb-6 sm:mb-8">
            <CardHeader>
              <CardTitle id="receptionists-title" className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
                Your Receptionists
              </CardTitle>
              <CardDescription>Manage and edit your AI receptionists</CardDescription>
            </CardHeader>
            <CardContent>
              {receptionists.length === 0 ? (
                <div className="text-center py-8 sm:py-12">
                  <div className="h-14 w-14 sm:h-16 sm:w-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
                    <Phone className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2">No receptionists yet</h3>
                  <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6">Create your first AI receptionist to get started</p>
                  <Button
                    onClick={() => navigate("/onboarding?returning=1")}
                    className="touch-target"
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create Your First Receptionist
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

        {/* Quick Actions */}
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
            ].map((item) => (
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

        {/* Revenue Engine Section */}
        {receptionists.length > 0 && (
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
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
