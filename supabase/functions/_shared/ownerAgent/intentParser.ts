// ═══════════════════════════════════════════════════════════════════════════
// OWNER AGENT — INTENT PARSER
// ═══════════════════════════════════════════════════════════════════════════
// Parses owner's natural language into structured intent + parameters.
// Uses pattern matching + LLM fallback for complex requests.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  OwnerIntent,
  OwnerIntentParams,
  ParsedOwnerIntent,
  ClarificationQuestion,
  ClarificationOption,
} from "./types.ts";

/** Pattern definitions for intent classification */
const INTENT_PATTERNS: Record<OwnerIntent, RegExp[]> = {
  // Service management
  add_service: [
    /\b(add|create|new)\s+(a\s+)?(service|treatment|appointment type)\b/i,
    /\b(i\s+want\s+to\s+)?(offer|add)\b.*\b(service|treatment)\b/i,
  ],
  update_service: [
    /\b(update|change|modify|edit)\s+(service|treatment)\b/i,
    /\b(set|change)\b.*\b(price|duration|description)\b.*\b(for|of)\b.*\b(service|treatment)\b/i,
  ],
  remove_service: [
    /\b(remove|delete|drop|stop\s+offering)\s+(service|treatment)\b/i,
  ],
  list_services: [
    /\b(list|show|what)\s+(services|treatments|offerings)\b/i,
    /\bwhat\s+(do\s+you|services)\s+(offer|have|provide)\b/i,
  ],
  set_service_price: [
    /\b(set|change|update)\b.*\bprice\b.*\b(to|for)\b.*\b(\$?\d+)\b.*\b(for|on)\b/i,
    /\bmake\b.*\b(service|treatment)\b.*\b(\$?\d+)\b/i,
  ],
  set_service_duration: [
    /\b(set|change|update)\b.*\b(duration|length|time)\b.*\b(to|for)\b.*\b(\d+\s*(min|mins|minutes|hr|hrs|hours)?)\b/i,
    /\bmake\b.*\b(service|treatment)\b.*\b(\d+\s*(min|mins|minutes|hr|hrs|hours)?)\b/i,
  ],
  toggle_service_active: [
    /\b(enable|disable|activate|deactivate|turn\s+(on|off))\b.*\b(service|treatment)\b/i,
  ],

  // Availability management
  set_hours: [
    /\b(set|change|update)\b.*\b(hours|schedule|availability)\b/i,
    /\b(open|close)\b.*\b(at|from|until)\b/i,
    /\b(hours|schedule)\b.*\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend)\b/i,
  ],
  block_time: [
    /\b(block|unavailable|closed)\b.*\b(date|day|time)\b/i,
    /\bdon'?t\s+(book|schedule)\b.*\b(date|day|time)\b/i,
  ],
  unblock_time: [
    /\b(unblock|available|open)\b.*\b(date|day|time)\b/i,
  ],
  set_staff_availability: [
    /\b(staff|doctor|provider|therapist)\b.*\b(availability|schedule|hours)\b/i,
    /\b(assign|set)\b.*\b(staff|doctor|provider)\b.*\b(availability|schedule)\b/i,
  ],
  block_staff: [
    /\b(block|unavailable|off)\b.*\b(staff|doctor|provider|therapist)\b/i,
    /\b(staff|doctor|provider)\b.*\b(vacation|off|away|unavailable)\b/i,
  ],
  unblock_staff: [
    /\b(unblock|available|back)\b.*\b(staff|doctor|provider|therapist)\b/i,
  ],
  set_break: [
    /\b(break|lunch|closed)\b.*\b(from|between|at)\b/i,
  ],

  // Channel management
  connect_channel: [
    /\b(connect|add|enable|setup)\b.*\b(whatsapp|widget|phone|email|sms)\b/i,
    /\b(whatsapp|widget|phone)\b.*\b(connect|enable|setup)\b/i,
  ],
  disconnect_channel: [
    /\b(disconnect|remove|disable|turn\s+off)\b.*\b(whatsapp|widget|phone|email|sms)\b/i,
  ],
  configure_channel: [
    /\b(configure|setup|settings)\b.*\b(whatsapp|widget|phone|email|sms)\b/i,
  ],

  // Staff management
  add_staff: [
    /\b(add|hire|new)\s+(staff|doctor|provider|therapist|employee|team\s+member)\b/i,
  ],
  update_staff: [
    /\b(update|change|edit)\b.*\b(staff|doctor|provider|therapist)\b/i,
  ],
  remove_staff: [
    /\b(remove|fire|delete)\b.*\b(staff|doctor|provider|therapist)\b/i,
  ],
  assign_staff_to_service: [
    /\b(assign|link)\b.*\b(staff|doctor|provider)\b.*\b(to|for)\b.*\b(service|treatment)\b/i,
  ],

  // Policy management
  set_cancellation_policy: [
    /\b(cancellation|cancel)\s+policy\b/i,
    /\b(change|set|update)\b.*\b(cancellation|cancel)\b.*\b(policy|notice|hours)\b/i,
  ],
  set_deposit_policy: [
    /\b(deposit)\s+(policy|required|percent|percentage)\b/i,
    /\b(change|set|update)\b.*\bdeposit\b/i,
  ],
  set_refund_policy: [
    /\b(refund)\s+policy\b/i,
    /\b(change|set|update)\b.*\brefund\b/i,
  ],
  set_late_policy: [
    /\b(late|no.?show)\s+(policy|fee)\b/i,
    /\b(change|set|update)\b.*\b(late|no.?show)\b/i,
  ],

  // Money Mode / Growth
  toggle_money_mode: [
    /\b(money\s+mode|sales\s+mode)\b.*\b(on|off|enable|disable|turn)\b/i,
    /\b(enable|disable|turn\s+(on|off))\b.*\b(money\s+mode|sales\s+mode)\b/i,
  ],
  set_money_mode_threshold: [
    /\b(money\s+mode|sales\s+mode)\b.*\b(threshold|sensitivity|level)\b/i,
    /\b(set|change)\b.*\b(threshold|sensitivity)\b.*\b(money\s+mode|sales\s+mode)\b/i,
  ],
  configure_growth_module: [
    /\b(enable|disable|configure|setup)\b.*\b(email|sms|social|review|referral|ad|campaign|invoice|feedback|calendar|recruitment)\b/i,
    /\b(growth\s+module|module)\b.*\b(enable|disable|configure)\b/i,
  ],

  // Knowledge / FAQ
  add_faq: [
    /\b(add|create)\s+(faq|question|faq\s+entry)\b/i,
  ],
  update_faq: [
    /\b(update|change|edit)\b.*\b(faq|question)\b/i,
  ],
  remove_faq: [
    /\b(remove|delete)\b.*\b(faq|question)\b/i,
  ],
  update_knowledge_base: [
    /\b(update|add|change)\b.*\b(knowledge|info|information)\b/i,
    /\b(knowledge\s+base|knowledge)\b.*\b(update|add|change)\b/i,
  ],

  // General
  show_config: [
    /\b(show|display|view)\b.*\b(config|configuration|settings|setup)\b/i,
    /\bwhat'?s\s+(my|the)\s+(config|setup|configuration)\b/i,
  ],
  explain_setting: [
    /\b(why|explain|reason)\b/i,
    /\bwhy\s+(is|did|do)\b/i,
  ],
  rollback: [
    /\b(rollback|revert|undo|go\s+back)\b/i,
    /\bundo\s+(the\s+)?(last|recent)\s+(change|change)\b/i,
  ],
  unknown: [],
};

