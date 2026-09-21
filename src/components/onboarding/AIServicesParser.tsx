import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2, Trash2, Clock, DollarSign, CheckCircle2, MessageSquare, Pencil, Check, X, AlertCircle, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ItemType } from "@/store/onboarding";

type ParsedService = {
  name: string;
  type: 'service';
  duration_minutes: number;
  price?: number | null;
  priceSpecified?: boolean;
  description: string;
  active: boolean;
  noTime?: boolean;
  addPriceChoice?: 'now' | 'later' | null;
};

type AIServicesParserProps = {
  businessType: string;
  onAddItems: (items: (ParsedService | { type: ItemType })[]) => void;
  disabled?: boolean;
};

export function AIServicesParser({ businessType, onAddItems, disabled }: AIServicesParserProps) {
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ duration: number; price: number; noTime: boolean }>({ duration: 0, price: 0, noTime: false });

  const handleParse = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter a description of your services");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-services", {
        body: { text: inputText, businessType, filterType: 'service' },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const serviceItems = (data.items || []).filter((item: ParsedService) => item.type === 'service');
      
      if (serviceItems.length === 0) {
        toast.error("Could not identify any services. Please try describing them differently.");
        return;
      }

      const itemsProcessed = serviceItems.map((item: ParsedService) => ({
        ...item,
        type: 'service' as const,
        noTime: item.duration_minutes === 0,
        priceSpecified: item.price != null,
        addPriceChoice: item.price == null ? null : undefined,
      }));

      setParsedItems(itemsProcessed);
      setShowResults(true);
      toast.success(`Found ${itemsProcessed.length} services!`);
    } catch (error) {
      console.error("Parse error:", error);
      const message = error instanceof Error ? error.message : "Failed to parse your input. Please try again.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveItem = (index: number) => {
    setParsedItems((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) {
      setEditingIndex(null);
    }
  };

  const handleStartEdit = (index: number) => {
    const item = parsedItems[index];
    setEditingIndex(index);
    setEditValues({
      duration: item.duration_minutes,
      price: item.price || 0,
      noTime: item.noTime || false,
    });
  };

  const handleSaveEdit = (index: number) => {
    setParsedItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              duration_minutes: editValues.noTime ? 0 : editValues.duration,
              price: editValues.price > 0 ? editValues.price : null,
              noTime: editValues.noTime,
              priceSpecified: editValues.price > 0,
              addPriceChoice: editValues.price > 0 ? undefined : item.addPriceChoice,
            }
          : item
      )
    );
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handlePriceChoice = (index: number, choice: 'now' | 'later') => {
    setParsedItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, addPriceChoice: choice } : item
      )
    );
    if (choice === 'now') {
      handleStartEdit(index);
    }
  };

  const handleAddAll = () => {
    if (parsedItems.length === 0) return;
    const itemsToAdd = parsedItems.map(item => ({
      ...item,
      type: 'service' as ItemType,
      duration_minutes: item.noTime ? 0 : item.duration_minutes,
      price: item.price ?? undefined,
    }));
    onAddItems(itemsToAdd);
    toast.success(`Added ${parsedItems.length} services!`);
    setParsedItems([]);
    setInputText("");
    setShowResults(false);
  };

  const handleReset = () => {
    setParsedItems([]);
    setShowResults(false);
    setEditingIndex(null);
  };

  const itemsNeedingPriceDecision = parsedItems.filter(i => !i.priceSpecified && i.addPriceChoice === null).length;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-primary" />
          AI Services Parser
        </CardTitle>
        <CardDescription className="text-xs">
          Describe your services — AI will organize them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {!showResults ? (
          <>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                placeholder={`Example:\n• Haircut $25 - 30 mins\n• Hair coloring $80 - 2 hours\n• Deep conditioning 45 min\n\nOr simply list them:\nMen's haircut, women's haircut, kids cut, beard trim...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={6}
                className="pl-10 resize-none text-sm"
                disabled={disabled || isLoading}
              />
            </div>
            <Button
              onClick={handleParse}
              disabled={disabled || isLoading || !inputText.trim()}
              className="w-full"
              size="default"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Parse Services
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-background text-xs">
                <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                {parsedItems.length} services found
              </Badge>
            </div>

            {/* Warning for items needing price decision */}
            {itemsNeedingPriceDecision > 0 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{itemsNeedingPriceDecision} item(s) need pricing decision</span>
              </div>
            )}

            {/* Parsed Items List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {parsedItems.map((item, idx) => (
                <div key={idx} className="p-3 bg-background border rounded-lg space-y-2">
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm break-words">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingIndex !== idx && (
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit(idx)} className="h-7 w-7 p-0">
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(idx)} className="h-7 w-7 p-0">
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Edit Mode */}
                  {editingIndex === idx ? (
                    <div className="ml-6 space-y-2 pt-2 border-t">
                      <div className="flex items-center gap-3">
                        <Switch
                          id={`no-time-${idx}`}
                          checked={editValues.noTime}
                          onCheckedChange={(checked) => setEditValues((prev) => ({ ...prev, noTime: checked }))}
                        />
                        <Label htmlFor={`no-time-${idx}`} className="text-xs cursor-pointer">No specific duration</Label>
                      </div>
                      {!editValues.noTime && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap">Duration:</Label>
                          <Input
                            type="number"
                            min={1}
                            value={editValues.duration}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
                            className="w-20 h-7 text-xs"
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Price:</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editValues.price}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                            className="w-20 h-7 text-xs pl-6"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleCancelEdit} className="h-7 text-xs">
                          <X className="mr-1 h-3 w-3" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => handleSaveEdit(idx)} className="h-7 text-xs">
                          <Check className="mr-1 h-3 w-3" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="ml-6 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.noTime ? (
                          <Badge variant="outline" className="text-xs">No set duration</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="h-3 w-3 mr-1" /> {item.duration_minutes}m
                          </Badge>
                        )}
                        {item.priceSpecified && item.price != null && (
                          <Badge variant="outline" className="flex items-center gap-1 text-xs">
                            <DollarSign className="h-3 w-3" /> {item.price}
                          </Badge>
                        )}
                      </div>
                      
                      {!item.priceSpecified && item.addPriceChoice === null && (
                        <div className="p-2 bg-muted/50 rounded-lg space-y-2">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> No price specified
                          </p>
                          <RadioGroup className="flex gap-4" onValueChange={(value) => handlePriceChoice(idx, value as 'now' | 'later')}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="now" id={`price-now-${idx}`} />
                              <Label htmlFor={`price-now-${idx}`} className="text-xs cursor-pointer">Add now</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="later" id={`price-later-${idx}`} />
                              <Label htmlFor={`price-later-${idx}`} className="text-xs cursor-pointer">Add later</Label>
                            </div>
                          </RadioGroup>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleReset} className="flex-1" size="sm">
                Start Over
              </Button>
              <Button onClick={handleAddAll} disabled={itemsNeedingPriceDecision > 0} className="flex-1" size="sm">
                <Check className="mr-1 h-3 w-3" /> Add All Services
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
