// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FLOW ENGINE - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export type FlowType = 'SERVICE' | 'PRODUCT' | null;

export type FlowStep = 
  | 'select_service' 
  | 'select_date' 
  | 'select_time' 
  | 'select_product'
  | 'select_quantity'
  | 'collect_name'
  | 'collect_contact'
  | 'collect_location'
  | 'confirm' 
  | 'complete'
  | null;

export type ConversationPhase = 
  | 'init'
  | 'greeting' 
  | 'discovery' 
  | 'booking' 
  | 'ordering' 
  | 'confirmation' 
  | 'followup' 
  | 'closing';

export interface FlowSlots {
  // Service booking slots
  serviceId?: string | null;
  serviceName?: string | null;
  date?: string | null;
  time?: string | null;
  
  // Product ordering slots
  productId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  selectedProducts?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price?: number;
  }>;
  
  // Contact slots (shared)
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  
  // Location slot (for orders with delivery)
  deliveryLocation?: string | null;
}

export interface ConversationState {
  session_id: string;
  receptionist_id: string;
  active_flow: FlowType;
  active_topic: string | null;
  flow_step: FlowStep;
  topic_confidence: number;
  slots: FlowSlots;
  greeting_sent: boolean;
  booking_confirmed: boolean;
  order_confirmed: boolean;
  asked_if_need_more_help: boolean;
  services_shown: boolean;
  products_shown: boolean;
  last_message_at: string;
}

export interface TopicShiftSignal {
  type: 'explicit' | 'semantic' | 'inferred';
  confidence: number;
  newTopic?: string;
  shouldBlock: boolean;
  blockReason?: string;
}

export interface FlowTransition {
  from: FlowStep;
  to: FlowStep;
  trigger: string;
  slots_updated: string[];
}

export const EXPLICIT_RESET_CUES = [
  'new topic',
  'something else',
  'another question',
  'forget that',
  'never mind',
  'start over',
  'different question',
  'change of plans',
  'actually, I wanted',
  'let me ask',
];

export const BLOCKING_STEPS: FlowStep[] = [
  'collect_contact',
  'confirm',
];

export function createEmptyState(sessionId: string, receptionistId: string): ConversationState {
  return {
    session_id: sessionId,
    receptionist_id: receptionistId,
    active_flow: null,
    active_topic: null,
    flow_step: null,
    topic_confidence: 0,
    slots: {},
    greeting_sent: false,
    booking_confirmed: false,
    order_confirmed: false,
    asked_if_need_more_help: false,
    services_shown: false,
    products_shown: false,
    last_message_at: new Date().toISOString(),
  };
}
