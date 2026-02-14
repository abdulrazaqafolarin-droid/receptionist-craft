// ═══════════════════════════════════════════════════════════════════════════
// MULTI-CHANNEL TYPES — Universal Message Abstraction
// ═══════════════════════════════════════════════════════════════════════════

export type ChannelType = 'widget' | 'whatsapp' | 'sms' | 'api' | 'email';

export interface InboundMessage {
  /** Unique message ID from the channel */
  channel_message_id: string;
  /** Normalized channel type */
  channel: ChannelType;
  /** The raw text content */
  text: string;
  /** Sender identifier (phone number, session ID, etc.) */
  sender_id: string;
  /** Receptionist to route to */
  receptionist_id: string;
  /** Session/conversation ID (generated if not provided) */
  session_id: string;
  /** Optional media attachments */
  media?: MediaAttachment[];
  /** Channel-specific raw payload for debugging */
  raw_payload?: Record<string, unknown>;
  /** Timestamp of the message */
  timestamp: string;
  /** Optional sender profile info */
  sender_profile?: {
    name?: string;
    phone?: string;
    email?: string;
    avatar_url?: string;
  };
}

export interface OutboundMessage {
  /** Normalized channel type */
  channel: ChannelType;
  /** Recipient identifier */
  recipient_id: string;
  /** Text content of the reply */
  text: string;
  /** Optional structured UI hints (only applicable for widget) */
  ui_hints?: Record<string, unknown>;
  /** Optional media to send */
  media?: MediaAttachment[];
  /** Optional quick reply buttons */
  quick_replies?: string[];
  /** Channel-specific metadata */
  metadata?: Record<string, unknown>;
}

export interface MediaAttachment {
  type: 'image' | 'audio' | 'video' | 'document';
  url: string;
  mime_type?: string;
  caption?: string;
}

export interface ChannelAdapter {
  /** Parse incoming webhook/request into InboundMessage */
  parseInbound(req: Request, body: Record<string, unknown>): Promise<InboundMessage | null>;
  /** Format OutboundMessage into channel-specific response */
  formatOutbound(message: OutboundMessage): Promise<Response | Record<string, unknown>>;
  /** Validate webhook signature (if applicable) */
  validateSignature?(req: Request): Promise<boolean>;
  /** Channel-specific message limits */
  limits: {
    maxTextLength: number;
    supportsMedia: boolean;
    supportsQuickReplies: boolean;
    supportsRichUI: boolean;
  };
}

export interface ChannelConfig {
  channel: ChannelType;
  enabled: boolean;
  credentials?: Record<string, string>;
  webhook_url?: string;
  receptionist_id?: string;
}
