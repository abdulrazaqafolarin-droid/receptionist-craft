// ═══════════════════════════════════════════════════════════════════════════
// OWNER AGENT — TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════
// The owner's conversational management interface types.
// ═══════════════════════════════════════════════════════════════════════════

/** Owner's intent when talking to the management agent */
export type OwnerIntent =
  // Service management
  | 'add_service'
  | 'update_service'
  | 'remove_service'
  | 'list_services'
  | 'set_service_price'
  | 'set_service_duration'
  | 'toggle_service_active'

  // Availability management
  | 'set_hours'
  | 'block_time'
  | 'unblock_time'
  | 'set_staff_availability'
  | 'block_staff'
  | 'unblock_staff'
  | 'set_break'

  // Channel management
  | 'connect_channel'
  | 'disconnect_channel'
  | 'configure_channel'

  // Staff management
  | 'add_staff'
  | 'update_staff'
  | 'remove_staff'
  | 'assign_staff_to_service'

  // Policy management
  | 'set_cancellation_policy'
  | 'set_deposit_policy'
  | 'set_refund_policy'
  | 'set_late_policy'

  // Money Mode / Growth
  | 'toggle_money_mode'
  | 'set_money_mode_threshold'
  | 'configure_growth_module'

  // Knowledge / FAQ
  | 'add_faq'
  | 'update_faq'
  | 'remove_faq'
  | 'update_knowledge_base'

  // General
  | 'show_config'
  | 'explain_setting'
  | 'rollback'
  | 'unknown';

/** Structured parameters extracted from owner's message */
export interface OwnerIntentParams {
  // Service params
  service_name?: string;
  service_id?: string;
  price?: number;
  duration_minutes?: number;
  description?: string;
  active?: boolean;

  // Availability params
  day_of_week?: number; // 0-6
  start_time?: string; // "09:00"
  end_time?: string; // "17:00"
  staff_id?: string;
  staff_name?: string;
  date?: string; // "2025-01-15"
  break_start?: string;
  break_end?: string;

  // Channel params
  channel_type?: 'widget' | 'whatsapp' | 'phone' | 'email';
  channel_config?: Record<string, unknown>;

  // Staff params
  staff_email?: string;
  staff_phone?: string;
  staff_role?: 'provider' | 'admin' | 'support';

  // Policy params
  cancellation_hours?: number;
  same_day_booking?: boolean;
  walk_ins?: boolean;
  deposit_percent?: number;
  deposit_required?: boolean;
  refund_policy?: string;
  late_fee?: number;

  // Money Mode params
  money_mode_enabled?: boolean;
  money_mode_threshold?: number; // 1-10

  // Growth module params
  module_key?: string;
  module_tier?: 1 | 2 | 3;
  module_config?: Record<string, unknown>;

  // Knowledge params
  question?: string;
  answer?: string;
  category?: string;

  // Rollback params
  version_number?: number;
  change_id?: string;

  // Generic
  target?: string; // generic target for "set X to Y"
  value?: string | number | boolean;
}

/** Parsed owner intent with confidence */
export interface ParsedOwnerIntent {
  intent: OwnerIntent;
  confidence: number;
  params: OwnerIntentParams;
  raw_message: string;
  clarification_needed?: string[];
}

/** Config diff for display to owner */
export interface ConfigDiff {
  path: string; // e.g., "services[2].price"
  field: string; // human-readable: "Teeth Whitening price"
  old_value: unknown;
  new_value: unknown;
  change_type: 'added' | 'removed' | 'modified';
  description: string; // plain language: "Changed Teeth Whitening price from $199 to $299"
}

/** Owner-facing change proposal */
export interface OwnerChangeProposal {
  id: string;
  summary: string; // "Update Teeth Whitening: price $199→$299, duration 45→60min"
  diffs: ConfigDiff[];
  reasoning: string; // from Configurator's reasoning_notes
  warnings: string[]; // any conflicts or uncertainties
  estimated_impact?: string; // "May increase booking value by ~15%"
  requires_approval: boolean;
  created_at: string;
}

