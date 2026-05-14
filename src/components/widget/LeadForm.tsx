import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, Send, SkipForward } from "lucide-react";

interface CustomerFieldItem {
  key: string;
  label: string;
  type: "standard" | "custom";
  required: boolean;
  order: number;
}

interface LeadFormProps {
  onSubmit: (data: { name: string; email?: string; phone?: string }) => void;
  onSkip?: () => void;
  disabled?: boolean;
  componentData?: {
    requiredFields?: string[];
    prefillName?: string;
    prefillEmail?: string;
    prefillPhone?: string;
    customerFields?: CustomerFieldItem[];
  };
}

function findField(items: CustomerFieldItem[] | undefined, key: string): CustomerFieldItem | undefined {
  return items?.find(f => f.key === key);
}

function hasKey(items: CustomerFieldItem[] | undefined, ...keys: string[]): boolean {
  return keys.some(k => items?.some(f => f.key === k));
}

export function LeadForm({ onSubmit, onSkip, disabled, componentData }: LeadFormProps) {
  const customerFields = componentData?.customerFields;
  const requiredFields = componentData?.requiredFields ?? ["name"];
  const [name, setName] = useState(componentData?.prefillName ?? "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  const [email, setEmail] = useState(componentData?.prefillEmail ?? "");
  const [phone, setPhone] = useState(componentData?.prefillPhone ?? "");
  const [error, setError] = useState<string | null>(null);

  // Derive field visibility from customerFields, with fallback to requiredFields
  const nameField = customerFields ? findField(customerFields, 'full_name') || findField(customerFields, 'first_name') : null;
  const emailField = customerFields ? findField(customerFields, 'email') : null;
  const phoneField = customerFields ? findField(customerFields, 'phone') || findField(customerFields, 'whatsapp') : null;

  const showName = customerFields ? !!nameField : requiredFields.includes("name");
  const showEmail = customerFields ? !!emailField : requiredFields.includes("email");
  const showPhone = customerFields ? !!phoneField : requiredFields.includes("phone");

  const isNameRequired = customerFields ? (nameField?.required ?? true) : requiredFields.includes("name");
  const isEmailRequired = customerFields ? (emailField?.required ?? false) : false;
  const isPhoneRequired = customerFields ? (phoneField?.required ?? false) : false;

  const nameLabel = customerFields ? (nameField?.label ?? "Name") : "Name";
  const emailLabel = customerFields ? (emailField?.label ?? "Email") : "Email";
  const phoneLabel = customerFields ? (phoneField?.label ?? "Phone") : "Phone";

  const handleSubmit = () => {
    if (disabled) return;
    setError(null);

    const trimmedName = name.trim();
    if (showName && isNameRequired && (!trimmedName || trimmedName.length < 2)) {
      setError("Please enter your name.");
      return;
    }
    const trimmedEmail = email.trim();
    if (showEmail && trimmedEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
      }
    } else if (showEmail && isEmailRequired && !trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }
    const trimmedPhone = phone.trim();
    if (showPhone && trimmedPhone) {
      const digits = trimmedPhone.replace(/\D/g, "");
      if (digits.length < 7) {
        setError("Please enter a valid phone number.");
        return;
      }
    } else if (showPhone && isPhoneRequired && !trimmedPhone) {
      setError("Please enter your phone number.");
      return;
    }

    onSubmit({
      name: trimmedName || componentData?.prefillName || "",
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
    });
  };

  return (
    <Card className="p-4 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <User className="h-4 w-4 text-primary" />
        Your Details
      </p>

      <div className="space-y-3">
        {showName && (
          <div className="space-y-1">
            <Label htmlFor="lead-name" className="text-xs text-muted-foreground">
              {nameLabel} {isNameRequired && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={nameRef}
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Your ${nameLabel.toLowerCase()}`}
                disabled={disabled}
                className="pl-8 rounded-lg"
              />
            </div>
          </div>
        )}

        {showEmail && (
          <div className="space-y-1">
            <Label htmlFor="lead-email" className="text-xs text-muted-foreground">
              {emailLabel} {isEmailRequired && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you@example.com`}
                disabled={disabled}
                className="pl-8 rounded-lg"
              />
            </div>
          </div>
        )}

        {showPhone && (
          <div className="space-y-1">
            <Label htmlFor="lead-phone" className="text-xs text-muted-foreground">
              {phoneLabel} {isPhoneRequired && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                disabled={disabled}
                className="pl-8 rounded-lg"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            onClick={handleSubmit}
            disabled={disabled}
            size="sm"
            className="gap-1.5 rounded-lg flex-1 pressable"
            aria-label="Submit contact details"
          >
            <Send className="h-4 w-4" />
            Submit
          </Button>
          {onSkip && (
            <Button
              variant="ghost"
              onClick={onSkip}
              disabled={disabled}
              size="sm"
              className="gap-1.5 rounded-lg text-muted-foreground pressable"
              aria-label="Skip contact form"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
