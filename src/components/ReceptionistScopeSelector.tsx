import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReceptionistOption, ReceptionistScopeState } from "@/hooks/useReceptionistScope";
import { Users, User, ListFilter } from "lucide-react";

interface ReceptionistScopeSelectorProps {
  receptionists: ReceptionistOption[];
  value: ReceptionistScopeState;
  onChange: (value: ReceptionistScopeState) => void;
  compact?: boolean;
}

export function ReceptionistScopeSelector({ receptionists, value, onChange, compact = false }: ReceptionistScopeSelectorProps) {
  const selectedCount = value.mode === "all" ? receptionists.length : value.receptionistIds.length;

  const selectedLabel =
    value.mode === "all"
      ? "All receptionists"
      : value.mode === "single"
        ? receptionists.find((r) => r.id === value.receptionistIds[0])?.name || "Select receptionist"
        : `${selectedCount} selected`;

  if (receptionists.length === 0) return null;

  return (
    <Card className={compact ? "border-primary/20" : "border-primary/20 bg-primary/5"}>
      <CardContent className={compact ? "p-3" : "p-4"}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListFilter className="h-4 w-4 text-primary" />
            Receptionist scope
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={value.mode === "single" ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ mode: "single", receptionistIds: [value.receptionistIds[0] || receptionists[0].id] })}
            >
              <User className="mr-1 h-3 w-3" /> Single
            </Button>
            <Button
              type="button"
              variant={value.mode === "multi" ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ mode: "multi", receptionistIds: value.receptionistIds.length ? value.receptionistIds : [receptionists[0].id] })}
            >
              <Users className="mr-1 h-3 w-3" /> Multi-select
            </Button>
            <Button
              type="button"
              variant={value.mode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ mode: "all", receptionistIds: [] })}
            >
              All
            </Button>
          </div>

          {value.mode === "single" && (
            <div className="min-w-[220px]">
              <Label className="sr-only">Select receptionist</Label>
              <Select
                value={value.receptionistIds[0] || ""}
                onValueChange={(id) => onChange({ mode: "single", receptionistIds: [id] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select receptionist" />
                </SelectTrigger>
                <SelectContent>
                  {receptionists.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {value.mode === "multi" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Choose receptionists ({selectedCount})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                {receptionists.map((r) => {
                  const checked = value.receptionistIds.includes(r.id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={r.id}
                      checked={checked}
                      onCheckedChange={(nextChecked) => {
                        const nextIds = nextChecked
                          ? [...value.receptionistIds, r.id]
                          : value.receptionistIds.filter((id) => id !== r.id);
                        if (nextIds.length === 0) return;
                        onChange({ mode: "multi", receptionistIds: Array.from(new Set(nextIds)) });
                      }}
                    >
                      {r.name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Badge variant="outline">{selectedLabel}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
