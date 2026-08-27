-- Connector Registry: tracks every possible external connection with live status.
-- This is the foundation for the 3-tier system (fully autonomous / drafts-only / can't do it yet).
-- Extensible: adding a new connector means adding a row, not new code.

-- Enum for connector status
CREATE TYPE public.connector_status AS ENUM (
  'not_configured',  -- No credentials set, slot visible but empty
  'configured',      -- Credentials saved, not yet verified
  'connected',       -- Verified working
  'error',           -- Credentials invalid or API returned error
  'expired',         -- OAuth token expired, needs re-auth
  'rate_limited',    -- Temporarily throttled
  'deprecated'       -- Provider no longer supported
);

-- Enum for connector category (groups related connectors)
CREATE TYPE public.connector_category AS ENUM (
  'messaging',       -- Email, SMS, WhatsApp
  'social',          -- Instagram, Facebook, TikTok, LinkedIn, X
  'payments',        -- Stripe, Paystack
  'calendar',        -- Google Calendar, Outlook
  'reviews',         -- Google Reviews, Yelp, Trustpilot
  'storage',         -- Google Drive, Dropbox
  'ads',             -- Google Ads, Meta Ads
  'auth',            -- Google, Microsoft SSO
  'ai',              -- OpenAI, Gemini (for module-level AI)
  'other'            -- Anything not categorized
);

-- Core connector registry table
CREATE TABLE IF NOT EXISTS public.connectors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Connector identity
  connector_key TEXT NOT NULL,          -- e.g. 'gmail', 'instagram', 'twilio_sms', 'google_calendar'
  display_name TEXT NOT NULL,           -- e.g. 'Gmail', 'Instagram', 'Twilio SMS'
  description TEXT,                     -- Plain-language description of what connecting enables
  category public.connector_category NOT NULL DEFAULT 'other',
  
  -- Status (live, checked on every module action)
  status public.connector_status NOT NULL DEFAULT 'not_configured',
  
  -- Credentials (encrypted at rest, stored per-user)
  config_json JSONB DEFAULT '{}'::jsonb,
  
  -- Tier info (computed from status)
  current_tier INT GENERATED ALWAYS AS (
    CASE 
      WHEN status = 'connected' THEN 1
      WHEN status IN ('configured', 'rate_limited') THEN 2
      ELSE 3
    END
  ) STORED,
  
  -- Metadata
  last_health_check TIMESTAMPTZ,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- One connector type per user
  UNIQUE(user_id, connector_key)
);

-- RLS: users can only see their own connectors
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connectors"
  ON public.connectors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connectors"
  ON public.connectors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connectors"
  ON public.connectors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connectors"
  ON public.connectors FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_connectors_user_key ON public.connectors(user_id, connector_key);
CREATE INDEX IF NOT EXISTS idx_connectors_user_category ON public.connectors(user_id, category);

-- Connector definitions: the catalog of all possible connectors.
-- This is what makes new connectors a configuration, not a rebuild.
CREATE TABLE IF NOT EXISTS public.connector_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identity
  connector_key TEXT UNIQUE NOT NULL,   -- e.g. 'gmail', 'instagram'
  display_name TEXT NOT NULL,           -- e.g. 'Gmail'
  description TEXT NOT NULL,            -- Plain-language: "Let your AI send and receive emails from your Gmail account"
  category public.connector_category NOT NULL,
  
  -- Icon and UI
  icon_name TEXT,                       -- Lucide icon name
  brand_color TEXT,                     -- Hex color for brand consistency
  
  -- Connection type
  auth_type TEXT NOT NULL DEFAULT 'api_key',  -- 'oauth', 'api_key', 'webhook', 'manual'
  setup_url TEXT,                       -- URL to start OAuth flow or setup page
  help_url TEXT,                        -- Link to setup instructions
  
  -- Tier behavior
  tier_1_description TEXT,              -- "What works when connected"
  tier_2_description TEXT,              -- "What works with just credentials (drafts only)"
  tier_3_description TEXT,              -- "What you can do without this connector"
  
  -- OAuth metadata (for OAuth-type connectors)
  oauth_scopes TEXT[],                  -- Required scopes
  oauth_provider TEXT,                  -- 'google', 'microsoft', 'meta', etc.
  
  -- Which modules need this connector
  required_by_modules TEXT[],           -- Module keys that need this connector
  
  -- Metadata
  is_google_family BOOLEAN DEFAULT false,  -- Part of Google Sign-In family
  supports_one_click_connect BOOLEAN DEFAULT false,  -- Single OAuth button
  is_coming_soon BOOLEAN DEFAULT false,   -- Slot visible but not yet buildable
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed: all connectors from the 20 modules + Google family
INSERT INTO public.connector_definitions (connector_key, display_name, description, category, auth_type, tier_1_description, tier_2_description, tier_3_description, required_by_modules, is_google_family, supports_one_click_connect) VALUES

