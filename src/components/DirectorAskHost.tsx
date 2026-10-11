/**
 * DirectorAskHost — the global secure-input outlet, mounted once in App.
 *
 * When the brain needs something only the owner can give (credentials,
 * OTP, approvals, choices, files), this bottom-sheet appears wherever
 * the owner is — not buried in a tab. Masked fields with show/hide,
 * use-once vs save choice for secrets, Approve/Deny for consequential
 * actions with the consequences spelled out, countdown to expiry.
 * Local plaintext clears on submit and unmount. Nothing key-shaped is
 * ever logged, persisted, or rendered outside this sheet.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDirectorAsk, type AskRequest } from "@/hooks/useDirectorAsk";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";

function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

function AskForm({ req, onDone, answer, deny }: {
  req: AskRequest;
  onDone: () => void;
  answer: (id: string, values: Record<string, unknown>, opts?: { store?: boolean; provider?: string; vault_name?: string }) => Promise<void>;
  deny: (id: string) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [store, setStore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setFormError(null);
  };

  const submit = async (denied: boolean) => {
    setBusy(true);
    setFormError(null);
    try {
      if (denied || req.kind === "approval") {
        if (denied) await deny(req.id);
        else await answer(req.id, {});
        toast.success(denied ? "Denied — the task stops here." : "Approved.");
      } else {
        await answer(req.id, values, {
          store: req.kind === "credential" ? store : undefined,
          provider: req.kind === "credential" ? guessProvider(req) : undefined,
        });
        toast.success(req.kind === "credential" && store ? "Stored encrypted." : "Sent — resuming.");
      }
      setValues({});
      onDone();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Submit failed — correct it and retry.");
    } finally {
      setBusy(false);
    }
  };

  const isApproval = req.kind === "approval";

  return (
    <div className="space-y-3">
      {req.service && (
        <p className="text-xs text-muted-foreground">
          Service: <span className="font-medium text-foreground">{req.service}</span>
        </p>
      )}
      {req.reason && <p className="text-sm">{req.reason}</p>}
      {req.purpose && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          It will be used to: {req.purpose}
        </p>
      )}

      {!isApproval && req.fields.map((f) => (
        <div key={f.key}>
          <label className="mb-1 block text-xs font-medium" htmlFor={`ask-${req.id}-${f.key}`}>
            {f.label}
            {f.required !== false && <span className="text-destructive"> *</span>}
          </label>
          {(f.type === "yesno") ? (
            <div className="flex gap-2">
              {(["Yes", "No"] as const).map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={values[f.key] === (opt === "Yes") ? "default" : "outline"}
                  onClick={() => set(f.key, opt === "Yes")}
                  className="min-h-[44px] flex-1"
                >
                  {opt}
                </Button>
              ))}
            </div>
          ) : (f.type === "choice" && f.options) ? (
            <div className="flex flex-col gap-1.5">
              {f.options.map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={values[f.key] === opt ? "default" : "outline"}
                  onClick={() => set(f.key, opt)}
                  className="min-h-[44px] justify-start text-left"
                >
                  {opt}
                </Button>
              ))}
            </div>
          ) : (
            <div className="relative">
              <input
                id={`ask-${req.id}-${f.key}`}
                type={f.type === "password" && !show[f.key] ? "password" : f.type === "otp" ? "tel" : "text"}
                inputMode={f.type === "otp" ? "numeric" : undefined}
                autoComplete="off"
                value={String(values[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.type === "file" ? "File name in the runner's box" : f.help || ""}
                className="h-[44px] w-full rounded-xl border border-border bg-background px-3 pr-10 font-mono text-sm"
              />
              {f.type === "password" && (
                <button
                  aria-label={show[f.key] ? "Hide value" : "Show value"}
                  onClick={() => setShow((s) => ({ ...s, [f.key]: !s[f.key] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {show[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
          )}
          {f.help && f.type !== "password" && (
            <p className="mt-1 text-[11px] text-muted-foreground">{f.help}</p>
          )}
        </div>
      ))}

      {req.kind === "credential" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={store ? "default" : "outline"}
            onClick={() => setStore(true)}
            className="min-h-[44px] flex-1 text-xs"
          >
            Save securely
          </Button>
          <Button
            size="sm"
            variant={!store ? "default" : "outline"}
            onClick={() => setStore(false)}
            className="min-h-[44px] flex-1 text-xs"
          >
            Just this once
          </Button>
        </div>
      )}

      {formError && (
        <p className="rounded-lg border border-destructive/40 px-3 py-2 text-xs text-destructive" role="alert">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        {isApproval ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => { void submit(false); }}
              className="min-h-[44px] flex-1"
            >
              <ShieldAlert className="mr-1 h-4 w-4" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => { void submit(true); }}
              className="min-h-[44px] flex-1"
            >
              Deny
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => { void submit(false); }}
              className="min-h-[44px] flex-1"
            >
              {busy ? "Sending…" : "Send"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => { void submit(true); }}
              className="min-h-[44px]"
            >
              Skip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function guessProvider(req: AskRequest): string {
  const hay = `${req.service} ${req.title}`.toLowerCase();
  for (const p of ["elevenlabs", "stripe", "paystack", "assemblyai", "resend", "openai", "google_maps", "twilio_sms", "whatsapp"]) {
    if (hay.includes(p.replace("_", " ")) || hay.includes(p)) return p;
  }
  return "custom";
}

export function DirectorAskHost() {
  const { pending, answer, deny } = useDirectorAsk(true);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const now = useNow();

  const current = useMemo(
    () => pending.find((r) => r.id !== dismissed && r.status === "pending") || null,
    [pending, dismissed],
  );

  useEffect(() => {
    setDismissed(null);
  }, [pending.length]);

  if (!current) return null;
  const msLeft = new Date(current.expires_at).getTime() - now;
  if (msLeft <= 0) return null;

  const mm = Math.floor(msLeft / 60000);
  const ss = Math.floor((msLeft % 60000) / 1000);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) setDismissed(current.id); }}>
      <DialogContent
        aria-label={current.title || "Director needs you"}
        className="max-h-[88vh] overflow-y-auto sm:max-w-md max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle className="pr-6 text-left">
            {current.title || (current.kind === "approval" ? "Approval needed" : "Director needs input")}
          </DialogTitle>
          <p className="text-left text-xs text-muted-foreground">
            Expires in {mm}:{String(ss).padStart(2, "0")} · dismiss pauses nothing, the request waits
          </p>
        </DialogHeader>
        <AskForm req={current} onDone={() => setDismissed(current.id)} answer={answer} deny={deny} />
      </DialogContent>
    </Dialog>
  );
}
