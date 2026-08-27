/**
 * Module 2: Email Responder
 *
 * Answers inbound customer emails using the business's knowledge base.
 * Same brain as the chat widget — uses the receptionist's system prompt,
 * knowledge base, and conversation context.
 *
 * Tier 1: Gmail/Outlook connected — reads + replies automatically
 * Tier 2: No inbox access — drafts replies for owner to send
 * Tier 3: No email at all — owner handles manually
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type EmailMessage } from "../channels/emailSender.ts";
import { checkConnectorTier, type TierCheckResult } from "../connectors/registry.ts";

export interface InboundEmail {
  from: string;
  from_name?: string;
  subject: string;
  body: string;
  received_at: string;
}

export interface EmailResponse {
  success: boolean;
  tier: 1 | 2 | 3;
  reply_text: string;
  sent: boolean;
  draft?: { subject: string; body: string; to: string };
  connect_prompt?: string;
}

/**
 * Process an inbound email and generate a response.
 */
export async function respondToEmail(
  supabase: SupabaseClient,
  userId: string,
  receptionistId: string,
  email: InboundEmail,
): Promise<EmailResponse> {
  // Check tier
  const tierCheck = await checkConnectorTier(supabase, userId, "gmail");
  const outlookCheck = await checkConnectorTier(supabase, userId, "outlook");
  const effectiveTier = Math.min(tierCheck.tier, outlookCheck.tier) as 1 | 2 | 3;

  // Load business context
  const { data: rec } = await supabase
    .from("receptionists")
    .select("business_name, system_prompt, knowledge_base, tone")
    .eq("id", receptionistId)
    .maybeSingle();

  // Generate reply using Gemini
  const replyText = await generateEmailReply(
    rec?.system_prompt || "",
    rec?.knowledge_base || "",
    rec?.tone || "professional",
    rec?.business_name || "the business",
    email,
  );

  // Build the reply message
  const replyMessage: EmailMessage = {
    to: email.from,
    subject: `Re: ${email.subject}`,
    html: `<p>${replyText.replace(/\n/g, "</p><p>")}</p>`,
    text: replyText,
    from_name: rec?.business_name,
    reply_to: email.from,
  };

  // Send or draft based on tier
  if (effectiveTier === 1) {
    const sendResult = await sendEmail(supabase, userId, receptionistId, replyMessage);
    return {
      success: sendResult.success,
      tier: 1,
      reply_text: replyText,
      sent: sendResult.success,
      draft: sendResult.draft,
    };
  }

  // Tier 2 or 3: return draft
  return {
    success: true,
    tier: effectiveTier,
    reply_text: replyText,
    sent: false,
    draft: {
      subject: replyMessage.subject,
      body: replyText,
      to: email.from,
    },
    connect_prompt: effectiveTier === 3
      ? `Connect your Gmail or Outlook so I can reply to emails automatically. For now, here's a draft you can copy and send.`
      : undefined,
  };
}

async function generateEmailReply(
  systemPrompt: string,
  knowledgeBase: string,
  tone: string,
  businessName: string,
  email: InboundEmail,
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return "Thank you for your email. We'll get back to you shortly.";

  const prompt = `You are a customer service representative for ${businessName}.
Tone: ${tone}

${systemPrompt ? `Business context: ${systemPrompt}` : ""}
${knowledgeBase ? `Knowledge base: ${knowledgeBase}` : ""}

A customer sent this email:
From: ${email.from_name || email.from}
Subject: ${email.subject}
Message: ${email.body}

Write a professional, helpful reply. Be specific to their question. Do not use placeholders.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      }),
    },
  );

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Thank you for your email. We'll get back to you shortly.";
}