-- Email connectors
('gmail', 'Gmail', 'Let your AI send and receive emails from your Gmail account.', 'messaging', 'oauth',
 'Your AI answers inbound emails automatically and sends outbound campaigns.',
 'Your AI drafts replies and campaigns — you copy and send them manually.',
 'You can manage email manually or connect Gmail to automate it.',
 ARRAY['email_responder', 'email_sender', 'ai_email_manager', 'review_management', 'customer_feedback', 'analytics_digest', 'referral_program', 'invoice_followup', 'content_generation'],
 true, true),

('outlook', 'Outlook / Microsoft 365', 'Let your AI manage your Outlook inbox and send emails.', 'messaging', 'oauth',
 'Your AI triages, drafts, and sends from your Outlook inbox.',
 'Your AI drafts replies — you send them from Outlook.',
 'You can manage email manually or connect Outlook to automate it.',
 ARRAY['email_responder', 'email_sender', 'ai_email_manager', 'calendar_sync'],
 true, false),

('smtp_custom', 'Custom SMTP Server', 'Use any email provider with your AI for outbound emails.', 'messaging', 'api_key',
 'Your AI sends emails through your configured SMTP server.',
 'Not applicable - SMTP is for sending, not receiving.',
 'Connect any email provider to enable AI-sent messages.',
 ARRAY['email_sender', 'customer_feedback', 'analytics_digest'],
 false, false),

-- SMS connector
('twilio_sms', 'Twilio SMS', 'Let your AI send text messages to customers.', 'messaging', 'api_key',
 'Your AI sends appointment reminders, follow-ups, and campaigns via SMS.',
 'Your AI drafts text messages — you send them yourself.',
 'Connect Twilio to enable AI-sent text messages.',
 ARRAY['sms_campaign', 'appointment_reminders', 'customer_feedback', 'referral_program', 'invoice_followup'],
 false, false),

-- Social media connectors
('instagram', 'Instagram', 'Let your AI post content and respond to DMs on Instagram.', 'social', 'oauth',
 'Your AI posts content, responds to comments, and manages DMs.',
 'Your AI drafts posts and replies — you copy and post them.',
 'Connect Instagram to let your AI manage your business presence.',
 ARRAY['social_posting', 'social_responder', 'review_management'],
 false, false),

('facebook', 'Facebook', 'Let your AI post to your Facebook page and respond to messages.', 'social', 'oauth',
 'Your AI posts content and responds to page messages automatically.',
 'Your AI drafts posts and messages — you publish them manually.',
 'Connect Facebook to let your AI manage your page presence.',
 ARRAY['social_posting', 'social_responder'],
 false, false),

('tiktok', 'TikTok', 'Let your AI schedule and publish TikTok videos.', 'social', 'oauth',
 'Your AI schedules and publishes TikTok content from your content plan.',
 'Your AI drafts video descriptions and captions — you post manually.',
 'Connect TikTok to automate your video publishing.',
 ARRAY['social_posting'],
 false, false),

('linkedin', 'LinkedIn', 'Let your AI post professional content on LinkedIn.', 'social', 'oauth',
 'Your AI posts content and responds to messages on LinkedIn.',
 'Your AI drafts posts and replies — you publish them.',
 'Connect LinkedIn to automate your professional presence.',
 ARRAY['social_posting', 'social_responder'],
 false, false),

('twitter_x', 'X (Twitter)', 'Let your AI post and respond on X.', 'social', 'oauth',
 'Your AI posts content and responds to mentions on X.',
 'Your AI drafts tweets and replies — you post them.',
 'Connect X to automate your presence on the platform.',
 ARRAY['social_posting', 'social_responder'],
 false, false),

-- Calendar connectors
('google_calendar', 'Google Calendar', 'Keep your Google Calendar in sync with FrontDesk bookings.', 'calendar', 'oauth',
 'Two-way sync: bookings appear in Google Calendar and vice versa.',
 'Your AI tells you about scheduling conflicts — you manage them manually.',
 'Connect Google Calendar for automatic sync.',
 ARRAY['calendar_sync', 'meeting_links'],
 true, true),

('outlook_calendar', 'Outlook Calendar', 'Sync your Outlook Calendar with FrontDesk bookings.', 'calendar', 'oauth',
 'Two-way sync between Outlook Calendar and FrontDesk.',
 'Your AI notes scheduling conflicts — you resolve them manually.',
 'Connect Outlook Calendar for automatic sync.',
 ARRAY['calendar_sync'],
 false, false),

('google_meet', 'Google Meet', 'Auto-generate video call links for consultations and meetings.', 'calendar', 'oauth',
 'Your AI creates Google Meet links for every virtual appointment.',
 'Your AI suggests you create a meeting link — you do it manually.',
 'Connect Google Meet to auto-generate video links.',
 ARRAY['meeting_links'],
 true, true),