/** Entity extraction patterns */
const ENTITY_PATTERNS = {
  // Money amounts: $299, 299, $2,400, etc.
  price: /\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\b/,
  // Duration: 30min, 45 mins, 1hr, 1.5 hours, 90m
  duration: /(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|hr|hrs|hour|hours|m|h)\b/i,
  // Time: 9:00, 9:00 AM, 09:00, 14:30
  time: /\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\b/i,
  // Date: tomorrow, Monday, Jan 15, 2025-01-15, next Tuesday
  date: /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})\b/i,
  // Day of week
  day_of_week: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekday|weekend)\b/i,
  // Percentage: 50%, 50 percent
  percentage: /(\d{1,3})\s*%|\b(\d{1,3})\s*percent\b/i,
  // Number (generic)
  number: /\b(\d+)\b/,
  // Staff name (capitalized words, possibly with title)
  staff_name: /\b(Dr\.|Dr|Doctor|Therapist)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/,
  // Service name (quoted or after "called"/"named")
  service_name: /["']([^"']+)["']|\b(?:called|named|titled)\s+([A-Z][a-z0-9\s]+)/i,
  // Channel types
  channel: /\b(whatsapp|widget|phone|email|sms|voice)\b/i,
  // Module keys
  module: /\b(email|sms|social|review|referral|ad|campaign|invoice|feedback|calendar|recruitment)\s*(responder|manager|posting|campaign)?\b/i,
};

