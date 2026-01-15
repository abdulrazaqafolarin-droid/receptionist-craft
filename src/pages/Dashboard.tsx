import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Calendar, BarChart3, Plus, Phone, CheckCircle2, Sparkles, ArrowRight, Zap, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatingBackground } from "@/components/FloatingBackground";
import { RevenueEngine } from "@/components/RevenueEngine";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [stats, setStats] = useState({
    conversations: 0,
    appointments: 0,
    activeReceptionists: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (receptionists.length === 0 && user) {
      const timer = setTimeout(() => {
        navigate("/onboarding-wizard");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [receptionists, user, navigate]);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (!user) return;

    const { data: recs } = await supabase
      .from("receptionists")
      .select("*")
      .eq("user_id", user.id);

    setReceptionists(recs || []);

    if (recs && recs.length > 0) {
      const receptionistIds = recs.map(r => r.id);

      const { count: convCount } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .in("receptionist_id", receptionistIds);

      const { count: apptCount } = await supabase
        .from("appointments")
        .select("*", { count: "exact", head: true })
        .in("receptionist_id", receptionistIds);

      setStats({
        conversations: convCount || 0,
        appointments: apptCount || 0,
        activeReceptionists: recs.filter(r => r.active).length,
      });
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <FloatingBackground variant="default" />
      <main id="main-content" className="relative z-10 container mx-auto px-4 py-6 sm:py-8 lg:py-12">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-10 animate-fade-in">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-2 bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base lg:text-lg">Your AI-powered appointment booking system</p>
          </div>
          <Button 
            onClick={() => navigate("/onboarding-wizard")} 
            size="lg" 
            className="group bg-gradient-to-r from-primary to-primary-glow hover:shadow-elevated transition-all duration-300 touch-target w-full sm:w-auto"
            aria-label="Create a new AI receptionist"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" aria-hidden="true" /> 
            Create Receptionist
          </Button>
        </header>

        {/* Getting Started Guide */}
        {receptionists.length === 0 && (
          <section 
            className="mb-8 sm:mb-10 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card animate-scale-in overflow-hidden relative rounded-xl border p-6 sm:p-8"
            aria-labelledby="getting-started-title"
          >
            <div className="absolute top-0 right-0 w-48 sm:w-64 h-48 sm:h-64 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 w-32 sm:w-48 h-32 sm:h-48 bg-gradient-to-tr from-secondary/10 to-transparent rounded-full blur-2xl" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-elevated">
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
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold flex items-center justify-center text-xs sm:text-sm shadow-md" aria-hidden="true">
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

        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-8 sm:mb-10" aria-label="Statistics overview">
          {[
            { title: "Total Conversations", value: stats.conversations, icon: MessageCircle, desc: "All time", color: "from-primary to-primary-glow" },
            { title: "Appointments Booked", value: stats.appointments, icon: Calendar, desc: "All time", color: "from-success to-emerald-400" },
            { title: "Active Receptionists", value: stats.activeReceptionists, icon: Zap, desc: "Ready to serve", color: "from-warning to-amber-400" },
          ].map((stat, idx) => (
            <Card 
              key={stat.title} 
              className="group hover:shadow-elevated transition-all duration-300 hover:-translate-y-1 animate-fade-in overflow-hidden relative"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} aria-hidden="true" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`} aria-hidden="true">
                  <stat.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-1" aria-label={`${stat.value} ${stat.title.toLowerCase()}`}>{stat.value}</div>
                <p className="text-xs sm:text-sm text-muted-foreground">{stat.desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>

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
                    onClick={() => navigate("/onboarding-wizard")} 
                    className="bg-gradient-to-r from-primary to-primary-glow touch-target"
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Create Your First Receptionist
                  </Button>
                </div>
              ) : (
                <ul className="space-y-3" role="list">
                  {receptionists.map((receptionist) => (
                    <li key={receptionist.id}>
                      <Card 
                        className="hover:shadow-md hover:border-primary/20 transition-all duration-300 group"
                      >
                        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 gap-4">
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow flex-shrink-0" aria-hidden="true">
                              <Phone className="h-5 w-5 sm:h-6 sm:w-6 text-primary-foreground" />
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
          <nav className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {[
              { title: "Conversations", desc: "View chat transcripts", icon: MessageCircle, path: "/conversations" },
              { title: "Appointments", desc: "Calendar view", icon: Calendar, path: "/appointments" },
              { title: "Analytics", desc: "Performance insights", icon: BarChart3, path: "/analytics" },
              { title: "Quality Review", desc: "Improve AI responses", icon: CheckCircle2, path: "/quality-review" },
            ].map((item) => (
              <Card 
                key={item.path}
                className="cursor-pointer hover:shadow-elevated hover:-translate-y-1 transition-all duration-300 group focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
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
                receptionistId={receptionists[0]?.id} 
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
