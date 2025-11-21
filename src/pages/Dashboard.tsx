import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Calendar, BarChart3, Plus, Phone, CheckCircle2 } from "lucide-react";
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

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);

    if (!user) return;

    // Load receptionists
    const { data: recs } = await supabase
      .from("receptionists")
      .select("*")
      .eq("user_id", user.id);

    setReceptionists(recs || []);

    // Load stats
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
    <div className="min-h-screen bg-background">
      <Navbar user={user} />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">Manage your AI receptionists and track performance</p>
          </div>
          <Button onClick={() => navigate("/onboarding")} size="lg">
            <Plus className="mr-2 h-4 w-4" /> Create Receptionist
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
              <MessageCircle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.conversations}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Appointments Booked</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.appointments}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Receptionists</CardTitle>
              <Phone className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.activeReceptionists}</div>
              <p className="text-xs text-muted-foreground">Ready to handle calls</p>
            </CardContent>
          </Card>
        </div>

        {/* Receptionists List */}
        <Card>
          <CardHeader>
            <CardTitle>Your Receptionists</CardTitle>
            <CardDescription>Manage and edit your AI receptionists</CardDescription>
          </CardHeader>
          <CardContent>
            {receptionists.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No receptionists yet</h3>
                <p className="text-muted-foreground mb-4">Create your first AI receptionist to get started</p>
              <Button onClick={() => navigate("/onboarding")}>
                <Plus className="mr-2 h-4 w-4" /> Create Your First Receptionist
              </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {receptionists.map((receptionist) => (
                  <Card key={receptionist.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="flex items-center justify-between p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                          <Phone className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{receptionist.name}</h3>
                          <p className="text-sm text-muted-foreground">{receptionist.business_name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={receptionist.active ? "default" : "secondary"}>
                          {receptionist.active ? "Active" : "Inactive"}
                        </Badge>
                        {receptionist.mock_mode && (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            Demo Mode
                          </Badge>
                        )}
                        <Button onClick={() => navigate(`/builder/${receptionist.id}`)}>
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
        <div className="grid md:grid-cols-4 gap-6 mt-8">
          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => navigate("/conversations")}>
            <CardHeader>
              <MessageCircle className="h-8 w-8 text-primary mb-2" />
              <CardTitle>View Conversations</CardTitle>
              <CardDescription>See all chat transcripts and interactions</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => navigate("/appointments")}>
            <CardHeader>
              <Calendar className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Manage Appointments</CardTitle>
              <CardDescription>View and manage booked appointments</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => navigate("/analytics")}>
            <CardHeader>
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Analytics Dashboard</CardTitle>
              <CardDescription>Comprehensive performance insights</CardDescription>
            </CardHeader>
          </Card>

          <Card className="cursor-pointer hover:shadow-lg transition-all" onClick={() => navigate("/quality-review")}>
            <CardHeader>
              <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Quality Review</CardTitle>
              <CardDescription>Review AI responses and improve quality</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </div>
  );
}
