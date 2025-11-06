import { useState, useEffect, useRef } from "react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Send, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  // Chat state
  const [currentReceptionist, setCurrentReceptionist] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

    // Greeting
    const greetingKeywords = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening"];
    if (containsAny(msg, greetingKeywords)) {
      const gm = currentReceptionist?.greeting_message || greetingMessage || `Hi! Thanks for calling ${bName}. This is ${name}. How can I help?`;
      return applyTone(tone, `Hello! I'm ${name} at ${bName}. ${gm}`);
    }

    // Booking
    const bookingKeywords = ["book", "appointment", "reserve", "schedule"];
    if (containsAny(msg, bookingKeywords)) {
      const slots = suggestFakeSlots();
      return applyTone(tone, `I can help with booking. Our available slots: ${slots.slice(0, 3).join(", ")}. Which one works best?`);
    }

    // Price
    const priceKeywords = ["price", "cost", "how much", "fee", "charge"];
    if (containsAny(msg, priceKeywords)) {
      if (services.length > 0 && services[0].service) {
        return applyTone(tone, `Our prices: ${formatServices(services)}. Which service would you like?`);
      }
      return applyTone(tone, `Prices vary by service. Could you tell me which service you're interested in?`);
    }

    // Hours
    if (containsAny(msg, ["open", "hours", "time"])) {
      if (hours) return applyTone(tone, `We are open: ${hours}. Would you like to book a slot?`);
      return applyTone(tone, `Our hours vary by day. What day are you asking about?`);
    }

    // Address
    if (containsAny(msg, ["where", "address", "located"])) {
      if (address) return applyTone(tone, `We are located at ${address}. Can I help you with directions or booking?`);
      return applyTone(tone, `Could you tell me what city you're in so I can find the nearest branch?`);
    }

    // FAQ matching
    for (let faq of faqs) {
      const qnorm = normalize(faq.question);
      const qWords = qnorm.split(" ").filter(Boolean);
      if (qWords.some(w => w.length > 3 && msg.includes(w))) {
        return applyTone(tone, faq.answer);
      }
    }

    // Fallback
    return applyTone(tone, currentReceptionist?.default_response || defaultResponse || `I'm sorry — I don't have that info yet. Can I take your contact so we can follow up?`);
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

    // Simulate typing delay
    setTimeout(() => {
      const reply = generateReply(userMessage);
      setMessages(prev => [...prev, { sender: "ai", text: reply, timestamp: Date.now() }]);
      setSending(false);

      // Save to database if receptionist exists
      if (currentReceptionist && user) {
        supabase.from("conversations").insert({
          receptionist_id: currentReceptionist.id,
          user_message: userMessage,
          bot_message: reply,
          direction: "inbound",
        });
      }
    }, 900 + Math.random() * 800);
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
            <CardContent className="space-y-4 max-h-[calc(100vh-16rem)] overflow-y-auto">
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
                <Label htmlFor="greeting">Greeting Message</Label>
                <Textarea
                  id="greeting"
                  value={greetingMessage}
                  onChange={(e) => setGreetingMessage(e.target.value)}
                  placeholder="Hi! Thanks for calling {BusinessName}. This is {ReceptionistName}. How can I help?"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="default-response">Default Response Message</Label>
                <Textarea
                  id="default-response"
                  value={defaultResponse}
                  onChange={(e) => setDefaultResponse(e.target.value)}
                  placeholder="I'm sorry — I don't have that info yet..."
                  rows={2}
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">Business Info Memory</h3>

                <div className="space-y-4">
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
                </div>
              </div>

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
                  />
                  <Button onClick={handleSendMessage} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
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
