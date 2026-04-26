import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  initialName?: string;
  initialContact?: string;
  disabled?: boolean;
  onSubmit: (payload: { name: string; contact: string }) => void;
}

export function LeadCaptureForm({ initialName = "", initialContact = "", disabled, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [contact, setContact] = useState(initialContact);

  return (
    <div className="space-y-2 rounded-xl border border-border/60 p-3 bg-card">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        disabled={disabled}
      />
      <Input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="Email or phone"
        disabled={disabled}
      />
      <Button
        className="w-full"
        disabled={disabled || !name.trim() || !contact.trim()}
        onClick={() => onSubmit({ name: name.trim(), contact: contact.trim() })}
      >
        Continue
      </Button>
    </div>
  );
}
