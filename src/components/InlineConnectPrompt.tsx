import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Link2,
  CheckCircle2,
  Clock,
  AlertCircle,
  KeyRound,
  ExternalLink,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

// ── Types (mirror ConnectorRegistry, runtime table not in generated types) ──

interface ConnectorDef {
  connector_key: string;
  display_name: string;
  description: string;
  auth_type: string;
  is_coming_soon: boolean;
  setup_url: string | null;
  help_url: string | null;
}

interface ConnectorStatus {
  connector_key: string;
  status: string;
  current_tier: number | null;
  last_error: string | null;
}

// Supabase table row types for connector tables (not in generated types)
interface ConnectorDefinitionRow {
  connector_key: string;
  display_name: string;
  description: string;
  auth_type: string;
  is_coming_soon: boolean;
  setup_url: string | null;
  help_url: string | null;
}

interface ConnectorRow {
  connector_key: string;
  status: string;
  current_tier: number | null;
  last_error: string | null;
}

export interface InlineConnectPromptProps {
  connectorKey: string;
  userId: string;
  /** Plain-language reason this connector is needed right here, at this moment. */
  why?: string;
  /** Optional override of the definition's display name. */
  displayName?: string;
  /** Compact variant for tight spaces (banner-style row). */
  compact?: boolean;
  /** Always render even when already connected (to show a confirm state). */
  showWhenConnected?: boolean;
  className?: string;
}

/**
 * Reusable inline connect prompt — the single component used everywhere a
 * capability gap is detected (§2.4 / Step 5). Reads the connector's live
 * status from the DB; when a gap exists it surfaces the connect action right
 * there, with either a guided path (OAuth → Connections registry) or a
 * paste-key field when that's the real integration path. Never says "go check
 * Settings" — the action is inline, at the moment the gap is touched.
 */
export function InlineConnectPrompt({
  connectorKey,
  userId,
  why,
  displayName,
  compact = false,
  showWhenConnected = false,
  className,
}: InlineConnectPromptProps) {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [def, setDef] = useState<ConnectorDef | null>(null);
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [defRes, statusRes] = await Promise.all([
        supabase
          .from("connector_definitions")
          .select(
            "connector_key, display_name, description, auth_type, is_coming_soon, setup_url, help_url",
          )
          .eq("connector_key", connectorKey)
          .maybeSingle<ConnectorDefinitionRow>(),
        supabase
          .from("connectors")
          .select("connector_key, status, current_tier, last_error")
          .eq("user_id", userId)
          .eq("connector_key", connectorKey)
          .maybeSingle<ConnectorRow>(),
      ]);

      if (!active) return;
      setDef(defRes.data || null);
      setStatus(statusRes.data || null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [connectorKey, userId]);

  const tier = status?.current_tier || 3;
  const statusState = status?.status || "not_configured";
  const isGap =
    statusState === "not_configured" || statusState === "error" || statusState === "expired";
  const isComingSoon = def?.is_coming_soon;

  if (loading) {
    return <div className="text-sm text-muted-foreground">Checking connector…</div>;
  }

  const resolvedName = displayName || def?.display_name || connectorKey;

  // Connected / configured and we don't need to show it → hide entirely.
  if (!isGap && !showWhenConnected) {
    return null;
  }

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const existing = status;
      if (existing) {
        await supabase
          .from("connectors")
          .update({
            status: "configured",
            config_json: { api_key: apiKey.trim() },
          })
          .eq("user_id", userId)
          .eq("connector_key", connectorKey);
      } else {
        await supabase.from("connectors").insert({
          user_id: userId,
          connector_key: connectorKey,
          status: "configured",
          config_json: { api_key: apiKey.trim() },
          display_name: def?.display_name || connectorKey,
        });
      }
      setSaved(true);
      setApiKey("");
      setStatus((s) => ({
        connector_key: connectorKey,
        status: "configured",
        current_tier: s?.current_tier || 2,
        last_error: null,
      }));
    } catch (e) {
      setError("Could not save your credentials. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Connected / configured display (only when showWhenConnected) ──
  if (!isGap && showWhenConnected) {
    const isConnected = statusState === "connected";
    return (
      <div className="flex items-center gap-2 text-sm">
        {isConnected ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            <span className="text-green-700">{resolvedName} is connected.</span>
          </>
        ) : (
          <>
            <Clock className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-amber-700">{resolvedName} is configured and ready.</span>
          </>
        )}
      </div>
    );
  }

  // Honest "on roadmap" state — this is a real gap we cannot connect yet.
  if (isComingSoon) {
    return (
      <div
        className={`rounded-lg border border-dashed bg-muted/40 p-3 text-sm ${className}`}
      >
        <div className="flex items-start gap-2">
          <Lock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {resolvedName} support is on the roadmap
            </p>
            <p className="text-muted-foreground mt-0.5">
              {why ||
                def?.description ||
                `This capability needs ${resolvedName}, which is coming soon.`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Real gap → inline connect prompt with a concrete action.
  const isOAuth = def?.auth_type === "oauth";

  return (
    <div
      className={`rounded-lg border bg-background p-3 text-sm shadow-sm ${
        compact ? "" : "p-4"
      } ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
          {isOAuth ? (
            <Link2 className="h-4 w-4 text-primary" />
          ) : (
            <KeyRound className="h-4 w-4 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium flex items-center gap-1.5 flex-wrap">
            Connect {resolvedName}
            {!isOAuth && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                API key
              </span>
            )}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {why ||
              def?.description ||
              `This capability needs ${resolvedName}.`}
          </p>
        </div>
      </div>

      {isOAuth ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button size="sm" className="gap-1.5 w-full sm:w-auto" onClick={() => navigate("/connections")}>
            <Link2 className="h-3.5 w-3.5" />
            Connect {resolvedName}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          {def?.help_url && (
            <Button size="sm" variant="ghost" asChild className="w-full sm:w-auto">
              <a href={def.help_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                Setup guide
              </a>
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Opens Connections, where {resolvedName} is granted with one sign-in.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Paste your ${resolvedName} API key`}
              type="password"
              autoComplete="off"
            />
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim() || saving || saved}
            >
              {saved ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </>
              ) : saving ? (
                "Saving…"
              ) : (
                <>
                  <KeyRound className="h-3.5 w-3.5" /> Save key
                </>
              )}
            </Button>
          </div>
          {def?.setup_url ? (
            <p className="text-xs text-muted-foreground">
              Don't have a key yet?{" "}
              <a
                href={def.setup_url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Get one here
              </a>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Keys are stored securely and only used to power this capability.
            </p>
          )}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Feedback for just-saved state */}
      {saved && !isOAuth && (
        <p className="mt-2 text-xs text-green-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {resolvedName} is now configured.
        </p>
      )}
    </div>
  );
}
