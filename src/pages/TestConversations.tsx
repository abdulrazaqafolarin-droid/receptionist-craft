import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, Trash2, Bot, User, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TestMessage {
  role: "user" | "ai";
  content: string;
  timestamp: string;
  intent?: string;
  booking_created?: boolean;
  order_created?: boolean;
}

export default function TestConversations() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [testSessionId] = useState(`test_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || !id) return;
    const msg = input.trim();
    setInput("");
    setLoading(true);

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: msg, timestamp: new Date().toISOString() },
    ]);

    try {
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          receptionistId: id,
          message: msg,
          sessionId: testSessionId,
          test_mode: true,
        },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.reply || data.message || "No response",
          timestamp: new Date().toISOString(),
          intent: data.intent,
          booking_created: data.booking_created,
          order_created: data.order_created,
        },
      ]);
    } catch (err) {
      toast({
        title: "Test failed",
        description: err.message || "Could not reach the AI",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function cleanupTestData() {
    if (!id) return;
    try {
      const { data, error } = await supabase.functions.invoke("test-mode", {
        body: {
          action: "cleanup",
          receptionist_id: id,
        },
      });

      if (error) throw error;

      setMessages([]);
      toast({
        title: "Test data cleaned up",
        description: `${data.deleted || 0} test artifacts removed`,
      });
    } catch (err) {
      toast({
        title: "Cleanup failed",
        description: err.message,
        variant: "destructive",
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/builder/${id}`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <TestTube className="h-5 w-5 text-blue-500" />
                Test Your Operator
              </h1>
              <p className="text-sm text-muted-foreground">
                This is a real conversation with your AI. Test scenarios before going live.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-blue-600 border-blue-300">
              TEST MODE
            </Badge>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={cleanupTestData}>
                <Trash2 className="h-3 w-3 mr-1" />
                Clean Up
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="space-y-4 mb-6">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Start testing your operator</p>
              <p className="text-sm mt-1">
                Try common scenarios: book an appointment, ask about services,
                request a quote, or test edge cases.
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {[
                  "Hi, I'd like to book an appointment",
                  "What services do you offer?",
                  "How much does a consultation cost?",
                  "I want to cancel my booking",
                  "Do you have availability tomorrow?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="text-xs bg-secondary px-3 py-1.5 rounded-full hover:bg-secondary/80 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border"
                }`}
              >
                <div className="flex items-start gap-2">
                  {msg.role === "ai" && (
                    <Bot className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                  )}
                  {msg.role === "user" && (
                    <User className="h-4 w-4 mt-0.5 opacity-70 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "ai" && msg.intent && (
                      <div className="flex gap-1 mt-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {msg.intent}
                        </Badge>
                        {msg.booking_created && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                            BOOKING CREATED
                          </Badge>
                        )}
                        {msg.order_created && (
                          <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700">
                            ORDER CREATED
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground animate-pulse">
                    Thinking...
                  </span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="sticky bottom-0 bg-background pt-4 pb-6">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a test message..."
              disabled={loading}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()}>
              <Play className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
