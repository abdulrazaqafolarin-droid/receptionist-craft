/**
 * Collection framework — ONE general mechanism for gathering anything the
 * AI or platform needs from the owner: credentials, contact details, links,
 * preferences, or any future requirement.
 *
 * Principle (owner's rule): never build a one-off form. Every collection
 * need is a declarative CollectSchema rendered by CollectDialog. When a new
 * need appears (new connector, new business field, new preference), only a
 * schema entry is added — zero new UI code.
 *
 * A schema describes WHAT to collect. Verification (live key checks) and
 * persistence (where values land) stay with the caller, so the same dialog
 * serves connectors, business profiles, and future needs alike.
 */

export type FieldKind =
  | "text"
  | "password"
  | "email"
  | "url"
  | "tel"
  | "textarea"
  | "select";

export interface CollectField {
  name: string;
  label: string;
  placeholder?: string;
  kind?: FieldKind;
  required?: boolean;
  hint?: string;
  /** select options (kind === "select" only) */
  options?: string[];
  /** minimum length for text-like fields */
  minLength?: number;
}

export interface OAuthGuide {
  providerKey: string;
  consoleName: string;
  consoleUrl: string;
  scopes?: string[];
}

export interface CollectSchema {
  key: string;
  title: string;
  description: string;
  fields: CollectField[];
  submitLabel: string;
  /** Guided provider-app setup shown above the fields (OAuth family). */
  oauthGuide?: OAuthGuide;
  /** Setup-guide link shown beside the form. */
  helpUrl?: string | null;
  /** Which edge function verifies values live (null = save as configured). */
  verifyFn?: string | null;
}

export function validateField(field: CollectField, value: string): string | null {
  const v = (value || "").trim();
  if ((field.required ?? true) && !v) return `${field.label} is required.`;
  if (v && field.minLength && v.length < field.minLength) {
    return `${field.label} looks too short.`;
  }
  if (v && field.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return "That email address doesn't look right.";
  }
  if (v && field.kind === "url" && !/^https?:\/\/.+\..+/.test(v)) {
    return "Use a full link starting with https://.";
  }
  return null;
}

export function validateValues(schema: CollectSchema, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of schema.fields) {
    const err = validateField(f, values[f.name] || "");
    if (err) errors[f.name] = err;
  }
  return errors;
}

/** Connector credential schemas (migrated from the bespoke dialog). */
const CONNECTOR_SCHEMAS: Record<string, CollectSchema> = {
  stripe: {
    key: "stripe",
    title: "Connect Stripe",
    description: "Accept payments, deposits, and subscriptions through Stripe.",
    fields: [
      { name: "api_key", label: "Secret key", placeholder: "sk_live_… or sk_test_…", kind: "password", hint: "Stripe Dashboard → Developers → API keys. Test keys work for trying." },
    ],
    submitLabel: "Verify & connect",
    verifyFn: "verify-connector",
  },
  paystack: {
    key: "paystack",
    title: "Connect Paystack",
    description: "Accept payments through Paystack.",
    fields: [
      { name: "api_key", label: "Secret key", placeholder: "sk_live_… or sk_test_…", kind: "password", hint: "Paystack Dashboard → Settings → API Keys." },
    ],
    submitLabel: "Verify & connect",
    verifyFn: "verify-connector",
  },
  twilio_sms: {
    key: "twilio_sms",
    title: "Connect Twilio SMS",
    description: "Send reminders, campaigns, and win-back texts.",
    fields: [
      { name: "account_sid", label: "Account SID", placeholder: "AC…", hint: "Twilio Console dashboard." },
      { name: "auth_token", label: "Auth token", placeholder: "••••", kind: "password" },
    ],
    submitLabel: "Verify & connect",
    verifyFn: "verify-connector",
  },
  smtp_custom: {
    key: "smtp_custom",
    title: "Custom SMTP Server",
    description: "Send email through any provider.",
    fields: [
      { name: "host", label: "SMTP host", placeholder: "mail.yourdomain.com" },
      { name: "username", label: "Username", placeholder: "you@yourdomain.com" },
      { name: "password", label: "Password", placeholder: "••••", kind: "password" },
    ],
    submitLabel: "Save",
    verifyFn: null,
  },
  google_maps: {
    key: "google_maps",
    title: "Connect Google Maps",
    description: "Show business location and check service areas.",
    fields: [
      { name: "api_key", label: "API key", placeholder: "AIza…", kind: "password", hint: "Google Cloud Console → Credentials, with Maps JavaScript + Geocoding enabled." },
    ],
    submitLabel: "Verify & connect",
    verifyFn: "verify-connector",
  },
  yelp: {
    key: "yelp",
    title: "Connect Yelp",
    description: "Monitor and respond to Yelp reviews.",
    fields: [
      { name: "api_key", label: "API key", placeholder: "Yelp Fusion key", kind: "password", hint: "Yelp Developers → Manage App → API Key." },
    ],
    submitLabel: "Verify & connect",
    verifyFn: "verify-connector",
  },
  trustpilot: {
    key: "trustpilot",
    title: "Connect Trustpilot",
    description: "Monitor and respond to Trustpilot reviews.",
    fields: [
      { name: "api_key", label: "API key", placeholder: "Trustpilot key", kind: "password", hint: "Saved as configured — the first review check confirms it." },
    ],
    submitLabel: "Save",
    verifyFn: "verify-connector",
  },
};

