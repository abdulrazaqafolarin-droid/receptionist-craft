import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

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
      
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <Card className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Conversation History</h1>
                <p className="text-muted-foreground">View all receptionist conversations</p>
              </div>
            </div>
            
            {receptionists.length > 0 && (
              <select 
                className="px-4 py-2 border rounded-md bg-background"
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
                <Card key={i} className="p-4">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </Card>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversations.map((conv: any) => (
                <Card key={conv.id} className="p-4 hover:bg-accent transition-colors">
                  <div className="space-y-3">
                    {conv.receptionists && (
                      <div className="flex items-center gap-2 pb-2 border-b">
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary">
                          {conv.receptionists.name} - {conv.receptionists.business_name}
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-primary">Customer:</span>
                      <p className="flex-1 text-sm">{conv.user_message}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-secondary">Receptionist:</span>
                      <p className="flex-1 text-sm">{conv.bot_message}</p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {new Date(conv.created_at).toLocaleString()}
                      </span>
                      {conv.direction && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                          {conv.direction}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
