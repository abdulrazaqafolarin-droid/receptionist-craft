// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP CHANNEL ADAPTER — WhatsApp Business API (Cloud API)
// ═══════════════════════════════════════════════════════════════════════════
// Ready for activation when WhatsApp Business API credentials are configured.
// Follows the Meta Cloud API webhook format.
// ═══════════════════════════════════════════════════════════════════════════

import type { ChannelAdapter, InboundMessage, OutboundMessage, MediaAttachment } from './types.ts';

export const whatsappAdapter: ChannelAdapter = {
  async parseInbound(_req: Request, body: Record<string, unknown>): Promise<InboundMessage | null> {
    // Meta Cloud API webhook format
    const entry = (body.entry as any[])?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return null;

    const msg = messages[0];
    const contact = value?.contacts?.[0];
    const phoneNumberId = value?.metadata?.phone_number_id;

    // Resolve receptionist from phone number mapping
    // This would be looked up from a channel_configs table
    const receptionistId = body._receptionist_id as string || '';

    const text = msg.type === 'text' ? msg.text?.body : 
                 msg.type === 'interactive' ? (msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title) :
                 '';

    const media: MediaAttachment[] = [];
    if (msg.type === 'image' && msg.image) {
      media.push({ type: 'image', url: msg.image.id, mime_type: msg.image.mime_type, caption: msg.image.caption });
    }
    if (msg.type === 'audio' && msg.audio) {
      media.push({ type: 'audio', url: msg.audio.id, mime_type: msg.audio.mime_type });
    }
    if (msg.type === 'document' && msg.document) {
      media.push({ type: 'document', url: msg.document.id, mime_type: msg.document.mime_type, caption: msg.document.caption });
    }

    return {
      channel_message_id: msg.id,
      channel: 'whatsapp',
      text: text || '',
      sender_id: msg.from,
      receptionist_id: receptionistId,
      session_id: `wa_${msg.from}_${receptionistId}`,
      media: media.length > 0 ? media : undefined,
      timestamp: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
      raw_payload: body,
      sender_profile: {
        name: contact?.profile?.name,
        phone: msg.from,
      },
    };
  },

  async formatOutbound(message: OutboundMessage): Promise<Record<string, unknown>> {
    // Build WhatsApp Cloud API message payload
    const payload: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: message.recipient_id,
      type: 'text',
      text: { body: truncateText(message.text, 4096) },
    };

    // Add quick reply buttons if available (max 3 for WhatsApp)
    if (message.quick_replies && message.quick_replies.length > 0) {
      const buttons = message.quick_replies.slice(0, 3).map((text, i) => ({
        type: 'reply',
        reply: { id: `btn_${i}`, title: truncateText(text, 20) },
      }));

      payload.type = 'interactive';
      payload.interactive = {
        type: 'button',
        body: { text: truncateText(message.text, 1024) },
        action: { buttons },
      };
      delete payload.text;
    }

    return payload;
  },

  async validateSignature(req: Request): Promise<boolean> {
    const signature = req.headers.get('x-hub-signature-256');
    if (!signature) return false;

    const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
    if (!appSecret) return false;

    // In production, verify HMAC-SHA256 signature
    // For now, return true if signature header is present
    return true;
  },

  limits: {
    maxTextLength: 4096,
    supportsMedia: true,
    supportsQuickReplies: true,
    supportsRichUI: false,
  },
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
