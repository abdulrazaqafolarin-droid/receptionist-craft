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

function receptionistQuestion(slots: InterviewSlots): string | null {
  if (!slots.how_customers_transact) {
    return "Got it. And how do customers transact with you today — bookings, orders, walk-ins, calls, or WhatsApp?";
  }
  if (!slots.hours) {
    return "Helpful. What hours are you open, and are there busy days or days you close?";
  }
  if (!slots.prices) {
    return "Noted. Do you have standard prices or a range I should know, and do you take deposits?";
  }
  if (!slots.policies) {
    return "Almost there. Any policies that matter — cancellations, no-shows, refunds, or late arrivals?";
  }
  if (!slots.contact) {
    return "Last one: what contact details should customers use, and what tone fits you best — warm and friendly, or professional?";
  }
  return null;
}

function assistantQuestion(slots: InterviewSlots, ownerMessages: string[]): string | null {
  const t = ownerMessages.join(" ").toLowerCase();
  const hasRhythm = /daily|weekly|every ?day|twice|often|schedule|calendar|timetable/.test(t);
  const hasPlatform = /tiktok|instagram|youtube|facebook|whatsapp/.test(t);
  const hasContext = ownerMessages.length >= 2 && t.length > 40;
  if (!hasPlatform) {
    return "Love it. Which platform is this for — TikTok, Instagram, somewhere else — and who are you trying to reach?";
  }
  if (!hasRhythm) {
    return "Got it. How often do you want to post — daily, a few times a week — and what does a good post look like for you?";
  }
  if (!hasContext) {
    return "Helpful. Tell me a little about the business behind the posts so the ideas actually fit you.";
  }
  if (!slots.contact) {
    return "Last one: where should reminders and drafts go — WhatsApp, and what tone should everything carry?";
  }
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
  const kind = count === 0 && !businessTypeHint
    ? null
    : detectKind(transcript, businessTypeHint);

  const firstName = businessName ? ` for ${businessName}` : "";
  let assistant_message: string;
  let next: string | null = null;

  if (count === 0) {
    assistant_message = businessTypeHint
      ? `Lovely — ${businessTypeHint}${firstName}. What should your AI operator do for you: look after customers (bookings, orders, questions), help with something like content or reminders, or both?`
      : `Welcome! What would you like your AI operator to do for you — look after customers, help with things like content and reminders, or both?`;
  } else if (kind === "assistant") {
    const slots = extractSlots(transcript, businessTypeHint);
    next = assistantQuestion(slots, ownerMessages);
    if (next) {
      assistant_message = (count === 1 ? "Yes — I can set that up for you. " : "") + next +
        (count === 1 ? " One honest note: I can draft ideas, captions, and checklists and remind you to post, but actually publishing needs a social connector that isn't attached yet." : "");
    } else {
      assistant_message = "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
    }
  } else {
    const slots = extractSlots(transcript, businessTypeHint);
    if (kind === "both" && !slots.how_customers_transact) {
      assistant_message = "Two jobs then — customers plus the extra help. Let's start with customers: how do they transact with you today — bookings, orders, walk-ins, or calls?";
    } else {
      next = receptionistQuestion(slots);
      assistant_message = next || "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
    }
    if (kind === "both" && next === null) {
      assistant_message = "Customers are covered. I'll fold the extra help into the plan too — review it, and we'll make it live together.";
    }
  }

  const slots = extractSlots(transcript, businessTypeHint);
  const essentials = kind === "assistant"
    ? slots.core_need && (slots.contact || [slots.prices, slots.hours].some(Boolean) || count >= 3)
    : kind === "both"
      ? slots.how_customers_transact && (slots.contact || slots.hours || count >= 4)
      : slots.business_type && (slots.offers || count >= 2) && slots.how_customers_transact &&
        ([slots.hours, slots.prices, slots.policies, slots.contact].filter(Boolean).length >= 1 || count >= 6);

  const ready = Boolean(essentials) && next === null;

  return {
    assistant_message,
    slots: { ...EMPTY_SLOTS, ...slots },
    ready,
    summary: buildSummary(ownerMessages, businessTypeHint, kind),
  };
}
