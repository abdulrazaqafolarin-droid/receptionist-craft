import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, User, Bot, Clock, Search, X, RefreshCw, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { FloatingBackground } from "@/components/FloatingBackground";

interface Conversation {
  id: string;
  user_message: string;
  bot_message: string;
  created_at: string;
  direction: string | null;
  receptionists?: { name: string; business_name: string };
}

interface ReceptionistSummary {
  id: string;
  name: string;
  business_name: string;
}

export default function Conversations() {
  const { toast } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [receptionists, setReceptionists] = useState<ReceptionistSummary[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadReceptionists();
    fetchConversations();
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [selectedReceptionist]);

  useEffect(() => {
    applyFilters();
  }, [conversations, searchTerm, startDate, endDate]);

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
        .limit(100);

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

  const applyFilters = () => {
    let filtered = [...conversations];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(conv =>
        conv.user_message.toLowerCase().includes(search) ||
        conv.bot_message.toLowerCase().includes(search)
      );
    }

    if (startDate) {
      filtered = filtered.filter(conv => 
        new Date(conv.created_at) >= new Date(startDate)
      );
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(conv => 
        new Date(conv.created_at) <= end
      );
    }

    setFilteredConversations(filtered);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStartDate("");
    setEndDate("");
  };

  const exportToCSV = () => {
    const headers = ["Date", "Customer Message", "AI Response", "Direction"];
    const rows = filteredConversations.map(conv => [
      new Date(conv.created_at).toLocaleString(),
      conv.user_message,
      conv.bot_message,
      conv.direction || ""
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast({ title: "Success", description: "Conversations exported" });
  };

  const hasActiveFilters = searchTerm || startDate || endDate;

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        <Card className="glass-2">
          <div className="p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-bold">Conversation History</h1>
                    <p className="text-muted-foreground">
                      {filteredConversations.length} of {conversations.length} conversations
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
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
                  <Button onClick={exportToCSV} variant="outline" size="sm" className="h-10">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button onClick={fetchConversations} variant="outline" size="sm" disabled={loading} className="h-10">
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search messages..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="h-10 flex-1"
                    />
                    {hasActiveFilters && (
                      <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10">
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-5 glass-1">
                    <Skeleton className="h-4 w-3/4 mb-3" />
                    <Skeleton className="h-4 w-full" />
                  </Card>
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-16">
                <div className="h-20 w-20 rounded-3xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {hasActiveFilters ? "No matching conversations" : "No conversations yet"}
                </h3>
                <p className="text-muted-foreground">
                  {hasActiveFilters 
                    ? "Try adjusting your search or date filters" 
                    : "Conversations with your AI receptionist will appear here"
                  }
                </p>
                {hasActiveFilters && (
                  <Button variant="outline" onClick={clearFilters} className="mt-4">
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredConversations.map((conv: Conversation) => (
                  <Card key={conv.id} className="p-5 glass-1 card-hover">
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