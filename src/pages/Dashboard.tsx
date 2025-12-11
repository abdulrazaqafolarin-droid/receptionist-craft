import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Calendar, BarChart3, Plus, Phone, CheckCircle2, Sparkles, ArrowRight, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/20">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-10 animate-fade-in">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-2 bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">Your AI-powered appointment booking system</p>
          </div>
          <Button 
            onClick={() => navigate("/onboarding-wizard")} 
            size="lg" 
            className="group bg-gradient-to-r from-primary to-primary-glow hover:shadow-elevated transition-all duration-300"
          >
            <Plus className="mr-2 h-5 w-5 group-hover:rotate-90 transition-transform" /> 
            Create Receptionist
          </Button>
        </div>

        {/* Getting Started Guide */}
        {receptionists.length === 0 && (
          <Card className="mb-10 border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card animate-scale-in overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-secondary/10 to-transparent rounded-full blur-2xl" />
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-3 text-2xl">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-elevated">
                  <Sparkles className="h-6 w-6 text-primary-foreground" />
                </div>
                Getting Started
              </CardTitle>
              <CardDescription className="text-base">Follow these steps to set up your AI receptionist</CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { num: 1, title: "Create Receptionist", desc: "Set up name, business details" },
                  { num: 2, title: "Add Services", desc: "Define your offerings" },
                  { num: 3, title: "Set Availability", desc: "Configure business hours" },
                  { num: 4, title: "Test AI Chat", desc: "Chat with your AI" },
                  { num: 5, title: "View Calendar", desc: "See all appointments" },
                ].map((step, idx) => (
                  <div 
                    key={step.num} 
                    className="group p-4 rounded-xl bg-card/50 border border-border/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground font-bold flex items-center justify-center text-sm shadow-md">
                        {step.num}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <h4 className="font-semibold text-sm mb-1">{step.title}</h4>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-10">
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
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-5 transition-opacity`} />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold mb-1">{stat.value}</div>
                <p className="text-sm text-muted-foreground">{stat.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Receptionists List */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Your Receptionists
            </CardTitle>
            <CardDescription>Manage and edit your AI receptionists</CardDescription>
          </CardHeader>
          <CardContent>
            {receptionists.length === 0 ? (
              <div className="text-center py-12">
                <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Phone className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No receptionists yet</h3>
                <p className="text-muted-foreground mb-6">Create your first AI receptionist to get started</p>
                <Button onClick={() => navigate("/onboarding-wizard")} className="bg-gradient-to-r from-primary to-primary-glow">
                  <Plus className="mr-2 h-4 w-4" /> Create Your First Receptionist
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {receptionists.map((receptionist) => (
                  <Card 
                    key={receptionist.id} 
                    className="hover:shadow-md hover:border-primary/20 transition-all duration-300 group"
                  >
                    <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-6 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                          <Phone className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{receptionist.name}</h3>
                          <p className="text-sm text-muted-foreground">{receptionist.business_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant={receptionist.active ? "default" : "secondary"} className={receptionist.active ? "bg-success" : ""}>
                          {receptionist.active ? "Active" : "Inactive"}
                        </Badge>
                        {receptionist.mock_mode && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            Demo Mode
                          </Badge>
                        )}
                        <Button onClick={() => navigate(`/builder/${receptionist.id}`)} size="sm">
                          Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {[
            { title: "Conversations", desc: "View chat transcripts", icon: MessageCircle, path: "/conversations" },
            { title: "Appointments", desc: "Calendar view", icon: Calendar, path: "/appointments" },
            { title: "Analytics", desc: "Performance insights", icon: BarChart3, path: "/analytics" },
            { title: "Quality Review", desc: "Improve AI responses", icon: CheckCircle2, path: "/quality-review" },
          ].map((item) => (
            <Card 
              key={item.path}
              className="cursor-pointer hover:shadow-elevated hover:-translate-y-1 transition-all duration-300 group"
              onClick={() => navigate(item.path)}
            >
              <CardHeader className="p-4 sm:p-6">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">{item.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        {/* Setup Quick Actions */}
        {receptionists.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6 mt-8">
            <Card 
              className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-300" 
              onClick={() => navigate("/services")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Plus className="h-5 w-5 text-primary" />
                  Manage Services
                </CardTitle>
                <CardDescription>Add and manage the services customers can book</CardDescription>
              </CardHeader>
            </Card>
            
            <Card 
              className="cursor-pointer hover:shadow-lg hover:border-primary/20 transition-all duration-300" 
              onClick={() => navigate("/availability")}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5 text-primary" />
                  Set Business Hours
                </CardTitle>
                <CardDescription>Configure when your AI can accept bookings</CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
