import React, { useState } from "react";
import { GripVertical, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CustomerField {
  key: string;
  label: string;
  type: "standard" | "custom";
  required: boolean;
  order: number;
}

const STANDARD_FIELD_OPTIONS = [
  { key: "full_name", label: "Full Name" },
  { key: "first_name", label: "First Name" },
  { key: "email", label: "Email Address" },
  { key: "phone", label: "Phone Number" },
  { key: "whatsapp", label: "WhatsApp Number" },
  { key: "address", label: "Address" },
];

interface Props {
  fields: CustomerField[];
  onChange: (fields: CustomerField[]) => void;
}

export function CustomerFieldsConfig({ fields, onChange }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const usedKeys = new Set(fields.map((f) => f.key));
  const availableStandard = STANDARD_FIELD_OPTIONS.filter(
    (o) => !usedKeys.has(o.key)
  );

  function addStandardField(key: string) {
    const opt = STANDARD_FIELD_OPTIONS.find((o) => o.key === key);
    if (!opt) return;
    const newField: CustomerField = {
      key: opt.key,
      label: opt.label,
      type: "standard",
      required: false,
      order: fields.length,
    };
    onChange([...fields, newField]);
  }

  function addCustomField() {
    const customKey = `custom_${Date.now()}`;
    const newField: CustomerField = {
      key: customKey,
      label: "",
      type: "custom",
      required: false,
      order: fields.length,
    };
    onChange([...fields, newField]);
  }

  function removeField(key: string) {
    onChange(
      fields
        .filter((f) => f.key !== key)
        .map((f, i) => ({ ...f, order: i }))
    );
  }

  function updateField(key: string, updates: Partial<CustomerField>) {
    onChange(fields.map((f) => (f.key === key ? { ...f, ...updates } : f)));
  }

  function moveField(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const reordered = [...fields];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    onChange(reordered.map((f, i) => ({ ...f, order: i })));
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="bg-muted/30 rounded-lg border border-border p-4">
      <button
        type="button"
        className="flex items-center justify-between w-full text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div>
          <h3 className="text-sm font-semibold">📋 Customer Information Fields</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose what info your AI collects from customers
          </p>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-2">
          {sorted.map((field, idx) => (
            <div
              key={field.key}
              className="flex items-center gap-2 bg-card rounded-lg border border-border px-3 py-2"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={() => moveField(idx, -1)}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
                  disabled={idx === sorted.length - 1}
                  onClick={() => moveField(idx, 1)}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>

              {field.type === "custom" ? (
                <Input
                  className="flex-1 h-8 text-sm"
                  placeholder="Custom field label..."
                  value={field.label}
                  onChange={(e) =>
                    updateField(field.key, { label: e.target.value })
                  }
                />
              ) : (
                <span className="flex-1 text-sm font-medium">{field.label}</span>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs text-muted-foreground">Required</label>
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) =>
                    updateField(field.key, { required: checked })
                  }
                />
              </div>

              <button
                type="button"
                className="p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-colors"
                onClick={() => removeField(field.key)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {/* Add buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            {availableStandard.length > 0 && (
              <Select onValueChange={addStandardField}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="+ Add standard field" />
                </SelectTrigger>
                <SelectContent>
                  {availableStandard.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={addCustomField}
            >
              <Plus className="h-3 w-3 mr-1" /> Custom Field
            </Button>
          </div>

          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2">
              No fields configured. The AI won't collect any customer information.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const DEFAULT_CUSTOMER_FIELDS: CustomerField[] = [
  { key: "full_name", label: "Full Name", type: "standard", required: true, order: 0 },
  { key: "email", label: "Email Address", type: "standard", required: false, order: 1 },
  { key: "phone", label: "Phone Number", type: "standard", required: false, order: 2 },
];
