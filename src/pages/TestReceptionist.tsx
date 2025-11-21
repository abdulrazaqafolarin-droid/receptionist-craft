import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Send, ArrowLeft, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/Navbar";

type ChatMessage = {
  id?: string;
  sender: "user" | "bot";
  message: string;
  created_at: string;
};

const TestReceptionist = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [receptionistName, setReceptionistName] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });
  }, []);

  // Load receptionist info and chat history
  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      setInitialLoading(true);
      
      // Load receptionist name
      const { data: receptionist } = await supabase
        .from("receptionists")
        .select("name")
        .eq("id", id)
        .single();
      
      if (receptionist) {
        setReceptionistName(receptionist.name);
      }
      
      // Load chat history
      if (currentUserId) {
        const { data: chatHistory } = await supabase
          .from("chat_messages")
          .select("*")
          .eq("receptionist_id", id)
          .eq("user_id", currentUserId)
          .order("created_at", { ascending: true });
        
        if (chatHistory) {
          setMessages(chatHistory.map(msg => ({
            id: msg.id,
            sender: msg.sender as "user" | "bot",
            message: msg.message,
            created_at: msg.created_at
          })));
        }
      }
      
      setInitialLoading(false);
    };
    
    loadData();
  }, [id, currentUserId]);

  const handleSendMessage = async () => {
    const text = input.trim();
    if (!text || loading || !id || !currentUserId) return;
    
    setLoading(true);
    setInput("");
    
    // Optimistic UI update
    const userMsg: ChatMessage = {
      sender: "user",
      message: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    
    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [{ role: "user", content: text }],
          receptionistId: id,
          userId: currentUserId
        }
      });
      
      if (error) throw error;
      
      const botMsg: ChatMessage = {
        sender: "bot",
        message: data.reply,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, botMsg]);
      
      toast({ title: "Response received" });
    } catch (err: any) {
      console.error("Chat error:", err);
      
      let errorMsg = "Failed to get response";
      if (err.message?.includes("402")) {
        errorMsg = "Lovable AI credits exhausted. Please add credits to continue.";
      } else if (err.message?.includes("429")) {
        errorMsg = "Rate limit exceeded. Please wait a moment and try again.";
      }
      
      toast({ title: "Error", description: errorMsg, variant: "destructive" });
      
      // Remove optimistic message on error
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!id || !currentUserId) return;
    
    try {
      await supabase
        .from("chat_messages")
        .delete()
        .eq("receptionist_id", id)
        .eq("user_id", currentUserId);
      
      setMessages([]);
      toast({ title: "Chat cleared" });
    } catch (err) {
      console.error("Clear chat error:", err);
      toast({ title: "Failed to clear chat", variant: "destructive" });
    }
  };

  if (initialLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      
      <div className="flex-1 container max-w-4xl mx-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/builder/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Test AI Receptionist</h1>
              <p className="text-muted-foreground">{receptionistName}</p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={handleClearChat} disabled={messages.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Chat
          </Button>
        </div>

        <Card className="flex flex-col h-[calc(100vh-250px)]">
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <p className="text-muted-foreground mb-2">No messages yet</p>
                  <p className="text-sm text-muted-foreground">Start a conversation to test your AI receptionist</p>
                </div>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg px-4 py-2 ${
                    msg.sender === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                disabled={loading}
                className="flex-1"
              />
              <Button type="submit" disabled={loading || !input.trim()} size="icon">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default TestReceptionist;