/** Extract entities from message */
function extractEntities(message: string): OwnerIntentParams {
  const params: OwnerIntentParams = {};
  const lower = message.toLowerCase();

  // Price
  const priceMatch = message.match(ENTITY_PATTERNS.price);
  if (priceMatch) {
    params.price = parseFloat(priceMatch[1].replace(/,/g, ''));
  }

  // Duration
  const durationMatch = message.match(ENTITY_PATTERNS.duration);
  if (durationMatch) {
    const value = parseFloat(durationMatch[1]);
    const unit = durationMatch[2].toLowerCase();
    if (unit.startsWith('hr') || unit === 'h') {
      params.duration_minutes = Math.round(value * 60);
    } else {
      params.duration_minutes = Math.round(value);
    }
  }

  // Time
  const timeMatch = message.match(ENTITY_PATTERNS.time);
  if (timeMatch) {
    params.start_time = timeMatch[1].toUpperCase();
  }

  // Date
  const dateMatch = message.match(ENTITY_PATTERNS.date);
  if (dateMatch) {
    params.date = dateMatch[1];
  }

  // Day of week
  const dayMatch = lower.match(ENTITY_PATTERNS.day_of_week);
  if (dayMatch) {
    const dayMap: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
      weekday: -1, weekend: -2,
    };
    params.day_of_week = dayMap[dayMatch[1].toLowerCase()];
  }

  // Percentage
  const pctMatch = message.match(ENTITY_PATTERNS.percentage);
  if (pctMatch) {
    params.deposit_percent = parseInt(pctMatch[1] || pctMatch[2], 10);
  }

  // Service name (quoted or after called/named)
  const svcMatch = message.match(ENTITY_PATTERNS.service_name);
  if (svcMatch) {
    params.service_name = svcMatch[1] || svcMatch[2];
  }

  // Channel
  const chMatch = lower.match(ENTITY_PATTERNS.channel);
  if (chMatch) {
    params.channel_type = chMatch[1] as OwnerIntentParams['channel_type'];
  }

  // Module
  const modMatch = lower.match(ENTITY_PATTERNS.module);
  if (modMatch) {
    params.module_key = modMatch[1];
  }

  // Generic target/value for "set X to Y"
  const setMatch = message.match(/\b(set|change|update|make)\s+([a-z\s]+)\s+(to|at)\s+([^.,]+)/i);
  if (setMatch) {
    params.target = setMatch[2].trim();
    const val = setMatch[4].trim();
    params.value = isNaN(Number(val)) ? val : Number(val);
  }

  return params;
}

