import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Send, Loader2, MessageCircle, Phone, Mail, MapPin, RefreshCw, Mic } from "lucide-react";
import VoiceInputButton from "@/components/widget/VoiceInputButton";
import VoiceChatOverlay from "@/components/widget/VoiceChatOverlay";
import { useToast } from "@/hooks/use-toast";
import { QuickReplyButtons } from "@/components/widget/QuickReplyButtons";
import { ChatSessionOverlay } from "@/components/widget/ChatSessionOverlay";
import { UISignalRenderer, type UISignal } from "@/components/widget/UISignalRenderer";
import { ChatShell } from "@/components/widget/ChatShell";
import { buildCartMessage, buildLeadFormMessage, buildTimeSlotMessage } from "@/lib/widgetMessages";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  showQuickReplies?: boolean;

}
type WidgetPieces = {
  booking: boolean;
  ordering: boolean;
  voice: boolean;
  lead_capture: boolean;
};

const ALL_PIECES_ON: WidgetPieces = { booking: true, ordering: true, voice: true, lead_capture: true };

function coercePieces(v: unknown): WidgetPieces {
  if (!v || typeof v !== "object") return ALL_PIECES_ON;
  const o = v as Record<string, unknown>;
  const b = (x: unknown, fallback: boolean) => typeof x === "boolean" ? x : fallback;
  return {
    booking: b(o.booking, true),
    ordering: b(o.ordering, true),
    voice: b(o.voice, true),
    lead_capture: b(o.lead_capture, true),
  };
}

type ReceptionistData = {
  id: string;
  name: string | null;
  business_name: string | null;
  greeting_message: string | null;
  timezone: string | null;
  tone: string | null;
  business_model: 'services' | 'products' | 'both' | 'internal' | null;
  widget_surface?: WidgetPieces | null;
  business_info: {
    widget_customization?: {
      primaryColor?: string;
      secondaryColor?: string;
      logoUrl?: string;
    };
  } | null;
};

type ServiceItem = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  duration_minutes?: number | null;
  is_product?: boolean | null;
  active?: boolean | null;
  receptionist_id?: string;
  stock_quantity?: number | null;
  user_id?: string | null;
  created_at?: string;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
};

type BookingState = {
  serviceId: string | null;
  serviceName: string | null;
  date: Date | null;
  timeSlot: { start: string; end: string; display: string } | null;
};

const defaultBookingState: BookingState = {
  serviceId: null,
  serviceName: null,
  date: null,
  timeSlot: null,
};
;

