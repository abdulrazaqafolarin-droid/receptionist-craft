import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, Plus, Trash2, Clock, ShoppingBag, DollarSign, CheckCircle2, MessageSquare, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ItemType } from "@/store/onboarding";

type ParsedItem = {
  name: string;
  type: ItemType;
  duration_minutes: number;
  price?: number;
  description: string;
  active: boolean;
  noTime?: boolean;
};

type AIServiceParserProps = {
  businessType: string;
  onAddItems: (items: ParsedItem[]) => void;
  disabled?: boolean;
};

export function AIServiceParser({ businessType, onAddItems, disabled }: AIServiceParserProps) {
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ duration: number; price: number; noTime: boolean }>({ duration: 0, price: 0, noTime: false });

  const handleParse = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter a description of your services and products");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-services", {
        body: { text: inputText, businessType },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (!data.items || data.items.length === 0) {
        toast.error("Could not identify any services or products. Please try describing them differently.");
        return;
      }

      const itemsWithNoTime = data.items.map((item: ParsedItem) => ({
        ...item,
        noTime: item.type === 'service' && item.duration_minutes === 0,
      }));

      setParsedItems(itemsWithNoTime);
      setShowResults(true);
      toast.success(`Found ${data.items.length} items!`);
    } catch (error: any) {
      console.error("Parse error:", error);
      toast.error(error.message || "Failed to parse your input. Please try again.");
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
              price: item.type === 'product' ? editValues.price : item.price,
              noTime: editValues.noTime,
            }
          : item
      )
    );
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleAddAll = () => {
    if (parsedItems.length === 0) return;
    const itemsToAdd = parsedItems.map(item => ({
      ...item,
      duration_minutes: item.noTime ? 0 : item.duration_minutes,
    }));
    onAddItems(itemsToAdd);
    toast.success(`Added ${parsedItems.length} items!`);
    setParsedItems([]);
    setInputText("");
    setShowResults(false);
  };

  const handleReset = () => {
    setParsedItems([]);
    setShowResults(false);
    setEditingIndex(null);
  };

  const servicesCount = parsedItems.filter((i) => i.type === "service").length;
  const productsCount = parsedItems.filter((i) => i.type === "product").length;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          AI Quick Add
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Describe all your services and products in plain text — AI will organize them for you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 sm:px-6">
        {!showResults ? (
          <>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                placeholder={`Example:\n• Haircut - 30 mins\n• Hair coloring - 2 hours\n• Shampoo $12\n• Hair spray $18\n• Deep conditioning 45 min\n• Premium hair oil $25\n\nOr simply list them:\nMen's haircut, women's haircut, kids cut, beard trim, hair gel, combs...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={8}
                className="pl-10 resize-none text-sm sm:text-base"
                disabled={disabled || isLoading}
              />
            </div>
            <Button
              onClick={handleParse}
              disabled={disabled || isLoading || !inputText.trim()}
              className="w-full"
              size="lg"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Parse & Organize
                </>
              )}
            </Button>
          </>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-background text-xs sm:text-sm">
                <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                {parsedItems.length} items found
              </Badge>
              {servicesCount > 0 && (
                <Badge variant="secondary" className="text-xs sm:text-sm">
                  <Clock className="mr-1 h-3 w-3" />
                  {servicesCount} services
                </Badge>
              )}
              {productsCount > 0 && (
                <Badge variant="secondary" className="text-xs sm:text-sm">
                  <ShoppingBag className="mr-1 h-3 w-3" />
                  {productsCount} products
                </Badge>
              )}
            </div>

            {/* Parsed Items List */}
            <div className="space-y-2 max-h-80 sm:max-h-96 overflow-y-auto pr-1">
              {parsedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 sm:p-4 bg-background border rounded-lg space-y-2"
                >
                  {/* Item Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                      {item.type === "product" ? (
                        <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-sm sm:text-base break-words">{item.name}</span>
                      <Badge
                        variant={item.type === "product" ? "secondary" : "outline"}
                        className="text-xs shrink-0"
                      >
                        {item.type === "product" ? "Product" : "Service"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {editingIndex !== idx && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(idx)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(idx)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground ml-6">
                      {item.description}
                    </p>
                  )}

                  {/* Edit Mode */}
                  {editingIndex === idx ? (
                    <div className="ml-6 space-y-3 pt-2 border-t">
                      {item.type === "service" ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <Switch
                              id={`no-time-${idx}`}
                              checked={editValues.noTime}
                              onCheckedChange={(checked) =>
                                setEditValues((prev) => ({ ...prev, noTime: checked }))
                              }
                            />
                            <Label htmlFor={`no-time-${idx}`} className="text-sm cursor-pointer">
                              No specific duration
                            </Label>
                          </div>
                          {!editValues.noTime && (
                            <div className="flex items-center gap-2">
                              <Label htmlFor={`duration-${idx}`} className="text-sm whitespace-nowrap">
                                Duration:
                              </Label>
                              <Input
                                id={`duration-${idx}`}
                                type="number"
                                min={1}
                                value={editValues.duration}
                                onChange={(e) =>
                                  setEditValues((prev) => ({
                                    ...prev,
                                    duration: parseInt(e.target.value) || 0,
                                  }))
                                }
                                className="w-20 h-8 text-sm"
                              />
                              <span className="text-sm text-muted-foreground">minutes</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`price-${idx}`} className="text-sm whitespace-nowrap">
                            Price:
                          </Label>
                          <div className="relative">
                            <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              id={`price-${idx}`}
                              type="number"
                              min={0}
                              step={0.01}
                              value={editValues.price}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  price: parseFloat(e.target.value) || 0,
                                }))
                              }
                              className="w-24 h-8 text-sm pl-7"
                            />
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8"
                        >
                          <X className="mr-1 h-3 w-3" />
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(idx)}
                          className="h-8"
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div className="ml-6 flex items-center gap-2 flex-wrap">
                      {item.type === "product" ? (
                        <Badge variant="outline" className="flex items-center gap-1 text-xs">
                          <DollarSign className="h-3 w-3" />
                          {item.price || 0}
                        </Badge>
                      ) : item.noTime ? (
                        <Badge variant="outline" className="text-xs">
                          No set duration
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />
                          {item.duration_minutes}m
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={handleReset} className="flex-1 order-2 sm:order-1">
                Start Over
              </Button>
              <Button
                onClick={handleAddAll}
                disabled={parsedItems.length === 0}
                className="flex-1 order-1 sm:order-2"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add All ({parsedItems.length})
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
