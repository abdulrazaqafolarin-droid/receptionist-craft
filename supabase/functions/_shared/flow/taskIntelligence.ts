// ═══════════════════════════════════════════════════════════════════════════
// TASK INTELLIGENCE MODULE
// Manages ACTIVE_TASK lifecycle, flow lock, and task-aware prompts
// ═══════════════════════════════════════════════════════════════════════════

import {
  ActiveTask,
  TaskType,
  TaskStep,
  createEmptyActiveTask,
  getTaskPendingInfo,
  getNextTaskStep,
  buildTaskSummary,
  isTaskComplete,
  EXPLICIT_RESET_CUES,
} from "./types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// TASK LIFECYCLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start a new task (booking or ordering)
 */
export function startTask(type: TaskType, timezone?: string): ActiveTask {
  const task = createEmptyActiveTask();
  task.type = type;
  task.started_at = new Date().toISOString();
  task.confidence = 0.9;
  
  if (type === 'booking') {
    task.step = 'selecting_service';
    task.entities.appointment.timezone = timezone || null;
  } else if (type === 'ordering') {
    task.step = 'selecting_product';
  }
  
  task.memory.pending_info = getTaskPendingInfo(task);
  task.memory.summary = buildTaskSummary(task);
  
  return task;
}

/**
 * Update task with new entity data
 */
export function updateTaskEntities(
  task: ActiveTask,
  updates: {
    serviceId?: string;
    serviceName?: string;
    serviceDuration?: number;
    servicePrice?: number;
    date?: string;
    time?: string;
    productId?: string;
    productName?: string;
    quantity?: number;
    productPrice?: number;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    deliveryAddress?: string;
  }
): ActiveTask {
  const updated = { ...task };
  
  // Update service
  if (updates.serviceId) {
    updated.entities.service.id = updates.serviceId;
    updated.entities.service.name = updates.serviceName || null;
    updated.entities.service.duration_minutes = updates.serviceDuration || null;
    updated.entities.service.price = updates.servicePrice || null;
  }
  
  // Update appointment
  if (updates.date) updated.entities.appointment.date = updates.date;
  if (updates.time) updated.entities.appointment.time = updates.time;
  
  // Update product cart
  if (updates.productId && updates.productName) {
    const existingIndex = updated.entities.product_cart.findIndex(
      p => p.id === updates.productId
    );
    if (existingIndex >= 0) {
      updated.entities.product_cart[existingIndex].quantity = updates.quantity || 1;
    } else {
      updated.entities.product_cart.push({
        id: updates.productId,
        name: updates.productName,
        quantity: updates.quantity || 1,
        price: updates.productPrice || null,
      });
    }
  }
  
  // Update customer
  if (updates.customerName) updated.entities.customer.name = updates.customerName;
  if (updates.customerPhone) updated.entities.customer.phone = updates.customerPhone;
  if (updates.customerEmail) updated.entities.customer.email = updates.customerEmail;
  if (updates.deliveryAddress) updated.entities.delivery_address = updates.deliveryAddress;
  
  // Recalculate step and pending info
  updated.step = getNextTaskStep(updated);
  updated.memory.pending_info = getTaskPendingInfo(updated);
  updated.memory.summary = buildTaskSummary(updated);
  
  return updated;
}

/**
 * Mark task as confirmed
 */
export function confirmTask(task: ActiveTask): ActiveTask {
  const updated = { ...task };
  updated.flow_flags.confirmation_shown = true;
  updated.step = 'completed';
  updated.memory.summary = buildTaskSummary(updated);
  return updated;
}

/**
 * Reset task (start fresh)
 */
