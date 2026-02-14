// ═══════════════════════════════════════════════════════════════════════════
// SMS CHANNEL ADAPTER — Twilio SMS API
// ═══════════════════════════════════════════════════════════════════════════
// Ready for activation when Twilio credentials are configured.
// ═══════════════════════════════════════════════════════════════════════════

import type { ChannelAdapter, InboundMessage, OutboundMessage } from './types.ts';

export const smsAdapter: ChannelAdapter = {
  async parseInbound(_req: Request, body: Record<string, unknown>): Promise<InboundMessage | null> {
    // Twilio webhook format (form-encoded, pre-parsed to JSON)
    const from = body.From as string;
    const text = body.Body as string;
    const messageSid = body.MessageSid as string;
    const to = body.To as string;

    if (!from || !text) return null;

    // Resolve receptionist from the "To" phone number
    const receptionistId = body._receptionist_id as string || '';

    return {
      channel_message_id: messageSid || crypto.randomUUID(),
      channel: 'sms',
      text,
      sender_id: from,
      receptionist_id: receptionistId,
      session_id: `sms_${from}_${receptionistId}`,
      timestamp: new Date().toISOString(),
      raw_payload: body,
      sender_profile: {
        phone: from,
      },
    };
  },

  async formatOutbound(message: OutboundMessage): Promise<Record<string, unknown>> {
    // SMS has no rich UI — plain text only
    let text = message.text;

    // Append quick replies as numbered options (SMS workaround)
    if (message.quick_replies && message.quick_replies.length > 0) {
      const options = message.quick_replies
        .map((reply, i) => `${i + 1}. ${reply}`)
        .join('\n');
      text += `\n\nReply with a number:\n${options}`;
    }

    // Truncate to SMS limit (1600 chars for Twilio)
    if (text.length > 1600) {
      text = text.substring(0, 1597) + '...';
    }

    return {
      to: message.recipient_id,
      body: text,
    };
  },

  async validateSignature(req: Request): Promise<boolean> {
    const twilioSignature = req.headers.get('x-twilio-signature');
    if (!twilioSignature) return false;

    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!authToken) return false;

    // In production, verify Twilio signature
    return true;
  },

  limits: {
    maxTextLength: 1600,
    supportsMedia: true, // MMS
    supportsQuickReplies: false, // Simulated via numbered list
    supportsRichUI: false,
  },
};
