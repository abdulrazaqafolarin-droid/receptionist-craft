import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Loader2, Plus, Trash2, Clock, ShoppingBag, DollarSign, CheckCircle2, MessageSquare } from "lucide-react";
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

      setParsedItems(data.items);
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
  };

  const handleAddAll = () => {
    if (parsedItems.length === 0) return;
    onAddItems(parsedItems);
    toast.success(`Added ${parsedItems.length} items!`);
    setParsedItems([]);
    setInputText("");
    setShowResults(false);
  };

  const handleReset = () => {
    setParsedItems([]);
    setShowResults(false);
  };

  const servicesCount = parsedItems.filter((i) => i.type === "service").length;
  const productsCount = parsedItems.filter((i) => i.type === "product").length;

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Quick Add
        </CardTitle>
        <CardDescription>
          Describe all your services and products in plain text — AI will organize them for you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!showResults ? (
          <>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                placeholder={`Example:\n• Haircut - 30 mins\n• Hair coloring - 2 hours\n• Shampoo $12\n• Hair spray $18\n• Deep conditioning treatment 45 minutes\n• Premium hair oil for $25\n\nOr simply list them:\nMen's haircut, women's haircut, kids cut, beard trim, hair gel products, combs...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={6}
                className="pl-10 resize-none"
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
              <Badge variant="outline" className="bg-background">
                <CheckCircle2 className="mr-1 h-3 w-3 text-green-500" />
                {parsedItems.length} items found
              </Badge>
              {servicesCount > 0 && (
                <Badge variant="secondary">
                  <Clock className="mr-1 h-3 w-3" />
                  {servicesCount} services
                </Badge>
              )}
              {productsCount > 0 && (
                <Badge variant="secondary">
                  <ShoppingBag className="mr-1 h-3 w-3" />
                  {productsCount} products
                </Badge>
              )}
            </div>

            {/* Parsed Items List */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {parsedItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-background border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.type === "product" ? (
                        <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium truncate">{item.name}</span>
                      <Badge
                        variant={item.type === "product" ? "secondary" : "outline"}
                        className="text-xs shrink-0"
                      >
                        {item.type === "product" ? "Product" : "Service"}
                      </Badge>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground ml-6 truncate">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {item.type === "product" && item.price ? (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {item.price}
                      </Badge>
                    ) : item.type === "service" ? (
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        {item.duration_minutes}m
                      </Badge>
                    ) : null}
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
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Start Over
              </Button>
              <Button
                onClick={handleAddAll}
                disabled={parsedItems.length === 0}
                className="flex-1"
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
