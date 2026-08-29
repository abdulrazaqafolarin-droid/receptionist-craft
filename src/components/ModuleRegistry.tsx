/**
 * ModuleRegistry — Shows all 20 growth modules with tier badges,
 * enable/disable toggles, and connector status.
 *
 * This is the single source of truth for what a business can do.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Zap, FileText, Lock, Bot } from "lucide-react";
import { InlineConnectPrompt } from "@/components/InlineConnectPrompt";

interface ModuleDefinition {
  key: string;
  name: string;
  description: string;
  category: "growth" | "operations" | "acquisition" | "retention";
  tier: 1 | 2 | 3;
  required_connectors: string[];
}

interface EnabledModule {
  module_key: string;
  enabled: boolean;
  config_json: Record<string, unknown>;
  tier_override: number | null;
}

const ALL_MODULES: ModuleDefinition[] = [
  // Tier 1 — Fully Autonomous
  { key: "lead_generator", name: "Lead Generator", description: "Auto-captures leads from conversations with contact info and scores", category: "acquisition", tier: 1, required_connectors: [] },
  { key: "content_generation", name: "Content Generation", description: "Drafts blog posts, ad copy, and social captions", category: "growth", tier: 1, required_connectors: [] },
  { key: "analytics_digest", name: "Analytics Digest", description: "Periodic performance summary with recommendations", category: "operations", tier: 1, required_connectors: [] },
  { key: "competitor_monitoring", name: "Competitor Monitoring", description: "Tracks competitor pricing, promotions, and news", category: "growth", tier: 1, required_connectors: [] },

  // Tier 2 — Need Email/SMS Connectors
  { key: "email_responder", name: "Email Responder", description: "Auto-replies to inbound customer emails using AI", category: "operations", tier: 2, required_connectors: ["gmail"] },
  { key: "email_sender", name: "Email Campaigns", description: "Sends outbound email campaigns and win-back sequences", category: "growth", tier: 2, required_connectors: ["gmail"] },
  { key: "sms_campaign", name: "SMS Campaign", description: "Sends text message campaigns and reminders", category: "growth", tier: 2, required_connectors: ["twilio_sms"] },
  { key: "customer_feedback", name: "Customer Feedback", description: "Sends satisfaction surveys and tracks NPS", category: "retention", tier: 2, required_connectors: ["gmail"] },
  { key: "referral_program", name: "Referral Program", description: "Generates referral codes and tracks conversions", category: "retention", tier: 1, required_connectors: [] },
  { key: "invoice_followup", name: "Invoice Follow-up", description: "Sends payment reminders for overdue invoices", category: "operations", tier: 2, required_connectors: ["gmail"] },
  { key: "document_generation", name: "Document Generation", description: "AI-drafts proposals, contracts, quotes, and agreements", category: "operations", tier: 1, required_connectors: [] },

  // Tier 3 — Connector Slots Only
  { key: "social_media_posting", name: "Social Media Posting", description: "Posts content to Instagram, Facebook, TikTok, LinkedIn", category: "growth", tier: 3, required_connectors: ["instagram"] },
  { key: "social_media_responder", name: "Social Media Responder", description: "Auto-replies to comments and DMs on social platforms", category: "operations", tier: 3, required_connectors: ["instagram"] },
  { key: "review_management", name: "Review Management", description: "Monitors and responds to Google Reviews, Yelp, Trustpilot", category: "retention", tier: 3, required_connectors: ["google_reviews"] },
  { key: "email_manager", name: "AI Email Manager", description: "Full inbox triage, prioritize, and manage", category: "operations", tier: 3, required_connectors: ["gmail"] },
  { key: "ad_campaigns", name: "Ad Campaign Manager", description: "Creates and manages Google Ads and Meta Ads", category: "acquisition", tier: 3, required_connectors: ["google_ads"] },
  { key: "calendar_sync", name: "Calendar Sync", description: "Two-way sync with Google Calendar and Outlook", category: "operations", tier: 3, required_connectors: ["google_calendar"] },
  { key: "recruitment", name: "Recruitment Assistant", description: "Screens applicants and schedules interviews", category: "operations", tier: 3, required_connectors: ["linkedin_jobs"] },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  growth: { label: "Growth", color: "bg-emerald-100 text-emerald-800" },
  operations: { label: "Operations", color: "bg-blue-100 text-blue-800" },
  acquisition: { label: "Acquisition", color: "bg-purple-100 text-purple-800" },
  retention: { label: "Retention", color: "bg-amber-100 text-amber-800" },
};

const TIER_INFO: Record<number, { label: string; color: string; icon: typeof Zap }> = {
  1: { label: "Fully Autonomous", color: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: Zap },
  2: { label: "Drafts, You Send", color: "bg-amber-100 text-amber-800 border-amber-200", icon: FileText },
  3: { label: "Coming Soon", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Lock },
};

interface ModuleRegistryProps {
  receptionistId: string;
  userId: string;
}

export function ModuleRegistry({ receptionistId, userId }: ModuleRegistryProps) {
  const [enabledModules, setEnabledModules] = useState<Map<string, EnabledModule>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["growth", "acquisition"]));

  useEffect(() => {
    loadModules();
  }, [receptionistId]);

  async function loadModules() {
    const { data } = await supabase
      .from("business_modules" as any)
      .select("*")
      .eq("receptionist_id", receptionistId);

    const map = new Map<string, EnabledModule>();
    (data || []).forEach((m: any) => {
      map.set(m.module_key, {
        module_key: m.module_key,
        enabled: m.enabled,
        config_json: m.config_json || {},
        tier_override: m.tier_override,
      });
    });
    setEnabledModules(map);
    setLoading(false);
  }

  async function toggleModule(moduleKey: string, enabled: boolean) {
    const existing = enabledModules.get(moduleKey);

    if (existing) {
      // Update
      await supabase
        .from("business_modules" as any)
        .update({ enabled })
        .eq("receptionist_id", receptionistId)
        .eq("module_key", moduleKey);

      setEnabledModules((prev) => {
        const next = new Map(prev);
        next.set(moduleKey, { ...existing, enabled });
        return next;
      });
    } else {
      // Insert
      await supabase
        .from("business_modules" as any)
        .insert({
          receptionist_id: receptionistId,
          module_key: moduleKey,
          enabled,
        });

      setEnabledModules((prev) => {
        const next = new Map(prev);
        next.set(moduleKey, { module_key: moduleKey, enabled, config_json: {}, tier_override: null });
        return next;
      });
    }
  }

  function toggleCategory(category: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  // Group modules by category
  const categories = new Map<string, ModuleDefinition[]>();
  ALL_MODULES.forEach((m) => {
    if (!categories.has(m.category)) categories.set(m.category, []);
    categories.get(m.category)!.push(m);
  });

  const enabledCount = ALL_MODULES.filter((m) => enabledModules.get(m.key)?.enabled !== false).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Loading modules...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Growth & Operations Modules</h3>
          <p className="text-sm text-muted-foreground">
            {enabledCount} of {ALL_MODULES.length} modules enabled
          </p>
        </div>
        <div className="flex gap-2">
          {Object.entries(TIER_INFO).map(([tier, info]) => (
            <Badge key={tier} variant="outline" className={info.color}>
              <info.icon className="h-3 w-3 mr-1" />
              Tier {tier}: {info.label}
            </Badge>
          ))}
        </div>
      </div>

      {Array.from(categories.entries()).map(([category, modules]) => {
        const catInfo = CATEGORY_LABELS[category];
        const isExpanded = expandedCategories.has(category);
        const enabledInCategory = modules.filter(
          (m) => enabledModules.get(m.key)?.enabled !== false,
        ).length;

        return (
          <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleCategory(category)}>
            <CollapsibleTrigger asChild>
              <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                <CardHeader className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Badge className={catInfo.color}>{catInfo.label}</Badge>
                      <CardTitle className="text-base">{category.charAt(0).toUpperCase() + category.slice(1)}</CardTitle>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {enabledInCategory}/{modules.length} enabled
                    </span>
                  </div>
                </CardHeader>
              </Card>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="space-y-2 ml-6">
                {modules.map((module) => {
                  const isEnabled = enabledModules.get(module.key)?.enabled !== false;
                  const tierInfo = TIER_INFO[module.tier];
                  const TierIcon = tierInfo.icon;

                  return (
                    <Card key={module.key} className={!isEnabled ? "opacity-60" : ""}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={(checked) => toggleModule(module.key, checked)}
                              disabled={module.tier === 3}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{module.name}</span>
                                <Badge variant="outline" className={`${tierInfo.color} text-xs`}>
                                  <TierIcon className="h-3 w-3 mr-1" />
                                  Tier {module.tier}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {module.description}
                              </p>
                              {module.required_connectors.length > 0 && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Requires: {module.required_connectors.join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                          {module.tier === 3 && (
                            <Button variant="ghost" size="sm" className="text-xs" disabled>
                              <Lock className="h-3 w-3 mr-1" />
                              On Roadmap
                            </Button>
                          )}
                        </div>
                        {/* §2.4 / Step 5 — when an enabled module needs a connector
                            that isn't live yet, surface the inline connect prompt
                            right here, at the moment the capability is touched. */}
                        {isEnabled &&
                          module.required_connectors.length > 0 &&
                          module.tier !== 3 &&
                          module.required_connectors.map((key) => (
                            <div key={key} className="mt-3">
                              <InlineConnectPrompt
                                connectorKey={key}
                                userId={userId}
                                why={`The ${module.name} module needs this connection to actually send messages.`}
                                compact
                              />
                            </div>
                          ))}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
