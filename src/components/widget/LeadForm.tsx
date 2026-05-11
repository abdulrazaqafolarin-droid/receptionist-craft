import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, Send, SkipForward } from "lucide-react";

interface LeadFormProps {
  onSubmit: (data: { name: string; email?: string; phone?: string }) => void;
  onSkip?: () => void;
  disabled?: boolean;
  componentData?: {
    requiredFields?: string[];
    prefillName?: string;
    prefillEmail?: string;
    prefillPhone?: string;
  };
}

export function LeadForm({ onSubmit, onSkip, disabled, componentData }: LeadFormProps) {
  const requiredFields = componentData?.requiredFields ?? ["name"];
  const [name, setName] = useState(componentData?.prefillName ?? "");
  const [email, setEmail] = useState(componentData?.prefillEmail ?? "");
  const [phone, setPhone] = useState(componentData?.prefillPhone ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (disabled) return;
    setError(null);

    const trimmedName = name.trim();
    if (requiredFields.includes("name") && (!trimmedName || trimmedName.length < 2)) {
      setError("Please enter your name.");
      return;
    }
    const trimmedEmail = email.trim();
    if (requiredFields.includes("email") && trimmedEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
      }
    }
    const trimmedPhone = phone.trim();
    if (requiredFields.includes("phone") && trimmedPhone) {
      const digits = trimmedPhone.replace(/\D/g, "");
      if (digits.length < 7) {
        setError("Please enter a valid phone number.");
        return;
      }
    }

    onSubmit({
      name: trimmedName,
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
    });
  };

  const needsName = requiredFields.includes("name");
  const needsEmail = requiredFields.includes("email");
  const needsPhone = requiredFields.includes("phone");

  return (
    <Card className="p-4 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <User className="h-4 w-4 text-primary" />
        Your Details
      </p>

      <div className="space-y-3">
        {needsName && (
          <div className="space-y-1">
            <Label htmlFor="lead-name" className="text-xs text-muted-foreground">
              Name {needsName && <span className="text-destructive">*</span>}
            </Label>
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={disabled}
                className="pl-8 rounded-lg"
              />
            </div>
          </div>
        )}

        {needsEmail && (
          <div className="space-y-1">
            <Label htmlFor="lead-email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={disabled}
                className="pl-8 rounded-lg"
              />
            </div>
          </div>
        )}

        {needsPhone && (
          <div className="space-y-1">
            <Label htmlFor="lead-phone" className="text-xs text-muted-foreground">
              Phone
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
            className="gap-1.5 rounded-lg flex-1"
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
              className="gap-1.5 rounded-lg text-muted-foreground"
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
