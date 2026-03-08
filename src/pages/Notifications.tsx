import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  CheckCircle, 
  Calendar,
  CalendarX,
  Clock,
  XCircle,
  Lightbulb,
  Zap
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  body: string | null;
  severity: string;
  read: boolean;
  created_at: string;
  metadata: any;
  receptionist_id: string | null;
}

const iconMap: Record<string, any> = {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  Calendar,
  CalendarX,
  Clock,
  XCircle,
  Lightbulb,
  Zap,
};

const getNotificationIcon = (type: string) => {
  const typeMap: Record<string, string> = {
    "quality.low": "AlertTriangle",
    "quality.flagged": "AlertCircle",
    "kb.suggestion": "Lightbulb",
    "appointment.created": "Calendar",
    "appointment.cancelled": "CalendarX",
    "appointment.reminder": "Clock",
    "system.error": "XCircle",
    "system.warning": "AlertTriangle",
    "system.ok": "CheckCircle",
    "test": "Zap",
  };
  return iconMap[typeMap[type] || "Info"];
};

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "text-red-500",
    warning: "text-yellow-500",
    info: "text-blue-500",
  };
  return colors[severity] || "text-muted-foreground";
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "critical" | "warning">("all");

  useEffect(() => {
    loadNotifications();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
    
    // Setup realtime listener
    const channel = supabase
      .channel("notifications-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => [newNotif, ...prev]);
          toast.info("New notification received");
          
          // Show browser notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification(newNotif.title, {
              body: newNotif.message || newNotif.body || '',
              icon: '/favicon.ico',
              badge: '/favicon.ico',
              tag: newNotif.id,
              requireInteraction: newNotif.severity === 'critical',
            });
            
            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      toast.error("Failed to load notifications");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      toast.success("Marked as read");
    } catch (error) {
      toast.error("Failed to mark as read");
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success("All notifications marked as read");
    } catch (error) {
      toast.error("Failed to mark all as read");
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "critical") return n.severity === "critical";
    if (filter === "warning") return n.severity === "warning";
    return true;
  });

  const groupedBySeverity = {
    critical: filteredNotifications.filter((n) => n.severity === "critical"),
    warning: filteredNotifications.filter((n) => n.severity === "warning"),
    info: filteredNotifications.filter((n) => n.severity === "info"),
  };

  return (
    <div className="min-h-screen bg-background">
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <h1 className="text-3xl font-bold">Notifications</h1>
          </div>
          <Button onClick={markAllAsRead} variant="outline">
            Mark All as Read
          </Button>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
            <TabsTrigger value="unread">
              Unread ({notifications.filter((n) => !n.read).length})
            </TabsTrigger>
            <TabsTrigger value="critical">
              Critical ({groupedBySeverity.critical.length})
            </TabsTrigger>
            <TabsTrigger value="warning">
              Warning ({groupedBySeverity.warning.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="text-center py-12">Loading notifications...</div>
        ) : filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Info className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No notifications to display</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredNotifications.map((notification) => {
              const Icon = getNotificationIcon(notification.type);
              return (
                <Card
                  key={notification.id}
                  className={`transition-all ${!notification.read ? "border-primary" : ""}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 mt-1 ${getSeverityColor(notification.severity)}`} />
                        <div>
                          <CardTitle className="text-base">{notification.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {notification.message || notification.body}
                          </CardDescription>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant={notification.severity === "critical" ? "destructive" : "outline"}>
                              {notification.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(notification.created_at).toLocaleString()}
                            </span>
                          </div>
                          {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-xs text-muted-foreground cursor-pointer">
                                Show details
                              </summary>
                              <pre className="text-xs bg-muted p-2 rounded mt-2 overflow-auto">
                                {JSON.stringify(notification.metadata, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                      {!notification.read && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markAsRead(notification.id)}
                        >
                          Mark as Read
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