/** Classify intent using pattern matching */
function classifyIntent(message: string): { intent: OwnerIntent; confidence: number } {
  const lower = message.toLowerCase().trim();
  
  // Check each intent's patterns
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'unknown') continue;
    for (const pattern of patterns) {
      if (pattern.test(lower)) {
        // Higher confidence for more specific patterns
        const confidence = pattern.source.length > 50 ? 0.9 : 0.8;
        return { intent: intent as OwnerIntent, confidence };
      }
    }
  }

  // Fallback: keyword-based scoring
  const scores: Record<OwnerIntent, number> = {
    add_service: 0, update_service: 0, remove_service: 0, list_services: 0,
    set_service_price: 0, set_service_duration: 0, toggle_service_active: 0,
    set_hours: 0, block_time: 0, unblock_time: 0, set_staff_availability: 0,
    block_staff: 0, unblock_staff: 0, set_break: 0,
    connect_channel: 0, disconnect_channel: 0, configure_channel: 0,
    add_staff: 0, update_staff: 0, remove_staff: 0, assign_staff_to_service: 0,
    set_cancellation_policy: 0, set_deposit_policy: 0, set_refund_policy: 0,
    set_late_policy: 0,
    toggle_money_mode: 0, set_money_mode_threshold: 0, configure_growth_module: 0,
    add_faq: 0, update_faq: 0, remove_faq: 0, update_knowledge_base: 0,
    show_config: 0, explain_setting: 0, rollback: 0, unknown: 0,
  };

  const keywords: Record<string, OwnerIntent[]> = {
    service: ['add_service', 'update_service', 'remove_service', 'list_services'],
    treatment: ['add_service', 'update_service', 'remove_service'],
    price: ['set_service_price'],
    cost: ['set_service_price'],
    duration: ['set_service_duration'],
    length: ['set_service_duration'],
    hours: ['set_hours'],
    schedule: ['set_hours', 'set_staff_availability'],
    availability: ['set_hours', 'set_staff_availability', 'block_time', 'unblock_time'],
    whatsapp: ['connect_channel', 'configure_channel'],
    widget: ['connect_channel', 'configure_channel'],
    phone: ['connect_channel', 'configure_channel'],
    staff: ['add_staff', 'update_staff', 'remove_staff', 'block_staff', 'unblock_staff', 'set_staff_availability'],
    doctor: ['add_staff', 'update_staff', 'remove_staff', 'block_staff', 'unblock_staff', 'set_staff_availability'],
    provider: ['add_staff', 'update_staff', 'remove_staff', 'block_staff', 'unblock_staff', 'set_staff_availability'],
    cancellation: ['set_cancellation_policy'],
    deposit: ['set_deposit_policy'],
    refund: ['set_refund_policy'],
    late: ['set_late_policy'],
    'money mode': ['toggle_money_mode'],
    'sales mode': ['toggle_money_mode'],
    threshold: ['set_money_mode_threshold'],
    rollback: ['rollback'],
    revert: ['rollback'],
    undo: ['rollback'],
    why: ['explain_setting'],
    explain: ['explain_setting'],
    config: ['show_config'],
    settings: ['show_config'],
  };

  for (const [keyword, intents] of Object.entries(keywords)) {
    if (lower.includes(keyword)) {
      for (const intent of intents) {
        scores[intent] += 0.1;
      }
    }
  }

  const topIntent = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (topIntent[1] > 0.2) {
    return { intent: topIntent[0] as OwnerIntent, confidence: Math.min(0.7, topIntent[1]) };
  }

  return { intent: 'unknown', confidence: 0.3 };
}

