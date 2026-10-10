/**
 * DevicesPanel — the Director's computers.
 *
 * Pair a machine once (the secret shows once — paste it into the
 * companion app's config, then it is gone from here forever), flip the
 * master switch per device, revoke to cut it off instantly. A device
 * that is off gets no work; a revoked device is forgotten entirely.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCompanionDevices } from "@/hooks/useCompanionDevices";
import { toast } from "sonner";
import { Copy, Check, MonitorSmartphone, Plus, Trash2 } from "lucide-react";

export function DevicesPanel() {
  const { devices, loading, error, pairDevice, setEnabled, revokeDevice } = useCompanionDevices(true);
  const [showPair, setShowPair] = useState(false);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("windows");
  const [busy, setBusy] = useState<string | null>(null);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const doPair = async () => {
    setBusy("pair");
    try {
      const { secret } = await pairDevice(name.trim() || "My computer", platform);
      setFreshSecret(secret);
      setCopied(false);
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Pair failed.");
    } finally {
      setBusy(null);
    }
  };

  const doCopy = async () => {
    if (!freshSecret) return;
    try {
      await navigator.clipboard.writeText(freshSecret);
      setCopied(true);
    } catch {
      toast.error("Copy blocked — select it manually.");
    }
  };

  const doRevoke = async (id: string, deviceName: string) => {
    if (!window.confirm(`Remove "${deviceName}"? It stops receiving work immediately.`)) return;
    setBusy(`revoke-${id}`);
    try {
      await revokeDevice(id);
      toast.success("Device removed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Remove failed.");
    } finally {
      setBusy(null);
    }
  };

  const seen = (iso: string | null) => {
    if (!iso) return "never seen";
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "alive now";
    if (mins < 60) return `${mins}m ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
        Computers the Director may drive — only when you ask, in that moment.
        Off means no hands; removing forgets the machine entirely.
      </p>

      {loading && <p className="px-1 py-4 text-xs text-muted-foreground">Checking devices…</p>}
      {error && (
        <p className="mt-2 rounded-xl border border-destructive/40 px-3 py-2.5 text-xs text-destructive">{error}</p>
      )}

      {!loading && !error && devices.length === 0 && !showPair && !freshSecret && (
        <div className="px-1 py-6 text-center">
          <MonitorSmartphone className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No computers paired</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            Pair this machine and the Director can click, type, and read your screen when you ask.
          </p>
        </div>
      )}

      {freshSecret && (
        <div className="mt-2 rounded-xl border border-primary/40 p-3">
          <p className="text-xs font-medium">Paste this into the companion app — it shows once, then never again.</p>
          <p className="mt-1 break-all rounded-lg bg-muted/60 p-2 font-mono text-[11px]">{freshSecret}</p>
          <div className="mt-1.5 flex gap-1">
            <Button size="sm" onClick={() => { void doCopy(); }} className="h-7 text-xs">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFreshSecret(null)} className="h-7 text-xs">
              I've saved it
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-2 space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium">{d.name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="mr-1 inline-block rounded bg-muted px-1.5 py-0.5 font-medium">{d.platform}</span>
                {d.enabled ? ` · ${seen(d.last_seen)}` : " · paused"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                role="switch"
                aria-checked={d.enabled}
                aria-label={`${d.name} hands`}
                disabled={busy !== null}
                onClick={() => { void (async () => { setBusy(`toggle-${d.id}`); try { await setEnabled(d.id, !d.enabled); } catch (e) { toast.error(e instanceof Error ? e.message : "Toggle failed."); } finally { setBusy(null); } })(); }}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${d.enabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.enabled ? "left-[22px]" : "left-0.5"}`} aria-hidden="true" />
              </button>
              <Button variant="ghost" size="sm" aria-label={`Remove ${d.name}`} disabled={busy !== null} onClick={() => { void doRevoke(d.id, d.name); }}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {showPair ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name — e.g. Office PC"
            maxLength={60}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="windows">Windows</option>
            <option value="macos">macOS</option>
            <option value="android">Android</option>
            <option value="runner">Runner (shell)</option>
          </select>
          <div className="flex gap-1">
            <Button size="sm" disabled={busy !== null} onClick={() => { void doPair(); }} className="text-xs">
              {busy === "pair" ? "Pairing…" : "Pair this machine"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPair(false)} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowPair(true)} className="mt-3 w-full text-xs">
          <Plus className="h-3.5 w-3.5" /> Pair a computer
        </Button>
      )}
    </div>
  );
}