-- Review connectors
('google_reviews', 'Google Reviews', 'Monitor and respond to Google Reviews automatically.', 'reviews', 'oauth',
 'Your AI monitors reviews, drafts responses, and flags negative ones instantly.',
 'Your AI drafts review responses — you post them on Google manually.',
 'Connect Google Reviews to monitor your reputation.',
 ARRAY['review_management'],
 true, true),

('yelp', 'Yelp', 'Monitor and respond to Yelp reviews.', 'reviews', 'api_key',
 'Your AI monitors Yelp reviews and drafts professional responses.',
 'Your AI drafts responses — you post them on Yelp manually.',
 'Connect Yelp to monitor your reputation.',
 ARRAY['review_management'],
 false, false),

('trustpilot', 'Trustpilot', 'Monitor and respond to Trustpilot reviews.', 'reviews', 'api_key',
 'Your AI monitors Trustpilot reviews and drafts responses.',
 'Your AI drafts responses — you post them on Trustpilot manually.',
 'Connect Trustpilot to monitor your reputation.',
 ARRAY['review_management'],
 false, false),

-- Payment connectors
('stripe', 'Stripe', 'Accept payments, deposits, and subscriptions through Stripe.', 'payments', 'api_key',
 'Your AI collects payments, deposits, and processes refunds automatically.',
 'Payment links are generated — you share them with customers.',
 'Connect Stripe to enable AI-powered payment collection.',
 ARRAY['payment_collection', 'invoice_followup', 'subscription_billing'],
 false, false),

('paystack', 'Paystack', 'Accept payments through Paystack.', 'payments', 'api_key',
 'Your AI collects payments and processes transactions via Paystack.',
 'Payment links are generated — you share them manually.',
 'Connect Paystack to enable payment collection.',
 ARRAY['payment_collection', 'invoice_followup'],
 false, false),

-- Storage connectors
('google_drive', 'Google Drive', 'Store generated documents, contracts, and reports in Google Drive.', 'storage', 'oauth',
 'Your AI saves contracts, invoices, and reports directly to your Google Drive.',
 'Your AI generates documents — you download and save them manually.',
 'Connect Google Drive to auto-save generated documents.',
 ARRAY['document_generation', 'contract_generation', 'analytics_digest'],
 true, true),

('google_sheets', 'Google Sheets', 'Export bookings, leads, and reports to Google Sheets.', 'storage', 'oauth',
 'Your AI exports data to spreadsheets automatically for your records.',
 'Your AI generates export files — you download and import them manually.',
 'Connect Google Sheets for automatic data export.',
 ARRAY['analytics_digest', 'lead_generator', 'crm_enrichment'],
 true, true),

('google_contacts', 'Google Contacts', 'Keep customer contact info synced with Google Contacts.', 'storage', 'oauth',
 'Customer contacts sync automatically between FrontDesk and Google Contacts.',
 'Your AI prepares contact exports — you import them manually.',
 'Connect Google Contacts to keep contacts in sync.',
 ARRAY['crm_enrichment'],
 true, true),

-- Ads connectors
('google_ads', 'Google Ads', 'Manage and monitor Google Ads campaigns.', 'ads', 'oauth',
 'Your AI manages targeting, budget, and reports on Google Ads.',
 'Your AI analyzes performance and suggests changes — you make them manually.',
 'Connect Google Ads to let your AI manage campaigns.',
 ARRAY['ad_campaign'],
 false, false),

('meta_ads', 'Meta Ads', 'Manage and monitor Facebook/Instagram ad campaigns.', 'ads', 'oauth',
 'Your AI manages Meta ad campaigns and reports performance.',
 'Your AI drafts ad copy and suggests targeting — you run campaigns manually.',
 'Connect Meta Ads to let your AI manage campaigns.',
 ARRAY['ad_campaign'],
 false, false),

-- Calendar sync (Google family)
('google_maps', 'Google Maps', 'Show your business location and check service areas.', 'calendar', 'api_key',
 'Your AI generates directions and checks if customers are in your service area.',
 'Your AI tells customers your address — they find directions themselves.',
 'Connect Google Maps for automatic location and distance features.',
 ARRAY['service_area_check', 'directions'],
 true, false),

-- Coming soon connectors (slots only, no OAuth wiring yet)
('instagram_business', 'Instagram Business (Advanced)', 'Advanced Instagram features: shopping, stories, reels scheduling.', 'social', 'oauth',
 'Advanced Instagram commerce and content features.',
 'Not yet available — coming soon.',
 'This advanced integration is under development.',
 ARRAY['social_posting'],
 false, false);

-- Auto-create connector slots for each user when they sign up
-- (via trigger or onboarding)
