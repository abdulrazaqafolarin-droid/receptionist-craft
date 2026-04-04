// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED ENGINE v2 - GOVERNOR (EXECUTION CONTROL)
// ═══════════════════════════════════════════════════════════════════════════
// 
// Pre-LLM enforcement layer. Generates strict instructions for the model.
// Prevents loops, repetition, and illegal responses.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  EngineState,
  RequirementCheck,
  IntentResult,
  GovernorInstruction,
  UIHints,
} from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// UI HINTS GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function generateUIHints(state: EngineState): UIHints {
  const hints: UIHints = {
    show_services: false,
    show_products: false,
    show_calendar: false,
    show_time_slots: false,
    show_confirmation: false,
    show_order_confirmation: false,
  };
  
  if (!state.task_type) return hints;
  
  switch (state.task_step) {
    case 'select_service':
      hints.show_services = true;
      break;
    case 'select_product':
      hints.show_products = true;
      break;
    case 'select_date':
      hints.show_calendar = true;
      break;
    case 'select_time':
      hints.show_time_slots = true;
      break;
    case 'confirm':
      if (state.task_type === 'booking') {
        hints.show_confirmation = true;
      } else {
        hints.show_order_confirmation = true;
      }
      break;
  }
  
  return hints;
}

// ═══════════════════════════════════════════════════════════════════════════
// GOVERNOR INSTRUCTION GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function generateInstruction(
  state: EngineState,
  requirements: RequirementCheck,
  intent: IntentResult
): GovernorInstruction {
  const instruction: GovernorInstruction = {
    allowed: [],
    forbidden: [],
    next_field: requirements.next_required,
    instruction: '',
    should_confirm: false,
    should_close: false,
  };
  
  // ─────────────────────────────────────────────────────────────────────────
  // UNIVERSAL FORBIDDEN ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  
  // Never re-confirm after confirmation sent
  if (state.rules.confirmation_sent) {
    instruction.forbidden.push('summarize_again');
    instruction.forbidden.push('repeat_details');
    instruction.forbidden.push('re_confirm');
  }
  
  // Never ask for already collected data
  requirements.collected.forEach(field => {
    instruction.forbidden.push(`ask_for_${field}`);
    instruction.forbidden.push(`re_ask_${field}`);
  });
  
  // Never re-greet
  if (state.rules.greeted) {
    instruction.forbidden.push('greet_again');
    instruction.forbidden.push('introduce_self');
  }
  
  // Never ask "anything else" twice
  if (state.rules.asked_if_need_more) {
    instruction.forbidden.push('ask_if_need_more');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP-SPECIFIC INSTRUCTIONS
  // ─────────────────────────────────────────────────────────────────────────
  
  if (!state.task_type) {
    // No active task
    instruction.allowed.push('ask_how_to_help');
    instruction.allowed.push('answer_question');
    instruction.instruction = 'No active task. Help the user start a booking or order, or answer their question naturally.';
    return instruction;
  }
  
  // BOOKING FLOW
  if (state.task_type === 'booking') {
    switch (requirements.next_required) {
      case 'service':
        instruction.allowed.push('ask_for_service');
        instruction.allowed.push('present_services');
        instruction.instruction = 'Ask which service they would like. Be natural and helpful.';
        break;
      case 'date':
        instruction.allowed.push('ask_for_date');
        instruction.instruction = 'Ask what date works best for them. Be conversational.';
        break;
      case 'time':
        instruction.allowed.push('ask_for_time');
        instruction.instruction = 'Ask what time they prefer. Mention available slots if relevant.';
        break;
      case 'name':
        instruction.allowed.push('ask_for_name');
        instruction.instruction = 'Ask for their name to complete the booking. Be friendly.';
        break;
      case 'contact':
        instruction.allowed.push('ask_for_contact');
        instruction.instruction = 'Ask for their phone number or email. Explain it\'s for confirmation.';
        break;
      case null:
        // All collected - confirm
        if (!state.rules.confirmation_sent) {
          instruction.should_confirm = true;
          instruction.allowed.push('summarize_and_confirm');
          instruction.instruction = 'Summarize the booking details ONCE and ask for confirmation. Keep it brief.';
        } else {
          instruction.should_close = true;
          instruction.allowed.push('thank_and_close');
          instruction.instruction = 'Booking confirmed. Thank them warmly and ask if there\'s anything else.';
        }
        break;
    }
  }
  
  // ORDERING FLOW
  if (state.task_type === 'ordering') {
    switch (requirements.next_required) {
      case 'product':
        instruction.allowed.push('ask_for_product');
        instruction.allowed.push('present_products');
        instruction.instruction = 'Ask what they would like to order. Present options if available.';
        break;
      case 'quantity':
        instruction.allowed.push('ask_for_quantity');
        instruction.instruction = 'Confirm the quantity they want.';
        break;
      case 'name':
        instruction.allowed.push('ask_for_name');
        instruction.instruction = 'Ask for their name to complete the order.';
        break;
      case 'contact':
        instruction.allowed.push('ask_for_contact');
        instruction.instruction = 'Ask for their phone number or email for order confirmation.';
        break;
      case 'delivery_address':
        instruction.allowed.push('ask_for_delivery_address');
        instruction.instruction = 'Ask where they would like us to deliver the order. Accept any address or "pickup" if they prefer to collect.';
        break;
      case null:
        if (!state.rules.confirmation_sent) {
          instruction.should_confirm = true;
          instruction.allowed.push('summarize_and_confirm');
          instruction.instruction = 'Summarize the order including delivery address ONCE and ask for confirmation.';
        } else {
          instruction.should_close = true;
          instruction.allowed.push('thank_and_close');
          instruction.instruction = 'Order confirmed. Thank them and ask if they need anything else.';
        }
        break;
    }
  }
  
  return instruction;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BLOCK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function buildPromptBlock(
  state: EngineState,
  requirements: RequirementCheck,
  instruction: GovernorInstruction
): string {
  const lines: string[] = [];
  
  // Determine which UI widgets are currently being shown
  const uiHints = generateUIHints(state);
  const activeWidgets: string[] = [];
  if (uiHints.show_services) activeWidgets.push('Service Selector');
  if (uiHints.show_products) activeWidgets.push('Product Selector');
  if (uiHints.show_calendar) activeWidgets.push('Calendar / Date Picker');
  if (uiHints.show_time_slots) activeWidgets.push('Time Slot Picker');
  if (uiHints.show_confirmation) activeWidgets.push('Booking Confirmation Card');
  if (uiHints.show_order_confirmation) activeWidgets.push('Order Confirmation Card');
  
  lines.push(`
# 🔒 EXECUTION GOVERNOR (CONVERSATIONAL COLLECTION ENGINE)

You are a warm, intelligent receptionist who tracks task progress while staying fully conversational.
NEVER become a rigid form-filler. Remain human at all times.

## 📌 CURRENT STATE

- Task: ${state.task_type || 'none'}
- Step: ${state.task_step || 'not started'}
- Locked: ${state.locked ? 'YES - Task complete, no more changes allowed' : 'NO'}

## 📊 FIELD STATUS

✅ Collected: ${requirements.collected.join(', ') || 'none'}
❌ Missing: ${requirements.missing.join(', ') || 'none - ready to confirm'}
➡️ Next Required: ${requirements.next_required || 'CONFIRMATION'}

## 🎯 YOUR TASK

${instruction.instruction}

## 🚫 FORBIDDEN (NEVER DO)
${instruction.forbidden.map(a => `• ${a}`).join('\n')}
• Ask for information you already have
• Repeat the exact same question twice — rephrase if needed
• Summarize more than once
• Use robotic filler phrases like "Certainly!", "Of course!", "I'd be happy to!"

${activeWidgets.length > 0 ? `
## 🖥️ UI WIDGET ACTIVE — TEXT DEDUPLICATION RULE (CRITICAL)

The following interactive UI widget(s) are being displayed alongside your text response:
${activeWidgets.map(w => `• ${w}`).join('\n')}

**NON-NEGOTIABLE RULES when a UI widget is showing:**
1. Your text response MUST be SHORT (1-2 sentences max) — the widget does the heavy lifting
2. NEVER list, enumerate, or describe the items/options that the widget already displays
3. Instead, write a brief, friendly prompt directing the user to interact with the widget

**Examples of CORRECT short responses when widgets are active:**
- Service Selector: "Here are our available services — just tap the one you'd like!"
- Product Selector: "Here are our products — pick whatever catches your eye!"
- Calendar: "Go ahead and choose a date that works best for you!"
- Time Slots: "Here are the available time slots — tap the one you prefer!"
- Confirmation: "Here's your summary — please confirm if everything looks good!"
` : ''}

## 🧠 CONVERSATIONAL COLLECTION RULES

1. **MULTI-EXTRACTION**: If the customer gives multiple pieces of info in one message, accept ALL of them at once
2. **VOLUNTEERED INFO**: If they tell you something before you ask, store it and skip asking later
3. **HESITATION**: If they say "hold on" / "let me check" / "one sec" — respond warmly ("Take your time!") and do NOT repeat the question
4. **MID-FLOW QUESTIONS**: Answer their question fully, then gently guide back to the task
5. **CORRECTIONS**: Acknowledge warmly, update the info, continue from current point
6. **FRUSTRATION**: Empathize, briefly explain why the info is needed, ask gently with different wording
7. **OFF-TOPIC**: Engage briefly (1-2 sentences), then weave back naturally — never say "let's get back to..."
8. **PARTIAL INPUT**: Accept what they gave, clarify only the specific ambiguous part
9. **NO LOOPS**: Never ask the same thing the same way twice
10. **CONTEXTUAL FILTERING**: If the customer described a specific need, ONLY mention relevant services/products

${instruction.should_confirm ? `
## ⚡ CONFIRMATION FORMAT

Provide ONE clear summary:
• ${state.task_type === 'booking' ? 'Service' : 'Item(s)'}: [name]
• ${state.task_type === 'booking' ? 'Date/Time' : 'Quantity'}: [details]
• Name: [customer name]
• Contact: [phone/email]

Then ask naturally: "Does everything look good?" or "Shall I confirm this?"
` : ''}

## 🎭 PERSONALITY

Be warm, professional, and efficient. Sound like a helpful human receptionist, not a form.
Use varied acknowledgments. Be conversational but concise.
`);

  // Add collected data reminder
  if (state.task_type) {
    lines.push(`
## 📝 COLLECTED DATA (Reference Only - Do NOT re-ask)
`);
    if (state.entities.service.name) {
      lines.push(`• Service: ${state.entities.service.name}`);
    }
    if (state.entities.appointment.date) {
      lines.push(`• Date: ${state.entities.appointment.date}`);
    }
    if (state.entities.appointment.time) {
      lines.push(`• Time: ${state.entities.appointment.time}`);
    }
    if (state.entities.products.length > 0) {
      lines.push(`• Products: ${state.entities.products.map(p => `${p.name} x${p.quantity}`).join(', ')}`);
    }
    if (state.entities.customer.name) {
      lines.push(`• Customer: ${state.entities.customer.name}`);
    }
    if (state.entities.customer.phone) {
      lines.push(`• Phone: ${state.entities.customer.phone}`);
    }
    if (state.entities.customer.email) {
      lines.push(`• Email: ${state.entities.customer.email}`);
    }
    if (state.entities.delivery_address) {
      lines.push(`• Delivery: ${state.entities.delivery_address}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// ILLEGAL RESPONSE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function checkIllegalState(
  state: EngineState,
  instruction: GovernorInstruction
): { illegal: boolean; reason: string | null } {
  // If locked and trying to confirm again
  if (state.locked && instruction.should_confirm) {
    return { illegal: true, reason: 'Task is locked - confirmation already sent. Cannot re-confirm.' };
  }
  
  // If trying to start a new task while one is active and locked
  if (state.locked && state.task_type) {
    return { illegal: false, reason: null }; // Allow but task is complete
  }
  
  return { illegal: false, reason: null };
}
