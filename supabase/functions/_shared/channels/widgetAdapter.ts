// ═══════════════════════════════════════════════════════════════════════════
// WIDGET CHANNEL ADAPTER — Native Web Widget
// ═══════════════════════════════════════════════════════════════════════════

import type { ChannelAdapter, InboundMessage, OutboundMessage } from './types.ts';

export const widgetAdapter: ChannelAdapter = {
  async parseInbound(_req: Request, body: Record<string, unknown>): Promise<InboundMessage | null> {
    const message = body.message as string;
    const receptionistId = body.receptionistId as string;
    const sessionId = body.sessionId as string;

    if (!message || !receptionistId || !sessionId) return null;

    return {
      channel_message_id: crypto.randomUUID(),
      channel: 'widget',
      text: message,
      sender_id: sessionId,
      receptionist_id: receptionistId,
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      raw_payload: body,
      sender_profile: {
        name: body.customerName as string | undefined,
      },
    };
  },

  async formatOutbound(message: OutboundMessage): Promise<Record<string, unknown>> {
    return {
      reply: message.text,
      uiHints: message.ui_hints || {},
      metadata: message.metadata || {},
    };
  },

  limits: {
    maxTextLength: 4000,
    supportsMedia: false,
    supportsQuickReplies: true,
    supportsRichUI: true,
  },
};
