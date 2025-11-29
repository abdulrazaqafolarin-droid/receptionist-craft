import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Loader2, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QuickReplyButtons } from "@/components/widget/QuickReplyButtons";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { format } from "date-fns";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  showQuickReplies?: boolean;
  showServices?: boolean;
  showDatePicker?: boolean;
  showTimeSlots?: boolean;
  timeSlots?: any[];
  bookingConfirmation?: any;
};

export default function Widget() {
  const [searchParams] = useSearchParams();
  const receptionistId = searchParams.get("rid");
  
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [receptionist, setReceptionist] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [services, setServices] = useState<any[]>([]);
  const [bookingState, setBookingState] = useState({
    serviceId: null as string | null,
    serviceName: null as string | null,
    date: null as Date | null,
    timeSlot: null as any,
    customerName: null as string | null,
    customerEmail: null as string | null,
    customerPhone: null as string | null,
    collectingInfo: null as 'name' | 'contact' | null,
  });
  const [widgetColors, setWidgetColors] = useState({
    primaryColor: "#8B5CF6",
    secondaryColor: "#A78BFA",
    logoUrl: "",
  });
  const [greetingStored, setGreetingStored] = useState(false);

  // Initialize persistent session ID
  useEffect(() => {
    if (!receptionistId) return;
    
    let sid = localStorage.getItem(`widget_session_${receptionistId}`);
    if (!sid) {
      sid = crypto.randomUUID();
      localStorage.setItem(`widget_session_${receptionistId}`, sid);
    }
    setSessionId(sid);
  }, [receptionistId]);

  useEffect(() {
    if (receptionistId && sessionId) {
      loadReceptionist();
      loadServices();
    }
  }, [receptionistId, sessionId]);

  // Store initial greeting in database to prevent re-greeting
  useEffect(() => {
    if (receptionist && receptionist.greeting_message && !greetingStored) {
      storeInitialGreeting();
    }
  }, [receptionist, greetingStored]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadReceptionist() {
    const { data, error } = await supabase
      .from("receptionists")
      .select("name, business_name, greeting_message, active, business_info")
      .eq("id", receptionistId)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Error", description: "Receptionist not found", variant: "destructive" });
      return;
    }

    setReceptionist(data);
    
    // Apply widget customization colors if available
    const businessInfo = data.business_info as any;
    if (businessInfo?.widget_customization) {
      const customization = businessInfo.widget_customization;
      setWidgetColors({
        primaryColor: customization.primaryColor || "#8B5CF6",
        secondaryColor: customization.secondaryColor || "#A78BFA",
        logoUrl: customization.logoUrl || "",
      });
    }
    
    // Display greeting message with quick replies (will be stored in DB via storeInitialGreeting)
    if (data.greeting_message) {
      setMessages([{
        role: "assistant",
        content: data.greeting_message,
        timestamp: new Date(),
        showQuickReplies: true,
      }]);
    }
  }

  async function storeInitialGreeting() {
    try {
      // Call widget-chat with empty message to store the greeting in database
      await supabase.functions.invoke("widget-chat", {
        body: {
          message: "",
          receptionistId,
          sessionId,
          bookingContext: bookingState,
        }
      });
      setGreetingStored(true);
    } catch (err) {
      console.error("Failed to store initial greeting:", err);
    }
  }

  async function loadServices() {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .eq("active", true);

    if (!error && data) {
      setServices(data);
    }
  }

  async function sendMessage(messageText?: string) {
    const textToSend = messageText || input.trim();
    if (!textToSend || !receptionistId) return;

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Handle booking info collection
      if (bookingState.collectingInfo === 'name') {
        // User provided their name
        setBookingState(prev => ({ ...prev, customerName: textToSend, collectingInfo: 'contact' }));
        
        const botMessage: Message = {
          role: "assistant",
          content: `Thanks, ${textToSend}! Please provide your email or phone number so we can send you a confirmation.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, botMessage]);
        setLoading(false);
        return;
      }

      if (bookingState.collectingInfo === 'contact') {
        // User provided contact info - complete the booking
        const contactInfo = textToSend.trim();
        const isEmail = contactInfo.includes('@');
        
        setBookingState(prev => ({
          ...prev,
          customerEmail: isEmail ? contactInfo : null,
          customerPhone: !isEmail ? contactInfo : null,
          collectingInfo: null,
        }));

        // Book the appointment
        try {
          const { data: bookingData, error: bookingError } = await supabase.functions.invoke("book-appointment", {
            body: {
              receptionistId,
              serviceId: bookingState.serviceId,
              startTime: bookingState.timeSlot.startTime,
              customerName: bookingState.customerName,
              customerEmail: isEmail ? contactInfo : null,
              customerPhone: !isEmail ? contactInfo : null,
              source: "widget",
            }
          });

          if (bookingError) throw bookingError;

          // Show confirmation
          const confirmationMessage: Message = {
            role: "assistant",
            content: `Perfect! Your appointment has been confirmed for ${format(new Date(bookingState.timeSlot.startTime), "MMMM d, yyyy 'at' h:mm a")}. You'll receive a confirmation ${isEmail ? 'email' : 'text'} shortly.`,
            timestamp: new Date(),
            bookingConfirmation: {
              serviceName: bookingState.serviceName,
              dateTime: bookingState.timeSlot.startTime,
              customerName: bookingState.customerName,
              contactInfo: contactInfo,
            }
          };
          
          setMessages(prev => [...prev, confirmationMessage]);
          
          // Reset booking state
          setBookingState({
            serviceId: null,
            serviceName: null,
            date: null,
            timeSlot: null,
            customerName: null,
            customerEmail: null,
            customerPhone: null,
            collectingInfo: null,
          });
          
          setLoading(false);
          return;
        } catch (bookErr: any) {
          console.error("Booking error:", bookErr);
          const errorMessage: Message = {
            role: "assistant",
            content: "I'm sorry, there was an issue completing your booking. Please try again or contact us directly.",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
          setLoading(false);
          return;
        }
      }

      // Normal conversation flow
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          message: textToSend,
          receptionistId,
          sessionId,
          bookingContext: bookingState,
        }
      });

      if (error) throw error;

      // Detect if we should show special UI
      const reply = data.reply || "";
      const lowerReply = reply.toLowerCase();
      
      let botMessage: Message = {
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };

      // Detect booking intent and show services
      if (data.hasBookingIntent || lowerReply.includes("which service") || lowerReply.includes("what service")) {
        if (services.length > 0) {
          botMessage.showServices = true;
        }
      }

      // If service selected, show date picker
      if (bookingState.serviceId && !bookingState.date && (lowerReply.includes("what day") || lowerReply.includes("when would"))) {
        botMessage.showDatePicker = true;
      }

      // If date selected, show time slots
      if (bookingState.date && !bookingState.timeSlot) {
        const dateStr = format(bookingState.date, "yyyy-MM-dd");
        const { data: slotsData } = await supabase.functions.invoke("check-availability", {
          body: {
            receptionistId,
            serviceId: bookingState.serviceId,
            startDate: dateStr,
            endDate: dateStr,
            maxSlots: 6,
          }
        });

        if (slotsData?.slots && slotsData.slots.length > 0) {
          botMessage.showTimeSlots = true;
          botMessage.timeSlots = slotsData.slots;
        }
      }

      setMessages(prev => [...prev, botMessage]);
    } catch (err: any) {
      console.error("Chat error:", err);
      toast({ 
        title: "Error", 
        description: err.message || "Failed to send message", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleServiceSelect(serviceId: string, serviceName: string) {
    setBookingState(prev => ({ ...prev, serviceId, serviceName }));
    await sendMessage(`I'd like to book ${serviceName}`);
  }

  async function handleDateSelect(date: Date) {
    setBookingState(prev => ({ ...prev, date }));
    await sendMessage(`I'd like an appointment on ${format(date, "MMMM d, yyyy")}`);
  }

  async function handleTimeSlotSelect(slot: any) {
    setBookingState(prev => ({ ...prev, timeSlot: slot, collectingInfo: 'name' }));
    
    const botMessage: Message = {
      role: "assistant",
      content: "Perfect! What's your name?",
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, botMessage]);
  }

  async function handleQuickReply(value: string) {
    if (value === "book_appointment") {
      await sendMessage("I'd like to book an appointment");
    } else if (value === "view_services") {
      await sendMessage("What services do you offer?");
    } else if (value === "view_prices") {
      await sendMessage("What are your prices?");
    } else if (value === "contact") {
      await sendMessage("How can I contact you?");
    } else {
      await sendMessage(value);
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSendClick = () => {
    sendMessage();
  };

  if (!receptionistId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background">
        <Card className="p-8 max-w-md text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
          <h2 className="text-2xl font-bold mb-2">Invalid Widget Link</h2>
          <p className="text-muted-foreground">
            This chat widget link is not properly configured. Please contact the business owner.
          </p>
        </Card>
      </div>
    );
  }

  if (!receptionist) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
      <Card className="w-full max-w-2xl h-[600px] flex flex-col shadow-2xl">
        {/* Header */}
        <div 
          className="text-primary-foreground p-6 rounded-t-lg"
          style={{
            background: `linear-gradient(to right, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})`
          }}
        >
          <div className="flex items-center gap-3">
            {widgetColors.logoUrl ? (
              <img 
                src={widgetColors.logoUrl} 
                alt="Logo" 
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircle className="h-6 w-6" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{receptionist.name}</h2>
              <p className="text-sm opacity-90">{receptionist.business_name}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/30">
          {messages.map((msg, idx) => (
            <div key={idx} className="space-y-2">
              <div
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Interactive UI Components */}
              {msg.role === "assistant" && (
                <>
                  {msg.showQuickReplies && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <QuickReplyButtons
                          buttons={[
                            { label: "📅 Book Appointment", value: "book_appointment" },
                            { label: "💼 View Services", value: "view_services" },
                            { label: "📞 Contact", value: "contact" },
                          ]}
                          onSelect={handleQuickReply}
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}

                  {msg.showServices && services.length > 0 && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <ServiceSelector
                          services={services}
                          onSelect={handleServiceSelect}
                          disabled={loading}
                        />
                      </div>
                    </div>
                  )}

                  {msg.showDatePicker && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <DateSelector
                          onSelect={handleDateSelect}
                          disabled={loading}
                          minDate={new Date()}
                        />
                      </div>
                    </div>
                  )}

                  {msg.showTimeSlots && msg.timeSlots && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <TimeSlotSelector
                          slots={msg.timeSlots}
                          onSelect={handleTimeSlotSelect}
                          disabled={loading}
                          showMore={false}
                        />
                      </div>
                    </div>
                  )}

                  {msg.bookingConfirmation && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <BookingConfirmation {...msg.bookingConfirmation} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                bookingState.collectingInfo === 'name' 
                  ? "Enter your name..." 
                  : bookingState.collectingInfo === 'contact'
                  ? "Enter your email or phone..."
                  : "Type your message..."
              }
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={handleSendClick} disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Powered by AI Receptionist
          </p>
        </div>
      </Card>
    </div>
  );
}
