/**
 * Conversational interview fallback — deterministic, offline-safe.
 *
 * Used when the `configurator-chat` edge function (Rutex gateway) is
 * unreachable. Asks ONE focused question at a time in the same slot order
 * the gateway interviewer uses, so the chat never dead-ends and the
 * transcript stays compatible with `propose-operator-plan`.
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
};

function detect(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function extractSlots(transcript: string, businessTypeHint: string): InterviewSlots {
  const t = transcript.toLowerCase();
  return {
    business_type: businessTypeHint || null,
    offers: detect(t, [/we (do|offer|sell|provide)/, /service/, /product/, /menu/, /treatment/, /class/, /repair/, /consult/]) ? "mentioned" : null,
    how_customers_transact: detect(t, [/book/, /appoint/, /order/, /walk.?in/, /call/, /whatsapp/, /website/, /dm/]) ? "mentioned" : null,
    hours: detect(t, [/\d\s?(am|pm)/, /open/, /close/, /hour/, /monday|tuesday|wednesday|thursday|friday|saturday|sunday/, /closed/]) ? "mentioned" : null,
    prices: detect(t, [/₦|\$|€|£|price|cost|charge|fee|rate|deposit|percent|%/]) ? "mentioned" : null,
    policies: detect(t, [/cancel/, /deposit/, /no.?show/, /refund/, /late/, /policy/, /require/]) ? "mentioned" : null,
    contact: detect(t, [/\d{7,}/, /@/, /whatsapp/, /phone/, /email/, /address|street|road|avenue|lagos|abuja/]) ? "mentioned" : null,
    tone_preference: detect(t, [/friendly|warm|casual/, /professional|formal/, /playful|fun/]) ? "mentioned" : null,
  };
}

function buildSummary(ownerMessages: string[], businessTypeHint: string): string {
  const joined = ownerMessages.join(" ").slice(0, 900);
  return businessTypeHint
    ? `${businessTypeHint}. Owner described: ${joined || "nothing yet"}`.slice(0, 1000)
    : `Owner described: ${joined || "nothing yet"}`.slice(0, 1000);
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
  const slots = extractSlots(transcript, businessTypeHint);
  const count = ownerMessages.length;

  const firstName = businessName ? ` for ${businessName}` : "";
  let assistant_message: string;

  if (count === 0) {
    assistant_message = businessTypeHint
      ? `Lovely — a ${businessTypeHint}${firstName}. What do you offer, and how do customers usually reach you to book or buy?`
      : `Welcome! Tell me what your business does, and how customers usually reach you to book or buy.`;
  } else if (!slots.how_customers_transact) {
    assistant_message = "Got it. And how do customers transact with you today — bookings, orders, walk-ins, calls, or WhatsApp?";
  } else if (!slots.hours) {
    assistant_message = "Helpful. What hours are you open, and are there busy days or days you close?";
  } else if (!slots.prices) {
    assistant_message = "Noted. Do you have standard prices or a range I should know, and do you take deposits?";
  } else if (!slots.policies) {
    assistant_message = "Almost there. Any policies that matter — cancellations, no-shows, refunds, or late arrivals?";
  } else if (!slots.contact) {
    assistant_message = "Last one: what contact details should customers use, and what tone fits you best — warm and friendly, or professional?";
  } else {
    assistant_message = "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
  }

  const essentials = slots.business_type && (slots.offers || count >= 2) && slots.how_customers_transact;
  const extras = [slots.hours, slots.prices, slots.policies, slots.contact].filter(Boolean).length;
  const ready = Boolean(essentials && (extras >= 1 || count >= 6));

  if (ready) {
    assistant_message = "That's everything I need. I'll put together your AI operator plan now — review it, and we'll make it live together.";
  }

  return {
    assistant_message,
    slots: { ...EMPTY_SLOTS, ...slots },
    ready,
    summary: buildSummary(ownerMessages, businessTypeHint),
  };
}
