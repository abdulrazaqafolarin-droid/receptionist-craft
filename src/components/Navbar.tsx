import { Button } from "@/components/ui/button";
import { User, LogOut, Settings, LayoutDashboard, HelpCircle, Bell, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import rutexLogo from "@/assets/rutex-logo.jpg";

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  body: string | null;
  read: boolean;
  created_at: string;
}

interface NavbarProps {
  user: {
    id: string;
    email?: string | null;
  } | null;
}

export const Navbar = ({ user }: NavbarProps) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    loadNotifications();

    const channel = supabase
      .channel("navbar-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotif = payload.new as NotificationRow;
          setNotifications((prev) => [newNotif, ...prev].slice(0, 20));
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedNotif = payload.new as NotificationRow;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
          );
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  };

  const markAsRead = async (id: string) => {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Error signing out");
      return;
    }
    toast.success("Signed out successfully");
    navigate("/auth");
  };

  return (
    <nav 
      className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <a 
            href="#main-content"
            className="skip-link"
          >
            Skip to main content
          </a>
          <button 
            className="flex items-center gap-2 sm:gap-3 cursor-pointer group touch-target"
            onClick={() => navigate(user ? "/dashboard" : "/")}
            aria-label="Go to home page"
          >
            <img 
              src={rutexLogo} 
              alt="Rutex Logo" 
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl shadow-md group-hover:shadow-elevated transition-all duration-300 object-cover"
            />
            <span className="text-lg sm:text-xl font-bold text-foreground">
              Rutex FrontDesk
            </span>
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              {/* Command palette trigger */}
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex items-center gap-2 text-muted-foreground hover:text-foreground touch-target"
                onClick={() => window.dispatchEvent(new CustomEvent("rutex:open-palette"))}
                aria-label="Open command palette"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span className="text-sm">Search</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                  ⌘K
                </kbd>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden touch-target"
                onClick={() => window.dispatchEvent(new CustomEvent("rutex:open-palette"))}
                aria-label="Open command palette"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </Button>
              {/* Notifications Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="relative hover:bg-primary/10 touch-target"
                    aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
                  >
                    <Bell className="h-5 w-5" aria-hidden="true" />
                    {unreadCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs animate-pulse"
                        aria-hidden="true"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 shadow-elevated">
                  <div className="flex items-center justify-between p-3 border-b">
                    <h3 className="font-semibold">Notifications</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate("/notifications")}
                      className="text-primary hover:text-primary"
                    >
                      View All
                    </Button>
                  </div>
                  <ScrollArea className="h-[400px]">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <Bell className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                            !notif.read ? "bg-primary/5" : ""
                          }`}
                          onClick={() => {
                            markAsRead(notif.id);
                            navigate("/notifications");
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-2 w-2 rounded-full mt-2 flex-shrink-0 ${!notif.read ? "bg-primary" : "bg-muted"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{notif.title}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {notif.message || notif.body}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(notif.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-10 w-10 rounded-full hover:ring-2 hover:ring-primary/20 transition-all touch-target"
                    aria-label="User menu"
                  >
                    <Avatar className="h-10 w-10 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                        {user.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 shadow-elevated">
                  <div className="flex items-center gap-3 p-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {user.email?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-medium truncate">{user.email}</p>
                      <p className="text-xs text-muted-foreground">Pro Plan</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/dashboard")} className="cursor-pointer">
                    <LayoutDashboard className="mr-2 h-4 w-4 text-muted-foreground" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/notifications")} className="cursor-pointer">
                    <Bell className="mr-2 h-4 w-4 text-muted-foreground" />
                    Notifications
                    {unreadCount > 0 && (
                      <Badge variant="destructive" className="ml-auto text-xs">
                        {unreadCount}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/help")} className="cursor-pointer">
                    <HelpCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                    Help
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                onClick={() => navigate("/auth")} 
                className="hover:bg-primary/10 touch-target hidden sm:inline-flex"
              >
                Sign In
              </Button>
              <Button 
                onClick={() => navigate("/auth")} 
                className="touch-target"
              >
                <span className="sm:hidden">Sign In</span>
                <span className="hidden sm:inline">Start Free</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};
