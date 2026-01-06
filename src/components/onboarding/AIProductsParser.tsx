import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2, Trash2, DollarSign, CheckCircle2, MessageSquare, Pencil, Check, X, AlertCircle, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ItemType } from "@/store/onboarding";

type ParsedProduct = {
  name: string;
  type: 'product';
  duration_minutes: number;
  price?: number | null;
  priceSpecified?: boolean;
  description: string;
  active: boolean;
  addPriceChoice?: 'now' | 'later' | null;
};

type AIProductsParserProps = {
  businessType: string;
  onAddItems: (items: ParsedProduct[]) => void;
  disabled?: boolean;
};

export function AIProductsParser({ businessType, onAddItems, disabled }: AIProductsParserProps) {
  const [inputText, setInputText] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);

  const handleParse = async () => {
    if (!inputText.trim()) {
      toast.error("Please enter a description of your products");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-services", {
        body: { text: inputText, businessType, filterType: 'product' },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      const productItems = (data.items || []).filter((item: any) => item.type === 'product');
      
      if (productItems.length === 0) {
        toast.error("Could not identify any products. Please try describing them differently.");
        return;
      }

      const itemsProcessed = productItems.map((item: ParsedProduct) => ({
        ...item,
        type: 'product' as const,
        duration_minutes: 0,
        priceSpecified: item.price != null,
        addPriceChoice: item.price == null ? null : undefined,
      }));

      setParsedItems(itemsProcessed);
      setShowResults(true);
      toast.success(`Found ${itemsProcessed.length} products!`);
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
    setEditPrice(item.price || 0);
  };

  const handleSaveEdit = (index: number) => {
    setParsedItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              price: editPrice > 0 ? editPrice : null,
              priceSpecified: editPrice > 0,
              addPriceChoice: editPrice > 0 ? undefined : item.addPriceChoice,
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
      price: item.price ?? undefined,
    }));
    onAddItems(itemsToAdd as any);
    toast.success(`Added ${parsedItems.length} products!`);
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
    <Card className="border-secondary/30 bg-gradient-to-br from-secondary/5 to-transparent">
      <CardHeader className="pb-3 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingBag className="h-4 w-4 text-secondary-foreground" />
          AI Products Parser
        </CardTitle>
        <CardDescription className="text-xs">
          Describe your products — AI will organize them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {!showResults ? (
          <>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                placeholder={`Example:\n• Hair spray $18\n• Premium shampoo $25\n• Hair gel $15\n\nOr simply list them:\nShampoo, conditioner, hair oil, styling cream...`}
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
              variant="secondary"
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
                  Parse Products
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
                {parsedItems.length} products found
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
                      <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
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
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">Price:</Label>
                        <div className="relative">
                          <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={editPrice}
                            onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                            className="w-24 h-7 text-xs pl-6"
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
                              <RadioGroupItem value="now" id={`prod-price-now-${idx}`} />
                              <Label htmlFor={`prod-price-now-${idx}`} className="text-xs cursor-pointer">Add now</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="later" id={`prod-price-later-${idx}`} />
                              <Label htmlFor={`prod-price-later-${idx}`} className="text-xs cursor-pointer">Add later</Label>
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
              <Button onClick={handleAddAll} disabled={itemsNeedingPriceDecision > 0} className="flex-1" variant="secondary" size="sm">
                <Check className="mr-1 h-3 w-3" /> Add All Products
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