export function resetTask(): ActiveTask | null {
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOW LOCK LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user wants to cancel/exit the current flow
 */
export function detectFlowExit(message: string): boolean {
  const lowerMsg = message.toLowerCase().trim();
  
  // Explicit cancellation
  if (/^(cancel|stop|never\s?mind|forget\s?it|start\s?over)$/i.test(lowerMsg)) {
    return true;
  }
  
  // Check reset cues
  for (const cue of EXPLICIT_RESET_CUES) {
    if (lowerMsg.includes(cue.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if message is task-relevant or off-topic
 */
export function isMessageOnTopic(message: string, task: ActiveTask): {
  onTopic: boolean;
  confidence: number;
  suggestedAction: 'continue' | 'redirect' | 'answer_briefly';
} {
  const lowerMsg = message.toLowerCase();
  
  // If no active task, everything is on-topic
  if (!task.type) {
    return { onTopic: true, confidence: 1, suggestedAction: 'continue' };
  }
  
  // Clearly on-topic patterns
  const bookingPatterns = /service|book|appointment|schedule|date|time|when|available/i;
  const orderingPatterns = /product|order|buy|purchase|quantity|how many|cart|add/i;
  const contactPatterns = /name|phone|email|contact|call me|reach me/i;
  const confirmPatterns = /yes|confirm|correct|right|book it|place order|that's right/i;
  
  if (task.type === 'booking') {
    if (bookingPatterns.test(lowerMsg) || contactPatterns.test(lowerMsg) || confirmPatterns.test(lowerMsg)) {
      return { onTopic: true, confidence: 0.95, suggestedAction: 'continue' };
    }
  }
  
  if (task.type === 'ordering') {
    if (orderingPatterns.test(lowerMsg) || contactPatterns.test(lowerMsg) || confirmPatterns.test(lowerMsg)) {
      return { onTopic: true, confidence: 0.95, suggestedAction: 'continue' };
    }
    // Casual availability questions mid-order → answer briefly, return to order
    const casualAvailability = /when\s*can\s*(i|we)|do\s*you\s*have\s*(any\s*)?(availability|time|opening|slot|free)|is\s*there\s*(a\s*|an\s*)?(slot|time|opening|spot)\s*(available|free|open)|what\s*(days?|times?)\s*(are|do)\s*(you|the)\s*.*(available|open|free)/i;
    if (casualAvailability.test(lowerMsg)) {
      return { onTopic: false, confidence: 0.8, suggestedAction: 'answer_briefly' };
    }
  }
  
  // Check for FAQ/info requests mid-flow
  const infoPatterns = /what is|how much|do you|can you|tell me about|hours|location|price/i;
  if (infoPatterns.test(lowerMsg)) {
    // Brief answer but then redirect back
    return { onTopic: false, confidence: 0.7, suggestedAction: 'answer_briefly' };
  }
  
  // Small talk detection
  const smallTalkPatterns = /how are you|what's up|hello|hi there|nice to meet/i;
  if (smallTalkPatterns.test(lowerMsg)) {
    return { onTopic: false, confidence: 0.6, suggestedAction: 'redirect' };
  }
  
  // Default: assume on-topic with low confidence
  return { onTopic: true, confidence: 0.5, suggestedAction: 'continue' };
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK-AWARE PROMPT BUILDING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build task continuity prompt block for system prompt injection
 */
export function buildTaskContinuityPrompt(task: ActiveTask | null): string {
  if (!task || !task.type) {
    return '';
  }
  
  const parts: string[] = [];
  
  parts.push(`
# 📌 ACTIVE TASK — TASK CONTINUITY RULES (CRITICAL)

**There is an ACTIVE TASK in progress. You MUST continue this task.**

## Current Task State
\`\`\`
${buildTaskSummary(task)}
\`\`\`

## Task Continuity Rules (NON-NEGOTIABLE)

1. **PRIORITIZE TASK COMPLETION** — Every response should move toward completing the current task
2. **DO NOT RESTART** — Never re-ask for information already collected
3. **DO NOT SWITCH TOPICS** — Unless user explicitly cancels (says "cancel", "never mind", "start over")
4. **USE COLLECTED DATA** — Reference already-selected service/product/date naturally
5. **ASK FOR NEXT MISSING INFO** — Focus on collecting: ${task.memory.pending_info.join(', ') || 'confirmation'}

## Current Step: ${task.step || 'not started'}

## What to Do Next:
`);

  // Step-specific instructions
  switch (task.step) {
    case 'selecting_service':
      parts.push(`- Present available services and ask which one they'd like`);
      parts.push(`- If user mentions a service, confirm it and move to date selection`);
      break;
    case 'selecting_date':
      parts.push(`- Ask "What date works best for you?" or similar`);
      parts.push(`- When user provides date, confirm and move to time selection`);
      break;
    case 'selecting_time':
      parts.push(`- Show available time slots for the selected date`);
      parts.push(`- When user picks a time, move to contact collection`);
      break;
    case 'selecting_product':
      parts.push(`- Show products and ask what they'd like to order`);
      parts.push(`- Confirm product selection and ask about quantity if needed`);
      break;
    case 'selecting_quantity':
      parts.push(`- Confirm quantity for selected product(s)`);
      parts.push(`- Ask if they want to add more items or proceed to checkout`);
      break;
    case 'collecting_contact':
      parts.push(`- Ask for their name and contact (phone or email)`);
      parts.push(`- Be conversational: "May I have your name?" then "And the best way to reach you?"`);
      break;
    case 'confirming':
      parts.push(`- Summarize all collected information clearly`);
      parts.push(`- Ask for explicit confirmation: "Shall I confirm this booking?"`);
      break;
  }

  parts.push(`
## If User Goes Off-Topic:
- For quick questions: Answer briefly, then redirect back: "Great question! [brief answer]. Now, back to your ${task.type === 'booking' ? 'appointment' : 'order'} — ${getRedirectPhrase(task)}"
- For persistent off-topic: Gently remind them of the active task
- ONLY abandon task if user explicitly says "cancel", "never mind", or "start over"

## Already Collected Data (DO NOT RE-ASK):
`);

  if (task.entities.service.name) {
    parts.push(`- Service: ${task.entities.service.name}`);
  }
  if (task.entities.appointment.date) {
    parts.push(`- Date: ${task.entities.appointment.date}`);
  }
  if (task.entities.appointment.time) {
    parts.push(`- Time: ${task.entities.appointment.time}`);
  }
  if (task.entities.product_cart.length > 0) {
    parts.push(`- Products: ${task.entities.product_cart.map(p => `${p.name} x${p.quantity}`).join(', ')}`);
  }
  if (task.entities.customer.name) {
    parts.push(`- Customer Name: ${task.entities.customer.name}`);
  }
  if (task.entities.customer.phone) {
    parts.push(`- Phone: ${task.entities.customer.phone}`);
  }
  if (task.entities.customer.email) {
    parts.push(`- Email: ${task.entities.customer.email}`);
  }

  return parts.join('\n');
}

/**
 * Get redirect phrase based on current step
 */
function getRedirectPhrase(task: ActiveTask): string {
  switch (task.step) {
    case 'selecting_service':
      return 'which service would you like?';
    case 'selecting_date':
      return 'what date works for you?';
    case 'selecting_time':
      return 'which time slot works best?';
    case 'selecting_product':
      return 'what would you like to order?';
    case 'selecting_quantity':
      return 'how many would you like?';
    case 'collecting_contact':
      return 'I just need your contact details to confirm.';
    case 'confirming':
      return 'shall I confirm this for you?';
    default:
      return 'let me help you complete this.';
  }
}

/**
 * Build flow lock prompt (prevents unwanted topic switches)
 */
export function buildFlowLockPrompt(task: ActiveTask | null): string {
  if (!task || !task.type) {
    return '';
  }

  return `
# 🔒 FLOW LOCK — ACTIVE (${task.type.toUpperCase()})

The user is in an active ${task.type} flow. You are LOCKED to this flow.

**DO NOT:**
- Switch to FAQ mode unless explicitly asked
- Start a new booking/order while one is active
- Engage in extended small talk
- Re-greet the user
- Ask about things already discussed

**DO:**
- Stay focused on completing the current ${task.type}
- Answer brief questions quickly, then return to the task
- Guide the user to the next step naturally
- Reference previously collected information

**EXIT CONDITIONS (only these can end the flow):**
- User explicitly says "cancel", "never mind", "forget it", "start over"
- Task is completed successfully
- User requests to speak to a human
`;
}

/**
 * Detect task intent from message
 */
export function detectTaskIntent(message: string): TaskType | null {
  const lowerMsg = message.toLowerCase();
  
  // Booking indicators
  if (/book|appointment|schedule|reserve|sign up|available|when can/i.test(lowerMsg)) {
    return 'booking';
  }
  
  // Ordering indicators  
  if (/buy|purchase|order|get|want to get|i'd like|add to cart|checkout/i.test(lowerMsg)) {
    // Make sure it's not about booking
    if (!/appointment|book|schedule/i.test(lowerMsg)) {
      return 'ordering';
    }
  }
  
  return null;
}

/**
 * Build smart memory summary (task-focused, not narrative)
 */
export function buildSmartMemorySummary(task: ActiveTask | null): string {
  if (!task || !task.type) {
    return 'No active task. User is browsing or asking questions.';
  }
  
  return buildTaskSummary(task);
}
