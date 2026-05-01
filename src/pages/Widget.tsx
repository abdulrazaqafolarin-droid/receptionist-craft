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
  const defaultBookingState = {
    serviceId: null as string | null,
    serviceName: null as string | null,
    date: null as Date | null,
    timeSlot: null as any,
    customerName: null as string | null,
    customerEmail: null as string | null,
    customerPhone: null as string | null,
    collectingInfo: null as 'name' | 'contact' | null,
    productId: null as string | null,
    productName: null as string | null,
    quantity: 1 as number,
    orderMode: false as boolean,
    awaitingOrderConfirmation: false as boolean,
    pendingProducts: [] as Array<{ productId: string; productName: string; quantity: number; price?: number }>,
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
  const [existingMessages, setExistingMessages] = useState<any[]>([]);
  const [sessionCheckComplete, setSessionCheckComplete] = useState(false);
  const [voiceChatOpen, setVoiceChatOpen] = useState(false);
  const [activeUISignal, setActiveUISignal] = useState<UISignal | null>(null);
  
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

  // ─── Client-side name validation (mirrors edge function nameValidator.ts) ───
  const NAME_BLOCKLIST_CLIENT = new Set([
    'hello','hi','hey','thanks','thank','please','yes','no','sure','okay','ok',
    'great','good','fine','nice','cool','right','perfect','awesome','wonderful',
    'amazing','excellent','fantastic','monday','tuesday','wednesday','thursday',
    'friday','saturday','sunday','january','february','march','april','may','june',
    'july','august','september','october','november','december','morning','afternoon',
    'evening','noon','midnight','tonight','today','tomorrow','ridiculous','terrible',
    'awful','horrible','angry','upset','frustrated','confused','worried','anxious',
    'nervous','happy','sad','mad','desperate','annoyed','furious','disgusted',
    'shocked','scared','interested','excited','curious','concerned','disappointed',
    'looking','waiting','trying','going','coming','leaving','calling','booking',
    'ordering','buying','getting','having','making','taking','running','sitting',
    'standing','walking','talking','asking','helping','wondering','thinking',
    'feeling','working','living','doing','browse','browsing','like','sorry',
    'want','need','know','think','see','look','tell','give','take','come','make',
    'find','keep','in','so','much','very','really','quite','too','also','just',
    'not','but','and','for','with','about','here','there','back','the','this',
    'that','what','when','where','how','why','who','some','any','all','each',
    'every','well','still','already','bread','cake','dental','clinic','store',
    'shop','service','product','appointment','booking','order','delivery','urgent',
    'emergency','available','open','closed','free','busy','ready','someone',
    'anyone','everyone','nobody','something','anything','everything','nothing',
    'done','again','new','old','sir','mam','miss','mrs','dear',
    'specifically','definitely','actually','basically','honestly',
  ]);

  const SENTENCE_REJECT_PATTERNS = [
    /\b(i'll|i'd|i'm|i've|i am|i was|i will|i would|i could|i should|i might|i can|i want|i need|i think|i know|i see|i hope|i wish|i like|i love|i hate|i don't|i didn't|i won't|i can't|i couldn't|i shouldn't|i wouldn't)\b/i,
    /\bto\s+(browse|order|book|buy|get|see|check|look|find|make|take|have|know|ask|try|go|come|leave|start|stop|cancel)\b/i,
    /\b(sorry|apolog|excuse me|pardon|forgive|my bad|oops|whoops)\b/i,
    /\b(can you|could you|would you|will you|do you|is there|are there|what is|how do|how can)\b/i,
    /\b(because|although|however|therefore|instead|otherwise|meanwhile|furthermore)\b/i,
    /^(let|let's|please|just|maybe|perhaps|actually|honestly|basically|well|so|oh|um|uh|hmm|ah)\b/i,
    /\blike\s+to\b/i,
    /\b(never\s*mind|forget\s*it|hold\s*on|wait\s*a|not\s+sure|no\s+thanks|no\s+thank)\b/i,
  ];

  function validateDirectNameInput(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    // Reject sentences
    for (const pattern of SENTENCE_REJECT_PATTERNS) {
      if (pattern.test(trimmed)) return null;
    }
    const words = trimmed.split(/\s+/);
    // Reject more than 3 words
    if (words.length > 3) return null;
    // Validate each word
    for (const word of words) {
      if (!/^[A-Za-z][A-Za-z'-]*$/.test(word)) return null;
      if (word.length < 2 || word.length > 15) return null;
      if (NAME_BLOCKLIST_CLIENT.has(word.toLowerCase())) return null;
    }
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // Helper: add a user message to UI and persist to DB
  function addUserMessage(content: string) {
    const msg: Message = { role: "user", content, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    persistMessage('user', content);
    return msg;
  }

  // Helper: find a previously provided customer name from conversation history
  // Scans bot messages for "Thank you, <Name>" patterns and user messages for name declarations
  function findPreviousNameInHistory(msgs: Message[]): string | null {
    // 1. Check if we already have a name in booking state
    if (bookingState.customerName && bookingState.customerName.length >= 2) {
      return bookingState.customerName;
    }
    // 2. Scan bot messages for "Thank you, Name" acknowledgements
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (msg.role === 'assistant') {
        const thankYouMatch = msg.content.match(/Thank you,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[!.]/);
        if (thankYouMatch?.[1]) return thankYouMatch[1];
      }
    }
    // 3. Scan user messages for explicit name declarations
    const NAME_PATTERNS = [
      /(?:my\s+name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:(?:you\s+can\s+)?call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /\bi'?m\s+([A-Z][a-z]+)\s*[.!?,]?\s*$/i,
    ];
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role !== 'user') continue;
      for (const pattern of NAME_PATTERNS) {
        const match = msgs[i].content.match(pattern);
        if (match?.[1] && match[1].length >= 2 && match[1].length <= 20) {
          return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        }
      }
    }
    return null;
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
    
    // Check if session has expired (older than 24 hours)
    const isExpired = sid && sessionTimestamp && (now - parseInt(sessionTimestamp, 10)) > SESSION_MAX_AGE_MS;
    
    if (!sid || isExpired) {
      // No session or expired — create fresh
      sid = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, sid);
      localStorage.setItem(TIMESTAMP_KEY, now.toString());
      setSessionId(sid);
      setSessionCheckComplete(true);
      return;
    }
    
    setSessionId(sid);
    
    // Session exists and is within 24 hours — check for messages
    checkExistingConversation(sid);
  }, [receptionistId]);
  
  // Check if there's an existing conversation for this session
  async function checkExistingConversation(sid: string) {
    try {
      // Set session header so RLS policy can match widget user's messages
      const { data, error } = await supabase
        .from('chat_messages')
        .select('message, sender, created_at')
        .eq('session_id', sid)
        .eq('receptionist_id', receptionistId)
        .order('created_at', { ascending: true })
        .limit(50)
        .setHeader('x-session-id', sid);
      
      if (error) {
        console.warn('Error loading conversation history:', error);
      }
      
      if (!error && data && data.length > 0) {
        // Has existing conversation — show overlay
        setExistingMessages(data);
        setHasExistingSession(true);
        setShowSessionOverlay(true);
      }
    } catch (err) {
      console.error('Error checking existing conversation:', err);
    } finally {
      // Mark session check as complete regardless of outcome
      setSessionCheckComplete(true);
    }
  }
  
  // Handle continue existing chat - show BOTH user and assistant messages + resume booking flow
  function handleContinueChat() {
    setShowSessionOverlay(false);
    setGreetingStored(true); // Prevent re-storing greeting
    
    // Restore persisted booking state from localStorage
    const restoredBooking = loadPersistedBookingState();
    setBookingState(restoredBooking);
    setActiveUISignal(null);
    
    // Restore messages from the existing conversation - include both user and AI messages
    if (existingMessages.length > 0) {
      const restoredMessages: Message[] = existingMessages
        .filter(msg => msg.message && msg.message.trim()) // Filter out empty messages
        .map(msg => ({
          role: msg.sender === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.message,
          timestamp: new Date(msg.created_at),
          showQuickReplies: false,
        }));
      
      setMessages(restoredMessages);
      
      // After restoring messages, detect incomplete booking stage and auto-resume
      // Use setTimeout to let state settle before appending resumption message
      setTimeout(() => resumeBookingFlow(restoredBooking), 400);
    }
  }
  
  // Detect the last incomplete booking stage and re-render the appropriate UI widget
  async function resumeBookingFlow(state: typeof defaultBookingState) {
    // If collecting info (name or contact), just prompt again
    if (state.collectingInfo === 'name') {
      emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
      addBotMessage("Welcome back! 👋 We were just getting your details to complete the booking. What's your name?");
      return;
    }
    if (state.collectingInfo === 'contact') {
      emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
      addBotMessage(`Welcome back, ${state.customerName}! 👋 To finish your booking, could you share your email or phone number?`);
      return;
    }
    // If awaiting order confirmation
    if (state.awaitingOrderConfirmation && state.productName) {
      emitUISignal({ intent: "ordering", activeComponent: null, reason: "step_progression" });
      addBotMessage(`Welcome back! 👋 You had selected ${state.productName}. Would you like to go ahead with this order, make changes, or start fresh?`);
      return;
    }
    // If service + date selected but no time slot — fetch fresh slots and show
    if (state.serviceId && state.date && !state.timeSlot) {
      const formattedDate = format(state.date, "EEEE, MMMM d");
      setLoading(true);
      try {
        const dateStr = format(state.date, "yyyy-MM-dd");
        const nextDay = new Date(state.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const endDateStr = format(nextDay, "yyyy-MM-dd");
        
        const { data: slotsData, error: slotsError } = await supabase.functions.invoke("check-availability", {
          body: { receptionistId, serviceId: state.serviceId, startDate: dateStr, endDate: endDateStr, maxSlots: 8 }
        });
        
        const slots = slotsData?.slots || [];
        if (slots.length > 0) {
          addBotMessage(
            `Welcome back! 👋 You were booking ${state.serviceName} for ${formattedDate}. Here are today's available times — pick one to continue!`,
            { showTimeSlots: true, timeSlots: slots }
          );
          emitUISignal({ intent: "booking", activeComponent: "time_picker", componentData: { slots } });
        } else {
          // Date no longer has slots — offer date picker again
          setBookingState(prev => ({ ...prev, date: null }));
          addBotMessage(
            `Welcome back! 👋 You were booking ${state.serviceName}, but ${formattedDate} no longer has open slots. Please pick another date.`,
            { showDatePicker: true }
          );
          emitUISignal({ intent: "booking", activeComponent: "date_picker" });
        }
      } catch (e) {
        console.error("[Widget] Error resuming booking flow:", e);
        setBookingState(prev => ({ ...prev, date: null }));
        addBotMessage(`Welcome back! 👋 You were booking ${state.serviceName}. Please pick a date to continue.`, { showDatePicker: true });
        emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      } finally {
        setLoading(false);
      }
      return;
    }
    // If service selected but no date — show date picker
    if (state.serviceId && !state.date) {
      addBotMessage(
        `Welcome back! 👋 You were booking ${state.serviceName}. Go ahead and pick a date that works for you!`,
        { showDatePicker: true }
      );
      emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      return;
    }
    // If time slot selected but info not yet collected — start collecting
    if (state.serviceId && state.date && state.timeSlot && !state.customerName) {
      const formattedDate = format(state.date, "EEEE, MMMM d");
      const formattedTime = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(state.timeSlot.startTime || state.timeSlot.start));
      setBookingState(prev => ({ ...prev, collectingInfo: 'name' }));
      emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
      addBotMessage(`Welcome back! 👋 You were booking ${state.serviceName} on ${formattedDate} at ${formattedTime}. To complete your booking, may I have your name please?`);
      return;
    }
    // No active booking flow — show quick replies
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
  
  // Handle start new chat
  async function handleNewChat() {
    setShowSessionOverlay(false);
    setHasExistingSession(false);
    setExistingMessages([]);
    
    // Generate new session ID with fresh timestamp
    const newSid = crypto.randomUUID();
    localStorage.setItem(`widget_session_${receptionistId}`, newSid);
    localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    setSessionId(newSid);
    
    // Reset booking state and clear persisted copy
    setBookingState({...defaultBookingState});
    localStorage.removeItem(BOOKING_STATE_KEY);
    setActiveUISignal(null);
    
    // Show fresh greeting with a proper "Hi" conversation start
    if (receptionist?.greeting_message) {
      setMessages([{
        role: "assistant",
        content: receptionist.greeting_message,
        timestamp: new Date(),
        showQuickReplies: true,
      }]);
    }
    
    setGreetingStored(false); // Allow greeting to be stored for new session
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadReceptionist() {
    // First try the public-safe view (works for unauthenticated widget users)
    let data: any = null;
    let error: any = null;
    
    const viewResult = await supabase
      .from("widget_receptionists")
      .select("id, name, business_name, greeting_message, timezone, tone")
      .eq("id", receptionistId)
      .maybeSingle();
    
    if (viewResult.data) {
      data = viewResult.data;
    } else {
      // Fallback: try RPC function for additional fields
      const rpcResult = await supabase.rpc("get_public_receptionist", { p_receptionist_id: receptionistId });
      if (rpcResult.data && rpcResult.data.length > 0) {
        data = rpcResult.data[0];
      } else {
        error = viewResult.error || rpcResult.error;
      }
    }
    
    // Also try to get business_info and business_model (authenticated owners only, will silently fail for widget)
    const fullResult = await supabase
      .from("receptionists")
      .select("business_info, business_model")
      .eq("id", receptionistId!)
      .maybeSingle();
    
    if (fullResult.data) {
      data = { ...data, ...fullResult.data };
    }

    if (!data) {
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
    
    // Only display greeting message for NEW sessions (not when continuing existing conversation)
    // If hasExistingSession is true, the overlay will show and user will choose to continue or start fresh
    if (data.greeting_message && !hasExistingSession) {
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
    // Use the public_catalog view or RPC for unauthenticated widget access
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_services_for_receptionist", { p_receptionist_id: receptionistId! });
    
    let items = rpcData;
    
    // Fallback to direct table query (works if user is authenticated owner)
    if (rpcError || !items) {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("receptionist_id", receptionistId)
        .eq("active", true);
      if (!error) items = data;
    }

    if (items) {
      const serviceItems = items.filter((item: any) => item.duration_minutes > 0);
      const productItems = items.filter((item: any) => item.duration_minutes === 0 || item.is_product === true);
      console.log("[Widget] Services:", serviceItems.length, "Products:", productItems.length);
      setServices(serviceItems);
      setProducts(productItems);
    }
  }

  // Load receptionist and services when sessionId is ready AND session check is complete
  useEffect(() => {
    if (receptionistId && sessionId && sessionCheckComplete) {
      loadReceptionist();
      loadServicesAndProducts();
    }
  }, [receptionistId, sessionId, sessionCheckComplete, hasExistingSession]);

  // Store initial greeting in database to prevent re-greeting
  useEffect(() => {
    if (receptionist && receptionist.greeting_message && !greetingStored && sessionId) {
      storeInitialGreeting();
    }
  }, [receptionist, greetingStored, sessionId]);

  // Intent patterns that match quick action button behavior
  const QUICK_ACTION_INTENTS: { pattern: RegExp; action: string }[] = [
    // Book Appointment intent → matches "book_appointment" button
    { pattern: /\b(book|schedule|make|set\s*up|arrange|reserve)\b.*\b(appointment|booking|visit|session|consultation|meeting|slot)\b/i, action: 'book_appointment' },
    { pattern: /\b(appointment|booking|visit|session|consultation)\b.*\b(book|schedule|make|set\s*up|arrange|reserve)\b/i, action: 'book_appointment' },
    { pattern: /\b(i('d| would| want to| wanna| need to) like to (book|schedule|come in|make an appointment|set up))\b/i, action: 'book_appointment' },
    { pattern: /\bi('m| am) ready to book\b/i, action: 'book_appointment' },
    { pattern: /\bcan i (book|schedule|get|make)\b/i, action: 'book_appointment' },
    { pattern: /\b(when (can|could) (i|we) come in|when are you (available|free|open))\b/i, action: 'book_appointment' },
    { pattern: /\b(any (availability|openings|slots)|do you have (availability|openings))\b/i, action: 'book_appointment' },
    { pattern: /\bi need (an? )?(appointment|booking|slot|session)\b/i, action: 'book_appointment' },
    { pattern: /\bwhat (days|dates|times?) (are |do you have )?(available|open|free)\b/i, action: 'book_appointment' },
    { pattern: /\b(what times do you have|what time slots|show me (the |your )?(schedule|availability|calendar))\b/i, action: 'book_appointment' },
    { pattern: /\bi('d| would) like to come in\b/i, action: 'book_appointment' },
    { pattern: /\blet('s| us) (book|schedule|set up|make)\b/i, action: 'book_appointment' },
    { pattern: /\b(sign me up|put me down|pencil me in)\b/i, action: 'book_appointment' },
    { pattern: /\b(next available|earliest available|soonest)\b/i, action: 'book_appointment' },
    // View Products intent → matches "view_products" button
    { pattern: /\b(show|see|view|browse|look at|check out|what)\b.*\b(products?|items?|catalog|menu|stock|inventory|merchandise)\b/i, action: 'view_products' },
    { pattern: /\b(products?|items?|catalog|menu|stock|inventory|merchandise)\b.*\b(show|see|view|browse|available|have|offer|sell)\b/i, action: 'view_products' },
    { pattern: /\bwhat (do you|can i) (buy|order|purchase|get)\b/i, action: 'view_products' },
    { pattern: /\b(i('d| would) like to|i want to|can i|let me)\b.*\b(buy|order|purchase|shop|get something)\b/i, action: 'view_products' },
    { pattern: /\b(buy|order|purchase|shop|get)\b.*\b(something|anything|stuff)\b/i, action: 'view_products' },
    { pattern: /\bwhat('s| is) (for sale|on (the )?menu|available (to buy|for purchase))\b/i, action: 'view_products' },
    { pattern: /\bdo you (sell|carry|have|stock)\b/i, action: 'view_products' },
    // View Services intent → matches "view_services" button
    { pattern: /\b(show|see|view|list|what are)\b.*\b(services?|offerings?|treatments?|options?)\b/i, action: 'view_services' },
    { pattern: /\b(services?|offerings?|treatments?)\b.*\b(show|see|view|offer|available|provide|have)\b/i, action: 'view_services' },
    { pattern: /\bwhat (do you|can you) (do|offer|provide)\b/i, action: 'view_services' },
    { pattern: /\bwhat (services?|options?) (do you|are) (have|available|offer)\b/i, action: 'view_services' },
    { pattern: /\b(how can you help|what can you help with|what do you specialize in)\b/i, action: 'view_services' },
    // Contact intent → matches "contact" button
    { pattern: /\b(contact|reach|call|phone|email|address|location|directions|where are you|how (do i|can i|to) (reach|contact|find|get to))\b/i, action: 'contact' },
  ];

  // Try to match a typed service name from user input for direct booking
  function matchServiceFromText(text: string): { id: string; name: string } | null {
    if (services.length === 0) return null;
    const lowerText = text.toLowerCase();
    // Check if user typed "book a [service name]" or similar
    for (const s of services) {
      if (lowerText.includes(s.name.toLowerCase())) {
        return { id: s.id, name: s.name };
      }
    }
    return null;
  }

  async function sendMessage(messageText?: string) {
    const textToSend = messageText || input.trim();
    if (!textToSend || !receptionistId) return;

    // ─── QUICK ACTION INTENT ROUTING ───────────────────────────────
    // If not already in a booking/order flow, check if the typed message
    // matches a quick action button intent and route identically.
    const isInActiveFlow = bookingState.collectingInfo || 
                           bookingState.awaitingOrderConfirmation || 
                           bookingState.serviceId || 
                           bookingState.productId;

    if (!isInActiveFlow) {
      const lowerText = textToSend.toLowerCase();
      
      // First: check if user mentions a specific service name with booking intent
      const bookingIntentMatch = QUICK_ACTION_INTENTS.some(({ pattern, action }) => 
        action === 'book_appointment' && pattern.test(lowerText)
      );
      
      if (bookingIntentMatch) {
        const matchedService = matchServiceFromText(textToSend);
        addUserMessage(textToSend);
        setInput("");
        
        if (matchedService) {
          // User mentioned a specific service — skip service selection, go to calendar
          await handleServiceSelect(matchedService.id, matchedService.name);
        } else {
          // General booking intent — route to handleQuickReply
          await handleQuickReply('book_appointment');
        }
        return;
      }
      
      // Then check other intents
      for (const { pattern, action } of QUICK_ACTION_INTENTS) {
        if (action === 'book_appointment') continue; // already handled above
        if (pattern.test(lowerText)) {
          addUserMessage(textToSend);
          setInput("");
          await handleQuickReply(action);
          return;
        }
      }
    }

    const userMessage: Message = {
      role: "user",
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    
    // Refresh session timestamp on each interaction (keeps 24h window rolling)
    if (receptionistId) {
      localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    }

    try {
      // Handle soft order confirmation step (client-side flow — persist user message)
      if (bookingState.awaitingOrderConfirmation) {
        persistMessage('user', textToSend);
        const lowerText = textToSend.toLowerCase().trim();
        const isConfirm = /^(yes|yep|yeah|sure|go ahead|proceed|confirm|let's do it|ready|ok|okay|place it|place the order|place order|do it|absolutely|definitely|yea|sounds good|let's go|i'm ready)/.test(lowerText);
        const isChange = /^(change|modify|edit|update|different|swap|switch|actually|wait|hold on|let me change|i want to change|make changes|no.*change|want.*change)/.test(lowerText) || 
                         /change|modify|different|swap|switch/.test(lowerText);
        const isCancel = /^(no|nope|nah|cancel|never\s*mind|not really|not now|not ready|maybe later|i('ll| will) pass|forget it|stop|back off|leave me)/.test(lowerText);
        
        if (isConfirm) {
          // User confirmed — NOW start collecting info
          setBookingState(prev => ({ 
            ...prev, 
            awaitingOrderConfirmation: false,
            collectingInfo: 'name',
          }));
          emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
          
          addBotMessage("Perfect, let's get your order placed! What's your name?");
          setLoading(false);
          return;
        } else if (isChange) {
          // User wants to change — show product selector again
          setBookingState(prev => ({ 
            ...prev, 
            awaitingOrderConfirmation: false,
            pendingProducts: [],
            productId: null,
            productName: null,
            quantity: 1,
            orderMode: false,
          }));
          emitUISignal({ intent: "ordering", activeComponent: "product_selector", reason: "intent_switch" });
          
          addBotMessage("No problem at all! Here are our products again — take your time and pick whatever you'd like.", { showProducts: true });
          setLoading(false);
          return;
        } else if (isCancel) {
          // User not ready — back off completely
          setBookingState({...defaultBookingState});
          emitUISignal({ intent: "browsing", activeComponent: null, reason: "user_cancel" });
          addBotMessage("No worries at all! Feel free to browse or ask me anything whenever you're ready. I'm here to help! 😊");
          setLoading(false);
          return;
        }
        // If none matched, treat as ambiguous — ask again gently
        addBotMessage("Just to be sure — would you like to go ahead with this order, make any changes to your selection, or take some more time to browse?");
        setLoading(false);
        return;
      }

      // Handle booking info collection (client-side flow — persist user message)
      if (bookingState.collectingInfo === 'name') {
        persistMessage('user', textToSend);
        let name = textToSend.trim();

        // Detect back-references like "same name", "the name I gave you", "use my earlier name"
        const isBackReference = /\b(same\s+name|name\s+i\s+(?:gave|told|provided|said|mentioned)|(?:use|keep)\s+(?:my|the)\s+(?:earlier|previous|last|same)\s+name|already\s+(?:gave|told|said)|you\s+(?:already\s+)?have\s+(?:my|it|the)\s+name)\b/i.test(name);
        if (isBackReference) {
          const previousName = findPreviousNameInHistory(messages);
          if (previousName) {
            name = previousName;
          } else {
            addBotMessage("I don't seem to have your name from earlier in our conversation. Could you please tell me your name?");
            setLoading(false);
            return;
          }
        } else {
          // Validate the input as a direct name — reject sentences, verbs, apologies
          const validated = validateDirectNameInput(name);
          if (!validated) {
            addBotMessage("I didn't catch a valid name there. Could you please share just your first name or full name? For example: \"John\" or \"Jane Smith\"");
            setLoading(false);
            return;
          }
          name = validated;
        }

        if (name.length < 2) {
          addBotMessage("I didn't quite catch that. Could you please provide your full name?");
          setLoading(false);
          return;
        }
        
        setBookingState(prev => ({ ...prev, customerName: name, collectingInfo: 'contact' }));
        emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
        
        addBotMessage(`Thank you, ${name}! And what's the best way to reach you? You can share your email address or phone number.`);
        setLoading(false);
        return;
      }

      if (bookingState.collectingInfo === 'contact') {
        persistMessage('user', textToSend);
        // User provided contact info - complete the booking or order
        const contactInfo = textToSend.trim();
        const isEmail = contactInfo.includes('@');
        const isPhone = /^\+?[\d\s\-\(\)]{7,}$/.test(contactInfo.replace(/\s/g, ''));
        
        // Validate contact info
        if (!isEmail && !isPhone) {
          addBotMessage("I couldn't recognize that as an email or phone number. Could you please provide a valid email address (e.g., you@example.com) or phone number?");
          setLoading(false);
          return;
        }
        
        setBookingState(prev => ({
          ...prev,
          customerEmail: isEmail ? contactInfo : null,
          customerPhone: !isEmail ? contactInfo : null,
          collectingInfo: null,
        }));

        // Check if this is a product order or appointment booking
        if (bookingState.orderMode && bookingState.productName) {
          // Write the order to the database via the create_widget_order RPC
          try {
            const orderItems = bookingState.pendingProducts.length > 0
              ? bookingState.pendingProducts.map(p => ({
                  product_id: p.productId,
                  product_name: p.productName,
                  quantity: p.quantity,
                  unit_price: p.price || null,
                }))
              : [{
                  product_id: bookingState.productId,
                  product_name: bookingState.productName,
                  quantity: bookingState.quantity || 1,
                  unit_price: null,
                }];

            const totalAmount = orderItems.reduce((sum, item) => sum + ((item.unit_price || 0) * item.quantity), 0);

            const { data: orderId, error: orderError } = await supabase.rpc('create_widget_order', {
              p_receptionist_id: receptionistId,
              p_customer_name: bookingState.customerName!,
              p_items: orderItems,
              p_customer_email: isEmail ? contactInfo : null,
              p_customer_phone: !isEmail ? contactInfo : null,
              p_notes: null,
              p_metadata: { session_id: sessionId, source: 'widget' },
            });

            if (orderError) {
              console.error("[Widget] Order creation error:", orderError);
              throw orderError;
            }

            const orderConfirmationMessage: Message = {
              role: "assistant",
              content: `Wonderful! Your order has been placed successfully. Here are the details:`,
              timestamp: new Date(),
              orderConfirmation: {
                products: orderItems.map(i => ({ name: i.product_name, quantity: i.quantity, price: i.unit_price })),
                customerName: bookingState.customerName,
                contactInfo: contactInfo,
                orderId: orderId || crypto.randomUUID(),
                totalAmount,
              }
            };
            
            setMessages(prev => [...prev, orderConfirmationMessage]);
            persistMessage('ai', `Wonderful! Your order has been placed successfully. Here are the details:`);
            emitUISignal({ intent: "confirmation", activeComponent: "order_summary", componentData: orderConfirmationMessage.orderConfirmation || {} });
          } catch (orderErr: any) {
            console.error("[Widget] Order error:", orderErr);
            addBotMessage("I apologize, but I encountered an issue placing your order. Please try again or contact us directly.");
          }
          
          // Reset booking state
          setBookingState({...defaultBookingState});
          localStorage.removeItem(BOOKING_STATE_KEY);
          
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

          // Format nice date/time
          const appointmentDate = format(new Date(bookingState.timeSlot.startTime), "EEEE, MMMM d, yyyy");
          const appointmentTime = format(new Date(bookingState.timeSlot.startTime), "h:mm a");

          // Show confirmation with card
          const confirmationMessage: Message = {
            role: "assistant",
            content: `Your appointment has been confirmed! Here are your booking details:`,
            timestamp: new Date(),
            bookingConfirmation: {
              serviceName: bookingState.serviceName,
              dateTime: bookingState.timeSlot.startTime,
              customerName: bookingState.customerName,
              contactInfo: contactInfo,
              duration: services.find(s => s.id === bookingState.serviceId)?.duration_minutes,
            }
          };
          
          setMessages(prev => [...prev, confirmationMessage]);
          persistMessage('ai', `Your appointment has been confirmed! Here are your booking details:`);
          emitUISignal({ intent: "confirmation", activeComponent: "booking_confirmation", componentData: confirmationMessage.bookingConfirmation || {} });
          
          // Reset booking state
          setBookingState({...defaultBookingState});
          localStorage.removeItem(BOOKING_STATE_KEY);
          
          setLoading(false);
          return;
        } catch (bookErr: any) {
          console.error("Booking error:", bookErr);
          addBotMessage("I apologize, but I encountered an issue while confirming your appointment. Please try again, or feel free to contact us directly for assistance.");
          setLoading(false);
          return;
        }
      }

      // Normal conversation flow - include abuse protection fields
      const { data, error } = await supabase.functions.invoke("widget-chat", {
        body: {
          message: textToSend,
          receptionistId,
          sessionId,
          bookingContext: bookingState,
          // Honeypot and timing for bot detection
          _hp_field: honeypotValue,
          _form_load_time: formLoadTimeRef.current,
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

      // Check if booking was created by the backend
      if (data.bookingCreated && data.bookingDetails) {
        botMessage.bookingConfirmation = {
          serviceName: data.bookingDetails.serviceName,
          dateTime: data.bookingDetails.startTime,
          customerName: data.bookingDetails.customerName,
          customerEmail: data.bookingDetails.customerEmail,
          customerPhone: data.bookingDetails.customerPhone,
          confirmationId: data.bookingDetails.id,
          duration: services.find(s => s.id === bookingState.serviceId)?.duration_minutes,
        };
        
        // Reset booking state after successful booking
        setBookingState({...defaultBookingState});
        emitUISignal({ intent: "confirmation", activeComponent: "booking_confirmation", componentData: botMessage.bookingConfirmation || {} });
      }
      
      // Check if order was created by the backend
      if (data.orderCreated && data.orderDetails) {
        botMessage.orderConfirmation = {
          products: data.orderDetails.products || [],
          customerName: data.orderDetails.customerName,
          contactInfo: data.orderDetails.customerEmail || data.orderDetails.customerPhone,
          orderId: data.orderDetails.id,
          totalAmount: data.orderDetails.totalAmount,
          deliveryAddress: data.orderDetails.deliveryAddress,
        };
        
        // Reset booking state after successful order
        setBookingState({...defaultBookingState});
        emitUISignal({ intent: "confirmation", activeComponent: "order_summary", componentData: botMessage.orderConfirmation || {} });
      }

      let hasStructuredUISignal = false;
      if (data.uiSignal) {
        const normalizedSignal = normalizeUISignal(data.uiSignal);
        if (normalizedSignal) {
          const hydratedSignal = await hydrateTimePickerSignal(normalizedSignal);
          hasStructuredUISignal = Boolean(hydratedSignal.activeComponent);
          setActiveUISignal(hydratedSignal);
        }
      }

      // Legacy UI fallbacks only when backend does not return a structured uiSignal
      // Only show services if AI explicitly asks for service selection
      const shouldShowServices = (
        data.showServicesUI ||
        data.shouldShowServices ||
        data.uiHints?.showServiceSelector ||
        lowerReply.includes("which service") || 
        lowerReply.includes("what service") ||
        lowerReply.includes("select a service") ||
        lowerReply.includes("choose a service")
      ) && !bookingState.serviceId && !data.bookingCreated;
      
      if (!hasStructuredUISignal && shouldShowServices && services.length > 0) {
        botMessage.showServices = true;
      }

      // Detect product order intent and show products
      const shouldShowProducts = (
        data.showProductsUI ||
        data.shouldShowProducts ||
        data.uiHints?.showProductSelector ||
        lowerReply.includes("which product") || 
        lowerReply.includes("what product") ||
        lowerReply.includes("order from our") ||
        lowerReply.includes("browse our products")
      ) && !bookingState.productId && !data.orderCreated;
      
      if (!hasStructuredUISignal && shouldShowProducts && products.length > 0) {
        botMessage.showProducts = true;
      }

      // Only show date picker if AI explicitly asks for a date
      // NOT automatically after service selection - let the AI control the flow
      const shouldShowDatePicker = (
        data.showDatePickerUI ||
        data.uiHints?.showDatePicker ||
        lowerReply.includes("which date") ||
        lowerReply.includes("what date") ||
        lowerReply.includes("when would you like") ||
        lowerReply.includes("pick a date") ||
        lowerReply.includes("select a date") ||
        lowerReply.includes("choose a date")
      ) && bookingState.serviceId && !bookingState.date && !data.bookingCreated;
      
      if (!hasStructuredUISignal && shouldShowDatePicker) {
        botMessage.showDatePicker = true;
      }

      // Only show time slots if AI explicitly asks for a time
      const shouldShowTimeSlots = (
        data.showTimeSlotsUI ||
        data.uiHints?.showTimePicker ||
        lowerReply.includes("which time") ||
        lowerReply.includes("what time") ||
        lowerReply.includes("select a time") ||
        lowerReply.includes("pick a time") ||
        lowerReply.includes("choose a time") ||
        lowerReply.includes("available slot")
      ) && bookingState.serviceId && bookingState.date && !bookingState.timeSlot && !data.bookingCreated;
      
      if (!hasStructuredUISignal && shouldShowTimeSlots) {
        const dateStr = format(bookingState.date, "yyyy-MM-dd");
        const nextDay = new Date(bookingState.date);
        nextDay.setDate(nextDay.getDate() + 1);
        const endDateStr = format(nextDay, "yyyy-MM-dd");
        
        console.log("[Widget] sendMessage fetching availability:", { receptionistId, serviceId: bookingState.serviceId, startDate: dateStr, endDate: endDateStr });
        
        const { data: slotsData, error: slotsError } = await supabase.functions.invoke("check-availability", {
          body: {
            receptionistId,
            serviceId: bookingState.serviceId,
            startDate: dateStr,
            endDate: endDateStr,
            maxSlots: 6,
          }
        });

        console.log("[Widget] sendMessage slots response:", { slotsData, slotsError });

        const slots = slotsData?.slots || [];
        if (slots.length > 0) {
          botMessage.showTimeSlots = true;
          botMessage.timeSlots = slots;
        } else {
          // No slots available, tell user
          botMessage.content += "\n\nUnfortunately, no time slots are available for that date. Please select another date.";
          botMessage.showDatePicker = true;
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
    emitUISignal({ intent: "booking", activeComponent: "date_picker" });
    addUserMessage(`I'd like to book ${serviceName}`);
    addBotMessage(`Great choice! Go ahead and pick a date that works for you.`, { showDatePicker: true });
  }

  async function handleProductsConfirm(selectedProducts: Array<{ productId: string; productName: string; quantity: number; price?: number }>) {
    if (selectedProducts.length === 0) return;
    
    // Build summary for soft confirmation
    const productNames = selectedProducts.map(p => `${p.quantity}x ${p.productName}`).join(', ');
    const totalPrice = selectedProducts.reduce((sum, p) => sum + ((p.price || 0) * p.quantity), 0);
    const priceText = totalPrice > 0 ? ` for a total of $${totalPrice.toFixed(2)}` : '';
    
    // Store pending products but DON'T start collecting info yet
    setBookingState(prev => ({ 
      ...prev, 
      awaitingOrderConfirmation: true,
      pendingProducts: selectedProducts,
      productId: selectedProducts[0].productId,
      productName: productNames,
      quantity: selectedProducts.reduce((sum, p) => sum + p.quantity, 0),
      orderMode: true,
      collectingInfo: null, // NOT collecting info yet
    }));
    emitUISignal({ intent: "ordering", activeComponent: null, reason: "step_progression" });
    
    // Soft confirmation message — ask if they want to proceed
    const botContent = `Great choices! You've selected ${productNames}${priceText}. Are you ready to go ahead with this order, or would you like to make any changes?`;
    addBotMessage(botContent);
  }

  async function handleDateSelect(date: Date) {
    setBookingState(prev => ({ ...prev, date }));
    
    // Immediately fetch time slots for that date
    const dateStr = format(date, "yyyy-MM-dd");
    const formattedDate = format(date, "EEEE, MMMM d");
    
    addUserMessage(`I'd like an appointment on ${formattedDate}`);
    setLoading(true);
    
    try {
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      const endDateStr = format(nextDay, "yyyy-MM-dd");
      
      console.log("[Widget] Fetching availability:", { receptionistId, serviceId: bookingState.serviceId, startDate: dateStr, endDate: endDateStr });
      
      const { data: slotsData, error: slotsError } = await supabase.functions.invoke("check-availability", {
        body: {
          receptionistId,
          serviceId: bookingState.serviceId,
          startDate: dateStr,
          endDate: endDateStr,
          maxSlots: 8,
        }
      });
      
      console.log("[Widget] check-availability response:", { slotsData, slotsError });
      
      // Handle edge function error
      if (slotsError) {
        console.error("[Widget] check-availability error:", slotsError);
        setBookingState(prev => ({ ...prev, date: null }));
        addBotMessage("I had trouble checking availability. Please try selecting a date again.", { showDatePicker: true });
        return;
      }

      // Extract slots - handle both direct response and nested data
      const slots = slotsData?.slots || [];
      console.log("[Widget] Extracted slots count:", slots.length);
      
      if (slots.length > 0) {
        addBotMessage(`Here are the available slots for ${formattedDate} — pick the one that works best for you!`, { showTimeSlots: true, timeSlots: slots });
        emitUISignal({ intent: "booking", activeComponent: "time_picker", componentData: { slots } });
      } else {
        setBookingState(prev => ({ ...prev, date: null }));
        addBotMessage(`I'm sorry, but there are no available time slots on ${formattedDate}. Would you like to try a different date?`, { showDatePicker: true });
        emitUISignal({ intent: "booking", activeComponent: "date_picker" });
      }
    } catch (error) {
      console.error("[Widget] Error fetching availability:", error);
      setBookingState(prev => ({ ...prev, date: null }));
      addBotMessage("I had trouble checking availability. Please try selecting a date again.", { showDatePicker: true });
      emitUISignal({ intent: "booking", activeComponent: "date_picker" });
    } finally {
      setLoading(false);
    }
  }

  async function handleTimeSlotSelect(slot: any) {
    const startTime = slot.startTime || slot.start;
    setBookingState(prev => ({ 
      ...prev, 
      timeSlot: { ...slot, startTime }, 
      collectingInfo: 'name' 
    }));
    emitUISignal({ intent: "lead_capture", activeComponent: null, reason: "step_progression" });
    
    const formattedTime = format(new Date(startTime), "h:mm a");
    const formattedDate = bookingState.date ? format(bookingState.date, "EEEE, MMMM d") : "";
    
    addUserMessage(`I'll take the ${formattedTime} slot`);
    addBotMessage(`Excellent! You've selected ${bookingState.serviceName} on ${formattedDate} at ${formattedTime}.\n\nTo complete your booking, may I have your name please?`);
  }

  async function handleQuickReply(value: string) {
    if (value === "book_appointment") {
      if (services.length === 1) {
        // Only one service — skip selection, go straight to calendar
        await handleServiceSelect(services[0].id, services[0].name);
      } else if (services.length > 1) {
        addBotMessage("Which service would you like to book? Just tap one below!", { showServices: true });
        emitUISignal({ intent: "booking", activeComponent: "service_selector" });
      } else {
        await sendMessage("I'd like to book an appointment");
      }
    } else if (value === "view_services") {
      if (services.length > 0) {
        const serviceList = services.map(s => 
          `• **${s.name}**${s.duration_minutes ? ` (${s.duration_minutes} min)` : ''}${s.price ? ` - $${s.price}` : ''}`
        ).join('\n');
        addBotMessage(`Here are our available services:\n\n${serviceList}\n\nWould you like to book any of these?`, { showServices: true });
        emitUISignal({ intent: "service_enquiry", activeComponent: "service_selector" });
      } else {
        await sendMessage("What services do you offer?");
      }
    } else if (value === "view_products") {
      if (products.length > 0) {
        const productList = products.map(p => 
          `• **${p.name}**${p.price ? ` - $${p.price}` : ''}`
        ).join('\n');
        addBotMessage(`Here are our available products:\n\n${productList}\n\nWould you like to order any of these?`, { showProducts: true });
        emitUISignal({ intent: "product_enquiry", activeComponent: "product_selector" });
      } else {
        await sendMessage("What products do you have?");
      }
    } else if (value === "contact") {
      emitUISignal({ intent: "support", activeComponent: null, reason: "no_ui_needed" });
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
      
      addBotMessage(contactMessage);
    } else if (value === "view_prices") {
      await sendMessage("What are your prices?");
    } else {
      await sendMessage(value);
    }
  }

  // Refresh conversation - now creates a truly new chat with new session ID
  async function handleRefreshConversation() {
    if (!receptionistId) return;
    
    // Generate new session ID with fresh timestamp
    const newSid = crypto.randomUUID();
    localStorage.setItem(`widget_session_${receptionistId}`, newSid);
    localStorage.setItem(`widget_session_ts_${receptionistId}`, Date.now().toString());
    setSessionId(newSid);
    
    // Reset local booking state and clear persisted copy
    setBookingState({...defaultBookingState});
    localStorage.removeItem(BOOKING_STATE_KEY);
    setActiveUISignal(null);
    
    // Reset session tracking
    setHasExistingSession(false);
    setExistingMessages([]);
    setGreetingStored(false);
    
    // Clear messages and show fresh greeting
    if (receptionist?.greeting_message) {
      setMessages([{
        role: "assistant",
        content: receptionist.greeting_message,
        timestamp: new Date(),
        showQuickReplies: true,
      }]);
    } else {
      setMessages([{
        role: "assistant",
        content: `Hello! How can I help you today?`,
        timestamp: new Date(),
        showQuickReplies: true,
      }]);
    }
    
    setInput("");
  }


  const handleSendClick = () => {
    sendMessage();
  };

  // Voice chat: send message and return AI reply text
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
          bookingContext: bookingState,
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

        <UISignalRenderer
          signal={activeUISignal}
          services={services}
          products={products}
          loading={loading}
          onServiceSelect={handleServiceSelect}
          onProductsConfirm={handleProductsConfirm}
          onDateSelect={handleDateSelect}
          onTimeSlotSelect={handleTimeSlotSelect}
          onDismiss={() => setActiveUISignal(null)}
        />

        {/* Input */}
        <div className="p-4 border-t border-border bg-card/50 backdrop-blur-sm">
          <div className="flex gap-2 items-end">
            {/* Invisible honeypot field - bots will fill this, humans won't see it */}
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
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendClick(); } }}
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
            <VoiceInputButton
              onTranscript={(text) => {
                setInput(text);
                sendMessage(text);
              }}
              disabled={loading}
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
        </div>
      </Card>
    </div>
  );
}
