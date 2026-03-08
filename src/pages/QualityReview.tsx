import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Flag, Copy, AlertCircle, TrendingDown } from "lucide-react";
import { notify } from "@/lib/notify";

interface AIResponse {
  id: string;
  request_message: string;
  reply_text: string;
  created_at: string;
  quality_score: {
    overall?: number;
    clarity?: number;
    accuracy?: number;
    confidence?: number;
  } | null;
  flagged: boolean;
  latency_ms: number | null;
  confidence: number | null;
}

interface Receptionist {
  id: string;
  name: string;
  business_name: string;
}

export default function QualityReview() {
  const [items, setItems] = useState<AIResponse[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadReceptionists();
  }, []);

  useEffect(() => {
    if (selectedReceptionist) {
      loadResponses();
    }
  }, [selectedReceptionist]);

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading receptionists:", error);
      return;
    }

    setReceptionists(data || []);
    if (data && data.length > 0) {
      setSelectedReceptionist(data[0].id);
    }
  }

  async function loadResponses() {
    if (!selectedReceptionist) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_responses")
        .select("id, request_message, reply_text, created_at, quality_score, flagged, latency_ms, confidence")
        .eq("receptionist_id", selectedReceptionist)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Parse quality_score from JSON
      const parsedData = (data || []).map(item => ({
        ...item,
        quality_score: typeof item.quality_score === 'string' 
          ? JSON.parse(item.quality_score)
          : item.quality_score
      })) as AIResponse[];

      setItems(parsedData);
    } catch (error) {
      console.error("Error loading responses:", error);
      toast({
        title: "Error",
        description: "Failed to load responses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function flagResponse(id: string) {
    try {
      const response = items.find(r => r.id === id);
      const { error } = await supabase
        .from("ai_responses")
        .update({ flagged: true })
        .eq("id", id);

      if (error) throw error;

      // Send notification
      await notify({
        type: "quality.flagged",
        title: "Low Quality Response Flagged",
        body: `A response has been flagged for review. Quality score: ${response?.quality_score?.overall?.toFixed(2) || "N/A"}`,
        severity: "critical",
        receptionist_id: selectedReceptionist,
      });

      toast({
        title: "Response Flagged",
        description: "This response has been flagged for review",
      });
      loadResponses();
    } catch (error) {
      console.error("Error flagging response:", error);
      toast({
        title: "Error",
        description: "Failed to flag response",
        variant: "destructive",
      });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Reply text copied to clipboard",
    });
  }

  function getQualityColor(score: number | undefined): string {
    if (!score) return "text-muted-foreground";
    if (score >= 0.9) return "text-green-600 dark:text-green-400";
    if (score >= 0.7) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  function getQualityBadgeVariant(score: number | undefined): "default" | "secondary" | "destructive" {
    if (!score) return "secondary";
    if (score >= 0.9) return "default";
    if (score >= 0.7) return "secondary";
    return "destructive";
  }

  const lowQualityItems = items.filter(item => {
    const score = item.quality_score?.overall;
    return score !== undefined && score < 0.8;
  });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-foreground">Quality Review</h1>
          <p className="text-muted-foreground">Review AI responses and flag issues for improvement</p>
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium mb-2 block text-foreground">Select Receptionist</label>
          <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Choose a receptionist" />
            </SelectTrigger>
            <SelectContent>
              {receptionists.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name} - {r.business_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {lowQualityItems.length > 0 && (
          <Card className="mb-6 border-destructive">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                Low Quality Responses
              </CardTitle>
              <CardDescription>
                {lowQualityItems.length} response{lowQualityItems.length !== 1 ? 's' : ''} with quality score below 0.8
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading responses...</div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No responses found for this receptionist.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const overallScore = item.quality_score?.overall;
              const isLowQuality = overallScore !== undefined && overallScore < 0.8;

              return (
                <Card 
                  key={item.id} 
                  className={`transition-all hover:shadow-md ${
                    item.flagged ? "border-destructive" : isLowQuality ? "border-warning" : ""
                  }`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            {new Date(item.created_at).toLocaleString()}
                          </CardTitle>
                          {item.flagged && (
                            <Badge variant="destructive" className="gap-1">
                              <Flag className="h-3 w-3" />
                              Flagged
                            </Badge>
                          )}
                          {isLowQuality && !item.flagged && (
                            <Badge variant="secondary" className="gap-1">
                              <TrendingDown className="h-3 w-3" />
                              Low Quality
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!item.flagged && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => flagResponse(item.id)}
                            className="gap-2"
                          >
                            <Flag className="h-4 w-4" />
                            Flag
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(item.reply_text)}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-sm mb-1 text-foreground">User Message:</h4>
                      <p className="text-sm text-muted-foreground">{item.request_message}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm mb-1 text-foreground">AI Reply:</h4>
                      <p className="text-sm text-foreground">{item.reply_text}</p>
                    </div>
                    <div className="flex flex-wrap gap-4 pt-2 border-t">
                      <div>
                        <span className="text-xs text-muted-foreground">Overall Quality:</span>
                        <Badge 
                          variant={getQualityBadgeVariant(overallScore)} 
                          className="ml-2"
                        >
                          {overallScore ? (overallScore * 100).toFixed(0) : "—"}%
                        </Badge>
                      </div>
                      {item.quality_score?.confidence !== undefined && (
                        <div>
                          <span className="text-xs text-muted-foreground">Confidence:</span>
                          <span className={`ml-2 text-sm font-medium ${getQualityColor(item.quality_score.confidence)}`}>
                            {(item.quality_score.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                      {item.latency_ms !== null && (
                        <div>
                          <span className="text-xs text-muted-foreground">Latency:</span>
                          <span className="ml-2 text-sm font-medium text-foreground">
                            {item.latency_ms}ms
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
