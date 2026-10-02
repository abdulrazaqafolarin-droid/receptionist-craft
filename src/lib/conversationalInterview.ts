/**
 * Conversational interview fallback — deterministic, offline-safe.
 *
 * Used when the `configurator-chat` edge function (Rutex gateway) is
 * unreachable. Asks ONE focused question at a time. Detects whether the
 * owner wants a customer receptionist (bookings/orders) or a different
 * kind of operator (content, social posts, reminders, general help) and
 * follows the matching track — never force-fits one into the other.
 * Never promises auto-posting, account access, or connectors.
 *
 * Business language only. No technical jargon.
 */

export interface InterviewSlots {
  business_type: string | null;
  offers: string | null;
  how_customers_transact: string | null;
  hours: string | null;
  prices: string | null;
  policies: string | null;
  contact: string | null;
  tone_preference: string | null;
  operator_kind: "receptionist" | "assistant" | "both" | null;
  core_need: string | null;
  external_needs: string[];
}

export interface InterviewTurn {
  assistant_message: string;
  slots: InterviewSlots;
  ready: boolean;
  summary: string;
}

const EMPTY_SLOTS: InterviewSlots = {
  business_type: null,
  offers: null,
  how_customers_transact: null,
  hours: null,
  prices: null,
  policies: null,
  contact: null,
  tone_preference: null,
  operator_kind: null,
  core_need: null,
  external_needs: [],
};

const ASSISTANT_HINTS = [
  /tiktok/i, /instagram/i, /youtube/i, /social/i, /post/i, /content/i,
  /caption/i, /followers/i, /remind/i, /reminder/i, /video/i, / reels/i,
  /publish/i, /marketing/i,
];

const BOOKING_HINTS = [
  /book/i, /appoint/i, /order/i, /schedul/i, /reserv/i, /client/i,
  /customer/i, /patient/i, /walk.?in/i, /shop/i, /store/i, /salon/i,
  /clinic/i, /restaurant/i,
];

