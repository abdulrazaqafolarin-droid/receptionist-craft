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
    show_lead_form: false,
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
    case 'collect_name':
    case 'collect_contact':
      hints.show_lead_form = true;
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
  
  // After confirmation sent: block unsolicited re-confirmation
  // but ALLOW re-confirmation if the customer explicitly asks for it
  if (state.rules.confirmation_sent) {
    instruction.forbidden.push('unprompted_re_confirm');
    instruction.forbidden.push('unprompted_repeat_details');
    instruction.allowed.push('re_confirm_if_requested');
    instruction.allowed.push('repeat_details_if_requested');
  }
  
  // Never ask for already collected data
  requirements.collected.forEach(field => {
    instruction.forbidden.push(`ask_for_${field}`);
    instruction.forbidden.push(`re_ask_${field}`);
  });
  
  // Never re-greet with full greeting sequence
  // Light acknowledgments ("welcome back", "hey again") after pause are fine
  if (state.rules.greeted) {
    instruction.forbidden.push('full_greet_again');
    instruction.forbidden.push('re_introduce_self');
    instruction.allowed.push('light_acknowledgment_after_pause');
  }
  
  // Never ask "anything else" twice — but resets on new task
  if (state.rules.asked_if_need_more && !state.task_type) {
    instruction.forbidden.push('ask_if_need_more');
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // STEP-SPECIFIC INSTRUCTIONS (FLEXIBLE ORDER)
  // ─────────────────────────────────────────────────────────────────────────
  
  if (!state.task_type) {
    instruction.allowed.push('ask_how_to_help');
    instruction.allowed.push('answer_question');
    instruction.instruction = 'No active task. Help the user start a booking or order, or answer their question naturally.';
    return instruction;
  }
  
  const { collected, missing, next_required } = requirements;
  const fieldLabel: Record<string, string> = {
    service: 'the service they want',
    product: 'what product they want',
    date: 'what date works for them',
    time: 'what time works for them',
    name: 'their name',
    contact: 'their phone number or email',
    quantity: 'the quantity they want',
    delivery_address: 'their delivery address',
  };
  
  // Build a flexible instruction that acknowledges collected fields
  // and naturally asks for only what's still missing
  if (next_required === null) {
    if (!state.rules.confirmation_sent) {
      instruction.should_confirm = true;
      instruction.allowed.push('summarize_and_confirm');
      instruction.instruction = `The customer has provided all required ${state.task_type} details. Summarize what they've provided ONCE and ask them to confirm. Keep it brief.`;
    } else {
      instruction.should_close = true;
      instruction.allowed.push('thank_and_close');
      instruction.allowed.push('celebrate_with_customer');
      instruction.allowed.push('offer_one_preparation_tip');
      instruction.instruction = `${state.task_type === 'booking' ? 'Booking' : 'Order'} confirmed. 1. Celebrate briefly with the customer. 2. Offer ONE natural next-step or preparation tip if relevant. 3. Then ask warmly if there\'s anything else. Keep it conversational, not checklist-like.`;
    }
    return instruction;
  }
  
  // Flexible collection: don't force a specific order, just ask for the next missing field
  // If customer provided info out of order, acknowledge the collected fields
  const emotionContext = state.emotional_tone === 'frustrated' || state.emotional_tone === 'negative'
    ? ' The customer seems distressed. Acknowledge their concern first, then gently guide to the next step.'
    : state.emotional_tone === 'urgent'
    ? ' The customer has urgency. Be efficient and reassuring.'
    : '';
  if (collected.length > 0) {
    instruction.instruction = `Collected: ${collected.join(', ')}. Missing: ${missing.join(', ')}. `;
    instruction.instruction += `Naturally ask for ${fieldLabel[next_required] || `the ${next_required}`}. `;
    instruction.instruction += `If the customer just provided multiple details, acknowledge them all before asking for the next one.`;
    instruction.instruction += emotionContext;
  } else {
    instruction.instruction = `Ask for ${fieldLabel[next_required] || `the ${next_required}`} to continue the ${state.task_type}. Be natural and conversational.`;
    instruction.instruction += emotionContext;
  }
  
  // When a UI widget is active for this field, don't ask for it in text
  const uiHintsForInstruction = generateUIHints(state);
  if (next_required === 'service' && uiHintsForInstruction.show_services) {
    instruction.allowed.push('refer_to_service_widget');
  } else if (next_required === 'product' && uiHintsForInstruction.show_products) {
    instruction.allowed.push('refer_to_product_widget');
  } else if (next_required === 'date' && uiHintsForInstruction.show_calendar) {
    instruction.allowed.push('refer_to_date_widget');
  } else if (next_required === 'time' && uiHintsForInstruction.show_time_slots) {
    instruction.allowed.push('refer_to_time_widget');
  } else {
    instruction.allowed.push(`ask_for_${next_required}`);
    instruction.allowed.push(`present_${next_required === 'service' ? 'services' : next_required === 'product' ? 'products' : next_required}`);
  }
  
  return instruction;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BLOCK GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export function buildPromptBlock(
  state: EngineState,
  requirements: RequirementCheck,
  instruction: GovernorInstruction,
  userMessage: string = ''
): string {
  const detectsUrgency = (message: string): boolean => {
    if (!message) return false;
    return /\b(pain|hurt|emergency|urgent|bleeding|swollen|broken|panicking|scared|desperate|help me|please|asap|as soon as possible|worried|critical)\b/i.test(message);
  };
  const urgentTurn = detectsUrgency(userMessage);
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
  if (uiHints.show_lead_form) activeWidgets.push('Contact Information Form');
  
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
## 🖥️ UI WIDGET ACTIVE — TEXT DEDUPLICATION GUIDELINE

The following interactive UI widget(s) are being displayed alongside your text response:
${activeWidgets.map(w => `• ${w}`).join('\n')}

**GUIDELINES when a UI widget is showing:**
1. ${urgentTurn ? 'This user is in distress. Prioritize empathy and practical help above brevity for this turn.' : 'Your text response should be short and complementary to the widget — let the widget handle selection while you provide context, answer questions, or guide naturally.'}
2. NEVER list, enumerate, or describe the items/options that the widget already displays
3. If the customer asks about the options shown in the widget (e.g., differences between services), ANSWER their question fully before directing them to the widget
4. Write a brief, friendly prompt directing the user to interact with the widget only if they haven't already asked a specific question

**Example approach (NOT exact wording — adapt to conversation):**
If user asks a specific question about options: answer it, then suggest the widget.
If user hasn't asked anything specific: a brief prompt to use the widget is fine.
` : ''}

## 🖥️ UI WIDGET REQUEST — CHOOSE THE RIGHT WIDGET FOR THE CUSTOMER

After every response, decide whether a UI widget would help the customer complete their goal based on what they want:
- They want to BOOK → [WIDGET: service_selector@0.9X] (then date_picker, then time_picker as the flow advances)
- They want to BUY products → [WIDGET: product_selector@0.9X]
- They asked about availability/timing → [WIDGET: date_picker@0.8X]
- They need to pick a time → [WIDGET: time_picker@0.85]
- They've agreed to book and you need their contact info → [WIDGET: lead_form@0.8X]
- You've collated their booking/order → [WIDGET: booking_confirmation@0.9X] or [WIDGET: order_summary@0.9X]
- They're switching topics → [WIDGET: switch_confirmation@0.75]
- No widget helps right now (they're just asking a question) → [NO_WIDGET]

End your response with EXACTLY ONE marker on its own line:
[WIDGET: name@confidence] — e.g., [WIDGET: date_picker@0.94] or [WIDGET: service_selector@0.7]
[NO_WIDGET]

Confidence 0.0-1.0. Above 0.7 = show widget. Below 0.7 = don't show (you're unsure, ask a clarifying question instead).
Valid widgets: service_selector, product_selector, date_picker, time_picker, booking_confirmation, order_summary, lead_form, switch_confirmation.

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
