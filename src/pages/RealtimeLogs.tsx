import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface NotificationLog {
  id: string;
  type: string;
  title: string;
  message: string;
  body: string | null;
  severity: string;
  category: string | null;
  metadata: any;
  created_at: string;
  receptionist_id: string | null;
  read: boolean;
}

export default function RealtimeLogs() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setItems(data || []);
      toast.success("Logs refreshed");
    } catch (error: any) {
      toast.error("Failed to load logs");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();

    const channel = supabase
      .channel("realtime-notifications-admin")
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "notifications" 
        },
        (payload) => {
          console.log("Realtime notification:", payload);
          if (payload.eventType === "INSERT") {
            setItems((prev) => [payload.new as NotificationLog, ...prev]);
            setLiveCount((c) => c + 1);
            toast.info("New notification received");
          } else if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((item) =>
                item.id === payload.new.id ? (payload.new as NotificationLog) : item
              )
            );
          } else if (payload.eventType === "DELETE") {
            setItems((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "destructive";
      case "warning":
        return "outline";
      case "info":
      default:
        return "secondary";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Realtime Notification Logs</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Live updates • {items.length} total logs {liveCount > 0 && `• ${liveCount} new`}
              </p>
            </div>
          </div>
          <Button onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="space-y-3">
          {loading && items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">Loading logs...</p>
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No notifications yet</p>
              </CardContent>
            </Card>
          ) : (
            items.map((n) => (
              <Card key={n.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {n.title}
                        <Badge variant={getSeverityColor(n.severity)}>
                          {n.severity}
                        </Badge>
                        {n.category && (
                          <Badge variant="outline">{n.category}</Badge>
                        )}
                        {!n.read && (
                          <Badge variant="default">Unread</Badge>
                        )}
                      </CardTitle>
                      <div className="text-sm text-muted-foreground mt-1">
                        {n.type} • {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm mb-2">{n.message || n.body}</p>
                  {n.metadata && Object.keys(n.metadata).length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        View metadata
                      </summary>
                      <pre className="text-xs mt-2 p-3 bg-muted rounded-md overflow-auto max-h-48">
                        {JSON.stringify(n.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