/** Clarification question with UI-friendly options */
export interface ClarificationQuestion {
  id: string;
  key: string; // parameter key being clarified
  label: string; // human-readable question
  type: 'select' | 'multiselect' | 'input' | 'number' | 'price' | 'duration' | 'datetime' | 'boolean' | 'staff_picker' | 'service_picker' | 'date_range';
  required: boolean;
  options?: ClarificationOption[]; // for select/multiselect
  placeholder?: string; // for input types
  default_value?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  depends_on?: string; // show only if another question has specific value
}

/** Option for select/multiselect questions */
export interface ClarificationOption {
  value: string | number | boolean;
  label: string;
  description?: string;
  icon?: string; // emoji or icon name
  disabled?: boolean;
}

/** Structured clarification response from owner */
export interface ClarificationResponse {
  question_id: string;
  key: string;
  value: unknown;
  answered_at: string;
}

/** Owner chat message */
export interface OwnerChatMessage {
  id: string;
  role: 'owner' | 'agent' | 'system';
  content: string;
  message_type: 'text' | 'proposal' | 'diff' | 'confirmation' | 'insight' | 'voice' | 'clarification';
  proposal?: OwnerChangeProposal;
  diffs?: ConfigDiff[];
  clarifications?: ClarificationQuestion[];
  clarification_responses?: ClarificationResponse[];
  metadata?: Record<string, unknown>;
  created_at: string;
}

/** Owner chat session */
export interface OwnerChatSession {
  session_id: string;
  receptionist_id: string;
  messages: OwnerChatMessage[];
  pending_proposal?: OwnerChangeProposal;
  context: {
    current_page?: string; // which dashboard page owner is viewing
    selected_entity?: { type: string; id: string }; // e.g., { type: 'service', id: 'svc_123' }
  };
  created_at: string;
  updated_at: string;
}

/** Explanation levels for progressive disclosure */
export type ExplanationLevel = 'executive' | 'understanding' | 'technical' | 'audit';

/** Explanation content at each level */
export interface ExplanationContent {
  executive: string; // "Weekend deposit cut no-shows from 14 to 3"
  understanding: string; // "You said weekends high risk Mar 12. 14 no-shows since → deposit cut to 3."
  technical: string; // "Cohort analysis: 147 convos, 43% web, 31% WhatsApp. p<0.01."
  audit: {
    methodology: string;
    data_sources: string[];
    assumptions: string[];
    limitations: string[];
    sql_query?: string;
    model_version?: string;
  };
}

/** Proactive insight card for owner */
export interface InsightCard {
  id: string;
  type: 'revenue_leak' | 'capacity_waste' | 'channel_decay' | 'growth_pattern' | 'risk' | 'opportunity';
  title: string;
  description: string;
  metric_value: string; // "3 ghosted this week (was 0)"
  metric_trend: 'up' | 'down' | 'stable';
  confidence: number; // 0-1
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggested_action: string; // "Add follow-up nudge after quote"
  action_type: 'autonomous' | 'suggest' | 'alert';
  reasoning: ExplanationContent;
  related_entities?: { type: string; id: string; label: string }[];
  dismissible: boolean;
  created_at: string;
}

/** Autonomous rule set by owner */
export interface AutonomousRule {
  id: string;
  domain: 'reminders' | 'waitlist' | 'reviews' | 'inventory' | 'staffing' | 'custom';
  name: string;
  description: string;
  condition: string; // human-readable: "When booking cancelled and waitlist not empty"
  action: string; // human-readable: "Auto-fill from waitlist, notify customer, confirm in 15min"
  rule_json: Record<string, unknown>; // structured for execution
  enabled: boolean;
  created_by: 'owner' | 'ai_suggested';
  last_executed?: string;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

export interface OwnerAgentContext {
  receptionist_id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  capabilities: Record<string, unknown>;
  current_config: Record<string, unknown>;
  config_version: number;
  active_insights: InsightCard[];
  autonomous_rules: AutonomousRule[];
  recent_changes: OwnerChangeProposal[];
}