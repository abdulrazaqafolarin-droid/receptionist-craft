// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
// 
// SINGLE SOURCE OF TRUTH for all AI business operator types.
// No other type file should define conversation/task types.
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export type TaskType = 'booking' | 'ordering' | null;

export type TaskStep = 
  // Booking steps
  | 'select_service'
  | 'select_date'
  | 'select_time'
  // Ordering steps
  | 'select_product'
  | 'select_quantity'
  | 'collect_delivery'
  // Shared steps
  | 'collect_name'
  | 'collect_contact'
  | 'confirm'
  | 'complete'
  | null;

export type UserIntent =
  | 'greeting'
  | 'farewell'
  | 'book'
  | 'order'
  | 'confirm'
  | 'deny'
  | 'cancel'
  | 'ack'          // acknowledgment (ok, sure, etc.)
  | 'info'         // asking for information
  | 'price'        // asking about price
  | 'hours'        // asking about hours
  | 'complaint'
  | 'escalate'     // wants human
  | 'small_talk'
  | 'correction'   // correcting previous info
  | 'continue';    // continuing current flow

export type EmotionalTone = 'neutral' | 'positive' | 'negative' | 'urgent' | 'frustrated';

// ═══════════════════════════════════════════════════════════════════════════
// ENTITY STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

export interface ServiceEntity {
  id: string | null;
  name: string | null;
  duration_minutes: number | null;
  price: number | null;
}

export interface ProductItem {
  id: string;
  name: string;
  quantity: number;
  price: number | null;
}

export interface AppointmentEntity {
  date: string | null;      // "2025-02-10" or "tomorrow"
  time: string | null;      // "14:00" or "2pm"
  timezone: string | null;
}

export interface CustomerEntity {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface TaskEntities {
  service: ServiceEntity;
  products: ProductItem[];
  appointment: AppointmentEntity;
  customer: CustomerEntity;
  delivery_address: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE STATE OBJECT - THE SINGLE SOURCE OF TRUTH
// ═══════════════════════════════════════════════════════════════════════════

export interface EngineState {
  // Task tracking
  task_type: TaskType;
  task_step: TaskStep;
  task_started_at: string | null;
  
  // Collected entities
  entities: TaskEntities;
  
  // Conversation rules (prevents loops)
  rules: {
    greeted: boolean;
    confirmation_sent: boolean;
    closing_offered: boolean;
    asked_if_need_more: boolean;
  };
  
  // Flow control
  locked: boolean;              // After confirmation, prevent changes
  topic_lock: string | null;    // Lock to specific service/product
  
  // Memory
  last_intent: UserIntent;
  emotional_tone: EmotionalTone;
  summary: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS CAPABILITIES
// ═══════════════════════════════════════════════════════════════════════════

export interface BusinessCapabilities {
  can_book: boolean;
  can_order: boolean;
  can_deliver: boolean;
  primary_goal: 'sales' | 'bookings' | 'support' | 'leads';
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE INPUT/OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface EngineInput {
  message: string;
  session_id: string;
  receptionist_id: string;
  is_first_message: boolean;
  capabilities: BusinessCapabilities;
  services: Array<{ id: string; name: string; duration_minutes?: number; price?: number }>;
  products: Array<{ id: string; name: string; price?: number; in_stock?: boolean }>;
  timezone?: string;
  current_state: EngineState | null;
}

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  should_start_task: boolean;
  target_task: TaskType;
  should_cancel_task: boolean;
}

export interface ExtractedEntities {
  service_id?: string;
  service_name?: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  date?: string;
  time?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  delivery_address?: string;
}

export interface RequirementCheck {
  complete: boolean;
  missing: string[];
  collected: string[];
  next_required: string | null;
  validation_errors: string[];
}

export interface UIHints {
  show_services: boolean;
  show_products: boolean;
  show_calendar: boolean;
  show_time_slots: boolean;
  show_confirmation: boolean;
  show_order_confirmation: boolean;
}

export interface GovernorInstruction {
  allowed: string[];
  forbidden: string[];
  next_field: string | null;
  instruction: string;
  should_confirm: boolean;
  should_close: boolean;
}

export interface EngineResult {
  state: EngineState;
  intent: IntentResult;
  entities: ExtractedEntities;
  requirements: RequirementCheck;
  ui_hints: UIHints;
  instruction: GovernorInstruction;
  prompt_block: string;
  illegal: boolean;
  illegal_reason: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export function createEmptyState(): EngineState {
  return {
    task_type: null,
    task_step: null,
    task_started_at: null,
    entities: {
      service: { id: null, name: null, duration_minutes: null, price: null },
      products: [],
      appointment: { date: null, time: null, timezone: null },
      customer: { name: null, phone: null, email: null },
      delivery_address: null,
    },
    rules: {
      greeted: false,
      confirmation_sent: false,
      closing_offered: false,
      asked_if_need_more: false,
    },
    locked: false,
    topic_lock: null,
    last_intent: 'greeting',
    emotional_tone: 'neutral',
    summary: '',
  };
}

export function serializeState(state: EngineState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string | null | undefined): EngineState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as EngineState;
  } catch {
    return null;
  }
}
