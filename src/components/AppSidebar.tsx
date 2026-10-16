import { useState } from "react";
import { BarChart, Home, Calendar, CalendarDays, MessageSquare, Settings, HelpCircle, ClipboardCheck, Lightbulb, Activity, Bell, Radio, Briefcase, MessageCircleQuestion, Building2, Plug, DollarSign, Users, UserCog, AlertTriangle, CreditCard, GitBranch, ChevronDown, Puzzle, Clock, Terminal, Bot } from "lucide-react";
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

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useMemo } from "react";
import { useActiveOperatorStore } from "@/store/activeOperator";
import { isRouteVisible } from "@/lib/operatorSurface";

const groups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: Home },
      { title: "Analytics", url: "/analytics", icon: BarChart },
      { title: "Money Mode", url: "/money-mode", icon: DollarSign },
    ],
  },
  {
    label: "Your Operator",
    items: [
      { title: "Operator Management", url: "/operator-management", icon: GitBranch },
      { title: "Products & Services", url: "/services", icon: Briefcase },
      { title: "Availability", url: "/availability", icon: Clock },
      { title: "Staff", url: "/staff", icon: UserCog },
      { title: "FAQs", url: "/faqs", icon: MessageCircleQuestion },
      { title: "Operator Console", url: "/console", icon: Terminal },
    ],
  },
  {
    label: "AI Workers",
    items: [{ title: "AI Workers", url: "/workers", icon: Bot }],
  },
  {
    label: "Conversations",
    items: [
      { title: "Conversations", url: "/conversations", icon: MessageSquare },
      { title: "Quality Review", url: "/quality-review", icon: ClipboardCheck },
      { title: "KB Suggestions", url: "/kb-rewrite", icon: Lightbulb },
      { title: "Escalations", url: "/escalations", icon: AlertTriangle },
    ],
  },
  {
    label: "Bookings",
    items: [
      { title: "Orders & Appointments", url: "/appointments", icon: Calendar },
      { title: "Calendar", url: "/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Customers",
    items: [{ title: "Customers", url: "/customers", icon: Users }],
  },
  {
    label: "Connections",
    items: [
      { title: "Channels", url: "/channels", icon: Plug },
      { title: "Connections", url: "/connections", icon: Puzzle },
    ],
  },
  {
    label: "Account",
    items: [
      { title: "Organization", url: "/organization", icon: Building2 },
      { title: "Billing", url: "/billing", icon: CreditCard },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Diagnostics", url: "/diagnostics", icon: Activity },
      { title: "Realtime Logs", url: "/realtime-logs", icon: Radio },
      { title: "Settings", url: "/settings", icon: Settings },
      { title: "Help", url: "/help", icon: HelpCircle },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path || (path === "/workers" && currentPath.startsWith("/workers/"));

  const isGroupActive = (items: Array<{ url: string }>) =>
    items.some((item) => item.url === currentPath);

  // Operator surface: hide nav items the active operator's approved plan
  // excluded. No surface (older operators) -> show everything. Empty
  // groups disappear entirely so the nav stays clean.
  const visiblePages = useActiveOperatorStore((s) => s.visiblePages);
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => isRouteVisible(i.url, visiblePages)) }))
        .filter((g) => g.items.length > 0),
    [visiblePages],
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) {
      initial[g.label] = isGroupActive(g.items);
    }
    if (!initial["Overview"]) initial["Overview"] = true;
    if (!initial["Your Operator"]) initial["Your Operator"] = true;
    return initial;
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

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
              <span className="text-lg font-bold text-foreground">
                Rutex
              </span>
            </button>
          </div>
        )}

        {visibleGroups.map((group) => {
          const active = isGroupActive(group.items);
          const isOpen = openGroups[group.label] ?? false;
          const effectiveOpen = state === "collapsed" || isOpen || (active && group.items.some((i) => i.url === currentPath));

          return (
            <SidebarGroup key={group.label} className={cn(state !== "collapsed" && "mb-1")}>
              {state !== "collapsed" ? (
                <Collapsible open={effectiveOpen} onOpenChange={(o) => setOpenGroups((prev) => ({ ...prev, [group.label]: o }))}>
                  <CollapsibleTrigger asChild>
                    <SidebarGroupLabel className="flex items-center justify-between cursor-pointer select-none text-xs uppercase tracking-wider text-muted-foreground font-semibold px-4 mb-1">
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform duration-200", effectiveOpen && "rotate-180")}
                      />
                    </SidebarGroupLabel>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      <SidebarMenu className="space-y-1 px-2" role="navigation" aria-label={group.label}>
                        {group.items.map((item) => (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton
                              onClick={() => navigate(item.url)}
                              className={cn(
                                "w-full rounded-lg transition-all duration-200 hover:bg-sidebar-accent group touch-target",
                                isActive(item.url)
                                  ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
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
                              <span className="ml-3 text-sm truncate">{item.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        ))}
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                // Collapsed state: show item icons only, grouped by first item (group label flyout behaviour handled by shadcn)
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1 px-2" role="navigation" aria-label={group.label}>
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          onClick={() => navigate(item.url)}
                          className={cn(
                            "w-full rounded-lg transition-all duration-200 hover:bg-sidebar-accent touch-target",
                            isActive(item.url)
                              ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                              : "text-sidebar-foreground hover:text-primary"
                          )}
                          aria-current={isActive(item.url) ? "page" : undefined}
                          aria-label={item.title}
                        >
                          <item.icon
                            className={cn(
                              "h-4 w-4 transition-colors flex-shrink-0",
                              isActive(item.url) ? "text-primary" : "text-muted-foreground"
                            )}
                            aria-hidden="true"
                          />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
