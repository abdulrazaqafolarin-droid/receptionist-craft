/**
 * OAuth provider registry (F3) — single source of truth for authorize and
 * token endpoints plus default scopes per connector.
 *
 * Server-side only: token exchange needs client secrets, which never touch
 * the browser. The frontend only ever sees the authorize URL (public info)
 * returned by oauth-start.
 *
 * Deno-safe: ASCII only, no imports.
 */

export interface OAuthProvider {
  key: string; // oauth_provider value used by connector rows
  authorizeUrl: string;
  tokenUrl: string;
  /** client id / secret parameter names differ per provider */
  idParam: string;
  secretParam: string;
  /** how the token endpoint wants its body */
  bodyFormat: "json" | "form";
  /** extra fixed params for the authorize URL */
  extraAuthorize: Record<string, string>;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  google: {
    key: "google",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    idParam: "client_id",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: { access_type: "offline", prompt: "consent", response_type: "code" },
  },
  microsoft: {
    key: "microsoft",
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    idParam: "client_id",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: { response_type: "code", response_mode: "query" },
  },
  meta: {
    key: "meta",
    authorizeUrl: "https://www.facebook.com/v20.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v20.0/oauth/access_token",
    idParam: "client_id",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: { response_type: "code" },
  },
  tiktok: {
    key: "tiktok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    idParam: "client_key",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: { response_type: "code" },
  },
  linkedin: {
    key: "linkedin",
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    idParam: "client_id",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: { response_type: "code" },
  },
  twitter: {
    key: "twitter",
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    idParam: "client_id",
    secretParam: "client_secret",
    bodyFormat: "form",
    extraAuthorize: {
      response_type: "code",
      code_challenge: "rutex-challenge",
      code_challenge_method: "plain",
    },
  },
};

/** Default scopes per connector (used when connector_definitions.oauth_scopes is empty). */
export const CONNECTOR_SCOPES: Record<string, { provider: string; scopes: string[]; joiner: " " | "," }> = {
  gmail: { provider: "google", scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"], joiner: " " },
  google_calendar: { provider: "google", scopes: ["https://www.googleapis.com/auth/calendar"], joiner: " " },
  google_meet: { provider: "google", scopes: ["https://www.googleapis.com/auth/calendar"], joiner: " " },
  google_reviews: { provider: "google", scopes: ["https://www.googleapis.com/auth/business.manage"], joiner: " " },
  google_drive: { provider: "google", scopes: ["https://www.googleapis.com/auth/drive.file"], joiner: " " },
  google_sheets: { provider: "google", scopes: ["https://www.googleapis.com/auth/spreadsheets"], joiner: " " },
  google_contacts: { provider: "google", scopes: ["https://www.googleapis.com/auth/contacts.readonly"], joiner: " " },
  google_ads: { provider: "google", scopes: ["https://www.googleapis.com/auth/adwords"], joiner: " " },
  outlook: { provider: "microsoft", scopes: ["Mail.Read", "Mail.Send", "offline_access"], joiner: " " },
  outlook_calendar: { provider: "microsoft", scopes: ["Calendars.ReadWrite", "offline_access"], joiner: " " },
  instagram: { provider: "meta", scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "pages_manage_posts"], joiner: "," },
  facebook: { provider: "meta", scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"], joiner: "," },
  instagram_business: { provider: "meta", scopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"], joiner: "," },
  meta_ads: { provider: "meta", scopes: ["ads_read", "ads_management"], joiner: "," },
  tiktok: { provider: "tiktok", scopes: ["user.info.basic", "video.upload", "video.publish"], joiner: "," },
  linkedin: { provider: "linkedin", scopes: ["openid", "profile", "w_member_social"], joiner: " " },
  twitter_x: { provider: "twitter", scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"], joiner: " " },
  yelp: { provider: "none", scopes: [], joiner: " " },
  trustpilot: { provider: "none", scopes: [], joiner: " " },
};

export function providerFor(connectorKey: string): string | null {
  return CONNECTOR_SCOPES[connectorKey]?.provider || null;
}
