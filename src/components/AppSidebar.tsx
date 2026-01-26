import { BarChart, Home, Calendar, MessageSquare, Settings, HelpCircle, ClipboardCheck, Lightbulb, Activity, Bell, Radio, Clock, Briefcase, MessageCircleQuestion, ShoppingBag } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import rutexLogo from "@/assets/rutex-logo.jpg";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Analytics", url: "/analytics", icon: BarChart },
  { title: "Conversations", url: "/conversations", icon: MessageSquare },
  { title: "Orders & Appointments", url: "/appointments", icon: Calendar },
  { title: "Products & Services", url: "/services", icon: Briefcase },
  { title: "Availability", url: "/availability", icon: Clock },
  { title: "FAQs", url: "/faqs", icon: MessageCircleQuestion },
  { title: "Quality Review", url: "/quality-review", icon: ClipboardCheck },
  { title: "KB Suggestions", url: "/kb-rewrite", icon: Lightbulb },
  { title: "Diagnostics", url: "/diagnostics", icon: Activity },
  { title: "Notifications", url: "/notifications", icon: Bell },
  { title: "Realtime Logs", url: "/realtime-logs", icon: Radio },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Help", url: "/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar 
      className={cn(
        "border-r border-sidebar-border bg-sidebar-background",
        state === "collapsed" ? "w-16" : "w-64"
      )} 
      collapsible="icon"
    >
      <SidebarContent className="py-4">
        {/* Logo Section */}
        {state !== "collapsed" && (
          <div className="px-4 mb-6">
            <button 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity touch-target w-full text-left"
              onClick={() => navigate("/dashboard")}
              aria-label="Go to dashboard"
            >
              <img 
                src={rutexLogo} 
                alt="Rutex Logo" 
                className="h-10 w-10 rounded-xl shadow-md object-cover"
              />
              <span className="text-lg font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                Rutex
              </span>
            </button>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-4 mb-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1 px-2" role="navigation" aria-label="Main menu">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    className={cn(
                      "w-full rounded-lg transition-all duration-200 hover:bg-sidebar-accent group touch-target",
                      isActive(item.url) 
                        ? "bg-gradient-to-r from-primary/10 to-primary/5 text-primary font-medium border-l-2 border-primary" 
                        : "text-sidebar-foreground hover:text-primary"
                    )}
                    aria-current={isActive(item.url) ? "page" : undefined}
                    aria-label={item.title}
                  >
                    <item.icon 
                      className={cn(
                        "h-4 w-4 transition-colors flex-shrink-0",
                        isActive(item.url) ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                      )} 
                      aria-hidden="true"
                    />
                    {state !== "collapsed" && (
                      <span className="ml-3 text-sm truncate">{item.title}</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
