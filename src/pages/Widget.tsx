import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Loader2, MessageCircle, Phone, Mail, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QuickReplyButtons } from "@/components/widget/QuickReplyButtons";
import { ServiceSelector } from "@/components/widget/ServiceSelector";
import { ProductSelector } from "@/components/widget/ProductSelector";
import { DateSelector } from "@/components/widget/DateSelector";
import { TimeSlotSelector } from "@/components/widget/TimeSlotSelector";
import { BookingConfirmation } from "@/components/widget/BookingConfirmation";
import { OrderConfirmation } from "@/components/widget/OrderConfirmation";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  showQuickReplies?: boolean;
  showServices?: boolean;
  showProducts?: boolean;
  showDatePicker?: boolean;
  showTimeSlots?: boolean;
  timeSlots?: any[];
  bookingConfirmation?: any;
  orderConfirmation?: any;
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
  const [products, setProducts] = useState<any[]>([]);
  const [businessModel, setBusinessModel] = useState<'services' | 'products' | 'both'>('services');
  const [bookingState, setBookingState] = useState({
    serviceId: null as string | null,
    serviceName: null as string | null,
    date: null as Date | null,
    timeSlot: null as any,
    customerName: null as string | null,
    customerEmail: null as string | null,
    customerPhone: null as string | null,
    collectingInfo: null as 'name' | 'contact' | null,
    // Product ordering state
    productId: null as string | null,
    productName: null as string | null,
    quantity: 1 as number,
    orderMode: false as boolean,
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadReceptionist() {
    const { data, error } = await supabase
      .from("receptionists")
      .select("name, business_name, greeting_message, active, business_info, business_model")
      .eq("id", receptionistId)
      .eq("active", true)
      .maybeSingle();

    if (error || !data) {
      toast({ title: "Error", description: "Receptionist not found", variant: "destructive" });
      return;
    }

    setReceptionist(data);
    
    // Set business model
    setBusinessModel((data as any).business_model || 'services');
    
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

  async function loadServicesAndProducts() {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("receptionist_id", receptionistId)
      .eq("active", true);

    if (!error && data) {
      // Separate services and products based on duration_minutes
      // Products have duration_minutes = 0, Services have duration_minutes > 0
      const serviceItems = data.filter(item => item.duration_minutes > 0);
      const productItems = data.filter(item => item.duration_minutes === 0);
      setServices(serviceItems);
      setProducts(productItems);
    }
  }

  // Load receptionist and services when sessionId is ready
  useEffect(() => {
    if (receptionistId && sessionId) {
      loadReceptionist();
      loadServicesAndProducts();
    }
  }, [receptionistId, sessionId]);

  // Store initial greeting in database to prevent re-greeting
  useEffect(() => {
    if (receptionist && receptionist.greeting_message && !greetingStored && sessionId) {
      storeInitialGreeting();
    }
  }, [receptionist, greetingStored, sessionId]);

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
        // User provided contact info - complete the booking or order
        const contactInfo = textToSend.trim();
        const isEmail = contactInfo.includes('@');
        
        setBookingState(prev => ({
          ...prev,
          customerEmail: isEmail ? contactInfo : null,
          customerPhone: !isEmail ? contactInfo : null,
          collectingInfo: null,
        }));

        // Check if this is a product order or appointment booking
        if (bookingState.orderMode && bookingState.productName) {
          // Product order confirmation
          const orderConfirmationMessage: Message = {
            role: "assistant",
            content: `Perfect! Your order for ${bookingState.quantity || 1}x ${bookingState.productName} has been placed. We'll contact you at ${contactInfo} to confirm the details. Is there anything else I can help you with today?`,
            timestamp: new Date(),
            orderConfirmation: {
              productName: bookingState.productName,
              quantity: bookingState.quantity || 1,
              customerName: bookingState.customerName,
              contactInfo: contactInfo,
              orderId: crypto.randomUUID(),
            }
          };
          
          setMessages(prev => [...prev, orderConfirmationMessage]);
          
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
            productId: null,
            productName: null,
            quantity: 1,
            orderMode: false,
          });
          
          setLoading(false);
          return;
        }

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
            content: `Perfect! Your appointment has been confirmed for ${format(new Date(bookingState.timeSlot.startTime), "MMMM d, yyyy 'at' h:mm a")}. You'll receive a confirmation ${isEmail ? 'email' : 'text'} shortly. Is there anything else I can help you with today?`,
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
            productId: null,
            productName: null,
            quantity: 1,
            orderMode: false,
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
    setBookingState(prev => ({ ...prev, serviceId, serviceName, orderMode: false }));
    await sendMessage(`I'd like to book ${serviceName}`);
  }

  async function handleProductSelect(productId: string, productName: string) {
    setBookingState(prev => ({ 
      ...prev, 
      productId, 
      productName, 
      orderMode: true,
      collectingInfo: 'name' 
    }));
    
    const botMessage: Message = {
      role: "assistant",
      content: `Great choice! You've selected ${productName}. What's your name so I can process your order?`,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, botMessage]);
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
      // Show services directly for booking flow
      if (services.length > 0) {
        const botMessage: Message = {
          role: "assistant",
          content: "Great! Which service would you like to book?",
          timestamp: new Date(),
          showServices: true,
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        await sendMessage("I'd like to book an appointment");
      }
    } else if (value === "view_services") {
      // Show services list for information only
      if (services.length > 0) {
        const serviceList = services.map(s => 
          `• **${s.name}**${s.duration_minutes ? ` (${s.duration_minutes} min)` : ''}${s.price ? ` - $${s.price}` : ''}`
        ).join('\n');
        const botMessage: Message = {
          role: "assistant",
          content: `Here are our available services:\n\n${serviceList}\n\nWould you like to book any of these?`,
          timestamp: new Date(),
          showServices: true,
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        await sendMessage("What services do you offer?");
      }
    } else if (value === "view_products") {
      // Show products directly
      if (products.length > 0) {
        const productList = products.map(p => 
          `• **${p.name}**${p.price ? ` - $${p.price}` : ''}`
        ).join('\n');
        const botMessage: Message = {
          role: "assistant",
          content: `Here are our available products:\n\n${productList}\n\nWould you like to order any of these?`,
          timestamp: new Date(),
          showProducts: true,
        };
        setMessages(prev => [...prev, botMessage]);
      } else {
        await sendMessage("What products do you have?");
      }
    } else if (value === "contact") {
      // Show contact information directly
      const contactInfo = receptionist?.business_info as any;
      let contactMessage = "Here's how you can reach us:\n\n";
      
      if (contactInfo?.phone || receptionist?.phone) {
        contactMessage += `📞 Phone: ${contactInfo?.phone || receptionist?.phone}\n`;
      }
      if (contactInfo?.email) {
        contactMessage += `✉️ Email: ${contactInfo.email}\n`;
      }
      if (contactInfo?.address) {
        contactMessage += `📍 Address: ${contactInfo.address}\n`;
      }
      if (contactInfo?.website) {
        contactMessage += `🌐 Website: ${contactInfo.website}\n`;
      }
      
      if (contactMessage === "Here's how you can reach us:\n\n") {
        contactMessage = `You can reach ${receptionist?.business_name || 'us'} through this chat! I'm here to help with any questions.`;
      } else {
        contactMessage += "\nIs there anything else I can help you with?";
      }
      
      const botMessage: Message = {
        role: "assistant",
        content: contactMessage,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
    } else if (value === "view_prices") {
      await sendMessage("What are your prices?");
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
        <Card className="p-8 sm:p-12 max-w-md text-center shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <MessageCircle className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">Invalid Widget Link</h2>
          <p className="text-muted-foreground leading-relaxed">
            This chat widget link is not properly configured. Please contact the business owner.
          </p>
        </Card>
      </div>
    );
  }

  if (!receptionist) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-2 sm:p-4">
      <Card className="w-full max-w-3xl h-[90vh] sm:h-[700px] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Header */}
        <div 
          className="text-primary-foreground p-4 sm:p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})`
          }}
        >
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative flex items-center gap-3">
            {widgetColors.logoUrl ? (
              <div className="h-14 w-14 rounded-full overflow-hidden ring-2 ring-white/30 shadow-lg">
                <img 
                  src={widgetColors.logoUrl} 
                  alt="Logo" 
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center ring-2 ring-white/30 shadow-lg">
                <MessageCircle className="h-7 w-7" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold truncate">{receptionist.name}</h2>
              <p className="text-sm opacity-90 truncate">{receptionist.business_name}</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                <span className="text-xs opacity-80">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-gradient-to-b from-muted/20 to-background scroll-smooth">
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={cn(
                "space-y-2 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
                `animation-delay-${idx % 3}`
              )}
            >
              <div
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div 
                    className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center mt-1"
                    style={{
                      background: `linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})`
                    }}
                  >
                    <MessageCircle className="h-4 w-4 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border/50 rounded-bl-md"
                  )}
                >
                  <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <p className="text-xs opacity-60 mt-2 flex items-center gap-1">
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
                            ...(businessModel === 'services' || businessModel === 'both' ? [{ label: "📅 Book Appointment", value: "book_appointment" }] : []),
                            ...(businessModel === 'services' || businessModel === 'both' ? [{ label: "💼 View Services", value: "view_services" }] : []),
                            ...(businessModel === 'products' || businessModel === 'both' ? [{ label: "🛍️ View Products", value: "view_products" }] : []),
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

                  {msg.showProducts && products.length > 0 && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <ProductSelector
                          products={products}
                          onSelect={handleProductSelect}
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

                  {msg.orderConfirmation && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%]">
                        <OrderConfirmation {...msg.orderConfirmation} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
              <div 
                className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})`
                }}
              >
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-5 py-3 shadow-sm">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"></div>
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.2s]"></div>
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.4s]"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm">
          <div className="flex gap-2 items-end">
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
              className="flex-1 min-h-[44px] text-base rounded-xl border-border/50 focus-visible:ring-2 focus-visible:ring-primary/20 transition-all"
              autoFocus
            />
            <Button 
              onClick={handleSendClick} 
              disabled={loading || !input.trim()}
              className="h-11 w-11 rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              style={{
                background: input.trim() ? `linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})` : undefined
              }}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
              Typically replies instantly
            </p>
            <p className="text-xs text-muted-foreground/70">
              Powered by AI
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
