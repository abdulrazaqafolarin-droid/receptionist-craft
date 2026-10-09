import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CollectDialog } from "@/components/CollectDialog";
import {
  getCollectSchema,
  oauthSchema,
  cliSchema,
  type CollectSchema,
} from "@/lib/collectSchema";
import type { Database } from "@/integrations/supabase/types";

type ConnectorCategory = Database["public"]["Enums"]["connector_category"];
type ConnectorStatus = Database["public"]["Enums"]["connector_status"];

export interface ConnectableDefinition {
  connector_key: string;
  display_name: string;
  description: string;
  category: string;
  auth_type: string;
  help_url?: string | null;
  oauth_scopes?: string[] | null;
  oauth_provider?: string | null;
}

interface Props {
  definition: ConnectableDefinition | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const OAUTH_CONSOLES: Record<string, { name: string; url: string }> = {
  google: { name: "Google Cloud Console", url: "https://console.cloud.google.com/apis/credentials" },
  microsoft: { name: "Azure App Registrations", url: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
  meta: { name: "Meta App Dashboard", url: "https://developers.facebook.com/apps" },
  tiktok: { name: "TikTok Developers", url: "https://developers.tiktok.com/apps" },
  linkedin: { name: "LinkedIn Developers", url: "https://developer.linkedin.com/" },
  twitter: { name: "X Developer Portal", url: "https://developer.twitter.com/" },
};

/**
 * Connector-specific shell over the general CollectDialog. The form,
 * validation, and guided blocks come from the schema registry — this file
 * owns only connector domain logic: verify + upsert + provider sign-in.
 */
export function ConnectorConnectDialog({ definition, userId, onClose, onSaved }: Props) {
  const [connecting, setConnecting] = useState(false);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const open = definition !== null;
  if (!open || !definition) return null;
  const def = definition;

  const isOauth = def.auth_type === "oauth";
  const isCli = def.auth_type === "cli";
  const schema: CollectSchema | null = isOauth
    ? (() => {
        const consoleInfo = def.oauth_provider ? OAUTH_CONSOLES[def.oauth_provider] : undefined;
        return oauthSchema(def.connector_key, def.display_name, def.description, {
          providerKey: def.oauth_provider || "other",
          consoleName: consoleInfo?.name || "Provider console",
          consoleUrl: consoleInfo?.url || def.help_url || "#",
          scopes: def.oauth_scopes || [],
        }, def.help_url);
      })()
    : isCli
      ? cliSchema(def.connector_key, def.display_name, def.description)
      : getCollectSchema(def.connector_key);
  if (!schema) return null;
  // Narrowed once for closures below (TS can't narrow across callbacks).
  const sch: CollectSchema = schema;

  async function persist(
    credentials: Record<string, string>,
    status: ConnectorStatus,
    lastError: string | null,
  ): Promise<void> {
    const { error: upsertErr } = await supabase.from("connectors").upsert(
      {
        user_id: userId,
        connector_key: def.connector_key,
        display_name: def.display_name,
        description: def.description,
        category: def.category as ConnectorCategory,
        status,
        config_json: credentials,
        last_error: lastError,
        connected_at: status === "connected" ? new Date().toISOString() : null,
      },
      { onConflict: "user_id,connector_key" },
    );
    if (upsertErr) throw upsertErr;
  }

  async function handleSubmit(values: Record<string, string>): Promise<void> {
    // OAuth/manual entries save as configured — verification happens at
    // first real use, and the status says so honestly.
    let status: ConnectorStatus = "configured";
    let lastError: string | null = null;
    if (!isOauth && sch.verifyFn) {
      const { data, error } = await supabase.functions.invoke(sch.verifyFn, {
        body: { connector_key: def.connector_key, credentials: values },
      });
      if (error) throw error;
      const d = (data || {}) as { ok?: boolean; error?: string; detail?: string; status?: string };
      if (d.ok) {
        status = d.status === "connected" ? "connected" : "configured";
        if (status === "configured") lastError = d.detail || null;
      } else {
        status = "error";
        lastError = d.detail || d.error || "verification failed";
      }
    }

    await persist(values, status, lastError);

    if (status === "connected") {
      toast.success(`${def.display_name} connected and verified.`);
    } else if (status === "error") {
      toast.error(`${def.display_name}: ${lastError || "verification failed"} — saved so you can retry.`);
    } else if (lastError) {
      toast.success(`${def.display_name} saved (${lastError}). Complete the provider steps to activate.`);
    } else {
      toast.success(`${def.display_name} saved. Complete the provider steps to activate.`);
    }
    if (isOauth) {
      setSavedKey(def.connector_key);
    } else {
      onSaved();
      onClose();
    }
    if (isOauth) onSaved();
  }

  async function handleProviderConnect() {
    if (connecting || !savedKey) return;
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const { data, error } = await supabase.functions.invoke("oauth-start", {
        body: { connector_key: savedKey, redirect_uri: redirectUri },
      });
      if (error) throw error;
      const d = (data || {}) as { ok?: boolean; error?: string; detail?: string; authorize_url?: string };
      if (!d.ok || !d.authorize_url) {
        throw new Error(d.detail || d.error || "Could not start provider sign-in");
      }
      window.location.href = d.authorize_url;
    } catch (e) {
      console.error("Provider sign-in failed", e);
      toast.error(e instanceof Error ? e.message : "Provider sign-in failed");
      setConnecting(false);
    }
  }

  return (
    <CollectDialog
      schema={schema}
      open={open}
      onClose={() => {
        setSavedKey(null);
        onClose();
      }}
      onSubmit={handleSubmit}
      footerExtra={
        isOauth && savedKey ? (
          <Button onClick={handleProviderConnect} disabled={connecting} className="w-full">
            {connecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue to {def.display_name} sign-in
          </Button>
        ) : undefined
      }
    />
  );
}
