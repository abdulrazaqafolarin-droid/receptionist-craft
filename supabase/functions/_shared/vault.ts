/**
 * Vault crypto + access helpers — shared by all vault edge functions.
 *
 * AES-256-GCM via WebCrypto (Deno-native, no dependencies). The master
 * key lives ONLY in the VAULT_MASTER_KEY secret — never in code, never
 * in the client, never in logs. Plaintext provider keys exist only in
 * function memory, for the single call that needs them.
 *
 * Access rule: exactly one account (the vault owner UUID below) may
 * touch the vault. Every function verifies the caller JWT, resolves the
 * user server-side, and calls requireVaultOwner before anything else.
 * RLS denies everyone on the base tables regardless.
 *
 * Deno-safe: ASCII only, no imports, no Node APIs.
 */

export const VAULT_OWNER_ID = "0a249488-e3aa-4fbc-80be-93cc3e2d2fca";

export const REVEAL_PER_HOUR = 10;
export const CREATE_PER_DAY = 20;

let cachedKey: CryptoKey | null = null;

async function importMaster(raw: string): Promise<CryptoKey> {
  const bytes = Uint8Array.from(atob(raw.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("vault misconfigured");
  return crypto.subtle.importKey("raw", bytes.buffer as ArrayBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Test seam: inject an ephemeral master key. Never used in production. */
export async function setVaultMasterKeyForTests(rawB64: string): Promise<void> {
  cachedKey = await importMaster(rawB64);
}

async function masterKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = (typeof Deno !== "undefined" ? Deno.env.get("VAULT_MASTER_KEY") || "" : "");
  if (!raw) throw new Error("vault not configured");
  cachedKey = await importMaster(raw);
  return cachedKey;
}

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encrypt a provider key. Returns base64 ciphertext + iv for storage. */
export async function encryptKey(plaintext: string): Promise<{ cipher: string; iv: string }> {
  const key = await masterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, data.buffer as ArrayBuffer);
  return { cipher: b64(new Uint8Array(ct)), iv: b64(iv) };
}

/** Decrypt for one immediate server-side use. Plaintext never stored/logged. */
export async function decryptKey(cipher: string, iv: string): Promise<string> {
  const key = await masterKey();
  const ivBytes = unb64(iv);
  const ctBytes = unb64(cipher);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer },
    key,
    ctBytes.buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(pt);
}

export function keyLast4(key: string): string {
  const t = key.trim();
  return t.length <= 4 ? "****" : t.slice(-4);
}

/** Throws 403-shaped error unless the caller is the vault owner. */
export function requireVaultOwner(userId: string): void {
  if (userId !== VAULT_OWNER_ID) {
    const e = new Error("vault access denied") as Error & { status?: number };
    e.status = 403;
    throw e;
  }
}

const VAULT_ORIGINS = ["https://receptionist-craft.vercel.app"];

/** CORS locked to the production app + localhost dev. Null = rejected. */
export function vaultCors(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") || "";
  if (!origin) {
    return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  }
  if (origin === VAULT_ORIGINS[0] || origin.startsWith("http://localhost:")) {
    return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
  }
  return null;
}

export interface VaultCaller {
  user_id: string;
  ip: string;
  /** Service-role client: full table access, RLS bypassed. */
  service: any;
  /** User-scoped client: sees only what RLS/views allow (the safe view). */
  userDb: any;
}

/**
 * Authenticate a vault request: bearer JWT -> user -> owner gate.
 * Throws 401 (no/invalid token) or 403 (not the vault owner).
 * Client factories keep this module import-free for tests.
 */
export async function vaultCaller(
  req: Request,
  createService: () => any,
  createUserDb: (token: string) => any,
): Promise<VaultCaller> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    const e = new Error("missing authorization") as Error & { status?: number };
    e.status = 401;
    throw e;
  }
  const service = createService();
  const { data: { user }, error } = await service.auth.getUser(token);
  if (error || !user) {
    const e = new Error("invalid token") as Error & { status?: number };
    e.status = 401;
    throw e;
  }
  requireVaultOwner(user.id);
  const fwd = req.headers.get("x-forwarded-for") || "";
  return { user_id: user.id, ip: fwd.split(",")[0].trim(), service, userDb: createUserDb(token) };
}

export interface VaultDb {
  from(table: string): any;
}

/** Append an audit row. Never throws — auditing must not break the action. */
export async function vaultAudit(
  client: VaultDb,
  entry: { user_id: string; key_id?: string | null; action: string; ip?: string },
): Promise<void> {
  try {
    await client.from("vault_audit_logs").insert({
      user_id: entry.user_id,
      key_id: entry.key_id ?? null,
      action: entry.action,
      ip: (entry.ip || "").slice(0, 80),
    });
  } catch {
    // audit failure is recorded nowhere by design — the action stands
  }
}

/** Reveal rate limit: max REVEAL_PER_HOUR reveals per rolling hour. */
export async function revealAllowed(client: VaultDb, userId: string): Promise<boolean> {
  try {
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count } = await client
      .from("vault_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "reveal")
      .gte("created_at", hourAgo);
    return (count || 0) < REVEAL_PER_HOUR;
  } catch {
    return false;
  }
}

/** Create rate limit: max CREATE_PER_DAY creates per rolling day. */
export async function createAllowed(client: VaultDb, userId: string): Promise<boolean> {
  try {
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await client
      .from("vault_audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action", "create")
      .gte("created_at", dayAgo);
    return (count || 0) < CREATE_PER_DAY;
  } catch {
    return false;
  }
}

/**
 * Load the newest active key for a provider and decrypt it for immediate
 * server-side use (proxy pattern — plaintext never reaches the browser).
 * Touches last_used_at and audits 'use'. Null when none exists.
 */
export async function getActiveVaultKey(
  client: VaultDb,
  userId: string,
  provider: string,
): Promise<string | null> {
  try {
    const { data } = await client
      .from("api_keys")
      .select("id,encrypted_key,iv")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = data as { id: string; encrypted_key: string; iv: string } | null;
    if (!row) return null;
    const plain = await decryptKey(row.encrypted_key, row.iv);
    await client.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
    await vaultAudit(client, { user_id: userId, key_id: row.id, action: "use" });
    return plain;
  } catch {
    return null;
  }
}
