import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare, User, Bot, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface Conversation {
  id: string;
  user_message: string;
  bot_message: string;
  created_at: string;
  direction: string | null;
}

export default function Conversations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReceptionists();
    fetchConversations();
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [selectedReceptionist]);

  const loadReceptionists = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id);

    setReceptionists(data || []);
  };

  const fetchConversations = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('conversations')
        .select('*, receptionists(name, business_name)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (selectedReceptionist !== "all") {
        query = query.eq('receptionist_id', selectedReceptionist);
      }

      const { data, error } = await query;

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6 hover:bg-primary/5">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <Card className="border-2 border-border/50 shadow-xl">
          <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl lg:text-3xl font-bold">Conversation History</h1>
                  <p className="text-muted-foreground">View all receptionist conversations</p>
                </div>
              </div>
              
              {receptionists.length > 0 && (
                <select 
                  className="px-4 py-2.5 border-2 border-border rounded-xl bg-background text-sm font-medium focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  value={selectedReceptionist} 
                  onChange={(e) => setSelectedReceptionist(e.target.value)}
                >
                  <option value="all">All Receptionists</option>
                  {receptionists.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} - {r.business_name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-5 border-2 border-border/50">
                    <Skeleton className="h-4 w-3/4 mb-3" />
                    <Skeleton className="h-4 w-full" />
                  </Card>
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No conversations yet</h3>
                <p className="text-muted-foreground">Conversations with your AI receptionist will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {conversations.map((conv: any) => (
                  <Card key={conv.id} className="p-5 border-2 border-border/50 hover:border-primary/20 hover:shadow-lg transition-all">
                    <div className="space-y-4">
                      {conv.receptionists && (
                        <div className="flex items-center gap-2 pb-3 border-b border-border">
                          <Badge variant="secondary" className="text-xs font-medium">
                            {conv.receptionists.name} - {conv.receptionists.business_name}
                          </Badge>
                        </div>
                      )}
                      
                      {/* Customer message */}
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-primary block mb-1">Customer</span>
                          <p className="text-sm text-foreground leading-relaxed">{conv.user_message}</p>
                        </div>
                      </div>
                      
                      {/* Bot response */}
                      <div className="flex items-start gap-3">
                        <div className="h-8 w-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4 text-secondary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-secondary block mb-1">AI Receptionist</span>
                          <p className="text-sm text-foreground leading-relaxed">{conv.bot_message}</p>
                        </div>
                      </div>
                      
                      {/* Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(conv.created_at).toLocaleString()}
                        </div>
                        {conv.direction && (
                          <Badge variant="outline" className="text-xs">
                            {conv.direction}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
