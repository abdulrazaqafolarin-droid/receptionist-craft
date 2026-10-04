import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Loader2, ExternalLink } from "lucide-react";

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

interface Field {
  name: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  hint?: string;
}

/** Credential fields per api_key/manual connector. OAuth uses guided setup. */
const FIELDS: Record<string, Field[]> = {
  stripe: [{ name: "api_key", label: "Secret key", placeholder: "sk_live_… or sk_test_…", secret: true, hint: "Stripe Dashboard → Developers → API keys. Test keys work for trying." }],
  paystack: [{ name: "api_key", label: "Secret key", placeholder: "sk_live_… or sk_test_…", secret: true, hint: "Paystack Dashboard → Settings → API Keys." }],
  twilio_sms: [
    { name: "account_sid", label: "Account SID", placeholder: "AC…", hint: "Twilio Console dashboard." },
    { name: "auth_token", label: "Auth token", placeholder: "••••", secret: true },
  ],
  smtp_custom: [
    { name: "host", label: "SMTP host", placeholder: "mail.yourdomain.com" },
    { name: "username", label: "Username", placeholder: "you@yourdomain.com" },
    { name: "password", label: "Password", placeholder: "••••", secret: true },
  ],
  google_maps: [{ name: "api_key", label: "API key", placeholder: "AIza…", secret: true, hint: "Google Cloud Console → Credentials, with Maps JavaScript + Geocoding enabled." }],
};

const OAUTH_CONSOLE: Record<string, { name: string; url: string }> = {
  google: { name: "Google Cloud Console", url: "https://console.cloud.google.com/apis/credentials" },
  microsoft: { name: "Azure App Registrations", url: "https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
  meta: { name: "Meta App Dashboard", url: "https://developers.facebook.com/apps" },
  tiktok: { name: "TikTok Developers", url: "https://developers.tiktok.com/apps" },
  linkedin: { name: "LinkedIn Developers", url: "https://developer.linkedin.com/" },
  twitter: { name: "X Developer Portal", url: "https://developer.twitter.com/" },
};

export function ConnectorConnectDialog({ definition, userId, onClose, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const open = definition !== null;
  if (!open || !definition) return <Dialog open={false} onOpenChange={onClose}><DialogContent /></Dialog>;
  const def = definition;

  const isOauth = def.auth_type === "oauth";
  const fields = FIELDS[def.connector_key] || [];
  const consoleInfo = def.oauth_provider ? OAUTH_CONSOLE[def.oauth_provider] : undefined;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const credentials: Record<string, string> = {};
      for (const f of fields) credentials[f.name] = (values[f.name] || "").trim();
      if (fields.some((f) => !credentials[f.name])) {
        toast.error("Fill in every field first.");
        setSaving(false);
        return;
      }

      // Server-side verification (browser CORS forbids direct provider calls).
      // OAuth/manual entries save as configured — verification happens at
      // first real use, and the status says so honestly.
      let status: ConnectorStatus = "configured";
      let lastError: string | null = null;
      if (!isOauth && fields.length > 0) {
        const { data, error } = await supabase.functions.invoke("verify-connector", {
          body: { connector_key: def.connector_key, credentials },
        });
        if (error) throw error;
        const d = (data || {}) as { ok?: boolean; error?: string; detail?: string };
        if (d.ok) {
          status = "connected";
        } else {
          status = "error";
          lastError = d.detail || d.error || "verification failed";
        }
      }

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

      if (status === "connected") {
        toast.success(`${def.display_name} connected and verified.`);
      } else if (status === "error") {
        toast.error(`${def.display_name}: ${lastError || "verification failed"} — saved so you can retry.`);
      } else {
        toast.success(`${def.display_name} saved. Complete the provider steps to activate.`);
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error("Connector save failed", e);
      toast.error(e instanceof Error ? e.message : "Failed to save connector");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {def.display_name}</DialogTitle>
          <DialogDescription>{def.description}</DialogDescription>
        </DialogHeader>

        {isOauth && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-2">
            <p className="font-medium">Provider app required (one-time, ~5 minutes)</p>
            <p className="text-muted-foreground">
              {def.display_name} connects through your own app on the provider side. Create it, then paste the
              credentials below.
            </p>
            {consoleInfo && (
              <a
                href={consoleInfo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
              >
                Open {consoleInfo.name} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {def.oauth_scopes && def.oauth_scopes.length > 0 && (
              <p className="text-muted-foreground">Scopes to enable: {def.oauth_scopes.join(", ")}</p>
            )}
            {def.help_url && (
              <a
                href={def.help_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
              >
                Setup guide <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {(isOauth
          ? [
              { name: "client_id", label: "Client / App ID", placeholder: "From the provider console" },
              { name: "client_secret", label: "Client secret", placeholder: "••••", secret: true },
            ] as Field[]
          : fields
        ).map((f) => (
          <div key={f.name} className="grid gap-1.5">
            <Label htmlFor={`conn-${f.name}`}>{f.label}</Label>
            <Input
              id={`conn-${f.name}`}
              type={f.secret ? "password" : "text"}
              placeholder={f.placeholder}
              value={values[f.name] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              autoComplete="off"
            />
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isOauth ? "Save credentials" : "Verify & connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
