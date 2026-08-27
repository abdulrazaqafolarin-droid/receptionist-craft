/**
 * Module 17: Customer Feedback / Survey
 *
 * Sends satisfaction surveys after appointments or purchases.
 * Collects and scores feedback. Builds a feedback history.
 *
 * Tier 1: Email/SMS connected — sends + tracks automatically
 * Tier 2: No channel — drafts surveys, tracks manually-entered responses
 * Tier 3: No channel — drafts only
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailMessage } from "../channels/emailSender.ts";
import { sendSms } from "../channels/smsSender.ts";

export interface SurveyConfig {
  questions: Array<{
    id: string;
    text: string;
    type: "rating_1_5" | "yes_no" | "text";
    required: boolean;
  }>;
  trigger: "after_appointment" | "after_order" | "manual";
  delay_hours: number;
  channels: ("email" | "sms")[];
}

export interface SurveyResponse {
  survey_id: string;
  customer_id: string;
  answers: Record<string, string | number>;
  sentiment: "positive" | "neutral" | "negative";
  nps_score?: number;         // 0-10
  submitted_at: string;
}

const DEFAULT_SURVEY: SurveyConfig = {
  questions: [
    { id: "overall", text: "How was your experience?", type: "rating_1_5", required: true },
    { id: "recommend", text: "Would you recommend us to a friend? (0-10)", type: "rating_1_5", required: true },
    { id: "improve", text: "What could we improve?", type: "text", required: false },
  ],
  trigger: "after_appointment",
  delay_hours: 2,
  channels: ["email"],
};

/**
 * Send a feedback survey to a customer.
 */
export async function sendSurvey(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  customerId: string,
  config: Partial<SurveyConfig> = {},
): Promise<{ tier: 1 | 2 | 3; sent: boolean; survey_id: string; draft?: string }> {
  const surveyConfig = { ...DEFAULT_SURVEY, ...config };

  // Load customer
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .maybeSingle();

  if (!customer) return { tier: 3, sent: false, survey_id: "", draft: "Customer not found" };

  // Load business name
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name")
    .eq("id", receptionistId)
    .maybeSingle();

  const businessName = rec?.business_name || "our business";

  // Build survey link (or inline questions)
  const surveyQuestions = surveyConfig.questions
    .map((q) => `${q.text} ${q.type === "rating_1_5" ? "(1-5)" : q.type === "yes_no" ? "(yes/no)" : ""}`)
    .join("\n");

  const surveyBody = `Hi ${customer.name || "there"},\n\nHow was your experience with ${businessName}?\n\n${surveyQuestions}\n\nReply to this message with your answers. Thank you for your feedback!`;

  // Try email first, then SMS
  let tier: 1 | 2 | 3 = 3;
  let sent = false;

  if (surveyConfig.channels.includes("email") && customer.email) {
    const result = await sendEmail(supabase, userId, receptionistId, {
      to: customer.email,
      subject: `How was your experience with ${businessName}?`,
      html: surveyBody.replace(/\n/g, "<br>"),
      text: surveyBody,
    });
    tier = result.tier;
    sent = result.success && result.tier === 1;
  }

  if (!sent && surveyConfig.channels.includes("sms") && customer.phone) {
    const result = await sendSms(supabase, userId, receptionistId, {
      to: customer.phone,
      body: surveyBody,
    });
    tier = result.tier;
    sent = result.success && result.tier === 1;
  }

  // Create survey record
  const surveyId = `survey_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await supabase.from("conversion_events").insert({
    receptionist_id: receptionistId,
    session_id: "survey",
    event_type: "survey_sent",
    revenue_value: 0,
    currency: "USD",
    metadata: {
      survey_id: surveyId,
      customer_id: customerId,
      channel: surveyConfig.channels[0],
      sent,
    },
  });

  return {
    tier,
    sent,
    survey_id: surveyId,
    draft: sent ? undefined : surveyBody,
  };
}

/**
 * Analyze a survey response for sentiment.
 */
export function analyzeSentiment(answers: Record<string, string | number>): {
  sentiment: "positive" | "neutral" | "negative";
  nps_score?: number;
} {
  const overall = Number(answers.overall) || 0;
  const recommend = Number(answers.recommend) || 0;

  const sentiment =
    overall >= 4 ? "positive" : overall >= 3 ? "neutral" : "negative";

  return {
    sentiment,
    nps_score: recommend > 0 ? recommend : undefined,
  };
}

/**
 * Get feedback analytics for a receptionist.
 */
export async function getFeedbackAnalytics(
  supabase: SupabaseClient,
  receptionistId: string,
  days: number = 30,
): Promise<{
  total_surveys: number;
  response_rate: number;
  avg_rating: number;
  nps_score: number;
  sentiment_breakdown: { positive: number; neutral: number; negative: number };
  common_improvements: string[];
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from("conversion_events")
    .select("*")
    .eq("receptionist_id", receptionistId)
    .in("event_type", ["survey_sent", "survey_completed"])
    .gte("created_at", since);

  const sent = (events || []).filter((e) => e.event_type === "survey_sent").length;
  const completed = (events || []).filter((e) => e.event_type === "survey_completed").length;

  return {
    total_surveys: sent,
    response_rate: sent > 0 ? completed / sent : 0,
    avg_rating: 0,
    nps_score: 0,
    sentiment_breakdown: { positive: 0, neutral: 0, negative: 0 },
    common_improvements: [],
  };
}
