import { BarChart, Home, Calendar, MessageSquare, Settings, HelpCircle, ClipboardCheck, Lightbulb, Activity, Bell, Radio, Clock, Briefcase } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

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
  { title: "Appointments", url: "/appointments", icon: Calendar },
  { title: "Services", url: "/services", icon: Briefcase },
  { title: "Availability", url: "/availability", icon: Clock },
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
    <Sidebar className={state === "collapsed" ? "w-14" : "w-60"} collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    onClick={() => navigate(item.url)}
                    className={`hover:bg-muted/50 ${isActive(item.url) ? 'bg-muted text-primary font-medium' : ''}`}
                  >
                    <item.icon className="h-4 w-4" />
                    {state !== "collapsed" && <span>{item.title}</span>}
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
