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

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE TASK - Task-Intelligent State Object
// ═══════════════════════════════════════════════════════════════════════════
export type TaskType = 'booking' | 'ordering' | null;

export type TaskStep = 
  // Booking steps
  | 'selecting_service'
  | 'selecting_date'
  | 'selecting_time'
  // Ordering steps
  | 'selecting_product'
  | 'selecting_quantity'
  // Shared steps
  | 'collecting_contact'
  | 'confirming'
  | 'completed'
  | null;

export interface TaskEntities {
  // Service entity
  service: {
    id: string | null;
    name: string | null;
    duration_minutes: number | null;
    price: number | null;
  };
  
  // Product cart (multi-product support)
  product_cart: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number | null;
  }>;
  
  // Appointment entity
  appointment: {
    date: string | null;
    time: string | null;
    timezone: string | null;
  };
  
  // Customer entity
  customer: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  
  // Delivery (for orders)
  delivery_address: string | null;
}

export interface UIState {
  show_services: boolean;
  show_products: boolean;
  show_calendar: boolean;
  show_time_slots: boolean;
  show_confirmation: boolean;
}

export interface FlowFlags {
  greeted: boolean;
  confirmation_shown: boolean;
  closing_offered: boolean;
  asked_if_need_more: boolean;
}

export interface TaskMemory {
  summary: string;
  last_user_intent: string | null;
  emotional_tone: 'neutral' | 'positive' | 'negative' | 'urgent' | 'frustrated';
  pending_info: string[];
}

export interface ActiveTask {
  type: TaskType;
  step: TaskStep;
  confidence: number;
  started_at: string | null;
  entities: TaskEntities;
  ui_state: UIState;
  flow_flags: FlowFlags;
  memory: TaskMemory;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY FLOW SLOTS (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════
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
  
  // State machine context (serialized JSON)
  machineContext?: string | null;
  
  // Active task (serialized JSON)
  activeTask?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNOR STATE (for state-driven execution control)
// ═══════════════════════════════════════════════════════════════════════════
export interface GovernorStateType {
  active_flow: 'booking' | 'ordering' | 'support' | 'info' | 'none';
  current_step: TaskStep | null;
  locked: boolean;
  topic_lock: string | null;
  missing_fields: string[];
  collected_fields: string[];
  conversation_rules: {
    greeted: boolean;
    confirmation_sent: boolean;
    closing_sent: boolean;
    asked_if_need_more: boolean;
  };
  last_ai_action: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED STATE (for UnifiedConversationCore - SINGLE SOURCE OF TRUTH)
// ═══════════════════════════════════════════════════════════════════════════
export interface UnifiedStateType {
  task: ActiveTask | null;
  rules: {
    greeted: boolean;
    confirmationSent: boolean;
    closingOffered: boolean;
    askedIfNeedMore: boolean;
    locked: boolean;
    topicLock: string | null;
  };
  lastIntent: string;
  lastAction: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION STATE - Full Session State
// ═══════════════════════════════════════════════════════════════════════════
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
  // New: Active Task object
  active_task: ActiveTask | null;
  // New: Governor State object (legacy)
  governor_state?: GovernorStateType | null;
  // New: Unified State object (SINGLE SOURCE OF TRUTH)
  unified_state?: UnifiedStateType | null;
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
  'cancel',
  'stop',
];

export const BLOCKING_STEPS: FlowStep[] = [
  'collect_contact',
  'confirm',
];

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function createEmptyActiveTask(): ActiveTask {
  return {
    type: null,
    step: null,
    confidence: 0,
    started_at: null,
    entities: {
      service: { id: null, name: null, duration_minutes: null, price: null },
      product_cart: [],
      appointment: { date: null, time: null, timezone: null },
      customer: { name: null, phone: null, email: null },
      delivery_address: null,
    },
    ui_state: {
      show_services: false,
      show_products: false,
      show_calendar: false,
      show_time_slots: false,
      show_confirmation: false,
    },
    flow_flags: {
      greeted: false,
      confirmation_shown: false,
      closing_offered: false,
      asked_if_need_more: false,
    },
    memory: {
      summary: '',
      last_user_intent: null,
      emotional_tone: 'neutral',
      pending_info: [],
    },
  };
}

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
    active_task: null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE TASK HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function serializeActiveTask(task: ActiveTask | null): string | null {
  if (!task) return null;
  return JSON.stringify(task);
}

export function deserializeActiveTask(json: string | null | undefined): ActiveTask | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ActiveTask;
  } catch {
    return null;
  }
}

export function getTaskPendingInfo(task: ActiveTask): string[] {
  const pending: string[] = [];
  
  if (task.type === 'booking') {
    if (!task.entities.service.id) pending.push('service');
    if (!task.entities.appointment.date) pending.push('date');
    if (!task.entities.appointment.time) pending.push('time');
    if (!task.entities.customer.name) pending.push('customer_name');
    if (!task.entities.customer.phone && !task.entities.customer.email) pending.push('contact');
  } else if (task.type === 'ordering') {
    if (task.entities.product_cart.length === 0) pending.push('product');
    if (!task.entities.customer.name) pending.push('customer_name');
    if (!task.entities.customer.phone && !task.entities.customer.email) pending.push('contact');
  }
  
  return pending;
}

export function isTaskComplete(task: ActiveTask): boolean {
  return task.step === 'completed';
}

export function getNextTaskStep(task: ActiveTask): TaskStep {
  const pending = getTaskPendingInfo(task);
  
  if (task.type === 'booking') {
    if (!task.entities.service.id) return 'selecting_service';
    if (!task.entities.appointment.date) return 'selecting_date';
    if (!task.entities.appointment.time) return 'selecting_time';
    if (!task.entities.customer.name || 
        (!task.entities.customer.phone && !task.entities.customer.email)) {
      return 'collecting_contact';
    }
    if (!task.flow_flags.confirmation_shown) return 'confirming';
    return 'completed';
  }
  
  if (task.type === 'ordering') {
    if (task.entities.product_cart.length === 0) return 'selecting_product';
    if (!task.entities.customer.name || 
        (!task.entities.customer.phone && !task.entities.customer.email)) {
      return 'collecting_contact';
    }
    if (!task.flow_flags.confirmation_shown) return 'confirming';
    return 'completed';
  }
  
  return null;
}

export function buildTaskSummary(task: ActiveTask): string {
  if (!task.type) return 'No active task';
  
  const parts: string[] = [];
  parts.push(`User intent: ${task.type}`);
  
  if (task.type === 'booking' && task.entities.service.name) {
    parts.push(`Selected service: ${task.entities.service.name}`);
  }
  
  if (task.type === 'ordering' && task.entities.product_cart.length > 0) {
    const products = task.entities.product_cart.map(p => `${p.name} x${p.quantity}`).join(', ');
    parts.push(`Selected products: ${products}`);
  }
  
  if (task.entities.appointment.date) {
    parts.push(`Date: ${task.entities.appointment.date}`);
  }
  
  if (task.entities.appointment.time) {
    parts.push(`Time: ${task.entities.appointment.time}`);
  }
  
  if (task.entities.customer.name) {
    parts.push(`Customer: ${task.entities.customer.name}`);
  }
  
  parts.push(`Current step: ${task.step || 'not started'}`);
  
  const pending = getTaskPendingInfo(task);
  if (pending.length > 0) {
    parts.push(`Pending info: ${pending.join(', ')}`);
  }
  
  return parts.join('\n');
}
