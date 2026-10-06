import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, Loader2 } from "lucide-react";
import { validateValues, type CollectSchema } from "@/lib/collectSchema";

interface CollectDialogProps {
  schema: CollectSchema | null;
  open: boolean;
  initialValues?: Record<string, string>;
  submitLabel?: string;
  onClose: () => void;
  /** Parent verifies, persists, toasts, and closes. Receives trimmed values. */
  onSubmit: (values: Record<string, string>) => Promise<void>;
  /** Extra footer content (e.g. a provider sign-in button after save). */
  footerExtra?: React.ReactNode;
}

/**
 * The ONE collection dialog. Renders any CollectSchema — credentials,
 * contact facts, links, preferences, future needs — with validation,
 * in-depth hints, and guided OAuth setup blocks. New needs add a schema
 * entry, never new UI.
 */
export function CollectDialog({
  schema,
  open,
  initialValues,
  submitLabel,
  onClose,
  onSubmit,
  footerExtra,
}: CollectDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Fresh values per schema (dialog is reused across needs).
  useEffect(() => {
    if (open && schema) {
      const init: Record<string, string> = {};
      for (const f of schema.fields) init[f.name] = initialValues?.[f.name] || "";
      setValues(init);
      setErrors({});
      setSaving(false);
    }
  }, [open, schema, initialValues]);

  if (!open || !schema) {
    return (
      <Dialog open={false} onOpenChange={onClose}>
        <DialogContent />
      </Dialog>
    );
  }

  async function handleSubmit() {
    if (saving) return;
    const trimmed: Record<string, string> = {};
    for (const f of schema!.fields) trimmed[f.name] = (values[f.name] || "").trim();
    const errs = validateValues(schema!, trimmed);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setSaving(false);
    }
  }

  const guide = schema.oauthGuide;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{schema.title}</DialogTitle>
          <DialogDescription>{schema.description}</DialogDescription>
        </DialogHeader>

        {guide && (
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm space-y-2">
            <p className="font-medium">Provider app required (one-time, ~5 minutes)</p>
            <p className="text-muted-foreground">
              This connects through your own app on the provider side. Create it, then paste the
              credentials below.
            </p>
            <a
              href={guide.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
            >
              Open {guide.consoleName} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {guide.scopes && guide.scopes.length > 0 && (
              <p className="text-muted-foreground">Scopes to enable: {guide.scopes.join(", ")}</p>
            )}
          </div>
        )}

        {schema.fields.map((f) => (
          <div key={f.name} className="grid gap-1.5">
            <Label htmlFor={`collect-${f.name}`}>{f.label}</Label>
            {f.kind === "textarea" ? (
              <Textarea
                id={`collect-${f.name}`}
                placeholder={f.placeholder}
                value={values[f.name] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                rows={3}
              />
            ) : f.kind === "select" ? (
              <select
                id={`collect-${f.name}`}
                value={values[f.name] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose…</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <Input
                id={`collect-${f.name}`}
                type={f.kind === "password" ? "password" : f.kind === "email" ? "email" : f.kind === "url" ? "url" : f.kind === "tel" ? "tel" : "text"}
                inputMode={f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : f.kind === "url" ? "url" : undefined}
                placeholder={f.placeholder}
                value={values[f.name] || ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                autoComplete="off"
                aria-invalid={!!errors[f.name]}
              />
            )}
            {f.hint && !errors[f.name] && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            {errors[f.name] && <p className="text-xs text-destructive" role="alert">{errors[f.name]}</p>}
          </div>
        ))}

        {schema.helpUrl && (
          <a
            href={schema.helpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
          >
            Setup guide <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {footerExtra}
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving} className="flex-1">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel || schema.submitLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