/** Generic OAuth credential schema (per-provider guide filled by caller). */export function oauthSchema(
  connectorKey: string,
  displayName: string,
  description: string,
  guide: OAuthGuide,
  helpUrl?: string | null,
): CollectSchema {
  return {
    key: connectorKey,
    title: `Connect ${displayName}`,
    description,
    fields: [
      { name: "client_id", label: "Client / App ID", placeholder: "From the provider console" },
      { name: "client_secret", label: "Client secret", placeholder: "••••", kind: "password" },
    ],
    submitLabel: "Save credentials",
    oauthGuide: guide,
    helpUrl: helpUrl ?? null,
    verifyFn: null,
  };
}

/**
 * CLI-harness connector schema (anything-CLI pattern): the connection runs
 * a real command where a shell exists (companion or gateway runner), never
 * in the browser. The dialog collects the command spec and where it runs;
 * execution availability is reported honestly at verify time.
 */
export function cliSchema(
  connectorKey: string,
  displayName: string,
  description: string,
  harnessHint?: string | null,
): CollectSchema {
  return {
    key: connectorKey,
    title: `Connect ${displayName} via command`,
    description: `${description} Runs as a real command where you allow it — never inside the browser.`,
    fields: [
      { name: "cli_command", label: "Command", placeholder: harnessHint || "e.g. tiktok-post --help", hint: "The exact command the runner executes." },
      { name: "cli_context", label: "Where it runs", placeholder: "e.g. shop computer via companion", required: false, hint: "Which machine or runner should execute this." },
    ],
    submitLabel: "Save & check runner",
    verifyFn: "verify-connector",
  };
}

/** Business-profile schemas — the same dialog collects owner facts. */
export const BUSINESS_SCHEMAS: Record<string, CollectSchema> = {
  contact: {
    key: "contact",
    title: "Business contact details",
    description: "Where customers reach you — shown in chats, confirmations, and reminders.",
    fields: [
      { name: "phone", label: "Phone / WhatsApp", placeholder: "+234 …", kind: "tel", required: false },
      { name: "email", label: "Email", placeholder: "hello@business.com", kind: "email", required: false },
      { name: "address", label: "Address", placeholder: "Street, area, city", kind: "text", required: false },
      { name: "website", label: "Website", placeholder: "https://…", kind: "url", required: false },
    ],
    submitLabel: "Save contact details",
    verifyFn: null,
  },
  social: {
    key: "social",
    title: "Social profiles",
    description: "Links the operator shares when customers ask where to find you.",
    fields: [
      { name: "instagram", label: "Instagram", placeholder: "https://instagram.com/…", kind: "url", required: false },
      { name: "facebook", label: "Facebook", placeholder: "https://facebook.com/…", kind: "url", required: false },
      { name: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…", kind: "url", required: false },
    ],
    submitLabel: "Save social profiles",
    verifyFn: null,
  },
};

/** Resolve any collection need by key: connector credentials first, then business facts. */
export function getCollectSchema(key: string): CollectSchema | null {
  return CONNECTOR_SCHEMAS[key] || BUSINESS_SCHEMAS[key] || null;
}

export function isConnectorSchema(key: string): boolean {
  return key in CONNECTOR_SCHEMAS;
}
