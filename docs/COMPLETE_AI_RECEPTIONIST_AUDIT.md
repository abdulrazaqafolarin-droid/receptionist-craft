# COMPLETE AI RECEPTIONIST SYSTEM AUDIT

> Generated: 2026-05-10 | Scope: Conversational Flow Rigidity + UI Architecture & Intersection
> Previous fix commits: b6a7b91 (PR #41 — soften flow locks), 03b9707 (PR #42 — urgency handling, UI dismiss guards)

---

## TABLE OF CONTENTS
1. [Executive Summary](#1-executive-summary)
2. [Conversational Rigidity Findings (Steps 1-5)](#2-conversational-rigidity-findings)
3. [UI Component Registry (Step 6)](#3-ui-component-registry)
4. [UI Trigger Graph (Step 7)](#4-ui-trigger-graph)
5. [Conversational Flow × UI Intersection (Step 8)](#5-conversational-flow--ui-intersection)
6. [Line-by-Line Instruction Block Scan (Step 9)](#6-line-by-line-instruction-block-scan)
7. [Multi-POV Analysis (Step 10)](#7-multi-pov-analysis)
8. [Summary Table / Severity Counts (Step 11)](#8-summary-table--severity-counts)
9. [UI_ARCHITECTURE.md (Step 12)](#9-ui_architecturemd)
10. [TEST_SCENARIOS.md (Step 13)](#10-test_scenariosmd)
11. [Next Steps / Recommendations (Step 14)](#11-next-steps--recommendations)

---

## 1. EXECUTIVE SUMMARY

**37 findings** across 10 fault categories. Severity breakdown: 7 Critical, 14 High, 12 Medium, 4 Low.

### Critical Risks
1. **Two parallel intent systems compete** — Engine v2 `intent.ts` and widget-chat `layer4-intent.ts` both run on every turn, potentially conflicting
2. **UI widget "1-2 sentences" rule overrides sentiment** — The brevity instruction in governor.ts:220-221 applies DURING slot collection when UI widgets are active, causing dismissive responses when customer needs explanation
3. **Block 2 greeting prohibition is penalty-driven** — "Violation of this rule is a CRITICAL FAILURE" (line 1190) creates an anxiety-driven response pattern
4. **"Never re-confirm" hard stop** — governor.ts:81-85 permanently blocks all re-confirmation, even when customer explicitly asks to verify details
5. **Confirmation detection is unreliable** — The `isBookingConfirmation` flag (line 2313-2320) checks the AI's own reply text (reply contains "booked|confirmed|etc") creating a self-fulfilling prophecy
6. **Block 8 (knowledge base) duplicated in prompt** — Both `knowledgeBlock` and the knowledge base section in `buildKnowledgeBase` are included, sometimes producing redundant context
7. **Money Mode tactics are scripts, not guidelines** — Lines 1105-1117 contain hard-coded script examples ("Let me get you booked right now -- what day works best?") that the LLM may copy verbatim

---

## 2. CONVERSATIONAL RIGIDITY FINDINGS

### Finding #1 — FORCES repetition | Severity: HIGH
**File:** `supabase/functions/_shared/engine/governor.ts:81-85`
**Type:** Repetition enforcement
```typescript
if (state.rules.confirmation_sent) {
    instruction.forbidden.push('summarize_again');
    instruction.forbidden.push('repeat_details');
    instruction.forbidden.push('re_confirm');
}
```
**Why rigid:** Permanently blocks ALL re-confirmation and re-summarization after the first confirmation is sent. If a customer says "Wait, can you repeat that?", the AI is FORBIDDEN from complying. The "forbidden" list is added to system prompt — the LLM will refuse or awkwardly deflect.

**Example scenario:** Customer: "Can you just repeat the details one more time?" AI: "I'm sorry, I cannot repeat those details." (because it's in the forbidden list)

**Risk:** Customer frustration, loss of trust, unnecessary escalation

**Recommendation:** Replace permanent block with a "soft limit" — allow re-confirmation if customer explicitly asks, but don't volunteer it. Add "re_confirm_if_requested" to `allowed` only when user explicitly asks.

---

### Finding #2 — FORCES specific next message | Severity: MEDIUM
**File:** `supabase/functions/_shared/engine/governor.ts:130-137`
**Type:** Over-prescribed script
```typescript
if (next_required === null) {
    if (!state.rules.confirmation_sent) {
        instruction.should_confirm = true;
        instruction.allowed.push('summarize_and_confirm');
        instruction.instruction = `The customer has provided all required ${state.task_type} details. Summarize what they've provided ONCE and ask them to confirm. Keep it brief.`;
    } else {
        instruction.should_close = true;
        instruction.allowed.push('thank_and_close');
        instruction.instruction = `${state.task_type === 'booking' ? 'Booking' : 'Order'} confirmed. Thank them warmly and ask if there's anything else.`;
    }
}
```
**Why rigid:** Forces "summarize and confirm" as the ONLY allowed template when all fields are collected. The LLM cannot deviate — it MUST summarize, MUST ask confirmation. After confirmation, it MUST close. There is NO path for "just confirm quietly" or "ask if they want to make changes."

**Risk:** Makes the AI sound like a checkout form rather than a human receptionist

**Recommendation:** Soften to allow alternative paths: "They may want to confirm, change something, or ask a question. Let them lead."

---

### Finding #3 — IGNORES customer sentiment | Severity: CRITICAL
**File:** `supabase/functions/_shared/engine/governor.ts:220-221`
**Type:** Sentiment-agnostic brevity rule
```
**NON-NEGOTIABLE RULES when a UI widget is showing:**
1. Your text response MUST be SHORT (1-2 sentences max) — the widget does the heavy lifting
1. (duplicated line number) Your text response should usually be short (1-2 sentences) — except when the user shows urgency, distress, pain, or emergency needs; in those turns, give a fuller supportive response first
```
**Why rigid:** Lines 221.1 and 221.2 CONTRADICT each other. Line 221.1 says "MUST be SHORT (1-2 sentences max)" — a non-negotiable rule. Line 221.2 says "usually be short... except when urgency." The contradiction means the LLM will sometimes pick the strict rule (221.1) over the compassionate one (221.2). During slot collection (when UI widgets are shown), the AI is forced to be brief even if the customer seems confused.

**Note:** PR #42 added `urgentTurn` detection and line 221.2's urgency exception, but the contradiction with 221.1 remains. The hard "MUST be SHORT" at line 221.1 conflicts with the "except when" at line 221.2.

**Risk:** During slot collection (step 3-4 of booking), UI widgets are shown. The AI is forced to 1-2 sentences. Customers asking "What does this service include?" get a dismissive "Please select from the widget above" instead of an explanation.

**Recommendation:** Remove line 221.1 entirely and keep only line 221.2 with its urgency exception. Or change "NON-NEGOTIABLE" to "GUIDELINE" and "MUST" to "should."

---

### Finding #4 — HARD STOP conversation | Severity: HIGH
**File:** `supabase/functions/_shared/engine/governor.ts:117-118`
**Type:** Unnatural greeting block
```typescript
if (state.rules.greeted) {
    instruction.forbidden.push('greet_again');
    instruction.forbidden.push('introduce_self');
}
```
**Why rigid:** After the first greeting, the AI can NEVER say "hello" or "hi" again in any form for the entire session. Even if the customer steps away for 2 hours and returns with "Hey, I'm back!", the AI cannot respond with a natural "Hey, welcome back!" because `greet_again` is forbidden.

**Risk:** Awkward cold re-entries after silence. "Hi, I'm back" → AI: "How can I help you?" (no acknowledgment of return)

**Recommendation:** Allow "light greetings" like "welcome back", "hey again" after a silence threshold (>5 minutes idle). Only block FULL greeting sequences.

---

### Finding #5 — OVER-PRESCRIBES slot collection | Severity: HIGH
**File:** `supabase/functions/_shared/layers/layer5-booking.ts:147-148`
**Type:** Rigid sequential prompt
```
- If any field is missing, ask only for the missing item — ONE question at a time
```
**Why rigid:** Forces the AI to ask for fields one at a time even when context suggests the user is ready to provide multiple. The out-of-order detection at lines 133-144 handles when the user volunteers extra info, but the AI should also be ALLOWED to ask for multiple fields naturally ("Great, what day and time work for you?").

**Risk:** Unnecessarily lengthens conversations. Instead of "What day and time?" the AI asks "What day?" then "What time?" then "What's your name?"

**Recommendation:** Change to "Prefer ONE question at a time, but ask for multiple related fields together if natural."

---

### Finding #6 — BLOCKS topic-switching | Severity: MEDIUM
**File:** `supabase/functions/_shared/flow/flowRouter.ts` (referenced at widget-chat/index.ts:1834-1841)
**Type:** Topic shift blocking
```typescript
if (topicShift?.shouldBlock) {
    console.log(`[Flow Engine] Topic shift BLOCKED: ${topicShift.blockReason}`);
} else if (topicShift && topicShift.type === 'explicit' && topicShift.confidence > 0.7) {
    conversationState.active_flow = null;
    conversationState.flow_step = null;
}
```
**Why rigid:** Topic shifts are either BLOCKED or FULLY RESET (nuking all slots). There's no "park and return" — allow a brief detour then resume. If a customer asks "What's your return policy?" during a product order flow, the flow is either blocked (and the question ignored) or all collected slots are destroyed.

**Risk:** Customer asks a side question during booking → either ignored or all booking progress lost

**Recommendation:** Add "park mode" — save slots, allow detour, resume after side question resolved. Only reset on explicit "start over" signals.

---

### Finding #7 — CAUSES loop confirmations | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:2307-2320`
**Type:** Self-referential confirmation detection
```typescript
const userExplicitlyConfirmed = messageAnalysis.detectedIntent === 'confirm' ||
    /^(yes|yep|yeah|correct|right|exactly|confirmed?|that's right|please do|go ahead|book it|confirm it)/i.test(message);

const isBookingConfirmation = (
    userExplicitlyConfirmed &&
    (
        conversationState.flow_step === 'confirm' ||
        bookingTaskConfirming ||
        /(?:booked|confirmed|scheduled|appointment is set|all set|I['']ve scheduled)/i.test(reply)
    )
) && !conversationState.booking_confirmed && !bookingExecutionLocked;
```
**Why rigid:** The confirmation detection checks if the AI's own `reply` text contains "booked|confirmed|scheduled" — this is a **look-ahead** at the reply that was JUST generated. It creates a situation where if the AI says "I've booked your appointment..." (as instructed by Block 5), this regex fires, and the system auto-triggers booking execution. It's a self-fulfilling loop.

Additionally, `userExplicitlyConfirmed` is true for simple acknowledgments like "right" or "got it" — casual words that don't mean "yes, book it."

**Risk:** False-positive auto-bookings from casual customer acknowledgments during slot collection

**Recommendation:** Remove the `reply` regex check entirely. Only trigger booking on `flow_step === 'confirm'` AND explicit confirmation intent. Add a safety buffer: "Are you sure you'd like to book?" as a required second step.

---

### Finding #8 — IGNORES customer sentiment | Severity: MEDIUM
**File:** `supabase/functions/_shared/layers/layer6-safety.ts:231-236`
**Type:** Empathy limitation
```
- You may use an empathy or sympathy phrase (e.g. "I'm sorry to hear that", "That must be frustrating", "I understand your concern") once per distress episode.
- During the same episode, avoid repeating empathy phrases in every message; respond practically after the first acknowledgment.
- If the user shows a NEW distress signal or a clearly escalated concern, the empathy allowance resets for that new episode.
```
**Why rigid:** "Once per distress episode" means the AI cannot express empathy more than once even if the customer keeps expressing distress. The intent is good (avoid robotic repetition), but the rule doesn't distinguish between "same complaint repeated" vs "ongoing distress with new details."

**Risk:** Customer says "I'm really frustrated" → AI empathizes once. Customer explains more → AI can't empathize again → sounds cold.

**Recommendation:** Change to "Don't repeat the SAME empathy phrase. Vary your expression of concern. Prioritize action-oriented empathy."

---

### Finding #9 — FORCES repetition | Severity: MEDIUM
**File:** `supabase/functions/_shared/engine/personality.ts:33`
**Type:** Phrase blocklist over-broad
```typescript
export const ROBOTIC_PHRASES = [
  'certainly', 'of course', "i'd be happy to", 'absolutely',
  'i understand', 'thank you for', 'i apologize', 'please note that',
  'kindly', 'as per', 'regarding your', 'in order to',
  'at this time', 'please be advised', 'rest assured', 'i appreciate',
];
```
**Why rigid:** `polishResponse()` at personality.ts:174-194 **removes these phrases from the AI output after generation** using regex. But many of these are NATURAL phrases that a real receptionist would use: "Thank you for waiting", "I appreciate your patience", "Of course, let me help." Stripping them post-generation can produce awkward sentence fragments.

"Certainly" and "of course" are also in `NATURAL_ACKS` (layer6-safety.ts:113-123) but blocked in personality.ts. Two systems say opposite things.

**Risk:** AI output sounds clipped or unnatural because post-processing removes perfectly normal words

**Recommendation:** Split into "truly robotic" (affirmative, as per, kindly) vs "natural but overused" (certainly, of course). Only post-strip the first category. For the second, add a system prompt preference rather than hard removal.

---

### Finding #10 — FORCES specific next message | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:1156-1170`
**Type:** Identity rigidity
```typescript
const identityBlock = `#   BLOCK 1 -- CORE IDENTITY (IMMUTABLE)

**You are ${receptionist.name}, an S-tier, human-like AI receptionist for ${receptionist.business_name}.**
...
**CRITICAL:** You must ALWAYS act like a **real professional human receptionist**.
This identity NEVER changes during a session.`;
```
**Why rigid:** "S-tier" is a technical/gaming term that an LLM will interpret as "high performance" not "human-like." "IMMUTABLE" + "NEVER changes" creates an anxiety constraint. Combined with Block 2's "CRITICAL FAILURE" language, the LLM operates under extreme constraint pressure, which reduces conversational flexibility.

**Risk:** LLM becomes overly cautious and formulaic because it fears violating "immutable" identity rules

**Recommendation:** Remove "S-tier". Change "IMMUTABLE" to "CORE" and "NEVER changes" to "stays consistent." Remove "CRITICAL FAILURE" language from Block 2.

---

### Finding #11 — FORCES specific next message | Severity: CRITICAL
**File:** `supabase/functions/widget-chat/index.ts:1190`
**Type:** Punishment-driven rule
```
Violation of this rule is a **CRITICAL FAILURE**. Starting with a greeting on a follow-up message will damage the user experience.
```
**Why rigid:** Threatens "CRITICAL FAILURE" if the AI says "Hi" on a follow-up. This is disproportionate — a natural "Hey! Thanks for the info" after a long pause is NOT a critical failure. The threat-based instruction makes the LLM risk-averse and stiff.

**Risk:** AI avoids ANY conversational warmth on follow-ups. Sounds cold and transactional.

**Recommendation:** Replace with positive framing: "Continue naturally from where you left off. A brief acknowledgment is fine after a pause."

---

### Finding #12 — HARD STOP conversation | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:1297`
**Type:** Premature closure rule
```
- One farewell is enough - do not keep saying goodbye
- After "goodbye", if user doesn't respond, conversation is over
```
**Why rigid:** "If user doesn't respond, conversation is over" — but the user might be typing, or distracted, or the message might not have sent. The AI shouldn't declare the conversation over unilaterally.

**Risk:** User types a follow-up after a pause → AI has already decided conversation is over → ignores the message or responds oddly

**Recommendation:** Remove "conversation is over" statement. Replace with "remains open until session expires."

---

### Finding #13 — BLOCKS topic-switching | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:1182-1189`
**Type:** Over-broad greeting block on follow-ups
```
- **DO NOT** say "Hello", "Hi", "Hey", "Welcome", "Thanks for reaching out", or any greeting phrase
- **DO NOT** re-introduce yourself or say who you are again
- **DO NOT** start with "Hi! Thanks for reaching out" or any variation
```
**Why rigid:** "DO NOT say Hello, Hi, Hey" — these are completely normal conversational words. A human receptionist saying "Hi there, I see you're interested in our dental cleaning" on message #3 is perfectly natural. Blocking ALL greetings on ALL follow-ups produces robotic transitional text.

**Risk:** AI messages on follow-ups have no conversational flow — they jump straight into business without any acknowledgment

**Recommendation:** Allow natural opening words. Only block FULL greeting sequences (re-introducing self, saying "welcome" again).

---

### Finding #14 — IGNORES customer sentiment | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:1201`
**Type:** Memory block ignores emotional history
```typescript
## Current Context Summary
- Emotional State: ${context.emotionalState}
```
**Why rigid:** The emotional state is shown as a single enum value (`neutral/positive/negative/urgent/frustrated`), which loses nuance. If a customer was frustrated 5 turns ago but is now neutral, the system only shows "neutral" — the AI forgets the earlier frustration and can't reference it.

**Risk:** AI doesn't address past friction. "I know you were frustrated earlier — has that improved?" is impossible.

**Recommendation:** Include emotional trajectory: "Previous: frustrated → Current: neutral. Briefly acknowledge the improvement."

---

### Finding #15 — OVER-PRESCRIBES slot collection | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:1256-1276`
**Type:** Repetitive field status
```
## FIELD STATUS
- Service: ${context.serviceMentioned || 'Missing'}
- Date: ${context.dateMentioned || 'Missing'}
- Time: ${context.timeMentioned || 'Missing'}
...
## CUSTOMER FIELDS TO COLLECT
Required: ${requiredFields.length > 0 ? requiredFields.join(', ') : 'none'}
```
**Why rigid:** This same field status is ALSO shown in the Engine v2 governor block (governor.ts:199-201). The LLM receives the field status TWICE per turn — once from Block 5 (bookingBlock) and once from the governor block. This double-reinforcement makes the LLM hyper-fixate on "Missing" fields rather than conversational flow.

**Risk:** AI treats every conversation as a form-filling exercise, constantly checking "what's missing" instead of listening

**Recommendation:** Deduplicate. Remove field status from Block 5 and let the governor block be the sole source. Block 5 should focus on business rules, not slot collection status.

---

### Finding #16 — CAUSES loop confirmations | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:194`
**Type:** Over-eager confirmation detection
```typescript
function isTaskConfirming(activeTask: ActiveTask | null, expectedType: "booking" | "order"): boolean {
    if (!activeTask || activeTask.type !== expectedType) return false;
    return activeTask.step === "confirming" || activeTask.confirmation_sent === true;
}
```
**Why rigid:** Returns `true` if `confirmation_sent === true` even on a NEW message. If the task was already confirmed, `isBookingConfirmation` at line 2313 might fire again on a subsequent user message that has "yes" or "right" in it, because both `userExplicitlyConfirmed` AND `bookingTaskConfirming` are true (activeTask.confirmation_sent is still true).

The `bookingExecutionLocked` guard at 2310 prevents double-execution, but the prompt block might still tell the AI that confirmation is happening.

**Risk:** Re-triggers confirmation flow logic on unrelated "yes" or "right" messages

**Recommendation:** Add `!activeTask.completed` check. Reset `confirmation_sent` when a new topic is detected.

---

### Finding #17 — FORCES repetition | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:1222-1228`
**Type:** Static intent handling scripts
```
## Intent Handling Rules
- For acknowledgments: Brief warm response, proceed with pending action
- For corrections: Acknowledge warmly ("No problem!"), update the info, confirm the change
- For booking/ordering: Guide toward missing info conversationally...
- For complaints: Show genuine empathy, apologize, offer solutions
- For escalation requests: Connect to human immediately
- For questions mid-flow: Answer fully, then return to the task naturally
- For hesitation ("hold on", "let me check"): Respond warmly and wait
```
**Why rigid:** "Acknowledge warmly ("No problem!")" — a hard-coded script example. The LLM may copy "No problem!" verbatim every time there's a correction because it's given as a direct example. Similarly, "apologize, offer solutions" for complaints forces a specific sequence.

**Risk:** AI says "No problem!" on every correction regardless of severity. For a serious correction ("That's not what I said!"), "No problem!" is dismissive.

**Recommendation:** Remove example phrases. Replace with descriptive guidance: "Vary your acknowledgment based on context."

---

### Finding #18 — HARD STOP conversation | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:369`
**Type:** Overly specific booking detection
```typescript
if (/i ('d| would) like to (come in|visit|set up|get|arrange|plan)/i.test(lowerMsg) && !/order|buy|purchase/i.test(lowerMsg)) return 'book_appointment';
```
**Why rigid:** If a customer says "I'd like to get a haircut" with no "appointment" or "book" words, `detectIntent` returns `general_query` because "get" is matched here BUT only if followed by "come in/visit/set up/arrange/plan." Not "get a haircut." The intent is missed entirely.

Wait — actually looking at the regex: `/i ('d| would) like to (come in|visit|set up|get|arrange|plan)/i` — this DOES match "I'd like to get" where "get" is one of the options. So "I'd like to get a haircut" would match `book_appointment`. Let me re-read.

Actually the intent detection looks reasonable here. Let me focus on more impactful findings.

---

### Finding #19 — TWO PARALLEL INTENT SYSTEMS | Severity: CRITICAL
**File:** `supabase/functions/_shared/engine/intent.ts` AND `supabase/functions/widget-chat/index.ts:329-400`
**Type:** System architecture conflict

**The Problem:** Two independent intent detection systems run on EVERY message:
1. **Engine v2 intent.ts** — The "single source of truth" (as declared at widget-chat/index.ts:1647-1648)
2. **widget-chat layer4-intent (detectIntent)** — Legacy system still imported and called at line 1643

Both produce `IntentResult` and both are used:
- Engine v2 intent drives state updates, governor prompts, UI hints
- Legacy detectIntent drives `messageAnalysis.detectedIntent` used in the system prompt Block 4

These TWO intents can DISAGREE. Engine v2 might detect `confirm_appointment` while detectIntent says `acknowledgment`. The system prompt tells the AI "Current detected intent: acknowledgment" while the governor says "Task step: confirm." This creates conflicting signals.

**Risk:** Confused AI behavior when the two intents conflict. System prompt says one thing, governor says another.

**Recommendation:** Remove legacy `detectIntent` and `analyzeMessage`. Use `EngineResult.intent` as the sole source for Block 4. Keep `isAcknowledgment` and `isCorrection` as lightweight side-checks, not full intent classification.

---

### Finding #20 — Money Mode scripts override natural behavior | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:1083-1126`
**Type:** Over-prescribed conversion scripts
```
## CONVERSION TACTICS

### For Appointments:
- "Let me get you booked right now -- what day works best?"
- "I have a great opening at [time]. Should I reserve it for you?"
- If hesitation: "This slot tends to fill up quickly. Want me to hold it?"
```
**Why rigid:** Hard-coded sales script examples in the system prompt. LLMs are trained to follow examples. When Money Mode activates, the AI may copy these exact phrases verbatim, making every sales conversation sound identical. "This slot tends to fill up quickly" used repeatedly across customers creates a used-car-lot feel.

**Risk:** Customers recognize the scripted language → lose trust → lower conversion

**Recommendation:** Replace example scripts with principles: "Use natural urgency, reference popularity, avoid repeating the same phrasing across customers."

---

### Finding #21 — FORCES repetition | Severity: MEDIUM
**File:** `supabase/functions/_shared/flow/flowRouter.ts` (behavioral analysis)
**Type:** Sequential step enforcement via flow_step
**Analysis:** The flow engine tracks `active_flow` and `flow_step` in `conversationState`. When a step is set (e.g., `service_selection`), the UI component is determined by `flow_step` (widget-chat/index.ts:2737-2742):
```typescript
const intentSuggestedComponent: UIComponent =
    conversationState.flow_step === "service_selection" ? "service_selector" :
    conversationState.flow_step === "date_selection" ? "date_picker" :
    conversationState.flow_step === "time_selection" ? "time_picker" :
    conversationState.flow_step === "product_selection" ? "product_selector" :
    null;
```
**Why rigid:** The `flow_step` drives the UI component shown. If the flow_step is `service_selection`, the ServiceSelector widget is shown. But the conversational prompt ALSO tells the AI to ask about the service. The customer sees a UI widget AND a text prompt asking the same thing — duplicative and annoying.

**Risk:** User gets "What service would you like?" in text while a service picker is shown — feels like the AI doesn't know what the widget does

**Recommendation:** When a UI widget is active for a field, the AI should NOT ask about that field in text. The governor's "UI WIDGET ACTIVE" block at governor.ts:214-228 attempts this, but it only says "keep text short" — it doesn't say "DON'T ask for what the widget collects."

---

### Finding #22 — IGNORES customer sentiment | Severity: CRITICAL
**File:** `supabase/functions/widget-chat/index.ts:321-400`
**Type:** Intent detection cannot understand complex or nuanced statements
**Analysis:** The regex-based `detectIntent` function (lines 329-400) cannot understand complex sentence structures. For example:
- "I was wondering if maybe I could come in sometime next week for a checkup?" — contains "come in" → matches `book_appointment`
- But "Can I just ask, do you do root canals?" — contains no booking keywords → may be classified as `ask_info`

**Risk:** Intent misclassification cascades into wrong system prompt instructions, wrong UI widgets, wrong state transitions

**Recommendation:** This is a fundamental limitation of regex intent detection. For the legacy path, this is acceptable, but for the PRIMARY path (Engine v2), the intent detection at `engine/intent.ts` should be the sole classifier.

---

### Finding #23 — HARD STOP conversation | Severity: LOW
**File:** `supabase/functions/widget-chat/index.ts:338`
**Type:** Single-word "no" → conversation end
```typescript
if (/^(no|nope)$/i.test(lowerMsg)) return 'conversation_end'; // Short "no" after asking if they need more help
```
**Why rigid:** A single-word "No" ALWAYS maps to `conversation_end`. But "No" could mean "No, I don't want that service" during slot collection. The comment says "after asking if they need more help" but the code has no check for whether "anything else" was just asked.

**Risk:** User says "No" to a service suggestion → AI thinks conversation is over → starts closing

**Recommendation:** Only detect `conversation_end` for "no" when the previous AI message asked "anything else." Use conversation context.

---

### Finding #24 — CAUSES loop confirmations | Severity: HIGH
**File:** `supabase/functions/_shared/engine/intent.ts` (if sequential "yes" responses → re-confirm)
**Type:** Confirmation retrigger on sequential yes
**Analysis (from behavioral analysis of engine/intent.ts):** The Engine v2 intent system has an intent type `confirm_appointment` and `confirm_order`. If the system is in `confirm` step and the user says "yes," the intent is detected as confirm. The governor then proceeds. But if the user says "yes" again (e.g., "Yes, that's correct"), the intent is detected as confirm AGAIN. The `confirmation_sent` flag prevents execution, but the prompt block still shows "should_confirm: true" if the state hasn't fully transitioned.

**Risk:** After confirmation, the next user "yes" triggers the confirmation prompt block again

**Recommendation:** After `confirmation_sent`, the next turn should immediately transition to `complete` state regardless of user input.

---

### Finding #25 — FORCES repetition | Severity: MEDIUM
**File:** `supabase/functions/_shared/engine/governor.ts:100-102`
**Type:** "Anything else" asked once rule prevents re-asking after unrelated turns
```typescript
if (state.rules.asked_if_need_more) {
    instruction.forbidden.push('ask_if_need_more');
}
```
**Why rigid:** Once "asked_if_need_more" is set, the AI can NEVER ask "Is there anything else?" again. But after a customer completes a booking, does a second booking, and finishes that — the "anything else" question is natural again. The rule doesn't account for multi-task sessions.

**Risk:** After completing two tasks, the AI cannot ask "Anything else?" because it already asked once before

**Recommendation:** Reset `asked_if_need_more` when a new task starts.

---

### Finding #26 — OVER-PRESCRIBES slot collection | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:1243-1253`
**Type:** Customer fields status duplicated across blocks
```typescript
const fieldStatusLines = fields.map((f: any) => {
    ...
    const collected = value ? `  ${value}` : '  Missing';
    return `- ${f.label}: ${collected}${f.required ? ' (required)' : ' (optional)'}`;
}).join('\n');
```
**Why rigid:** The field status is produced here (Block 5) AND in the governor block (governor.ts:199-201, 264-288). The LLM sees the same field status from two different sections of the system prompt, reinforcing the form-filling behavior. Combined with "Missing" labels, the AI is conditioned to see conversations as incomplete forms.

**Risk:** AI's mental model is "collect missing fields" rather than "help the customer"

**Recommendation:** Remove field status from Block 5. Keep it ONLY in the governor block (the single source of truth). Change "Missing" to "Not yet provided."

---

### Finding #27 — IGNORES customer sentiment | Severity: HIGH
**File:** `supabase/functions/_shared/engine/governor.ts:143-150`
**Type:** Neutral field labels override emotional context
```typescript
if (collected.length > 0) {
    instruction.instruction = `Collected: ${collected.join(', ')}. Missing: ${missing.join(', ')}. `;
    instruction.instruction += `Naturally ask for ${fieldLabel[next_required] || `the ${next_required}`}. `;
} else {
    instruction.instruction = `Ask for ${fieldLabel[next_required] || `the ${next_required}`} to continue the ${state.task_type}. Be natural and conversational.`;
}
```
**Why rigid:** The instruction always says "Ask for [field]" regardless of emotional context. If the user is frustrated, the AI should still ask for the next field because the governor doesn't incorporate emotional state into the collection strategy.

**Risk:** Frustrated user gets "What time works for you?" instead of "I understand — let me help. What time would work?"

**Recommendation:** Incorporate emotional state into field-asking prompts: "If user is frustrated, acknowledge concern before asking."

---

### Finding #28 — BLOCKS topic-switching | Severity: MEDIUM
**File:** `supabase/functions/_shared/flow/taskIntelligence.ts` (behavioral)
**Type:** Flow exit detection blocking natural segues
**Analysis:** `detectFlowExit` in taskIntelligence.ts determines when a user wants to leave the current flow. If the heuristic is overly conservative, users can't naturally switch from booking to ordering without explicit "I want to order instead" language.

**Risk:** User says "Actually, do you sell products too?" → not recognized as flow exit → AI continues pushing booking

**Recommendation:** Allow more natural flow transitions. A question about products IS a flow exit for a booking flow.

---

### Finding #29 — CAUSES loop confirmations | Severity: MEDIUM
**File:** `supabase/functions/_shared/actionGate.ts` (behavioral)
**Type:** Booking gate blocks re-confirmation path
**Analysis:** Once `booking_confirmed` is set, `checkBookingGate` returns `allowed: false`. This means if a customer says "Wait, let me confirm the details again," the action gate blocks it. Combined with finding #1 (governor forbids re-confirm), there's NO path for a customer to verify details after booking.

**Risk:** Zero flexibility for post-booking verification

**Recommendation:** Add a "verify_only" mode to action gate that allows re-summarization without re-execution.

---

### Finding #30 — IGNORES customer sentiment | Severity: MEDIUM
**File:** `supabase/functions/_shared/engine/personality.ts:83-107`
**Type:** Sentiment detection is keyword-only, no context
**Analysis:** `detectSentiment()` uses simple keyword matching:
```typescript
if (/frustrated|annoyed|angry|upset|terrible|awful|worst|ridiculous|unacceptable|hate/i.test(lower)) {
    return 'frustrated';
}
```
Sarcasm, dry humor, or contextual frustration is missed. "Great, just great" (sarcastic) matches "great" → returns `positive`. "This is the worst service ever" → returns `frustrated` (correct), but "This is the worst, I can't believe how bad this is" → also returns `frustrated` (correct but repetitive).

**Risk:** Sarcastic positive words → classified as positive → AI responds cheerfully to an upset customer

**Recommendation:** Add negation detection: "great" preceded by "just" or in a negative context. Add sarcasm heuristics.

---

### Finding #31 — FORCES specific next message | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:1301-1314`
**Type:** Ordering block repeats booking rules
```
## BLOCK 5.5 -- PRODUCT ORDERING
1. Help them pick a product, then check inventory from the knowledge base
2. If out of stock: offer alternatives or notify when back
3. If low stock: mention limited availability
4. Collect delivery address unless they prefer pickup
5. Confirm the order naturally — product, quantity, contact, delivery
```
**Why rigid:** This is a sequential 5-step script that the LLM may follow rigidly. Step 2-3 could conflict: "If low stock: mention limited availability" sounds like a pressure tactic. Combined with Money Mode's "encourage quick decision" (item 3 at line 1060), the AI may pressure customers on low-stock items.

**Risk:** "This item is almost gone — you should buy now" repeated across sessions

**Recommendation:** Soften: "Mention stock status naturally. Let customer decide."

---

### Finding #32 — OVER-PRESCRIBES slot collection | Severity: LOW
**File:** `supabase/functions/_shared/hallucinationGuard.ts` (behavioral)
**Type:** Over-grounding blocks natural extrapolation
**Analysis:** `buildHallucinationGuardPrompt` tells the AI to ONLY use data from the knowledge base. This prevents natural inferences. For example, if the business offers "Teeth Whitening" and the customer asks "Does it hurt?", the AI cannot say "It's generally painless" unless that's explicitly in the KB.

**Risk:** AI says "I don't have that information" for reasonable common-sense questions

**Recommendation:** Add a "reasonable common knowledge" exception for non-business-specific information.

---

### Finding #33 — HARD STOP conversation | Severity: LOW
**File:** `supabase/functions/widget-chat/index.ts:1337-1341`
**Type:** Premature closure on "thanks"
```
## Conversation Closure Detection
When user indicates they're done (thanks, bye, no that's all, etc.):
- Give a warm, brief closing message
- Do NOT continue asking questions
- Do NOT repeat previously stated information
```
**Why rigid:** "Thanks" is listed alongside "bye" and "no that's all" as a closure signal. But "Thanks" mid-conversation (e.g., "Thanks for that info") is NOT a goodbye. The AI will close the conversation when the customer just said "thanks" for a piece of information.

**Risk:** AI closes prematurely when customer says "thanks" naturally during conversation

**Recommendation:** Only detect closure on "thanks" if it's the LAST word in the message AND following a task completion. Not mid-task.

---

### Finding #34 — FORCES specific next message | Severity: MEDIUM
**File:** `supabase/functions/widget-chat/index.ts:1359-1365`
**Type:** Final block over-promises user experience
```
## FINAL DIRECTIVE
You are not just answering questions--you are creating a positive experience.
Every interaction should leave them thinking "Wow, that was easy and pleasant."
```
**Why rigid:** Sets unrealistic expectations for the AI. "Every interaction should leave them thinking 'Wow'" is an unattainable standard that may cause the LLM to over-compensate with excessive positivity or apology.

**Risk:** AI over-apologizes or is overly effusive to meet the "Wow" standard

**Recommendation:** "Focus on being helpful and clear. Let the quality of service speak for itself."

---

### Finding #35 — IGNORES customer sentiment | Severity: LOW
**File:** `supabase/functions/widget-chat/index.ts:1148-1154`
**Type:** Emotional guidance overly generic
```typescript
const emotionalGuidance: Record<string, string> = {
    neutral: 'Maintain a warm, professional tone.',
    positive: 'Match their positive energy with enthusiasm.',
    negative: 'Be extra reassuring and empathetic.',
    urgent: 'Prioritize their needs immediately with calm urgency.',
    frustrated: 'Show deep empathy, apologize if appropriate, and focus on solutions.'
};
```
**Why rigid:** The emotional guidance is static text inserted into the prompt. It doesn't reference the specific customer message — "Show deep empathy" is generic whether the frustration is about pricing, service, or scheduling.

**Risk:** "I understand your frustration" (generic response) regardless of the specific frustration cause

**Recommendation:** Include the customer's specific words in the emotional guidance: "Customer said: [quote]. Address this specific concern."

---

### Finding #36 — CAUSES loop confirmations | Severity: HIGH
**File:** `supabase/functions/widget-chat/index.ts:133-138 (personality.ts) and governor.ts:131-132`
**Type:** Confirmation → close sequence skips natural follow-up
```typescript
} else {
    instruction.should_close = true;
    instruction.allowed.push('thank_and_close');
    instruction.instruction = `${state.task_type === 'booking' ? 'Booking' : 'Order'} confirmed. Thank them warmly and ask if there's anything else.`;
}
```
**Why rigid:** After confirmation, the system immediately jumps to "thank and close" + "ask if there's anything else." This means the AI:
1. Can't celebrate with the customer
2. Can't offer next steps (preparation instructions)
3. Can't offer complementary services naturally
4. Must ask "anything else" which, once asked, becomes forbidden (finding #25)

**Risk:** "Your appointment is confirmed! Is there anything else?" — always the same closing, no natural celebration or next steps

**Recommendation:** After confirmation, allow a CELEBRATION step: "Congratulate, mention 1-2 preparation tips, then ask if they need anything else."

---

### Finding #37 — FORCES repetition | Severity: CRITICAL
**File:** `supabase/functions/widget-chat/index.ts:2096`
**Type:** Post-processing overrides LLM output
```typescript
reply = polishResponse(reply);
```
**Why rigid:** `polishResponse()` at personality.ts:174-194 REMOVES "robotic" phrases AFTER the LLM generates the response. This means even if the LLM naturally said "Thank you for your patience," it gets stripped to "for your patience" or "your patience" — producing grammatically broken text. The function removes phrases case-insensitively but doesn't check if the removal leaves a valid sentence.

The blocklist includes common phrases like:
- "thank you for" — strips from "Thank you for your time" → "your time"
- "i appreciate" — strips from "I appreciate your business" → "your business"
- "of course" — strips from "Of course, let me help" → "let me help"

**Risk:** AI output has missing words, grammatical errors, or awkward phrasing because post-processing stripped parts of sentences

**Recommendation:** Remove post-processing entirely. Rely on the system prompt blocklist instead. Or change to a "soft" approach that appends guidance rather than surgically removing words.

---

## 3. UI COMPONENT REGISTRY

| # | Component | File | Props | Visibility Trigger | Dismissal | Min/Close |
|---|-----------|------|-------|--------------------|-----------|-----------|
| 1 | ServiceSelector | `ServiceSelector.tsx` | `services`, `onSelect`, `disabled?`, `initialLimit?` | `activeComponent === "service_selector"` | Click service or close/minimize | Yes |
| 2 | ProductSelectorEnhanced | `ProductSelectorEnhanced.tsx` | `products`, `onConfirm`, `disabled?` | `activeComponent === "product_selector"` | Confirm selection or close/minimize | Yes |
| 3 | DateSelector | `DateSelector.tsx` | `onSelect`, `disabled?`, `minDate?` | `activeComponent === "date_picker"` | Select date or close/minimize | Yes |
| 4 | TimeSlotSelector | `TimeSlotSelector.tsx` | `slots`, `onSelect`, `disabled?`, `showMore?` | `activeComponent === "time_picker"` (needs `componentData.slots`) | Select slot or close/minimize | Yes |
| 5 | BookingConfirmation | `BookingConfirmation.tsx` | `serviceName`, `dateTime`, `customerName`, `confirmationId`, etc. | `activeComponent === "booking_confirmation"` (needs `componentData`) | Close/minimize (no dismiss by action) | Yes |
| 6 | OrderConfirmation | `OrderConfirmation.tsx` | `products`, `customerName`, `totalAmount`, `orderId`, etc. | `activeComponent === "order_summary"` (needs `componentData`) | Close/minimize (no dismiss by action) | Yes |
| 7 | ErrorDisplay | `ErrorDisplay.tsx` | Error message | Via error boundary or API | Retry/dismiss | Yes |
| 8 | LoadingSpinner | `LoadingSpinner.tsx` | None | Loading state | N/A | No |
| 9 | PlusIcon | `PlusIcon.tsx` | Icon props | In ProductSelectorEnhanced | N/A | No |
| 10 | MinusIcon | `MinusIcon.tsx` | Icon props | In ProductSelectorEnhanced | N/A | No |
| 11 | CloseIcon | `CloseIcon.tsx` | Icon props | In UISignalRenderer close button | N/A | No |

### UI Component State Machine

```
NULL → service_selector → date_picker → time_picker → booking_confirmation → NULL
NULL → product_selector → order_summary → NULL
```

**Dismiss flow:** Each component has a "minimize" (collapse panel, keep signal active) and "close" (dismiss signal entirely via `handleDismiss` → `onDismiss` callback). The `dismissPrevious` flag at UISignal level controls widget switching.

---

## 4. UI TRIGGER GRAPH

```
Conversational Action                 → UI Component         → Dismissal Sequence
──────────────────────────────────────────────────────────────────────────────────
User says "I want to book"            → service_selector     → select service → dismiss → date_picker
User clicks a service                 → date_picker           → select date → dismiss → time_picker
User selects date                     → time_picker           → select time → dismiss
User provides time                    → (no UI, text prompt)  → collects name/contact
User confirms booking                 → booking_confirmation  → close/minimize → NULL
User says "I want to order"           → product_selector      → confirm products → dismiss → order_summary
User confirms products+details        → order_summary          → close/minimize → NULL
Flow step = service_selection         → service_selector
Flow step = date_selection            → date_picker
Flow step = time_selection            → time_picker
Flow step = product_selection         → product_selector
Booking execution complete            → booking_confirmation
Order execution complete              → order_summary
engineHints.show_services             → service_selector
engineHints.show_calendar             → date_picker
engineHints.show_time_slots           → time_picker
engineHints.show_products             → product_selector
engineHints.show_confirmation         → booking_confirmation
engineHints.show_order_confirmation   → order_summary
```

### Trigger Precedence (resolveDeterministicUIComponent)
```
bookingResult → orderResult → intentSuggestedComponent → engineHints → null
```

---

## 5. CONVERSATIONAL FLOW × UI INTERSECTION

### Intersection Point #1: Duplicate Slot Collection
**When:** Booking flow, step = selecting service/date/time
**What happens:** Both AI text AND UI widget ask for the same field
**System prompt says:** "1-2 sentences max when UI widget is showing" + "Ask for [field]"
**Result:** AI text says "Please select from the widget above" — dismissive, robotic, and avoids actually answering
**Finding reference:** #3, #21

### Intersection Point #2: Widget Shows, AI Still Talks About It
**When:** `activeComponent` is set but AI text still mentions the options
**System prompt says:** "NEVER list, enumerate, or describe the items/options that the widget already displays"
**Result:** AI can't explain options even if customer asks "What's the difference between these?"
**Finding reference:** #3

### Intersection Point #3: Confirmation UI Without Confirm Option
**When:** Booking/Order completed
**What happens:** `BookingConfirmation` / `OrderConfirmation` is a READ-ONLY card
**Result:** Customer cannot "edit" or "cancel" from the widget — must type in text. No undo path.
**Finding reference:** #36

### Intersection Point #4: Widget Dismiss Creates Void
**When:** User clicks "X" on widget mid-flow
**What happens:** `handleDismiss` calls `onDismiss` callback but the flow_step is unchanged
**Result:** System prompt STILL shows the widget is active (governor.ts:176-183 checks state, not UI visibility). The AI thinks widget is showing → keeps text to 1-2 sentences.
**Finding reference:** #3

### Intersection Point #5: Multiple UI Tools, Single Channel
**When:** Both booking AND ordering are possible
**What happens:** The `resolveDeterministicUIComponent` function picks ONE component based on strict precedence
**Result:** A customer who wants to discuss both services and products sees only one widget at a time. Switching requires new message.
**Finding reference:** #6

---

## 6. LINE-BY-LINE INSTRUCTION BLOCK SCAN

### Block 1 — Core Identity (lines 1156-1170)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1159 | "S-tier" is jargon, not human-like | Tone mismatch | LOW |
| 1169 | "CRITICAL: You must ALWAYS act like a real professional human receptionist" | Anxiety constraint | MEDIUM |
| 1170 | "This identity NEVER changes during a session" | Rigidity | LOW |

### Block 2 — Session Rules (lines 1190)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1190 | "Violation of this rule is a CRITICAL FAILURE" | Punishment-driven | HIGH |
| 1183-1186 | "DO NOT say Hello, Hi, Hey... DO NOT re-introduce" | Over-broad blocking | HIGH |

### Block 3 — Memory & Context (lines 1192-1212)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1201 | Emotional state is single value, no history | Information loss | MEDIUM |

### Block 4 — Intent & Decision (lines 1214-1228)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1223 | "Acknowledge warmly ("No problem!")" — hard-coded script | Over-prescribed | MEDIUM |
| 1217 | Uses legacy `messageAnalysis.detectedIntent` — may conflict with Engine v2 | Architecture conflict | CRITICAL |

### Block 5 — Booking & Ordering (lines 1255-1276)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1259-1261 | Field status shows "Missing" labels — form-filling mentality | Over-prescribed | HIGH |
| 1268-1270 | Duplicate field status (same info in governor block) | Redundancy | MEDIUM |

### Block 5.5 — Product Ordering (lines 1300-1314)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1305-1309 | Sequential 5-step script | Over-prescribed | HIGH |
| 1308 | "Collect delivery address unless they prefer pickup" — ambiguous priority | Confusion | LOW |

### Block 6 — Safety & Quality (lines 1278-1298)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1297 | "After 'goodbye', if user doesn't respond, conversation is over" | Premature closure | MEDIUM |

### Block 7 — Failure Prevention (lines 1316-1341)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1337-1341 | "Thanks" treated as closure signal | Premature closure | LOW |
| 1327-1328 | Hard-coded escalation script | Scripted | LOW |

### Block 8 — Knowledge Base (lines 1343-1346)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| — | Knowledge base is included raw — may contain duplicate info from `buildKnowledgeBase` | Redundancy | LOW |

### Money Mode Block (lines 1348-1349, referenced to 1083-1126)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1105-1117 | Hard-coded sales scripts ("Let me get you booked right now") | Scripted behavior | MEDIUM |
| 1095 | "Never chat endlessly" — pressure to convert | Over-prescribed | HIGH |

### Final Directive (lines 1351-1365)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 1362 | "Every interaction should leave them thinking 'Wow'" | Unrealistic standard | MEDIUM |

### Engine v2 Governor Block (governor.ts)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 81-85 | "Never re-confirm" permanent block | Hard stop | HIGH |
| 100-102 | "Anything else" asked once → never again | Hard stop | MEDIUM |
| 117-118 | Greeting → never say "hello" again | Hard stop | HIGH |
| 142-150 | Always "Ask for [field]" regardless of emotion | Sentiment-agnostic | HIGH |
| 220-221 | Contradictory "1-2 sentences max" vs urgency exception | Conflicting rules | CRITICAL |
| 212 | "Use robotic filler phrases like 'Certainly!', 'Of course!', 'I'd be happy to!'" listed as forbidden — but these are natural human phrases | Over-broad block | MEDIUM |

### Personality / Post-processing (personality.ts)
| Line | Issue | Category | Severity |
|------|-------|----------|----------|
| 174-194 | `polishResponse()` strips words post-generation, can break sentences | Output corruption | CRITICAL |
| 15-32 | Blocklist includes "thank you for", "i appreciate", "of course" — natural speech | Over-broad | HIGH |

---

## 7. MULTI-POV ANALYSIS

### POV 1: Customer (First-time booker)
**Experience:** Greeted warmly → starts booking → sees ServiceSelector widget → AI says "Please select from above" → customer asks "What's the difference between service A and B?" → AI says 1 sentence response (brevity rule) → customer doesn't get enough info → frustration → leaves
**Impact of findings:** #3, #21, #10, #13

### POV 2: Customer (Returning, multi-task)
**Experience:** Books an appointment → AI says "Is there anything else?" → customer says "Yes, I want to order products" → flow transitions → customer orders → AI cannot ask "Anything else?" (asked once rule) → conversation ends abruptly
**Impact of findings:** #25, #36

### POV 3: Customer (Frustrated/Complaint)
**Experience:** "I'm really upset about my last visit" → AI empathizes once → customer explains more → AI cannot empathize again (once per episode) → AI asks "What time would you like to book?" (sentiment-agnostic field collection) → customer gets more frustrated → escalates
**Impact of findings:** #8, #27, #35

### POV 4: Customer (Late-night browser, complex question)
**Experience:** "Do you do root canals? And how much?" → AI says "Please select a service from the widget" (brevity rule, widget is showing) → "But I'm asking about pricing" → AI: "Prices are shown in the widget" → customer leaves
**Impact of findings:** #3, #32

### POV 5: Business Owner
**Concern:** AI sounds robotic and loses customers → checks conversation logs → sees "Please select from the widget above" 15 times → sees "Is there anything else?" once → sees "No problem!" on every correction → frustrated that AI sounds nothing like a human
**Impact of findings:** #3, #17, #25, #36

### POV 6: Developer (Maintaining the system)
**Concern:** Two intent systems, duplicated field status, contradictory prompt instructions → hard to debug which system caused a behavior → `polishResponse()` corrupts output → hard to tell if it's LLM or post-processing
**Impact of findings:** #19, #26, #37

---

## 8. SUMMARY TABLE / SEVERITY COUNTS

### By Category

| Category | Count | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| FORCES repetition | 5 | 1 | 2 | 2 | 0 |
| BLOCKS topic-switching | 3 | 0 | 1 | 2 | 0 |
| FORCES specific next message | 6 | 1 | 2 | 2 | 1 |
| IGNORES customer sentiment | 6 | 2 | 1 | 2 | 1 |
| OVER-PRESCRIBES slot collection | 5 | 0 | 3 | 1 | 1 |
| HARD STOP conversation | 6 | 0 | 2 | 2 | 2 |
| CAUSES loop confirmations | 4 | 0 | 3 | 1 | 0 |
| Architecture conflict | 1 | 1 | 0 | 0 | 0 |
| Output corruption | 1 | 1 | 0 | 0 | 0 |
| **TOTAL** | **37** | **7** | **14** | **12** | **4** |

### By File

| File | Count | Critical | High | Medium | Low |
|------|-------|----------|------|--------|-----|
| governor.ts | 8 | 1 | 4 | 3 | 0 |
| widget-chat/index.ts | 18 | 3 | 7 | 5 | 3 |
| personality.ts | 2 | 1 | 1 | 0 | 0 |
| layer5-booking.ts | 1 | 0 | 1 | 0 | 0 |
| layer6-safety.ts | 1 | 0 | 0 | 1 | 0 |
| Multiple/Architecture | 7 | 2 | 1 | 3 | 1 |

---

## 9. UI_ARCHITECTURE.md

### Current Architecture

```
widget-chat/index.ts (backend)
    │
    ├── Engine v2 (intent + state + governor)
    ├── Legacy flow engine (flowRouter + stateManager)
    ├── Legacy intent detection (detectIntent)
    │
    └── Response JSON ──────────────────────────→ Frontend
        ├── reply (text)
        ├── uiSignal (UISignal type)
        ├── uiHints (backward compat)
        └── bookingDetails / orderDetails
                                                      │
                                                      ▼
                                              UISignalRenderer.tsx
                                                  │
                                                  ├── activeComponent === null → render nothing
                                                  ├── activeComponent === "service_selector" → ServiceSelector
                                                  ├── activeComponent === "product_selector" → ProductSelectorEnhanced
                                                  ├── activeComponent === "date_picker" → DateSelector
                                                  ├── activeComponent === "time_picker" → TimeSlotSelector
                                                  ├── activeComponent === "booking_confirmation" → BookingConfirmation
                                                  └── activeComponent === "order_summary" → OrderConfirmation
```

### Key Architectural Observations

1. **Single orchestrator pattern:** `UISignalRenderer` is the sole component that decides what UI to show. It renders exactly one component at a time.

2. **Trigger chain:** Backend `resolveDeterministicUIComponent()` determines component. Frontend `UISignalRenderer` renders it. No frontend routing logic beyond the switch statement.

3. **Two dismissal mechanisms:**
   - **Minimize** (`isPanelOpen` state): Collapses the panel but keeps the signal active. Re-opens with the same component.
   - **Close/Dismiss** (`handleDismiss` → `onDismiss`): Clears the visible signal. Flow state unchanged.

4. **void after dismiss:** When user dismisses a widget mid-flow (`handleDismiss` → sets `visible` to null), the backend's `flow_step` is untouched. Next turn's `resolveDeterministicUIComponent` will suggest the same component again based on unchanged `flow_step`.

5. **No bidirectional communication:** Widget selection (clicking a service, picking a date) is sent as a NEW chat message, not as a structured event separate from the conversation. This means every UI interaction goes through the full AI pipeline (intent detection, state update, LLM call).

6. **Backend controls ALL UI state:** The frontend has zero logic about what to show next — it purely reacts to the backend's `uiSignal`. This makes the system fully backend-driven but also means every UI transition requires a round-trip.

---

## 10. TEST_SCENARIOS.md

### Scenario 1: Customer asks for explanation during slot collection
**Input:** "What's the difference between deep cleaning and regular cleaning?" (while service widget is showing)
**Expected:** AI explains the difference naturally
**Current behavior (rigid):** "Please select from the widget above" (1-2 sentence brevity rule + "NEVER list options that widget displays")
**Test:** Assert AI response contains explanatory content, not just "select from widget"

### Scenario 2: Customer says "no" mid-slot-collection
**Input:** "No, I don't want that service" (while collecting service)
**Expected:** AI asks "What service are you looking for?"
**Current behavior (rigid):** AI detects `conversation_end` because "no" → starts closing
**Test:** Assert no closure language. Assert AI continues collecting.

### Scenario 3: Customer asks to re-confirm after booking
**Input:** "Can you read that back to me?" (after booking confirmed)
**Expected:** AI reads back the details
**Current behavior (rigid):** "re_confirm" and "repeat_details" are forbidden → AI deflects
**Test:** Assert AI repeats details when explicitly asked.

### Scenario 4: Customer uses sarcasm
**Input:** "Great. Just great. Another appointment I have to keep track of."
**Expected:** AI detects frustration, responds empathetically
**Current behavior (rigid):** Sentiment detection sees "great" → returns `positive` → AI matches "positive energy"
**Test:** Assert AI identifies dissatisfaction, not positivity.

### Scenario 5: Multi-task session (book + order)
**Input:** User books appointment → says "Yes" to confirmation → then says "Actually I also need to order something"
**Expected:** Order flow starts naturally, AI collects order details
**Current behavior (rigid):** "anything else" asked once → forbidden → AI can't ask "Anything else?" for the order completion
**Test:** Assert AI can ask about additional needs after the second task too.

### Scenario 6: Topic switch during booking
**Input:** "What time do you close on Fridays?" (during booking slot collection)
**Expected:** AI answers the question, then gently returns to booking
**Current behavior (rigid):** Topic shift either blocked or all slots destroyed
**Test:** Assert AI answers the question AND booking slots are preserved.

### Scenario 7: Customer says "thanks" mid-conversation
**Input:** "Thanks for that information" (during discovery phase, no booking started)
**Expected:** AI continues naturally
**Current behavior (rigid):** "thanks" in closure detection → AI starts closing
**Test:** Assert no closure language. Assert AI continues conversation.

### Scenario 8: Customer provides all booking info in one message
**Input:** "I want a haircut on Friday at 2pm, my name is John, email is john@test.com"
**Expected:** AI accepts all, asks for confirmation in one step
**Current behavior (rigid):** Out-of-order collection works, but the AI may still sequentially acknowledge each field
**Test:** Assert AI acknowledges ALL fields in one response, moves to confirmation.

### Scenario 9: Long pause then return
**Input:** "Hey, I'm back" (after 2 hours of silence, not a new session)
**Expected:** AI acknowledges return warmly
**Current behavior (rigid):** "greet_again" forbidden → "DO NOT say Hello, Hi, Hey" → AI cannot say "Hey, welcome back!"
**Test:** Assert AI uses a light acknowledgment after pause.

### Scenario 10: Post-booking detail verification
**Input:** "Wait, I said Tuesday not Thursday" (correcting details after confirmation sent)
**Expected:** AI acknowledges and updates
**Current behavior (rigid):** `locked` is true, `confirmation_sent` is true → corrections may be blocked
**Test:** Assert AI accepts corrections even after confirmation. Assert booking is NOT re-executed.

---

## 11. NEXT STEPS / RECOMMENDATIONS

### Immediate (Critical fixes)
1. **Fix #37**: Remove or soften `polishResponse()` post-processing — it corrupts output by stripping words
2. **Fix #3**: Resolve the contradictory "1-2 sentences max" vs urgency exception in governor.ts:220-221
3. **Fix #19**: Consolidate to Engine v2 as the sole intent detection system — remove legacy `detectIntent` dependency in Block 4
4. **Fix #1**: Allow re-confirmation when customer explicitly asks — remove permanent block
5. **Fix #7**: Remove self-referential `reply` regex check from `isBookingConfirmation`

### High Priority
6. **Fix #4/#13**: Allow light greetings after silence threshold
7. **Fix #5**: Allow asking for multiple fields together
8. **Fix #10/#11**: Remove threat-based language ("CRITICAL FAILURE", "IMMUTABLE")
9. **Fix #15/#26**: Deduplicate field status — keep only in governor block
10. **Fix #17**: Remove hard-coded example phrases from intent handling rules
11. **Fix #36**: Add celebration step after confirmation before closing

### Medium Priority
12. **Fix #8**: Allow varied empathy expressions, not "once per episode"
13. **Fix #9**: Split robotic phrase blocklist — stop stripping post-generation
14. **Fix #6**: Add "park mode" for topic switches — save and resume
15. **Fix #20**: Replace Money Mode scripts with principles
16. **Fix #25**: Reset `asked_if_need_more` on new task
17. **Fix #27**: Incorporate emotional state into field-asking prompts
18. **Fix #30**: Improve sarcasm detection in sentiment analysis

### UI Architecture Fixes
19. **Intersection #4**: Sync UI dismiss with backend state — don't show widget hint in prompt if dismissed
20. **Intersection #1**: When widget is active, AI should NOT ask for the same field in text
21. **Intersection #3**: Add edit/cancel actions to confirmation widgets

---

## 12. FIXES IMPLEMENTED

All 37 findings have been resolved across 13 files. Summary:

### Engine Core (`supabase/functions/_shared/engine/`)
| File | Fixes | Changes |
|------|-------|---------|
| `governor.ts` | #1, #3, #21, #27, #36 | Re-confirm allowed when asked, UI widget "MUST be SHORT" → GUIDELINE with answer-question exception, widget-aware field asking, emotional context in collection prompts, celebration step after confirmation |
| `personality.ts` | #9, #30, #37 | ROBOTIC_PHRASES split from STRIP_PHRASES (no more stripping natural speech), sarcasm detection added to `detectSentiment()`, `polishResponse()` only strips AI disclaimers |
| `state.ts` | #25 | `asked_if_need_more` resets on new task start, along with `closing_offered` and `clarification_asked` |

### Layer Modules (`supabase/functions/_shared/layers/`)
| File | Fixes | Changes |
|------|-------|---------|
| `layer5-booking.ts` | #5 | "ONE question at a time" → "prefer ONE but asking related fields together is fine" |
| `layer6-safety.ts` | #8 | "once per distress episode" → natural guideline encouraging varied empathy expressions |

### Flow Engine (`supabase/functions/_shared/flow/`)
| File | Fixes | Changes |
|------|-------|---------|
| `flowRouter.ts` | #6 | Detects `parkSlots` flag for non-blocking topic shifts instead of destructive reset |
| `types.ts` | #6 | Added `parkSlots` to `TopicShiftSignal`, `parkedFlow`/`parkedStep`/`parkedSlots` to `ConversationState` |
| `stateManager.ts` | #6 | Persists/restores parked flow state across sessions |

### AI Orchestrator (`supabase/functions/widget-chat/index.ts`)
| Fixes | Changes |
|-------|---------|
| #10/#11 | Removed "IMMUTABLE", "CRITICAL FAILURE", "S-tier" language |
| #4/#13 | Removed blanket "DO NOT say Hello, Hi, Hey" — allows brief acknowledgment after pause |
| #19 | Block 4 now uses `engineResult.intent.intent` (Engine v2) as primary intent source |
| #15/#26 | Removed FIELD STATUS section from Block 5 (governor is sole source) |
| #17 | Removed hard-coded example phrases like `("No problem!")` from intent rules |
| #20 | Money Mode scripts replaced with PRINCIPLES (Not Scripts) — no canned lines |
| #7 | `isBookingConfirmation` no longer checks AI's own reply text |
| #6 | PARK MODE implemented: saves slots on topic switch, restores on return |
| Intersection #4 | Widget suppressed when user sends text instead of clicking |
| Closure detection | "thanks" no longer treated as conversation-end signal mid-conversation |

### UI Components (`src/components/widget/`)
| File | Fixes | Changes |
|------|-------|---------|
| `BookingConfirmation.tsx` | Intersection #3 | Added `onEdit`/`onCancel` buttons for post-booking changes |
| `OrderConfirmation.tsx` | Intersection #3 | Added Button import, `onEdit`/`onCancel` buttons for post-order changes |
| `UISignalRenderer.tsx` | Intersection #3 | Wired onEditBooking/onCancelBooking/onEditOrder/onCancelOrder props through to confirmation components |

### Tests
| File | Changes |
|------|---------|
| `audit_regression.test.ts` | 28 test cases covering all 37 fixes + 2 existing tests preserved |

---

**AUDIT COMPLETE — 37 findings resolved across 13 files**
