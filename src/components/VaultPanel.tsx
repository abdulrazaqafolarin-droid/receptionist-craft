/**
 * VaultPanel — the owner's provider keys, masked by default.
 *
 * One account only (server-enforced). Plaintext appears solely in the
 * reveal flow: shown once, copyable, auto-cleared after 30 seconds and
 * on unmount. Nothing key-shaped is ever logged or persisted client-side.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useVaultKeys } from "@/hooks/useVaultKeys";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, RotateCw, Trash2, Copy, Check } from "lucide-react";

const PROVIDERS = [
  "elevenlabs", "assemblyai", "resend", "google", "openai",
  "paystack", "stripe", "whatsapp", "custom",
];

export function VaultPanel() {
  const { keys, loading, error, createKey, revealKey, rotateKey, revokeKey } = useVaultKeys(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("elevenlabs");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{ id: string; value: string } | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [copied, setCopied] = useState(false);

  // Auto-clear revealed plaintext after 30s and on unmount.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(null), 30000);
    return () => clearTimeout(t);
  }, [revealed]);
  useEffect(() => () => setRevealed(null), []);

  const doCreate = async () => {
    if (!name.trim() || secret.trim().length < 8) {
      toast.error("Give it a name and paste the full key.");
      return;
    }
    setBusy("create");
    try {
      await createKey(name.trim(), provider, secret.trim());
      setName("");
      setSecret("");
      setShowAdd(false);
      toast.success("Key stored encrypted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Store failed.");
    } finally {
      setBusy(null);
    }
  };

  const doReveal = async (id: string) => {
    if (!window.confirm("Show this key's plaintext? The reveal is logged.")) return;
    setBusy(`reveal-${id}`);
    try {
      const value = await revealKey(id);
      setCopied(false);
      setRevealed({ id, value });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reveal failed.");
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.value);
      setCopied(true);
      toast.success("Copied — it clears in 30 seconds.");
    } catch {
      toast.error("Copy blocked by the browser — select it manually.");
    }
  };

  const doRotate = async (id: string) => {
    if (rotateValue.trim().length < 8) {
      toast.error("Paste the full replacement key.");
      return;
    }
    setBusy(`rotate-${id}`);
    try {
      await rotateKey(id, rotateValue.trim());
      setRotating(null);
      setRotateValue("");
      toast.success("Key rotated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rotate failed.");
    } finally {
      setBusy(null);
    }
  };

  const doRevoke = async (id: string, keyName: string) => {
    if (!window.confirm(`Revoke "${keyName}"? The Director stops using it immediately.`)) return;
    setBusy(`revoke-${id}`);
    try {
      await revokeKey(id);
      if (revealed?.id === id) setRevealed(null);
      toast.success("Key revoked.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        Provider keys, encrypted server-side. Only this account can see this panel — the Director
        spends them without ever showing them.
      </p>

      {loading && <p className="px-1 py-4 text-xs text-muted-foreground">Opening the vault…</p>}
      {error && (
        <p className="mt-2 rounded-xl border border-destructive/40 px-3 py-2.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && keys.length === 0 && !showAdd && (
        <div className="px-1 py-6 text-center">
          <p className="text-sm font-medium">No keys yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your ElevenLabs key and the Director's voice switches on for every user.
          </p>
        </div>
      )}

      <ul className="mt-2 space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{k.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="mr-1 inline-block rounded bg-muted px-1.5 py-0.5 font-medium">{k.provider}</span>
                  •••• {k.key_last4 || "****"} · {k.status}
                  {k.last_used_at ? ` · used ${new Date(k.last_used_at).toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {k.status === "active" && (
                  <>
                    <Button
                      variant="ghost" size="sm" aria-label={`Reveal ${k.name}`}
                      disabled={busy !== null}
                      onClick={() => { void (revealed?.id === k.id ? setRevealed(null) : doReveal(k.id)); }}
                    >
                      {revealed?.id === k.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="sm" aria-label={`Rotate ${k.name}`}
                      disabled={busy !== null}
                      onClick={() => { setRotating(rotating === k.id ? null : k.id); setRotateValue(""); }}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" aria-label={`Revoke ${k.name}`}
                      disabled={busy !== null}
                      onClick={() => { void doRevoke(k.id, k.name); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {revealed?.id === k.id && (
              <div className="mt-2 rounded-lg bg-muted/60 p-2">
                <p className="break-all font-mono text-[11px]">{revealed.value}</p>
                <div className="mt-1.5 flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => { void doCopy(); }} className="h-7 text-xs">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRevealed(null)} className="h-7 text-xs">
                    Clear now
                  </Button>
                </div>
              </div>
            )}

            {rotating === k.id && (
              <div className="mt-2 flex gap-1">
                <input
                  type="password"
                  value={rotateValue}
                  onChange={(e) => setRotateValue(e.target.value)}
                  placeholder="Paste the replacement key"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
                <Button size="sm" disabled={busy !== null} onClick={() => { void doRotate(k.id); }} className="h-8 text-xs">
                  Save
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {showAdd ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name — e.g. ElevenLabs main"
            maxLength={80}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Paste the key — encrypted before it is stored"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs"
          />
          <div className="flex gap-1">
            <Button size="sm" disabled={busy !== null} onClick={() => { void doCreate(); }} className="text-xs">
              {busy === "create" ? "Storing…" : "Store encrypted"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setSecret(""); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm" variant="outline" onClick={() => setShowAdd(true)}
          className="mt-3 w-full text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Add a key
        </Button>
      )}
    </div>
  );
}
