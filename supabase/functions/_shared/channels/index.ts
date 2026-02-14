// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CHANNEL ROUTER — Universal Message Routing Layer
// ═══════════════════════════════════════════════════════════════════════════
// Routes inbound messages to the correct adapter and normalizes them
// into a unified InboundMessage format for the AI engine.
// ═══════════════════════════════════════════════════════════════════════════

import type { ChannelType, ChannelAdapter, InboundMessage, OutboundMessage } from './types.ts';
import { widgetAdapter } from './widgetAdapter.ts';
import { whatsappAdapter } from './whatsappAdapter.ts';
import { smsAdapter } from './smsAdapter.ts';

export type { ChannelType, ChannelAdapter, InboundMessage, OutboundMessage, MediaAttachment, ChannelConfig } from './types.ts';

// ═══════════════════════════════════════════════════════════════════════════
// ADAPTER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const adapters: Record<ChannelType, ChannelAdapter> = {
  widget: widgetAdapter,
  whatsapp: whatsappAdapter,
  sms: smsAdapter,
  api: widgetAdapter, // API uses same format as widget
  email: widgetAdapter, // Placeholder — email adapter TBD
};

/**
 * Get the adapter for a given channel type
 */
export function getAdapter(channel: ChannelType): ChannelAdapter {
  return adapters[channel] || adapters.widget;
}

/**
 * Detect channel type from the request
 */
export function detectChannel(req: Request, body: Record<string, unknown>): ChannelType {
  // Explicit channel header or body field
  const explicitChannel = (
    req.headers.get('x-channel') || 
    body.channel || 
    body.source
  ) as string | undefined;

  if (explicitChannel && explicitChannel in adapters) {
    return explicitChannel as ChannelType;
  }

  // Auto-detect from payload structure
  if (body.entry && (body.object === 'whatsapp_business_account')) {
    return 'whatsapp';
  }
  if (body.MessageSid || body.AccountSid) {
    return 'sms';
  }

  return 'widget';
}

/**
 * Parse any inbound request into a normalized InboundMessage
 */
export async function parseInboundMessage(
  req: Request, 
  body: Record<string, unknown>
): Promise<{ message: InboundMessage | null; channel: ChannelType }> {
  const channel = detectChannel(req, body);
  const adapter = getAdapter(channel);
  const message = await adapter.parseInbound(req, body);
  return { message, channel };
}

/**
 * Format an AI response into a channel-appropriate outbound message
 */
export async function formatOutboundMessage(
  channel: ChannelType,
  reply: string,
  recipientId: string,
  options?: {
    ui_hints?: Record<string, unknown>;
    quick_replies?: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<Record<string, unknown>> {
  const adapter = getAdapter(channel);
  const outbound: OutboundMessage = {
    channel,
    recipient_id: recipientId,
    text: reply,
    ui_hints: options?.ui_hints,
    quick_replies: options?.quick_replies,
    metadata: options?.metadata,
  };

  // Truncate text to channel limits
  if (outbound.text.length > adapter.limits.maxTextLength) {
    outbound.text = outbound.text.substring(0, adapter.limits.maxTextLength - 3) + '...';
  }

  // Strip UI hints for non-rich channels
  if (!adapter.limits.supportsRichUI) {
    outbound.ui_hints = undefined;
  }

  // Strip quick replies for channels that don't support them
  if (!adapter.limits.supportsQuickReplies) {
    outbound.quick_replies = undefined;
  }

  const result = await adapter.formatOutbound(outbound);
  return result as Record<string, unknown>;
}

/**
 * Get channel capabilities for prompt building
 */
export function getChannelCapabilities(channel: ChannelType): {
  canShowButtons: boolean;
  canShowCalendar: boolean;
  canShowProducts: boolean;
  canShowImages: boolean;
  maxResponseLength: number;
  formatInstructions: string;
} {
  const adapter = getAdapter(channel);
  
  return {
    canShowButtons: adapter.limits.supportsQuickReplies,
    canShowCalendar: adapter.limits.supportsRichUI,
    canShowProducts: adapter.limits.supportsRichUI,
    canShowImages: adapter.limits.supportsMedia,
    maxResponseLength: adapter.limits.maxTextLength,
    formatInstructions: channel === 'sms' 
      ? 'Keep responses under 160 characters when possible. Be extremely concise. No emojis. No markdown.'
      : channel === 'whatsapp'
      ? 'Use WhatsApp formatting: *bold*, _italic_. Keep responses conversational and concise. Emojis OK but sparingly.'
      : 'You may use rich formatting and emoji. Be conversational and helpful.',
  };
}

/**
 * Build a channel-aware prompt section for the AI
 */
export function buildChannelPrompt(channel: ChannelType): string {
  const caps = getChannelCapabilities(channel);
  
  if (channel === 'widget') return ''; // Widget is default, no extra instructions needed

  return `# 📌 CHANNEL AWARENESS — ${channel.toUpperCase()}

You are responding via **${channel}**. Adapt your responses accordingly:

- Max response length: ${caps.maxResponseLength} characters
- ${caps.formatInstructions}
- ${caps.canShowButtons ? 'Quick reply buttons are available — suggest actionable options.' : 'No buttons available — guide the user with clear text options.'}
- ${caps.canShowCalendar ? 'Calendar/date pickers are available.' : 'No date picker — ask for dates in text (e.g., "What day works for you?").'}
- ${caps.canShowProducts ? 'Product cards are available.' : 'No product cards — describe products in text with prices.'}
- ${caps.canShowImages ? 'Images can be sent.' : 'Cannot send images.'}

**CRITICAL:** Never reference UI elements that don't exist on this channel (e.g., don't say "click the button below" on SMS).`;
}