/** Generate structured clarification questions with UI options */
function generateClarifications(intent: OwnerIntent, params: OwnerIntentParams, context?: { services?: Array<{id: string; name: string}>; staff?: Array<{id: string; name: string}> }): ClarificationQuestion[] {
  const clarifications: ClarificationQuestion[] = [];
  let questionIndex = 0;

  const addQuestion = (q: Omit<ClarificationQuestion, 'id'>) => {
    clarifications.push({ ...q, id: `clarify_${intent}_${questionIndex++}` });
  };

  const serviceOptions: ClarificationOption[] = context?.services?.map(s => ({
    value: s.id,
    label: s.name,
    description: `Service ID: ${s.id}`,
  })) || [];

  const staffOptions: ClarificationOption[] = context?.staff?.map(s => ({
    value: s.id,
    label: s.name,
    description: `Staff ID: ${s.id}`,
  })) || [];

  const channelOptions: ClarificationOption[] = [
    { value: 'whatsapp', label: 'WhatsApp', icon: '💬', description: 'Business WhatsApp integration' },
    { value: 'widget', label: 'Web Widget', icon: '🌐', description: 'Embeddable website chat widget' },
    { value: 'phone', label: 'Phone/Voice', icon: '📞', description: 'Phone call handling via gateway' },
    { value: 'email', label: 'Email', icon: '📧', description: 'Email responder module' },
    { value: 'sms', label: 'SMS', icon: '💬', description: 'SMS campaign & responder' },
  ];

  const moduleOptions: ClarificationOption[] = [
    { value: 'emailResponder', label: 'Email Responder', icon: '📧', description: 'Auto-reply to inbound emails' },
    { value: 'emailSender', label: 'Email Campaigns', icon: '📧', description: 'Outbound email marketing' },
    { value: 'smsCampaign', label: 'SMS Campaigns', icon: '💬', description: 'Bulk SMS marketing' },
    { value: 'reviewManagement', label: 'Review Management', icon: '⭐', description: 'Monitor & reply to reviews' },
    { value: 'referralProgram', label: 'Referral Program', icon: '🎁', description: 'Customer referral tracking' },
    { value: 'invoiceFollowUp', label: 'Invoice Follow-up', icon: '💰', description: 'Automated payment reminders' },
    { value: 'customerFeedback', label: 'Customer Feedback', icon: '📝', description: 'Post-visit surveys' },
    { value: 'socialMediaPosting', label: 'Social Media Posting', icon: '📱', description: 'Auto-post to social channels' },
    { value: 'adCampaignManager', label: 'Ad Campaign Manager', icon: '📊', description: 'Manage ad campaigns' },
    { value: 'calendarSync', label: 'Calendar Sync', icon: '📅', description: 'Sync with Google/Outlook' },
    { value: 'recruitmentAssistant', label: 'Recruitment Assistant', icon: '👥', description: 'Job posting & screening' },
    { value: 'contentGeneration', label: 'Content Generation', icon: '✍️', description: 'AI content creation' },
    { value: 'analyticsDigest', label: 'Analytics Digest', icon: '📈', description: 'Automated reports' },
    { value: 'competitorMonitoring', label: 'Competitor Monitoring', icon: '🔍', description: 'Track competitor activity' },
  ];

  switch (intent) {
    case 'add_service': {
      if (!params.service_name) {
        addQuestion({
          key: 'service_name',
          label: 'What should I name the new service?',
          type: 'input',
          required: true,
          placeholder: 'e.g., Teeth Whitening, Dental Implant Consultation',
        });
      }
      if (!params.price) {
        addQuestion({
          key: 'price',
          label: 'What\'s the price?',
          type: 'price',
          required: true,
          placeholder: 'e.g., 299 or $299',
          validation: { min: 0, max: 100000 },
        });
      }
      if (!params.duration_minutes) {
        addQuestion({
          key: 'duration_minutes',
          label: 'How long does it take?',
          type: 'duration',
          required: true,
          placeholder: 'e.g., 60 min, 1.5 hr, 90m',
          validation: { min: 5, max: 480 },
        });
      }
      if (!params.description) {
        addQuestion({
          key: 'description',
          label: 'Brief description (optional)',
          type: 'input',
          required: false,
          placeholder: 'What does this service include?',
        });
      }
      break;
    }

    case 'update_service':
    case 'set_service_price':
    case 'set_service_duration':
    case 'toggle_service_active':
    case 'remove_service': {
      if (!params.service_id && !params.service_name) {
        addQuestion({
          key: 'service_id',
          label: 'Which service?',
          type: serviceOptions.length > 0 ? 'select' : 'input',
          required: true,
          options: serviceOptions,
          placeholder: serviceOptions.length === 0 ? 'Service name or ID' : undefined,
        });
      }
      if (intent === 'set_service_price' && !params.price) {
        addQuestion({
          key: 'price',
          label: 'What\'s the new price?',
          type: 'price',
          required: true,
          placeholder: 'e.g., 299 or $299',
        });
      }
      if (intent === 'set_service_duration' && !params.duration_minutes) {
        addQuestion({
          key: 'duration_minutes',
          label: 'How many minutes?',
          type: 'duration',
          required: true,
          placeholder: 'e.g., 60 min, 1.5 hr',
        });
      }
      if (intent === 'toggle_service_active' && params.active === undefined) {
        addQuestion({
          key: 'active',
          label: 'Enable or disable this service?',
          type: 'boolean',
          required: true,
          options: [
            { value: true, label: 'Enable ✅', description: 'Make available for booking' },
            { value: false, label: 'Disable ⏸️', description: 'Hide from customers' },
          ],
        });
      }
      break;
    }

    case 'set_hours': {
      if (!params.day_of_week) {
        addQuestion({
          key: 'day_of_week',
          label: 'Which days?',
          type: 'multiselect',
          required: true,
          options: [
            { value: 1, label: 'Monday' },
            { value: 2, label: 'Tuesday' },
            { value: 3, label: 'Wednesday' },
            { value: 4, label: 'Thursday' },
            { value: 5, label: 'Friday' },
            { value: 6, label: 'Saturday' },
            { value: 0, label: 'Sunday' },
          ],
          default_value: [1, 2, 3, 4, 5], // Mon-Fri default
        });
      }
      if (!params.start_time) {
        addQuestion({
          key: 'start_time',
          label: 'What time do you open?',
          type: 'input',
          required: true,
          placeholder: 'e.g., 09:00 or 9:00 AM',
          validation: { pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9](\\s?(AM|PM))?$' },
        });
      }
      if (!params.end_time) {
        addQuestion({
          key: 'end_time',
          label: 'What time do you close?',
          type: 'input',
          required: true,
          placeholder: 'e.g., 17:00 or 5:00 PM',
          validation: { pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9](\\s?(AM|PM))?$' },
        });
      }
      // Break time
      addQuestion({
        key: 'break_start',
        label: 'Break time? (optional)',
        type: 'input',
        required: false,
        placeholder: 'e.g., 13:00 - 14:00',
        depends_on: 'break_end',
      });
      addQuestion({
        key: 'break_end',
        label: 'Break end? (optional)',
        type: 'input',
        required: false,
        placeholder: 'e.g., 14:00',
        validation: { pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9](\\s?(AM|PM))?$' },
      });
      break;
    }

    case 'block_time':
    case 'unblock_time': {
      if (!params.date) {
        addQuestion({
          key: 'date',
          label: 'Which date(s)?',
          type: 'date_range',
          required: true,
          placeholder: 'e.g., 2025-01-15 or 2025-01-15 to 2025-01-20',
        });
      }
      if (!params.start_time && intent === 'block_time') {
        addQuestion({
          key: 'start_time',
          label: 'Start time? (optional - all day if empty)',
          type: 'input',
          required: false,
          placeholder: 'e.g., 14:00',
        });
      }
      if (!params.end_time && intent === 'block_time') {
        addQuestion({
          key: 'end_time',
          label: 'End time? (optional)',
          type: 'input',
          required: false,
          placeholder: 'e.g., 16:00',
        });
      }
      break;
    }

    case 'block_staff':
    case 'unblock_staff': {
      if (!params.staff_id && !params.staff_name) {
        addQuestion({
          key: 'staff_id',
          label: 'Which staff member?',
          type: staffOptions.length > 0 ? 'staff_picker' : 'input',
          required: true,
          options: staffOptions,
          placeholder: staffOptions.length === 0 ? 'Staff name or ID' : undefined,
        });
      }
      if (!params.date) {
        addQuestion({
          key: 'date',
          label: 'Which date(s)?',
          type: 'date_range',
          required: true,
          placeholder: 'e.g., 2025-07-15 to 2025-07-22',
        });
      }
      break;
    }

    case 'connect_channel': {
      if (!params.channel_type) {
        addQuestion({
          key: 'channel_type',
          label: 'Which channel do you want to connect?',
          type: 'select',
          required: true,
          options: channelOptions,
        });
      }
      // Channel-specific follow-ups
      if (params.channel_type === 'whatsapp') {
        addQuestion({
          key: 'channel_config.phone_number',
          label: 'WhatsApp Business phone number?',
          type: 'input',
          required: true,
          placeholder: '+1 555 123 4567',
          depends_on: 'channel_type',
        });
      }
      break;
    }

    case 'configure_growth_module': {
      if (!params.module_key) {
        addQuestion({
          key: 'module_key',
          label: 'Which growth module?',
          type: 'select',
          required: true,
          options: moduleOptions,
        });
      }
      if (!params.module_tier && params.module_key) {
        addQuestion({
          key: 'module_tier',
          label: 'What tier?',
          type: 'select',
          required: true,
          options: [
            { value: 1, label: 'Tier 1 — Fully Autonomous', description: 'Runs automatically, no approval needed' },
            { value: 2, label: 'Tier 2 — Draft & Approve', description: 'AI drafts, you review & send' },
            { value: 3, label: 'Tier 3 — Connector Only', description: 'Just connects external tools' },
          ],
        });
      }
      break;
    }

    case 'set_cancellation_policy': {
      if (!params.cancellation_hours) {
        addQuestion({
          key: 'cancellation_hours',
          label: 'How many hours notice required for cancellation?',
          type: 'number',
          required: true,
          placeholder: 'e.g., 24',
          validation: { min: 0, max: 168 },
          default_value: 24,
        });
      }
      if (params.same_day_booking === undefined) {
        addQuestion({
          key: 'same_day_booking',
          label: 'Allow same-day booking?',
          type: 'boolean',
          required: false,
          options: [
            { value: true, label: 'Yes, allow same-day' },
            { value: false, label: 'No, require advance booking' },
          ],
        });
      }
      if (params.walk_ins === undefined) {
        addQuestion({
          key: 'walk_ins',
          label: 'Accept walk-ins?',
          type: 'boolean',
          required: false,
          options: [
            { value: true, label: 'Yes, walk-ins welcome' },
            { value: false, label: 'No, appointments only' },
          ],
        });
      }
      break;
    }

    case 'set_deposit_policy': {
      if (!params.deposit_percent) {
        addQuestion({
          key: 'deposit_percent',
          label: 'What percentage deposit?',
          type: 'number',
          required: true,
          placeholder: 'e.g., 50',
          validation: { min: 0, max: 100 },
          default_value: 50,
        });
      }
      if (params.deposit_required === undefined) {
        addQuestion({
          key: 'deposit_required',
          label: 'Require deposit for all bookings?',
          type: 'boolean',
          required: false,
          options: [
            { value: true, label: 'Yes, always require deposit' },
            { value: false, label: 'Only for specific services' },
          ],
        });
      }
      break;
    }

    case 'set_refund_policy': {
      if (!params.refund_policy) {
        addQuestion({
          key: 'refund_policy',
          label: 'What\'s your refund policy?',
          type: 'select',
          required: true,
          options: [
            { value: 'full', label: 'Full refund if cancelled within notice period' },
            { value: 'partial', label: 'Partial refund (e.g., 50%)' },
            { value: 'credit', label: 'Store credit only' },
            { value: 'none', label: 'No refunds' },
            { value: 'custom', label: 'Custom policy (I\'ll describe)' },
          ],
        });
      }
      break;
    }

    case 'set_late_policy': {
      if (!params.late_fee) {
        addQuestion({
          key: 'late_fee',
          label: 'Late fee amount?',
          type: 'price',
          required: false,
          placeholder: 'e.g., 25 or $25',
        });
      }
      break;
    }

    case 'toggle_money_mode': {
      if (params.money_mode_enabled === undefined) {
        addQuestion({
          key: 'money_mode_enabled',
          label: 'Turn Money Mode on or off?',
          type: 'boolean',
          required: true,
          options: [
            { value: true, label: 'ON 🎯 — Proactive selling, urgency, conversion-focused' },
            { value: false, label: 'OFF 💬 — Standard helpful receptionist mode' },
          ],
        });
      }
      break;
    }

    case 'set_money_mode_threshold': {
      if (!params.money_mode_threshold) {
        addQuestion({
          key: 'money_mode_threshold',
          label: 'Intent threshold (1-10)?',
          type: 'number',
          required: true,
          placeholder: 'e.g., 7',
          validation: { min: 1, max: 10 },
          default_value: 7,
        });
      }
      break;
    }

    case 'add_faq': {
      if (!params.question) {
        addQuestion({
          key: 'question',
          label: 'What\'s the question?',
          type: 'input',
          required: true,
          placeholder: 'e.g., "Do you accept insurance?"',
        });
      }
      if (!params.answer) {
        addQuestion({
          key: 'answer',
          label: 'What\'s the answer?',
          type: 'input',
          required: true,
          placeholder: 'e.g., "Yes, we accept most major dental insurance plans."',
        });
      }
      if (!params.category) {
        addQuestion({
          key: 'category',
          label: 'Category?',
          type: 'select',
          required: false,
          options: [
            { value: 'general', label: 'General' },
            { value: 'booking', label: 'Booking & Appointments' },
            { value: 'pricing', label: 'Pricing & Payments' },
            { value: 'insurance', label: 'Insurance' },
            { value: 'hours', label: 'Hours & Location' },
            { value: 'services', label: 'Services & Treatments' },
          ],
        });
      }
      break;
    }

    case 'rollback': {
      addQuestion({
        key: 'version_number',
        label: 'Rollback to which version?',
        type: 'select',
        required: true,
        placeholder: 'Select a version',
        options: [
          { value: 'last', label: 'Last change (undo most recent)' },
          { value: 'previous', label: 'Previous version' },
          { value: 'specific', label: 'Specific version number...' },
        ],
      });
      break;
    }

    case 'configure_channel': {
      if (!params.channel_type) {
        addQuestion({
          key: 'channel_type',
          label: 'Which channel to configure?',
          type: 'select',
          required: true,
          options: channelOptions,
        });
      }
      break;
    }

    case 'add_staff': {
      if (!params.staff_name) {
        addQuestion({
          key: 'staff_name',
          label: 'Staff member\'s name?',
          type: 'input',
          required: true,
          placeholder: 'e.g., Dr. Sarah Chen',
        });
      }
      if (!params.staff_role) {
        addQuestion({
          key: 'staff_role',
          label: 'What\'s their role?',
          type: 'select',
          required: true,
          options: [
            { value: 'provider', label: 'Service Provider (doctor, therapist, stylist)' },
            { value: 'admin', label: 'Administrator (full access)' },
            { value: 'support', label: 'Support Staff (front desk, assistant)' },
          ],
        });
      }
      break;
    }

    case 'update_knowledge_base': {
      if (!params.question) {
        addQuestion({
          key: 'question',
          label: 'What information should I add/update?',
          type: 'input',
          required: true,
          placeholder: 'e.g., "We now offer Saturday appointments until 2pm"',
        });
      }
      break;
    }
  }

  return clarifications;
}

/** Main parser function */
export function parseOwnerMessage(message: string, context?: { services?: Array<{id: string; name: string}>; staff?: Array<{id: string; name: string}> }): ParsedOwnerIntent {
  const { intent, confidence } = classifyIntent(message);
  const params = extractEntities(message);
  const clarification_needed = confidence < 0.7 ? generateClarifications(intent, params, context) : [];

  return {
    intent,
    confidence,
    params,
    raw_message: message,
    clarification_needed: clarification_needed.length > 0 ? clarification_needed : undefined,
  };
}

/** Batch parse for conversation context (future: multi-turn) */
export function parseOwnerConversation(messages: { role: string; content: string }[]): ParsedOwnerIntent {
  // For now, just parse the latest owner message
  const lastOwnerMsg = messages
    .filter(m => m.role === 'owner' || m.role === 'user')
    .pop();
  return lastOwnerMsg ? parseOwnerMessage(lastOwnerMsg.content) : {
    intent: 'unknown',
    confidence: 0,
    params: {},
    raw_message: '',
  };
}