export default function Widget() {
  const [searchParams] = useSearchParams();
  const receptionistId = searchParams.get("rid");
  
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [receptionist, setReceptionist] = useState<ReceptionistData | null>(null);
  const [sessionId, setSessionId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ServiceItem[]>([]);
  const [businessModel, setBusinessModel] = useState<'services' | 'products' | 'both' | 'internal'>('services');
  // Approved widget surface (Stage 3): which flow pieces this operator's
  // visitors get. Absent (older operators) -> everything on.
  const [widgetPieces, setWidgetPieces] = useState<WidgetPieces>({ booking: true, ordering: true, voice: true, lead_capture: true });
  // Presentation-only booking state: tracks what the visitor has picked so the
  // UI can resume visually after a page close. It NO LONGER executes anything —
  // all bookings/orders run server-side through widget-chat (Phase 0.3).
  const defaultBookingState = {
    serviceId: null as string | null,
    serviceName: null as string | null,
    date: null as Date | null,
    timeSlot: null,
  };
  // Persist booking state to localStorage so mid-booking flows survive page close
  const BOOKING_STATE_KEY = `widget_booking_state_${receptionistId}`;
  
  function loadPersistedBookingState() {
    try {
      const raw = localStorage.getItem(BOOKING_STATE_KEY);
      if (!raw) return defaultBookingState;
      const parsed = JSON.parse(raw);
      // Rehydrate date from ISO string
      if (parsed.date) parsed.date = new Date(parsed.date);
      return { ...defaultBookingState, ...parsed };
    } catch {
      return defaultBookingState;
    }
  }

  const [bookingState, setBookingState] = useState(defaultBookingState);
  
  // Whenever bookingState changes, persist it
  useEffect(() => {
    if (!receptionistId) return;
    try {
      localStorage.setItem(BOOKING_STATE_KEY, JSON.stringify(bookingState));
    } catch { /* ignore quota errors */ }
  }, [bookingState, receptionistId]);

  const [widgetColors, setWidgetColors] = useState({
    primaryColor: "#8B5CF6",
    secondaryColor: "#A78BFA",
    logoUrl: "",
  });
  const [greetingStored, setGreetingStored] = useState(false);
  const [hasExistingSession, setHasExistingSession] = useState(false);
  const [showSessionOverlay, setShowSessionOverlay] = useState(false);
  const [existingMessages, setExistingMessages] = useState<ServiceItem[]>([]);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [activeUISignal, setActiveUISignal] = useState<UISignal | null>(null);

  // Suppress engine UI signals for flows this operator was not approved for.
  // The chat text still arrives; only the interactive picker is withheld, so
  // a helper operator never shows booking pickers it cannot fulfil.
  const BOOKING_COMPONENTS = ["service_selector", "date_picker", "time_picker", "booking_confirmation"];
  const ORDERING_COMPONENTS = ["product_selector", "order_summary"];
  function surfaceFilteredSignal(signal: UISignal | null): UISignal | null {
    if (!signal) return null;
    const comp = signal.activeComponent;
    const flow = signal.flow?.activeFlow;
    if (flow === "booking" || (comp && BOOKING_COMPONENTS.includes(comp))) {
      return widgetPieces.booking ? signal : null;
    }
    if (flow === "ordering" || (comp && ORDERING_COMPONENTS.includes(comp))) {
      return widgetPieces.ordering ? signal : null;
    }
    if (comp === "lead_form") return widgetPieces.lead_capture ? signal : null;
    if (comp === "switch_confirmation") return widgetPieces.booking && widgetPieces.ordering ? signal : null;
    return signal;
  }
  
  // Abuse protection: honeypot field and form load timing
  const [honeypotValue, setHoneypotValue] = useState("");
  const formLoadTimeRef = useRef<number>(Date.now());

  // Persist a message to chat_messages so conversation history restoration works
  async function persistMessage(sender: 'user' | 'ai', text: string) {
    if (!receptionistId || !sessionId || !text?.trim()) return;
    try {
      await supabase.from('chat_messages').insert({
        receptionist_id: receptionistId,
        session_id: sessionId,
        user_id: sessionId,
        sender,
        message: text,
        metadata: { source: 'widget_client', timestamp: new Date().toISOString() },
      }).setHeader('x-session-id', sessionId);
    } catch (e) {
      console.warn('Failed to persist message:', e);
    }
  }

  // Helper: add a bot message to UI and persist to DB
  function addBotMessage(content: string, extras?: Partial<Message>) {
    const msg: Message = { role: "assistant", content, timestamp: new Date(), ...extras };
    setMessages(prev => [...prev, msg]);
    persistMessage('ai', content);
    return msg;
  }

  function emitUISignal(partial: Partial<UISignal> & Pick<UISignal, "intent" | "activeComponent">) {
    setActiveUISignal({
      version: "1.0",
      componentData: {},
      dismissPrevious: true,
      reason: partial.activeComponent ? "step_progression" : "no_ui_needed",
      flow: { activeFlow: null, step: null, blocking: false },
      conversationCanContinue: true,
      ...partial,
    });
  }

  function normalizeUISignal(rawSignal: unknown): UISignal | null {
    if (!rawSignal || typeof rawSignal !== "object") return null;
    const signal = rawSignal as Record<string, unknown>;

    const activeComponent = (signal.activeComponent ?? signal.active_component ?? null) as UISignal["activeComponent"];
    const componentData = (signal.componentData ?? signal.component_data ?? {}) as UISignal["componentData"];

    if (!signal.intent || typeof signal.intent !== "string") return null;

    return {
      version: "1.0",
      intent: signal.intent as UISignal["intent"],
      activeComponent,
      componentData,
      dismissPrevious: Boolean(signal.dismissPrevious ?? signal.dismiss_previous ?? true),
      reason: (signal.reason as UISignal["reason"]) ?? "step_progression",
      flow: (signal.flow as UISignal["flow"]) ?? { activeFlow: null, step: null, blocking: false },
      conversationCanContinue: Boolean(signal.conversationCanContinue ?? signal.conversation_can_continue ?? true),
      moneyModeActive: Boolean(signal.moneyModeActive ?? signal.money_mode_active ?? false),
    };
  }

  async function hydrateTimePickerSignal(signal: UISignal): Promise<UISignal> {
    if (
      signal.activeComponent !== "time_picker" ||
      Array.isArray(signal.componentData?.slots) ||
      !bookingState.serviceId ||
      !bookingState.date ||
      !receptionistId
    ) {
      return signal;
    }

    try {
      const dateStr = format(bookingState.date, "yyyy-MM-dd");
      const nextDay = new Date(bookingState.date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDateStr = format(nextDay, "yyyy-MM-dd");

      const { data: slotsData } = await supabase.functions.invoke("check-availability", {
        body: {
          receptionistId,
          serviceId: bookingState.serviceId,
          startDate: dateStr,
          endDate: endDateStr,
          maxSlots: 6,
        }
      });

      const slots = slotsData?.slots || [];
      return {
        ...signal,
        componentData: {
          ...(signal.componentData || {}),
          slots,
        },
      };
    } catch (err) {
      console.warn("[Widget] Failed to hydrate time_picker signal slots:", err);
      return signal;
    }
  }

  // Helper: add a user message to UI and persist to DB
  function addUserMessage(content: string) {
    const msg: Message = { role: "user", content, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    persistMessage('user', content);
    return msg;
  }

  // Initialize persistent session ID and check for existing conversation
  useEffect(() => {
    if (!receptionistId) return;
    
    const SESSION_KEY = `widget_session_${receptionistId}`;
    const TIMESTAMP_KEY = `widget_session_ts_${receptionistId}`;
    const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

    let sid = localStorage.getItem(SESSION_KEY);
    const sessionTimestamp = localStorage.getItem(TIMESTAMP_KEY);
    const now = Date.now();
    
    const isExpired = sid && sessionTimestamp && (now - parseInt(sessionTimestamp, 10)) > SESSION_MAX_AGE_MS;
    
    if (!sid || isExpired) {
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
      localStorage.setItem(TIMESTAMP_KEY, now.toString());
      setSessionId(sid);
      setSessionCheckComplete(true);
      return;
    }
    
    setSessionId(sid);
    checkExistingConversation(sid);
  }, [receptionistId]);
  
  async function checkExistingConversation(sid: string) {
    if (!sid || !receptionistId) return;
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('message, sender, created_at')
        .eq('session_id', sid)
        .eq('receptionist_id', receptionistId)
        .order('created_at', { ascending: true })
        .limit(50)
        .setHeader('x-session-id', sid);
      
      if (error) console.warn('Error loading conversation history:', error);
      
      if (!error && data && data.length > 0) {
        setExistingMessages(data);
        setHasExistingSession(true);
        setShowSessionOverlay(true);
      }
    } catch (err) {
      console.error('Error checking existing conversation:', err);
    } finally {
      setSessionCheckComplete(true);
    }
  }
  
  function handleContinueChat() {
    setShowSessionOverlay(false);
    setGreetingStored(true);
    
    const restoredBooking = loadPersistedBookingState();
    setBookingState(restoredBooking);
    setActiveUISignal(null);
    
    if (existingMessages.length > 0) {
      const restoredMessages: Message[] = existingMessages
        .filter(msg => msg.message && msg.message.trim())
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.message,
          timestamp: new Date(msg.created_at),
          showQuickReplies: false,
        }));
      
      setMessages(restoredMessages);
      setTimeout(() => resumeBookingFlow(restoredBooking), 400);
    }
  }

  // Detect the last incomplete booking stage and re-render the appropriate widget
  async function resumeBookingFlow(state: typeof defaultBookingState) {
    if (state.serviceId && state.date && !state.timeSlot) {
      const formattedDate = format(state.date, "EEEE, MMMM d");
      setLoading(true);
      try {
        const dateStr = format(state.date, "yyyy-MM-dd");
        const nextDay = new Date(state.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const endDateStr = format(nextDay, "yyyy-MM-dd");

        const { data: slotsData } = await supabase.functions.invoke("check-availability", {
          body: { receptionistId, serviceId: state.serviceId, startDate: dateStr, endDate: endDateStr, maxSlots: 8 }
        });

        const slots = slotsData?.slots || [];
        if (slots.length > 0) {
          addBotMessage(`Welcome back! 👋 You were booking ${state.serviceName} for ${formattedDate}. Here are available times — pick one to continue!`);
          emitUISignal({ intent: "booking", activeComponent: "time_picker", componentData: { slots } });
        } else {
          setBookingState(prev => ({ ...prev, date: null }));
          addBotMessage(`Welcome back! 👋 ${formattedDate} no longer has open slots for ${state.serviceName}. Please pick another date.`);
          emitUISignal({ intent: "booking", activeComponent: "date_picker" });
        }
      } catch (e) {
        console.error("[Widget] Error resuming booking flow:", e);
        setBookingState(prev => ({ ...prev, date: null }));
        emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      } finally {
        setLoading(false);
      }
      return;
    }
    if (state.serviceId && !state.date) {
      addBotMessage(`Welcome back! 👋 You were booking ${state.serviceName}. Pick a date that works for you!`);
      emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      return;
    }
    if (state.serviceId && state.date && state.timeSlot) {
      addBotMessage(`Welcome back! 👋 We were finishing your ${state.serviceName} booking. Tell me anything to confirm or change!`);
      return;
    }
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || !lastMsg.showQuickReplies) {
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1] = { ...updated[updated.length - 1], showQuickReplies: true };
        }
        return updated;
      });
    }
  }

  async function handleNewChat() {
    setShowSessionOverlay(false);
    setHasExistingSession(false);
    setExistingMessages([]);
    
    const newSid = crypto.randomUUID();
    localStorage.setItem(`widget_session_${receptionistId}`, newSid);
    localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    setSessionId(newSid);
    
    setBookingState({...defaultBookingState});
    localStorage.removeItem(BOOKING_STATE_KEY);
    setActiveUISignal(null);
    
    if (receptionist?.greeting_message) {
      setMessages([{ role: "assistant", content: receptionist.greeting_message, timestamp: new Date(), showQuickReplies: true }]);
    }
    setGreetingStored(false);
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadReceptionist() {
    if (!receptionistId) return;
    let data: ReceptionistData | null = null;
    
    const rpcResult = await supabase.rpc("get_public_receptionist", { p_receptionist_id: receptionistId });
    if (rpcResult.data && rpcResult.data.length > 0) data = rpcResult.data[0];
    
    if (!data) {
      toast({ title: "Error", description: "Receptionist not found", variant: "destructive" });
      return;
    }

    setReceptionist(data);
    setBusinessModel(data.business_model || 'services');
    setWidgetPieces(coercePieces(data.widget_surface));
    const businessInfo = data.business_info;
    if (businessInfo?.widget_customization) {
      const c = businessInfo.widget_customization;
      setWidgetColors({ primaryColor: c.primaryColor || "#8B5CF6", secondaryColor: c.secondaryColor || "#A78BFA", logoUrl: c.logoUrl || "" });
    }
    
    if (data.greeting_message && !hasExistingSession) {
      setMessages([{ role: "assistant", content: data.greeting_message, timestamp: new Date(), showQuickReplies: true }]);
    }
  }

  async function storeInitialGreeting() {
    try {
      await supabase.functions.invoke("widget-chat", {
        body: {
          message: "",
          receptionistId,
          sessionId,
          displayedGreeting: receptionist?.greeting_message || `Hello! Welcome. How can I help you today?`,
          source: "widget_client"
        }
      });
      setGreetingStored(true);
    } catch (err) {
      console.error("Failed to store initial greeting:", err);
    }
  }

  async function loadServicesAndProducts() {
    if (!receptionistId) return;
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_services_for_receptionist", { p_receptionist_id: receptionistId });
    
    let items: ServiceItem[] | null = rpcData as ServiceItem[] | null;
    
    if (rpcError || !items) {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .eq("active", true);
      if (!error) items = data;
    }

    if (items) {
      const serviceItems = items.filter((item) => item.duration_minutes > 0);
      const productItems = items.filter((item) => item.duration_minutes === 0 || item.is_product === true);
      setServices(serviceItems);
      setProducts(productItems);
    }
  }

  useEffect(() => {
    if (receptionistId && sessionId && sessionCheckComplete) {
      loadReceptionist();
      loadServicesAndProducts();
    }
  }, [receptionistId, sessionId, sessionCheckComplete, hasExistingSession]);

  useEffect(() => {
    if (receptionist && receptionist.greeting_message && !greetingStored && sessionId) {
      storeInitialGreeting();
    }
  }, [receptionist, greetingStored, sessionId]);

  async function sendMessage(messageText?: string) {
    const textToSend = messageText || input.trim();
    if (!textToSend || !receptionistId) return;

    const userMessage: Message = { role: "user", content: textToSend, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    
    if (receptionistId) {
      localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    }

    try {
      // ─── SINGLE EXECUTION PATH (Phase 0.3) ─────────────────────────────
      // Every message — including widget-driven selections, cart intents,
      // and contact details — goes through widget-chat. Slot collection,
      // validation, action gates, idempotency, and booking/order execution
      // are owned server-side. This client only renders results.
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          message: textToSend,
          receptionistId,
          sessionId,
          _hp_field: honeypotValue,
          _form_load_time: formLoadTimeRef.current,
        }
      });

      if (error) throw error;

      const reply = data.reply || "";
      
      const botMessage: Message = { role: "assistant", content: reply, timestamp: new Date() };

      if (data.bookingCreated && data.bookingDetails) {
        setBookingState({...defaultBookingState});
        emitUISignal({ intent: "confirmation", activeComponent: "booking_confirmation", componentData: {
          serviceName: data.bookingDetails.serviceName,
          dateTime: data.bookingDetails.startTime,
          customerName: data.bookingDetails.customerName,
          customerEmail: data.bookingDetails.customerEmail,
          customerPhone: data.bookingDetails.customerPhone,
          confirmationId: data.bookingDetails.id,
          duration: services.find(s => s.id === bookingState.serviceId)?.duration_minutes,
        } });
      }
      
      if (data.orderCreated && data.orderDetails) {
        setBookingState({...defaultBookingState});
        emitUISignal({ intent: "confirmation", activeComponent: "order_summary", componentData: {
          products: data.orderDetails.products || [],
          customerName: data.orderDetails.customerName,
          contactInfo: data.orderDetails.customerEmail || data.orderDetails.customerPhone,
          orderId: data.orderDetails.id,
          totalAmount: data.orderDetails.totalAmount,
          deliveryAddress: data.orderDetails.deliveryAddress,
        } });
      }

      if (data.uiSignal) {
        const normalizedSignal = normalizeUISignal(data.uiSignal);
        if (normalizedSignal) {
          const hydratedSignal = await hydrateTimePickerSignal(normalizedSignal);
          setActiveUISignal(hydratedSignal);
        }
      }

      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error("Chat error:", err);
      toast({ title: "Error", description: err.message || "Failed to send message", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleServiceSelect(serviceId: string, serviceName: string) {
    setBookingState(prev => ({ ...prev, serviceId, serviceName }));
    emitUISignal({ intent: "booking", activeComponent: "date_picker" });
    addUserMessage(`I'd like to book ${serviceName}`);
    addBotMessage(`Great choice! Go ahead and pick a date that works for you.`);
  }

  async function handleProductsConfirm(selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) {
    if (selectedProducts.length === 0) return;
    // Phase 0.3: route the cart through the AI backend — widget-chat
    // validates stock/pricing and owns the transaction.
    const cartMessage = buildCartMessage(selectedProducts);
    if (!cartMessage) return;
    await sendMessage(cartMessage);
  }

  async function handleDateSelect(date: Date) {
    setBookingState(prev => ({ ...prev, date }));
    
    const dateStr = format(date, "yyyy-MM-dd");
    const formattedDate = format(date, "EEEE, MMMM d");
    
    addUserMessage(`I'd like an appointment on ${formattedDate}`);
    setLoading(true);
    
    try {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDateStr = format(nextDay, "yyyy-MM-dd");
      
      const { data: slotsData, error: slotsError } = await supabase.functions.invoke("check-availability", {
        body: { receptionistId, serviceId: bookingState.serviceId, startDate: dateStr, endDate: endDateStr, maxSlots: 8 }
      });
      
      if (slotsError) {
        console.error("[Widget] check-availability error:", slotsError);
        setBookingState(prev => ({ ...prev, date: null }));
        addBotMessage("I had trouble checking availability. Please try selecting a date again.");
        return;
      }

      const slots = slotsData?.slots || [];
      
      if (slots.length > 0) {
        addBotMessage(`Here are the available slots for ${formattedDate} — pick the one that works best for you!`);
        emitUISignal({ intent: "booking", activeComponent: "time_picker", componentData: { slots } });
      } else {
        setBookingState(prev => ({ ...prev, date: null }));
        addBotMessage(`I'm sorry, there are no available time slots on ${formattedDate}. Would you like to try a different date?`);
        emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      }
    } catch (error) {
      console.error("[Widget] Error fetching availability:", error);
      setBookingState(prev => ({ ...prev, date: null }));
      addBotMessage("I had trouble checking availability. Please try selecting a date again.");
      emitUISignal({ intent: "booking", activeComponent: "date_picker" });
    } finally {
      setLoading(false);
    }
  }

  async function handleTimeSlotSelect(slot: { startTime?: string; start?: string; end: string; display: string; score?: number; reason?: string }) {
    const startTime = slot.startTime || slot.start;
    setBookingState(prev => ({ 
      ...prev, 
      timeSlot: { ...slot, startTime }
    }));
    
    const formattedTime = format(new Date(startTime), "h:mm a");
    const formattedDate = bookingState.date ? format(bookingState.date, "EEEE, MMMM d") : "";

    // Phase 0.3: tell the AI which slot was chosen — the server-side engine
    // owns slot capture and decides what to collect next.
    await sendMessage(buildTimeSlotMessage(formattedTime, formattedDate));
  }

  async function handleQuickReply(value: string) {
    if (value === "book_appointment") {
      if (services.length === 1) {
        await handleServiceSelect(services[0].id, services[0].name);
      } else if (services.length > 1) {
        addBotMessage("Which service would you like to book? Just tap one below!");
        emitUISignal({ intent: "booking", activeComponent: "service_selector" });
      } else {
        await sendMessage("I'd like to book an appointment");
      }
    } else if (value === "view_services") {
      if (services.length > 0) {
        const serviceList = services.map(s => 
          `• **${s.name}**${s.duration_minutes ? ` (${s.duration_minutes} min)` : ''}${s.price ? ` - $${s.price}` : ''}`
        ).join('\n');
        addBotMessage(`Here are our available services:\n\n${serviceList}\n\nWould you like to book any of these?`);
        emitUISignal({ intent: "service_enquiry", activeComponent: "service_selector" });
      } else {
        await sendMessage("What services do you offer?");
      }
    } else if (value === "view_products") {
      if (products.length > 0) {
        const productList = products.map(p => 
          `• **${p.name}**${p.price ? ` - $${p.price}` : ''}`
        ).join('\n');
        addBotMessage(`Here are our available products:\n\n${productList}\n\nWould you like to order any of these?`);
        emitUISignal({ intent: "product_enquiry", activeComponent: "product_selector" });
      } else {
        await sendMessage("What products do you have?");
      }
    } else if (value === "contact") {
      emitUISignal({ intent: "support", activeComponent: null, reason: "no_ui_needed" });
      const contactInfo = receptionist?.business_info;
      let contactMessage = "Here's how you can reach us:\n\n";
      
      if (contactInfo?.phone || receptionist?.phone) contactMessage += `📞 Phone: ${contactInfo?.phone || receptionist?.phone}\n`;
      if (contactInfo?.email) contactMessage += `✉️ Email: ${contactInfo.email}\n`;
      if (contactInfo?.address) contactMessage += `📍 Address: ${contactInfo.address}\n`;
      if (contactInfo?.website) contactMessage += `🌐 Website: ${contactInfo.website}\n`;
      
      if (contactMessage === "Here's how you can reach us:\n\n") {
        contactMessage = `You can reach ${receptionist?.business_name || 'us'} through this chat! I'm here to help with any questions.`;
      } else {
        contactMessage += "\nIs there anything else I can help you with?";
      }
      
      addBotMessage(contactMessage);
    } else if (value === "view_prices") {
      await sendMessage("What are your prices?");
    } else {
      await sendMessage(value);
    }
  }

  async function handleRefreshConversation() {
    if (!receptionistId) return;
    
    const newSid = crypto.randomUUID();
    localStorage.setItem(`widget_session_${receptionistId}`, newSid);
    localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    setSessionId(newSid);
    
    setBookingState({...defaultBookingState});
    localStorage.removeItem(BOOKING_STATE_KEY);
    setActiveUISignal(null);
    setHasExistingSession(false);
    setExistingMessages([]);
    setGreetingStored(false);
    
    if (receptionist?.greeting_message) {
      setMessages([{ role: "assistant", content: receptionist.greeting_message, timestamp: new Date(), showQuickReplies: true }]);
    } else {
      setMessages([{ role: "assistant", content: `Hello! How can I help you today?`, timestamp: new Date(), showQuickReplies: true }]);
    }
    
    setInput("");
  }

  const handleSendClick = () => {
    sendMessage();
  };

  const handleVoiceSendMessage = async (text: string): Promise<string> => {
    if (!text || !receptionistId) return "";
    
    const userMessage: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    persistMessage('user', text);

    try {
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          message: text,
          receptionistId,
          sessionId,
          _hp_field: "",
          _form_load_time: formLoadTimeRef.current,
        }
      });

      if (error) throw error;
      const reply = data.reply || "I'm sorry, I couldn't process that.";
      
      const botMessage: Message = { role: "assistant", content: reply, timestamp: new Date() };
      setMessages(prev => [...prev, botMessage]);
      persistMessage('ai', reply);
      
      return reply;
    } catch (err) {
      console.error("Voice chat error:", err);
      return "Sorry, something went wrong. Please try again.";
    }
  };

  if (!receptionistId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
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
    <div className="flex items-center justify-center min-h-screen bg-background p-2 sm:p-4">
      {/* Voice Chat Overlay */}
      <VoiceChatOverlay
        open={voiceChatOpen}
        onClose={() => setVoiceChatOpen(false)}
        onSendMessage={handleVoiceSendMessage}
        primaryColor={widgetColors.primaryColor}
        secondaryColor={widgetColors.secondaryColor}
      />
      <Card className="w-full max-w-3xl h-[90vh] sm:h-[700px] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-300 relative">
        {/* Chat Session Overlay - shown when returning with existing conversation */}
        <ChatSessionOverlay
          hasExistingSession={showSessionOverlay}
          onContinue={handleContinueChat}
          onNewChat={handleNewChat}
          businessName={receptionist.business_name}
        />
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
                <img src={widgetColors.logoUrl} alt="Logo" className="h-full w-full object-cover" />
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
                <div className="h-2 w-2 rounded-full bg-success animate-pulse"></div>
                <span className="text-xs opacity-80">Online</span>
              </div>
            </div>
            {/* Voice Chat Button */}
            <button
              onClick={() => setVoiceChatOpen(true)}
              className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all hover:scale-105 ring-1 ring-white/20"
              aria-label="Start voice chat"
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ChatShell: shared chat UI (message list + input) used by both the
            customer Responder and the owner Configurator, themed per context. */}
        <ChatShell
          theme="responder"
          messages={messages}
          isUser={(m) => m.role === "user"}
          loading={loading}
          scrollRef={messagesEndRef}
          inputValue={input}
          onInputChange={setInput}
          onSend={handleSendClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendClick(); }
          }}
          disabled={loading}
          placeholder="Type your message..."
          showAvatar
          showTimestamp
          autoFocus
          listClassName="p-4 sm:p-6 bg-background scroll-smooth"
          sendIcon={<Send className="h-5 w-5" />}
          accentGradient={`linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})`}
          renderQuickReplies={(msg) =>
            msg.role === "assistant" && msg.showQuickReplies ? (
              <div className="flex justify-start">
                <div className="max-w-[80%]">
                  <QuickReplyButtons
                    buttons={[
                      ...((businessModel === 'services' || businessModel === 'both') && widgetPieces.booking ? [{ label: "📅 Book Appointment", value: "book_appointment" }] : []),
                      ...((businessModel === 'services' || businessModel === 'both') && widgetPieces.booking ? [{ label: "💼 View Services", value: "view_services" }] : []),
                      ...((businessModel === 'products' || businessModel === 'both') && widgetPieces.ordering ? [{ label: "🛍️ View Products", value: "view_products" }] : []),
                      { label: "📞 Contact", value: "contact" },
                    ]}
                    onSelect={handleQuickReply}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : null
          }
          typingIndicator={
            loading ? (
              <div className="flex gap-2 justify-start animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
                <div
                  className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${widgetColors.primaryColor}, ${widgetColors.secondaryColor})` }}
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
            ) : (
              <></>
            )
          }
          footerBefore={
            <input
              type="text"
              name="_hp_email_confirm"
              value={honeypotValue}
              onChange={(e) => setHoneypotValue(e.target.value)}
              autoComplete="off"
              tabIndex={-1}
              style={{
                position: 'absolute',
                left: '-9999px',
                width: '1px',
                height: '1px',
                opacity: 0,
                overflow: 'hidden',
              }}
              aria-hidden="true"
            />
          }
          inputAfter={
            widgetPieces.voice ? (
              <VoiceInputButton
                onTranscript={(text) => {
                  setInput(text);
                  sendMessage(text);
                }}
                disabled={loading}
              />
            ) : null
          }
          footerAfter={
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshConversation}
                  className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Start Fresh
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Powered by AI
              </p>
            </div>
          }
            betweenPanel={
              <UISignalRenderer
                signal={surfaceFilteredSignal(activeUISignal)}
              services={services}
              products={products}
              loading={loading}
              onServiceSelect={handleServiceSelect}
              onProductsConfirm={handleProductsConfirm}
              onDateSelect={handleDateSelect}
              onTimeSlotSelect={handleTimeSlotSelect}
              onDismiss={() => setActiveUISignal(null)}
              onLeadFormSubmit={(data) => {
                setActiveUISignal(null);
                const leadMessage = buildLeadFormMessage(data);
                if (leadMessage) sendMessage(leadMessage);
              }}
              onLeadFormSkip={() => setActiveUISignal(null)}
              onSwitchConfirm={() => {
                addUserMessage("Yes, let's switch");
                setActiveUISignal(null);
                sendMessage("Yes, let's switch");
              }}
              onSwitchCancel={() => {
                addUserMessage("No, stay");
                setActiveUISignal(null);
              }}
            />
          }
        />
      </Card>
    </div>
  );
}
