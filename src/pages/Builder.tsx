import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Send, Loader2, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Navbar } from "@/components/Navbar";

interface ServicePrice {
  service: string;
  price: string;
}

interface FAQ {
  question: string;
  answer: string;
}

interface Message {
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
}

export default function Builder() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const receptionistId = searchParams.get('id');
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [receptionistName, setReceptionistName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [tone, setTone] = useState("friendly");
  const [greeting, setGreeting] = useState("");
  const [defaultResponse, setDefaultResponse] = useState("");
  const [services, setServices] = useState<ServicePrice[]>([]);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [hoursOfOperation, setHoursOfOperation] = useState<any>({});

  // Chat simulator state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [pastConversations, setPastConversations] = useState<any[]>([]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Load existing receptionist if editing
  useEffect(() => {
    if (receptionistId) {
      loadReceptionist();
    }
  }, [receptionistId]);

  // Load chat history when receptionist changes
  useEffect(() => {
    if (receptionistId) {
      loadChatHistory();
    }
  }, [receptionistId]);

  const loadReceptionist = async () => {
    if (!receptionistId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('receptionists')
        .select('*')
        .eq('id', receptionistId)
        .single();

      if (error) throw error;

      if (data) {
        setReceptionistName(data.name);
        setBusinessName(data.business_name);
        setBusinessPhone(data.business_phone || "");
        setTone(data.tone || "friendly");
        setGreeting(data.greeting_message || "");
        setDefaultResponse(data.default_response || "");
        setServices(Array.isArray(data.services_and_prices) ? (data.services_and_prices as unknown as ServicePrice[]) : []);
        setFaqs([]);
        setHoursOfOperation(data.hours_of_operation || {});
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadChatHistory = async () => {
    if (!receptionistId) return;

    try {
      const { data, error } = await supabase.functions.invoke('chat-with-receptionist', {
        body: {
          action: 'get_history',
          receptionist_id: receptionistId,
        },
      });

      if (error) throw error;

      if (data?.conversations) {
        const loadedMessages: Message[] = [];
        data.conversations.forEach((conv: any) => {
          loadedMessages.push({
            sender: 'user',
            text: conv.user_message,
            timestamp: new Date(conv.created_at),
          });
          loadedMessages.push({
            sender: 'bot',
            text: conv.bot_message,
            timestamp: new Date(conv.created_at),
          });
        });
        setMessages(loadedMessages);
        setPastConversations(data.conversations);
      }
    } catch (error: any) {
      console.error('Error loading chat history:', error);
    }
  };

  const handleSaveReceptionist = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create a receptionist.",
        variant: "destructive",
      });
      return;
    }

    if (!receptionistName || !businessName) {
      toast({
        title: "Error",
        description: "Please fill in at least the receptionist name and business name.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        user_id: user.id,
        name: receptionistName,
        business_name: businessName,
        business_phone: businessPhone,
        tone,
        greeting_message: greeting,
        default_response: defaultResponse,
        hours_of_operation: hoursOfOperation as any,
        services_and_prices: services as any,
      };

      let savedReceptionistId = receptionistId;

      if (receptionistId) {
        // Update existing
        const { error } = await supabase
          .from("receptionists")
          .update(payload)
          .eq("id", receptionistId);

        if (error) throw error;
      } else {
        // Insert new
        const { data, error } = await supabase
          .from("receptionists")
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        savedReceptionistId = data.id;
      }

      toast({
        title: "Success",
        description: receptionistId 
          ? "Receptionist updated successfully!"
          : "Receptionist created successfully!",
      });

      // Navigate to edit mode if it was a new receptionist
      if (!receptionistId && savedReceptionistId) {
        navigate(`/builder?id=${savedReceptionistId}`);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !receptionistId) {
      if (!receptionistId) {
        toast({
          title: "Save First",
          description: "Please save your receptionist before testing the chat.",
          variant: "destructive",
        });
      }
      return;
    }

    const userMessage: Message = {
      sender: "user",
      text: userInput.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setUserInput("");
    setIsSending(true);
    setIsTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat-with-receptionist', {
        body: {
          action: 'send_message',
          receptionist_id: receptionistId,
          user_message: userMessage.text,
        },
      });

      if (error) throw error;

      setIsTyping(false);
      
      if (data?.bot_message) {
        const botMessage: Message = {
          sender: "bot",
          text: data.bot_message,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, botMessage]);
        
        // Refresh past conversations
        loadChatHistory();
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      setIsTyping(false);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleClearHistory = async () => {
    if (!receptionistId) return;

    try {
      const { error } = await supabase.functions.invoke('chat-with-receptionist', {
        body: {
          action: 'clear_history',
          receptionist_id: receptionistId,
        },
      });

      if (error) throw error;

      setMessages([]);
      setPastConversations([]);
      
      toast({
        title: "Success",
        description: "Chat history cleared!",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to clear history.",
        variant: "destructive",
      });
    }
  };

  const addService = () => {
    setServices([...services, { service: "", price: "" }]);
  };

  const updateService = (index: number, field: "service" | "price", value: string) => {
    const updated = [...services];
    updated[index][field] = value;
    setServices(updated);
  };

  const removeService = (index: number) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const addFaq = () => {
    setFaqs([...faqs, { question: "", answer: "" }]);
  };

  const updateFaq = (index: number, field: "question" | "answer", value: string) => {
    const updated = [...faqs];
    updated[index][field] = value;
    setFaqs(updated);
  };

  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">
          {receptionistId ? 'Edit' : 'Build'} Your AI Receptionist
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Panel */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Receptionist Configuration</CardTitle>
                <CardDescription>
                  Configure your AI receptionist's behavior and knowledge
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Info */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Receptionist Name *</Label>
                    <Input
                      id="name"
                      value={receptionistName}
                      onChange={(e) => setReceptionistName(e.target.value)}
                      placeholder="e.g., Sarah"
                    />
                  </div>

                  <div>
                    <Label htmlFor="business">Business Name *</Label>
                    <Input
                      id="business"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g., Sunshine Dental"
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Business Phone</Label>
                    <Input
                      id="phone"
                      value={businessPhone}
                      onChange={(e) => setBusinessPhone(e.target.value)}
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>

                  <div>
                    <Label htmlFor="tone">Tone</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger id="tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="greeting">Greeting Message</Label>
                    <Textarea
                      id="greeting"
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                      placeholder="Hello! Welcome to our business. How can I help you today?"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="default">Default Response</Label>
                    <Textarea
                      id="default"
                      value={defaultResponse}
                      onChange={(e) => setDefaultResponse(e.target.value)}
                      placeholder="I'm not sure about that. Let me connect you with someone who can help."
                      rows={2}
                    />
                  </div>
                </div>

                {/* Services */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>Services & Prices</Label>
                    <Button variant="outline" size="sm" onClick={addService}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  {services.map((service, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="Service name"
                        value={service.service}
                        onChange={(e) => updateService(index, "service", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Price"
                        value={service.price}
                        onChange={(e) => updateService(index, "price", e.target.value)}
                        className="w-32"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeService(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* FAQs */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>FAQs</Label>
                    <Button variant="outline" size="sm" onClick={addFaq}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  {faqs.map((faq, index) => (
                    <div key={index} className="p-3 border rounded space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">FAQ {index + 1}</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFaq(index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <Input
                        placeholder="Question"
                        value={faq.question}
                        onChange={(e) => updateFaq(index, "question", e.target.value)}
                      />
                      <Textarea
                        placeholder="Answer"
                        value={faq.answer}
                        onChange={(e) => updateFaq(index, "answer", e.target.value)}
                        rows={2}
                      />
                    </div>
                  ))}
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleSaveReceptionist}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : receptionistId ? (
                    'Update Receptionist'
                  ) : (
                    'Save Receptionist'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Chat Simulator */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Chat Simulator</CardTitle>
                <CardDescription>
                  Test your AI receptionist in real-time
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-96 border rounded-lg p-4 bg-muted/20">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">
                        {receptionistId 
                          ? "No messages yet. Start a conversation!" 
                          : "Save your receptionist to start chatting"}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${
                            msg.sender === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] px-4 py-2 rounded-lg ${
                              msg.sender === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground"
                            }`}
                          >
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {msg.timestamp.toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                      {isTyping && (
                        <div className="flex justify-start">
                          <div className="bg-secondary text-secondary-foreground px-4 py-2 rounded-lg">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>

                <div className="flex gap-2">
                  <Input
                    placeholder={receptionistId ? "Type your message..." : "Save receptionist first..."}
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && !isSending) {
                        handleSendMessage();
                      }
                    }}
                    disabled={isSending || !receptionistId}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={isSending || !userInput.trim() || !receptionistId}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>

                {receptionistId && messages.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearHistory}
                    className="w-full"
                  >
                    Clear Chat History
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Past Conversations */}
            {receptionistId && pastConversations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Past Conversations</CardTitle>
                  <CardDescription>
                    View your conversation history
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-4">
                      {pastConversations.map((conv, idx) => (
                        <div key={conv.id || idx} className="border-b pb-3 last:border-b-0">
                          <div className="flex items-start gap-2 mb-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">User:</p>
                              <p className="text-sm text-muted-foreground">{conv.user_message}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium">Bot:</p>
                              <p className="text-sm text-muted-foreground">{conv.bot_message}</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(conv.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
