import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap,
  FileText,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConnectorConnectDialog } from "@/components/ConnectorConnectDialog";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──────────────────────────────────────────────────────────

interface ConnectorDef {
  connector_key: string;
  display_name: string;
  description: string;
  category: string;
  auth_type: string;
  tier_1_description: string | null;
  tier_2_description: string | null;
  tier_3_description: string | null;
  is_google_family: boolean;
  supports_one_click_connect: boolean;
  is_coming_soon: boolean;
  setup_url: string | null;
  help_url: string | null;
  oauth_scopes: string[] | null;
  oauth_provider: string | null;
  required_by_modules: string[];
}

interface ConnectorStatus {
  connector_key: string;
  status: string;
  current_tier: number | null;
  last_error: string | null;
}

interface ConnectorCardProps {
  definition: ConnectorDef;
  userStatus?: ConnectorStatus;
  onConnect?: (key: string) => void;
  onDisconnect?: (key: string) => void;
}

// ── Tier Badge ─────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: number }) {
  if (tier === 1) {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
        <Zap className="h-3 w-3" />
        Fully Autonomous
      </Badge>
    );
  }
  if (tier === 2) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <FileText className="h-3 w-3" />
        Drafts Only
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-gray-500 gap-1">
      <XCircle className="h-3 w-3" />
      Not Connected
    </Badge>
  );
}

// ── Status Icon ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "configured":
      return <Clock className="h-5 w-5 text-amber-500" />;
    case "error":
    case "expired":
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Link2 className="h-5 w-5 text-gray-400" />;
  }
}

// ── Connector Card ─────────────────────────────────────────────────

export function ConnectorCard({
  definition: def,
  userStatus,
  onConnect,
  onDisconnect,
}: ConnectorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tier = userStatus?.current_tier || 3;
  const status = userStatus?.status || "not_configured";

  return (
    <Card className="transition-all hover:shadow-md" data-actor={`connector-card-${def.connector_key}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <StatusIcon status={status} />
            <div>
              <CardTitle className="text-base">{def.display_name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {def.description}
              </p>
            </div>
          </div>
          <TierBadge tier={tier} />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Tier descriptions — always visible, honest about current state */}
        <div className="space-y-2 mb-4">
          {tier === 1 && def.tier_1_description && (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <span>{def.tier_1_description}</span>
            </div>
          )}
          {tier >= 2 && def.tier_2_description && (
            <div className="flex items-start gap-2 text-sm">
              <FileText className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <span>{def.tier_2_description}</span>
            </div>
          )}
          {tier === 3 && def.tier_3_description && (
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{def.tier_3_description}</span>
            </div>
          )}
        </div>

        {/* Error display */}
        {userStatus?.last_error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2 mb-4 text-sm text-red-700">
            {userStatus.last_error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {status === "not_configured" || status === "error" || status === "expired" ? (
            <Button
              size="sm"
              onClick={() => onConnect?.(def.connector_key)}
              disabled={def.is_coming_soon}
              className="gap-1"
              data-actor={`connect-${def.connector_key}`}
            >
              <Link2 className="h-3.5 w-3.5" />
              {def.is_coming_soon
                ? "Coming Soon"
                : def.auth_type === "oauth"
                  ? `Connect ${def.display_name}`
                  : `Add ${def.display_name} Credentials`}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDisconnect?.(def.connector_key)}
              className="gap-1"
            >
              <Unlink className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          )}

          {def.help_url && (
            <Button size="sm" variant="ghost" asChild>
              <a href={def.help_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Setup Guide
              </a>
            </Button>
          )}

          {def.is_google_family && (
            <Badge variant="outline" className="text-[10px] ml-auto">
              Google Family — one sign-in for all
            </Badge>
          )}
        </div>

        {/* Expandable details */}
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs">
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {expanded ? "Less details" : "More details"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 text-sm text-muted-foreground space-y-1">
            <p>Connection type: {def.auth_type}</p>
            {def.required_by_modules && def.required_by_modules.length > 0 && (
              <p>Needed by: {def.required_by_modules.join(", ")}</p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ── Connector Registry Page ────────────────────────────────────────

interface ConnectorRegistryPageProps {
  userId: string;
}

export function ConnectorRegistryPage({ userId }: ConnectorRegistryPageProps) {
  const [definitions, setDefinitions] = useState<ConnectorDef[]>([]);
  const [statuses, setStatuses] = useState<Map<string, ConnectorStatus>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [connecting, setConnecting] = useState<ConnectorDef | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, loadData]);

  async function loadData() {
    setLoading(true);

    const [defsRes, statusRes] = await Promise.all([
      supabase.from("connector_definitions").select("*").order("category"),
      supabase.from("connectors").select("*").eq("user_id", userId),
    ]);

    setDefinitions((defsRes.data || []) as ConnectorDef[]);

    const statusMap = new Map<string, ConnectorStatus>();
    (statusRes.data || []).forEach((s: ConnectorStatus) =>
      statusMap.set(s.connector_key, s),
    );
    setStatuses(statusMap);

    setLoading(false);
  }

  async function handleConnect(key: string) {
    const def = definitions.find((d) => d.connector_key === key);
    if (!def) return;
    if (def.is_coming_soon) return;
    setConnecting(def);
  }

  async function handleDisconnect(key: string) {
    await supabase
      .from("connectors")
      .update({ status: "not_configured", config_json: {} })
      .eq("user_id", userId)
      .eq("connector_key", key);

    loadData();
  }

  // Group by category
  const categories = [...new Set(definitions.map((d) => d.category))];
  const filtered =
    filter === "all"
      ? definitions
      : definitions.filter((d) => d.category === filter);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          {
            label: "Connected",
            count: Array.from(statuses.values()).filter(
              (s) => s.status === "connected",
            ).length,
            color: "text-green-600",
          },
          {
            label: "Configured",
            count: Array.from(statuses.values()).filter(
              (s) => s.status === "configured",
            ).length,
            color: "text-amber-600",
          },
          {
            label: "Not Connected",
            count: definitions.length -
              Array.from(statuses.values()).filter(
                (s) =>
                  s.status === "connected" || s.status === "configured",
              ).length,
            color: "text-gray-500",
          },
        ].map((s) => (
          <div key={s.label} className={`text-sm ${s.color}`}>
            {s.count} {s.label}
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={filter === cat ? "default" : "outline"}
            onClick={() => setFilter(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Connector cards */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading connectors...
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((def) => (
            <ConnectorCard
              key={def.connector_key}
              definition={def}
              userStatus={statuses.get(def.connector_key)}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>
      )}
      <ConnectorConnectDialog
        definition={connecting}
        userId={userId}
        onClose={() => setConnecting(null)}
        onSaved={loadData}
      />
    </div>
  );
}