function detect(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export type OwnerSignal = "greeting" | "confusion" | "junk" | "substantive";

const GREETING_PATTERNS = [
  /^(hi|hey|hello|yo|how far|good (morning|afternoon|evening|day)|greetings|sup)\b/i,
];

const CONFUSION_PATTERNS = [
  /\?\?\s*$/, /^(huh|what|eh|sorry)\?*$/i, /don'?t understand/i, /don'?t get/i,
  /what do you mean/i, /confus/i, /explain/i, /simpler/i, /break it down/i,
  /i['’]m lost/i, /no idea what/i, /^\?+$/,
];

/**
 * Classify one owner message. Junk (empty/punctuation-only) and greetings
 * carry no business content; confusion needs a simpler rephrase, never a
 * verbatim repeat of the question that confused them.
 */
export function classifyOwnerMessage(text: string): OwnerSignal {
  const t = text.trim();
  if (!t || t.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return "junk";
  if (CONFUSION_PATTERNS.some((p) => p.test(t))) return "confusion";
  if (GREETING_PATTERNS.some((p) => p.test(t)) && t.length < 30) return "greeting";
  return "substantive";
}

/** Messages that advance the interview (drives readiness + counts). */
export function isSubstantive(text: string): boolean {
  return classifyOwnerMessage(text) === "substantive";
}

function detectKind(transcript: string, businessTypeHint: string): "receptionist" | "assistant" | "both" {
  const t = `${businessTypeHint} ${transcript}`;
  const assistant = detect(t, ASSISTANT_HINTS);
  const booking = detect(t, BOOKING_HINTS);
  if (assistant && booking) return "both";
  if (assistant) return "assistant";
  return "receptionist";
}

function extractSlots(transcript: string, businessTypeHint: string): InterviewSlots {
  const t = transcript.toLowerCase();
  const kind = ownerSaidEnough(transcript) || businessTypeHint ? detectKind(transcript, businessTypeHint) : null;
  const external_needs: string[] = [];
  if (detect(t, [/tiktok/i]) && detect(t, [/post|publish|upload|auto/i])) {
    external_needs.push("tiktok-auto-post");
  }
  if (detect(t, [/instagram/i]) && detect(t, [/post|publish|upload|auto/i])) {
    external_needs.push("instagram-auto-post");
  }
  return {
    business_type: businessTypeHint || null,
    offers: detect(t, [/we (do|offer|sell|provide)/, /service/, /product/, /menu/, /treatment/, /class/, /repair/, /consult/]) ? "mentioned" : null,
    how_customers_transact: detect(t, [/book/, /appoint/, /order/, /walk.?in/, /call/, /whatsapp/, /website/, /dm/]) ? "mentioned" : null,
    hours: detect(t, [/\d\s?(am|pm)/, /open/, /close/, /hour/, /monday|tuesday|wednesday|thursday|friday|saturday|sunday/, /closed/]) ? "mentioned" : null,
    prices: detect(t, [/₦|\$|€|£|price|cost|charge|fee|rate|deposit|percent|%/]) ? "mentioned" : null,
    policies: detect(t, [/cancel/, /deposit/, /no.?show/, /refund/, /late/, /policy/, /require/]) ? "mentioned" : null,
    contact: detect(t, [/\d{7,}/, /@/, /whatsapp/, /phone/, /email/, /address|street|road|avenue|lagos|abuja/]) ? "mentioned" : null,
    tone_preference: detect(t, [/friendly|warm|casual/, /professional|formal/, /playful|fun/]) ? "mentioned" : null,
    operator_kind: kind,
    core_need: kind === "assistant" || kind === "both" ? transcript.slice(0, 300) : null,
    external_needs,
  };
}

function ownerSaidEnough(transcript: string): boolean {
  return transcript.trim().length > 0;
}

function buildSummary(ownerMessages: string[], businessTypeHint: string, kind: InterviewSlots["operator_kind"]): string {
  const joined = ownerMessages.join(" ").slice(0, 900);
  const scope = kind === "assistant"
    ? "Owner wants a helper operator (not customer bookings). "
    : kind === "both"
      ? "Owner wants a receptionist plus another helper job. "
      : "";
  return businessTypeHint
    ? `${scope}${businessTypeHint}. Owner described: ${joined || "nothing yet"}`.slice(0, 1000)
    : `${scope}Owner described: ${joined || "nothing yet"}`.slice(0, 1000);
}

type QuestionKey =
  | "transact" | "hours" | "prices" | "policies" | "contact"
  | "platform" | "rhythm" | "context" | "dropoff";

const QUESTION_TEXT: Record<QuestionKey, { full: string; simple: string; example: string }> = {
  transact: {
    full: "Got it. And how do customers transact with you today — bookings, orders, walk-ins, calls, or WhatsApp?",
    simple: "How do people buy from you today?",
    example: `For example: "people walk in", "they WhatsApp me to book", or "they order on my website".`,
  },
  hours: {
    full: "Helpful. What hours are you open, and are there busy days or days you close?",
    simple: "When are you open?",
    example: `For example: "Monday to Saturday, 9am to 6pm, closed Sundays".`,
  },
  prices: {
    full: "Noted. Do you have standard prices or a range I should know, and do you take deposits?",
    simple: "What do you charge?",
    example: `For example: "haircuts 3k, beard trim 1500, no deposit".`,
  },
  policies: {
    full: "Almost there. Any policies that matter — cancellations, no-shows, refunds, or late arrivals?",
    simple: "Any rules customers should know?",
    example: `For example: "cancel 24 hours ahead" or "no refunds on deposits". If none, just say "no rules".`,
  },
  contact: {
    full: "Last one: what contact details should customers use, and what tone fits you best — warm and friendly, or professional?",
    simple: "How should people reach you?",
    example: `For example: "WhatsApp 0803..., warm and friendly".`,
  },
  platform: {
    full: "Love it. Which platform is this for — TikTok, Instagram, somewhere else — and who are you trying to reach?",
    simple: "Where will the posts go, and who should see them?",
    example: `For example: "TikTok, young women who buy skincare".`,
  },
  rhythm: {
    full: "Got it. How often do you want to post — daily, a few times a week — and what does a good post look like for you?",
    simple: "How often do you want to post?",
    example: `For example: "daily" or "three times a week".`,
  },
  context: {
    full: "Helpful. Tell me a little about the business behind the posts so the ideas actually fit you.",
    simple: "What does your business do, in one line?",
    example: `For example: "I sell handmade soaps in Lagos".`,
  },
  dropoff: {
    full: "Last one: where should reminders and drafts go — WhatsApp, and what tone should everything carry?",
    simple: "Where should I send your drafts and reminders?",
    example: `For example: "WhatsApp, friendly tone".`,
  },
};

function receptionistKey(slots: InterviewSlots): QuestionKey | null {
  if (!slots.how_customers_transact) return "transact";
  if (!slots.hours) return "hours";
  if (!slots.prices) return "prices";
  if (!slots.policies) return "policies";
  if (!slots.contact) return "contact";
  return null;
}

function assistantKey(slots: InterviewSlots, ownerMessages: string[]): QuestionKey | null {
  const t = ownerMessages.join(" ").toLowerCase();
  const hasRhythm = /daily|weekly|every ?day|twice|often|schedule|calendar|timetable/.test(t);
  const hasPlatform = /tiktok|instagram|youtube|facebook|whatsapp/.test(t);
  const hasContext = ownerMessages.filter(isSubstantive).length >= 2 && t.length > 40;
  if (!hasPlatform) return "platform";
  if (!hasRhythm) return "rhythm";
  if (!hasContext) return "context";
  if (!slots.contact) return "dropoff";
  return null;
}

/**
 * Given the owner's messages so far, produce the next interviewer turn.
 * Pure function — no network, no side effects.
 */
export function nextInterviewTurn(
  ownerMessages: string[],
  businessName: string,
  businessTypeHint: string,
): InterviewTurn {
  const transcript = ownerMessages.join("\n");
  const count = ownerMessages.length;
  const substantiveCount = ownerMessages.filter(isSubstantive).length;
  const lastSignal = count === 0 ? null : classifyOwnerMessage(ownerMessages[ownerMessages.length - 1]);
  const kind = count === 0 && !businessTypeHint
    ? null
    : detectKind(transcript, businessTypeHint);

  const firstName = businessName ? ` for ${businessName}` : "";
  const slots = extractSlots(transcript, businessTypeHint);
  let key: QuestionKey | null = null;
  let assistant_message: string;

  if (count === 0) {
    assistant_message = businessTypeHint
      ? `Lovely — ${businessTypeHint}${firstName}. What should your AI operator do for you: look after customers (bookings, orders, questions), help with something like content or reminders, or both?`
      : `Welcome! What would you like your AI operator to do for you — look after customers, help with things like content and reminders, or both?`;
  } else if (lastSignal === "junk") {
    // A tap, a stray mark, an empty send — never pretend content arrived.
    assistant_message = "I'm here — just tell me about your business in your own words, and we'll take it one small question at a time.";
  } else if (kind === "assistant") {
    key = assistantKey(slots, ownerMessages);
    if (key) {
      const q = QUESTION_TEXT[key];
      assistant_message = (substantiveCount <= 1 ? "Yes — I can set that up for you. " : "") + q.full +
        " One honest note: I can draft ideas, captions, and checklists and remind you to post, but actually publishing needs a social connector that isn't attached yet.";
      if (lastSignal === "confusion") {
        assistant_message = `No worries — simpler version: ${q.simple} ${q.example}`;
      } else if (lastSignal === "greeting") {
        assistant_message = `Hello! Great to meet you. ${q.simple} ${q.example}`;
      }
    } else {
      assistant_message = "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
    }
  } else {
    if (kind === "both" && !slots.how_customers_transact) {
      assistant_message = "Two jobs then — customers plus the extra help. Let's start with customers: how do they transact with you today — bookings, orders, walk-ins, or calls?";
      if (lastSignal === "confusion") {
        assistant_message = `No worries — simpler version: ${QUESTION_TEXT.transact.simple} ${QUESTION_TEXT.transact.example}`;
      }
    } else {
      key = receptionistKey(slots);
      if (key) {
        const q = QUESTION_TEXT[key];
        assistant_message = q.full;
        if (lastSignal === "confusion") {
          assistant_message = `No worries — simpler version: ${q.simple} ${q.example}`;
        } else if (lastSignal === "greeting") {
          assistant_message = `Hello! Great to meet you. ${q.simple} ${q.example}`;
        }
      } else {
        assistant_message = kind === "both"
          ? "Customers are covered. I'll fold the extra help into the plan too — review it, and we'll make it live together."
          : "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
      }
    }
  }

  const essentials = kind === "assistant"
    ? slots.core_need && (slots.contact || [slots.prices, slots.hours].some(Boolean) || substantiveCount >= 3)
    : kind === "both"
      ? slots.how_customers_transact && (slots.contact || slots.hours || substantiveCount >= 4)
      : slots.business_type && (slots.offers || substantiveCount >= 2) && slots.how_customers_transact &&
        ([slots.hours, slots.prices, slots.policies, slots.contact].filter(Boolean).length >= 1 || substantiveCount >= 6);

  const ready = Boolean(essentials) && key === null && lastSignal === "substantive";

  return {
    assistant_message,
    slots: { ...EMPTY_SLOTS, ...slots },
    ready,
    summary: buildSummary(ownerMessages, businessTypeHint, kind),
  };
}
