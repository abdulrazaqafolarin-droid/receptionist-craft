// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════
// 
// SINGLE state manager. Updates state based on intent and entities.
// Computes task step and tracks collected/missing fields.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EngineState,
  TaskStep,
  IntentResult,
  ExtractedEntities,
  RequirementCheck,
  createEmptyState,
} from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// STATE UPDATE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function updateState(
  current: EngineState,
  intent: IntentResult,
  entities: ExtractedEntities,
  timezone?: string
): EngineState {
  // Deep clone to avoid mutations
  const next: EngineState = JSON.parse(JSON.stringify(current));
  next.last_intent = intent.intent;
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLE CANCEL
  // ─────────────────────────────────────────────────────────────────────────
  if (intent.should_cancel_task) {
    next.task_type = null;
    next.task_step = null;
    next.task_started_at = null;
    next.entities = {
      service: { id: null, name: null, duration_minutes: null, price: null },
      products: [],
      appointment: { date: null, time: null, timezone: null },
      customer: { name: null, phone: null, email: null },
      delivery_address: null,
    };
    next.locked = false;
    next.topic_lock = null;
    next.summary = 'User cancelled. Ready for new task.';
    return next;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLE NEW TASK START
  // ─────────────────────────────────────────────────────────────────────────
  if (intent.should_start_task && intent.target_task) {
    next.task_type = intent.target_task;
    next.task_started_at = new Date().toISOString();
    next.task_step = intent.target_task === 'booking' ? 'select_service' : 'select_product';
    next.entities.appointment.timezone = timezone || null;
    next.topic_lock = intent.target_task;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE ENTITIES
  // ─────────────────────────────────────────────────────────────────────────
  
  // Service
  if (entities.service_id) {
    next.entities.service.id = entities.service_id;
    next.entities.service.name = entities.service_name || null;
  }
  
  // Appointment
  if (entities.date) next.entities.appointment.date = entities.date;
  if (entities.time) next.entities.appointment.time = entities.time;
  
  // Products (cart logic)
  if (entities.product_id && entities.product_name) {
    const existingIdx = next.entities.products.findIndex(p => p.id === entities.product_id);
    if (existingIdx >= 0) {
      next.entities.products[existingIdx].quantity = entities.quantity || 1;
    } else {
      next.entities.products.push({
        id: entities.product_id,
        name: entities.product_name,
        quantity: entities.quantity || 1,
        price: null,
      });
    }
  }
  
  // Customer
  if (entities.customer_name) next.entities.customer.name = entities.customer_name;
  if (entities.customer_phone) next.entities.customer.phone = entities.customer_phone;
  if (entities.customer_email) next.entities.customer.email = entities.customer_email;
  if (entities.delivery_address) next.entities.delivery_address = entities.delivery_address;
  
  // ─────────────────────────────────────────────────────────────────────────
  // RECALCULATE STEP
  // ─────────────────────────────────────────────────────────────────────────
  if (next.task_type) {
    next.task_step = computeStep(next);
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // HANDLE CONFIRMATION
  // ─────────────────────────────────────────────────────────────────────────
  if (intent.intent === 'confirm' && next.task_step === 'confirm') {
    next.rules.confirmation_sent = true;
    next.task_step = 'complete';
    next.locked = true; // LOCK after confirmation - no more changes
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE RULES
  // ─────────────────────────────────────────────────────────────────────────
  if (intent.intent === 'greeting') {
    next.rules.greeted = true;
  }
  if (intent.intent === 'farewell') {
    next.rules.closing_offered = true;
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  next.summary = buildSummary(next);
  
  return next;
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function computeStep(state: EngineState): TaskStep {
  if (state.task_type === 'booking') {
    if (!state.entities.service.id) return 'select_service';
    if (!state.entities.appointment.date) return 'select_date';
    if (!state.entities.appointment.time) return 'select_time';
    if (!state.entities.customer.name) return 'collect_name';
    if (!state.entities.customer.phone && !state.entities.customer.email) return 'collect_contact';
    if (!state.rules.confirmation_sent) return 'confirm';
    return 'complete';
  }
  
  if (state.task_type === 'ordering') {
    if (state.entities.products.length === 0) return 'select_product';
    const needsQuantity = state.entities.products.some(p => !p.quantity || p.quantity < 1);
    if (needsQuantity) return 'select_quantity';
    if (!state.entities.customer.name) return 'collect_name';
    if (!state.entities.customer.phone && !state.entities.customer.email) return 'collect_contact';
    if (!state.rules.confirmation_sent) return 'confirm';
    return 'complete';
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// REQUIREMENT CHECKER
// ═══════════════════════════════════════════════════════════════════════════

export function checkRequirements(state: EngineState): RequirementCheck {
  const result: RequirementCheck = {
    complete: false,
    missing: [],
    collected: [],
    next_required: null,
    validation_errors: [],
  };
  
  if (!state.task_type) return result;
  
  if (state.task_type === 'booking') {
    // Check each field
    if (state.entities.service.id) {
      result.collected.push('service');
    } else {
      result.missing.push('service');
    }
    
    if (state.entities.appointment.date) {
      result.collected.push('date');
    } else {
      result.missing.push('date');
    }
    
    if (state.entities.appointment.time) {
      result.collected.push('time');
    } else {
      result.missing.push('time');
    }
    
    if (state.entities.customer.name) {
      result.collected.push('name');
    } else {
      result.missing.push('name');
    }
    
    if (state.entities.customer.phone || state.entities.customer.email) {
      result.collected.push('contact');
    } else {
      result.missing.push('contact');
    }
  }
  
  if (state.task_type === 'ordering') {
    if (state.entities.products.length > 0) {
      result.collected.push('product');
      const hasValidQty = state.entities.products.every(p => p.quantity && p.quantity > 0);
      if (hasValidQty) {
        result.collected.push('quantity');
      } else {
        result.missing.push('quantity');
      }
    } else {
      result.missing.push('product');
    }
    
    if (state.entities.customer.name) {
      result.collected.push('name');
    } else {
      result.missing.push('name');
    }
    
    if (state.entities.customer.phone || state.entities.customer.email) {
      result.collected.push('contact');
    } else {
      result.missing.push('contact');
    }
  }
  
  // Validation
  if (state.entities.customer.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.entities.customer.email)) {
      result.validation_errors.push('Invalid email format');
    }
  }
  
  if (state.entities.customer.phone) {
    const digits = state.entities.customer.phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      result.validation_errors.push('Invalid phone format');
    }
  }
  
  result.complete = result.missing.length === 0 && result.validation_errors.length === 0;
  result.next_required = result.missing[0] || null;
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildSummary(state: EngineState): string {
  const parts: string[] = [];
  
  if (!state.task_type) {
    return 'No active task. Ready to help.';
  }
  
  parts.push(`Task: ${state.task_type}`);
  parts.push(`Step: ${state.task_step || 'not started'}`);
  
  if (state.task_type === 'booking' && state.entities.service.name) {
    parts.push(`Service: ${state.entities.service.name}`);
  }
  
  if (state.entities.appointment.date) {
    parts.push(`Date: ${state.entities.appointment.date}`);
  }
  
  if (state.entities.appointment.time) {
    parts.push(`Time: ${state.entities.appointment.time}`);
  }
  
  if (state.task_type === 'ordering' && state.entities.products.length > 0) {
    const items = state.entities.products.map(p => `${p.name} x${p.quantity}`).join(', ');
    parts.push(`Products: ${items}`);
  }
  
  if (state.entities.customer.name) {
    parts.push(`Customer: ${state.entities.customer.name}`);
  }
  
  const reqs = checkRequirements(state);
  if (reqs.missing.length > 0) {
    parts.push(`Missing: ${reqs.missing.join(', ')}`);
  }
  
  return parts.join(' | ');
}
