import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Plus, Trash2, Send, Sparkles, Volume2, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import VoiceInput from "@/components/VoiceInput";
import { speakText } from "@/utils/textToSpeech";

interface ServicePrice {
  service: string;
  price: string;
}

interface FAQ {
  question: string;
  answer: string;
}

interface Message {
  sender: "user" | "ai";
  text: string;
  timestamp?: number;
}

export default function Builder() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [receptionistName, setReceptionistName] = useState("Aisha - Receptionist");
  const [businessType, setBusinessType] = useState("Dental Clinic");
  const [businessPhone, setBusinessPhone] = useState("");
  const [tone, setTone] = useState("Friendly");
  const [greetingMessage, setGreetingMessage] = useState("");
  const [defaultResponse, setDefaultResponse] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [hours, setHours] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState<ServicePrice[]>([
    { service: "General Consultation", price: "₦5,000" }
  ]);
  const [faqs, setFaqs] = useState<FAQ[]>([
    { question: "Do you accept insurance?", answer: "Yes — we accept major insurers." }
  ]);
  
  // Advanced configuration state
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState("English");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [allowInterruptions, setAllowInterruptions] = useState(false);

  // Chat state
  const [currentReceptionist, setCurrentReceptionist] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load chat history when receptionist is set
  useEffect(() => {
    const loadChatHistory = async () => {
      if (!currentReceptionist || !user) return;

      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("receptionist_id", currentReceptionist.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading chat history:", error);
        return;
      }

      if (data && data.length > 0) {
        const loadedMessages: Message[] = data.map(msg => ({
          sender: msg.sender as "user" | "ai",
          text: msg.message,
          timestamp: new Date(msg.created_at).getTime(),
        }));
        setMessages(loadedMessages);
      } else {
        // No history, show initial greeting
        setMessages([
          {
            sender: "ai",
            text: `👋 Hi, I'm ${currentReceptionist.name}. How can I help you today?`,
            timestamp: Date.now(),
          },
        ]);
      }
    };

    loadChatHistory();
  }, [currentReceptionist, user]);

  // Chat simulator logic
  const normalize = (text: string) => {
    return (text || "").toLowerCase().replace(/[^\w\s]/gi, "");
  };

  const containsAny = (text: string, keywords: string[]) => {
    const t = normalize(text);
    return keywords.some(k => t.includes(k));
  };

  const applyTone = (toneType: string, text: string) => {
    switch (toneType.toLowerCase()) {
      case "friendly":
        return `Hey! 😊 ${text}`;
      case "energetic":
        return `Hi! ⚡ ${text}`;
      case "calm":
        return `Hello. ${text}`;
      case "professional":
      default:
        return text;
    }
  };

  const suggestFakeSlots = () => {
    const now = new Date();
    const slots = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      slots.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} 10:00`);
    }
    return slots;
  };

  const formatServices = (servicesList: ServicePrice[]) => {
    return servicesList.map(s => `${s.service}: ${s.price}`).join(" • ");
  };

  const generateReply = (userMessage: string): string => {
    const msg = normalize(userMessage);
    const name = currentReceptionist?.name || receptionistName;
    const bName = currentReceptionist?.business_name || businessName || businessType;
    const receptionistTone = currentReceptionist?.tone || tone;

    // Build context from receptionist memory
    const memoryContext = {
      businessName: currentReceptionist?.business_name || businessName || businessType,
      address: currentReceptionist?.address || address,
      hours: currentReceptionist?.hours_of_operation || hours,
      website: currentReceptionist?.website || website,
      services: currentReceptionist?.services_and_prices || services,
      faqs: faqs,
      greeting: currentReceptionist?.greeting_message || greetingMessage,
      defaultResponse: currentReceptionist?.default_response || defaultResponse,
    };

    // Greeting
    const greetingKeywords = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
    if (containsAny(msg, greetingKeywords)) {
      const gm = memoryContext.greeting || `Hi! Thanks for calling ${bName}. This is ${name}. How can I help?`;
      return applyTone(receptionistTone, `Hello! I'm ${name} at ${bName}. ${gm}`);
    }

    // Booking
    const bookingKeywords = ["book", "appointment", "reserve", "schedule"];
    if (containsAny(msg, bookingKeywords)) {
      const slots = suggestFakeSlots();
      return applyTone(receptionistTone, `I can help with booking. Our available slots: ${slots.slice(0, 3).join(", ")}. Which one works best?`);
    }

    // Price
    const priceKeywords = ["price", "cost", "how much", "fee", "charge"];
    if (containsAny(msg, priceKeywords)) {
      const serviceList = Array.isArray(memoryContext.services) ? memoryContext.services : services;
      if (serviceList.length > 0 && serviceList[0].service) {
        return applyTone(receptionistTone, `Our prices: ${formatServices(serviceList)}. Which service would you like?`);
      }
      return applyTone(receptionistTone, `Prices vary by service. Could you tell me which service you're interested in?`);
    }

    // Hours
    if (containsAny(msg, ["open", "hours", "time"])) {
      if (memoryContext.hours) return applyTone(receptionistTone, `We are open: ${memoryContext.hours}. Would you like to book a slot?`);
      return applyTone(receptionistTone, `Our hours vary by day. What day are you asking about?`);
    }

    // Address
    if (containsAny(msg, ["where", "address", "located"])) {
      if (memoryContext.address) return applyTone(receptionistTone, `We are located at ${memoryContext.address}. Can I help you with directions or booking?`);
      return applyTone(receptionistTone, `Could you tell me what city you're in so I can find the nearest branch?`);
    }

    // Website
    if (containsAny(msg, ["website", "online", "social", "facebook", "instagram"])) {
      if (memoryContext.website) return applyTone(receptionistTone, `You can find us at ${memoryContext.website}. Is there anything else I can help with?`);
      return applyTone(receptionistTone, `I don't have our website info right now. Would you like me to have someone call you back with that?`);
    }

    // FAQ matching
    for (let faq of memoryContext.faqs) {
      const qnorm = normalize(faq.question);
      const qWords = qnorm.split(" ").filter(Boolean);
      if (qWords.some(w => w.length > 3 && msg.includes(w))) {
        return applyTone(receptionistTone, faq.answer);
      }
    }

    // Fallback
    return applyTone(receptionistTone, memoryContext.defaultResponse || `I'm sorry — I don't have that info yet. Can I take your contact so we can follow up?`);
  };

  const handleSaveReceptionist = async () => {
    if (!user) {
      toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
      return;
    }

    try {
      const payload = {
        user_id: user.id,
        name: receptionistName,
        business_name: businessName || businessType,
        business_phone: businessPhone,
        tone: tone.toLowerCase() as any,
        greeting_message: greetingMessage || `Hi! Thanks for calling ${businessName || businessType}. This is ${receptionistName}. How can I help?`,
        default_response: defaultResponse || `I'm sorry — I don't have that info yet. Can I take your contact so we can follow up?`,
        address,
        website,
        hours_of_operation: hours as any,
        services_and_prices: services as any,
        active: true,
        mock_mode: true,
        goal: goal,
        language: language,
        system_prompt: systemPrompt,
        knowledge_base: knowledgeBase,
        temperature: temperature,
        allow_interruptions: allowInterruptions,
      };

      const { data, error } = await supabase
        .from("receptionists")
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // Save FAQs
      if (data && faqs.length > 0) {
        const faqInserts = faqs.map((faq, idx) => ({
          receptionist_id: data.id,
          question: faq.question,
          answer: faq.answer,
          priority: idx,
        }));
        await supabase.from("receptionist_faqs").insert(faqInserts);
      }

      setCurrentReceptionist(data);
      setMessages([
        {
          sender: "ai",
          text: `👋 Hi, I'm ${data.name}. How can I help you today?`,
          timestamp: Date.now(),
        },
      ]);

      toast({
        title: "🎉 Success!",
        description: `Your AI Receptionist '${data.name}' has been created successfully!`,
      });
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error",
        description: error.message || "Failed to save receptionist",
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    if (!currentReceptionist && !receptionistName) {
      toast({ title: "Info", description: "Please save your receptionist first", variant: "default" });
      return;
    }

    const userMessage = input;
    setMessages(prev => [...prev, { sender: "user", text: userMessage, timestamp: Date.now() }]);
    setInput("");
    setSending(true);

    try {
      // Save user message to database
      if (currentReceptionist && user) {
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          receptionist_id: currentReceptionist.id,
          sender: "user",
          message: userMessage,
        });
      }

      // Fetch receptionist data
      const { data: receptionist, error: recError } = await supabase
        .from("receptionists")
        .select("*")
        .eq("id", currentReceptionist.id)
        .single();

      if (recError) throw recError;

      // Fetch receptionist FAQs
      const { data: faqData } = await supabase
        .from("receptionist_faqs")
        .select("question, answer")
        .eq("receptionist_id", currentReceptionist.id)
        .order("priority", { ascending: true });

      // Fetch previous messages
      const { data: previousMessages } = await supabase
        .from("chat_messages")
        .select("sender, message")
        .eq("receptionist_id", currentReceptionist.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      // Build system prompt with receptionist context
      const systemPrompt = `You are ${receptionist.name}, an AI receptionist for ${receptionist.business_name}.
Tone: ${receptionist.tone} - respond in a ${receptionist.tone} manner.
Your job is to answer customer questions politely and naturally using the following business information.

Business Information:
- Business: ${receptionist.business_name}
- Phone: ${receptionist.business_phone || "Not provided"}
- Address: ${receptionist.address || "Not provided"}
- Hours: ${receptionist.hours_of_operation || "Not provided"}
- Website: ${receptionist.website || "Not provided"}

Services and Prices:
${Array.isArray(receptionist.services_and_prices) ? receptionist.services_and_prices.map((s: any) => `- ${s.service}: ${s.price}`).join('\n') : "Not provided"}

Frequently Asked Questions:
${faqData && faqData.length > 0 ? faqData.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n') : "No FAQs configured"}

Greeting Message: ${receptionist.greeting_message || "How can I help you today?"}

If a question isn't covered by the information above, respond with: "${receptionist.default_response || "I'm sorry — I don't have that info yet. Can I take your contact so we can follow up?"}"

Keep your responses concise, helpful, and in character as a receptionist.`;

      // Convert previous messages to OpenAI format
      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...(previousMessages || []).slice(-10).map((m: any) => ({
          role: m.sender === "ai" ? "assistant" : "user",
          content: m.message,
        })),
      ];

      // Call chat edge function
      const { data: aiData, error: aiError } = await supabase.functions.invoke('chat', {
        body: { 
          messages: openaiMessages,
          receptionistId: currentReceptionist.id 
        },
      });

      if (aiError) throw aiError;

      const reply = aiData.reply;
      setMessages(prev => [...prev, { sender: "ai", text: reply, timestamp: Date.now() }]);
      setSending(false);

      // Auto-speak the reply if enabled
      if (autoSpeak) {
        try {
          await speakText(reply);
        } catch (error) {
          console.error('Error speaking reply:', error);
        }
      }

      // Save AI reply to database
      if (currentReceptionist && user) {
        await supabase.from("chat_messages").insert({
          user_id: user.id,
          receptionist_id: currentReceptionist.id,
          sender: "ai",
          message: reply,
        });

        // Also save to conversations table for backward compatibility
        await supabase.from("conversations").insert({
          receptionist_id: currentReceptionist.id,
          user_message: userMessage,
          bot_message: reply,
          direction: "inbound",
        });
      }
    } catch (error: any) {
      console.error('Error in handleSendMessage:', error);
      setSending(false);
      toast({
        title: "Error",
        description: error.message || "Failed to generate response",
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

      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <div className="mb-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Rutex FrontDesk Builder
          </h1>
          <p className="text-muted-foreground mt-2">Create an AI receptionist your customers will talk to</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel: Form */}
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Create AI Receptionist
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 max-h-[calc(100vh-16rem)] overflow-y-auto">
              {/* Agent Info Section */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                  <h3 className="font-semibold">Agent Info</h3>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="receptionist-name">Receptionist Name *</Label>
                    <Input
                      id="receptionist-name"
                      value={receptionistName}
                      onChange={(e) => setReceptionistName(e.target.value)}
                      placeholder="Aisha — Receptionist"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-type">Business Type</Label>
                    <Select value={businessType} onValueChange={setBusinessType}>
                      <SelectTrigger id="business-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dental Clinic">Dental Clinic</SelectItem>
                        <SelectItem value="Beauty Salon">Beauty Salon</SelectItem>
                        <SelectItem value="Car Dealership">Car Dealership</SelectItem>
                        <SelectItem value="HVAC">HVAC</SelectItem>
                        <SelectItem value="Restaurant">Restaurant</SelectItem>
                        <SelectItem value="Retail">Retail</SelectItem>
                        <SelectItem value="Contractor">Contractor</SelectItem>
                        <SelectItem value="Consultant">Consultant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-phone">Business Phone Number</Label>
                    <Input
                      id="business-phone"
                      value={businessPhone}
                      onChange={(e) => setBusinessPhone(e.target.value)}
                      placeholder="+234..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="goal">Goal</Label>
                    <Textarea
                      id="goal"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="e.g., Book appointments and answer customer questions professionally"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Input
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      placeholder="e.g., English"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Personality & Tone Section */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                  <h3 className="font-semibold">Personality & Tone</h3>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="tone">Tone of Voice</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger id="tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Friendly">Friendly</SelectItem>
                        <SelectItem value="Professional">Professional</SelectItem>
                        <SelectItem value="Energetic">Energetic</SelectItem>
                        <SelectItem value="Calm">Calm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="system-prompt">System Prompt (Persona)</Label>
                    <Textarea
                      id="system-prompt"
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                      placeholder="Describe the receptionist's personality, behavior, and communication style..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="greeting">Greeting Message</Label>
                    <Textarea
                      id="greeting"
                      value={greetingMessage}
                      onChange={(e) => setGreetingMessage(e.target.value)}
                      placeholder="Hi! Thanks for calling {BusinessName}. This is {ReceptionistName}. How can I help?"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-response">Default Response (when unsure)</Label>
                    <Textarea
                      id="default-response"
                      value={defaultResponse}
                      onChange={(e) => setDefaultResponse(e.target.value)}
                      placeholder="I'm sorry — I don't have that info yet. Can I take your contact so we can follow up?"
                      rows={2}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Knowledge Base Section */}
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                  <h3 className="font-semibold">Knowledge Base</h3>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="knowledge-base">Business Information</Label>
                    <Textarea
                      id="knowledge-base"
                      value={knowledgeBase}
                      onChange={(e) => setKnowledgeBase(e.target.value)}
                      placeholder="Add comprehensive business details, services, hours, FAQs, policies, etc..."
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the main knowledge base that the AI will use to answer questions.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="business-name">Business Name</Label>
                    <Input
                      id="business-name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hours">Operating Hours</Label>
                    <Input
                      id="hours"
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder="Mon-Fri 9:00 - 18:00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="website">Website / Social</Label>
                    <Input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Services & Prices</Label>
                    {services.map((service, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="Service"
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
                    <Button variant="outline" size="sm" onClick={addService}>
                      <Plus className="h-4 w-4 mr-2" /> Add Service
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>FAQs</Label>
                    {faqs.map((faq, index) => (
                      <div key={index} className="space-y-2 p-3 border rounded-lg">
                        <div className="flex justify-between">
                          <Label className="text-xs">Question {index + 1}</Label>
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
                    <Button variant="outline" size="sm" onClick={addFaq}>
                      <Plus className="h-4 w-4 mr-2" /> Add FAQ
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Advanced Settings Section */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors">
                  <h3 className="font-semibold">Advanced Settings</h3>
                  <ChevronDown className="h-4 w-4 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="temperature">Temperature ({temperature.toFixed(1)})</Label>
                    <input
                      id="temperature"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower = more focused and consistent, Higher = more creative and varied
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <Label htmlFor="interruptions">Allow Interruptions</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enable users to interrupt the AI mid-response
                      </p>
                    </div>
                    <input
                      id="interruptions"
                      type="checkbox"
                      checked={allowInterruptions}
                      onChange={(e) => setAllowInterruptions(e.target.checked)}
                      className="h-4 w-4"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button onClick={handleSaveReceptionist} className="w-full" size="lg">
                Save & Generate AI Receptionist
              </Button>
            </CardContent>
          </Card>

          {/* Right Panel: Chat Preview */}
          <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>
                    {currentReceptionist ? currentReceptionist.name : `Preview: ${receptionistName}`}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Tone: {currentReceptionist ? currentReceptionist.tone : tone}
                  </p>
                </div>
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                  Preview Mode
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col h-[calc(100vh-24rem)]">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 p-2">
                  {messages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          message.sender === "user"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                        {message.timestamp && (
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2">
                        <p className="text-sm italic text-muted-foreground">Typing...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAutoSpeak(!autoSpeak)}
                      className="flex items-center gap-2"
                    >
                      <Volume2 className="h-4 w-4" />
                      Auto-speak: {autoSpeak ? "ON" : "OFF"}
                    </Button>
                  </div>
                  <div className="flex gap-2 pt-3 border-t">
                    <Input
                      placeholder="Type a message..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="flex-1"
                      disabled={sending}
                    />
                    <VoiceInput 
                      onTranscript={(text) => {
                        setInput(text);
                        // Auto-send after a brief delay
                        setTimeout(() => {
                          if (text) {
                            const userMessage = text;
                            setMessages(prev => [...prev, { sender: "user", text: userMessage, timestamp: Date.now() }]);
                            setInput("");
                            setSending(true);
                            setTimeout(async () => {
                              const reply = generateReply(userMessage);
                              setMessages(prev => [...prev, { sender: "ai", text: reply, timestamp: Date.now() }]);
                              setSending(false);
                              if (autoSpeak) {
                                try {
                                  await speakText(reply);
                                } catch (error) {
                                  console.error('Error speaking reply:', error);
                                }
                              }
                              if (currentReceptionist && user) {
                                supabase.from("conversations").insert({
                                  receptionist_id: currentReceptionist.id,
                                  user_message: userMessage,
                                  bot_message: reply,
                                  direction: "inbound",
                                });
                              }
                            }, 900 + Math.random() * 800);
                          }
                        }, 100);
                      }}
                      disabled={sending}
                    />
                    <Button onClick={handleSendMessage} size="icon" disabled={sending}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-3">
                  💡 Try: "Hi", "How much is a cleaning?", "Where are you located?"
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
