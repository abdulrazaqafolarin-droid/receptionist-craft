-- Owner Chat Messages
CREATE TABLE IF NOT EXISTS public.owner_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL,
    receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'agent', 'system')),
    content TEXT NOT NULL,
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'proposal', 'diff', 'confirmation', 'insight', 'voice', 'clarification')),
    proposal_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_chat_messages_session ON public.owner_chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_owner_chat_messages_receptionist ON public.owner_chat_messages(receptionist_id);

-- Owner Proposals (config change proposals awaiting approval)
CREATE TABLE IF NOT EXISTS public.owner_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    proposal_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    applied_version INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS idx_owner_proposals_receptionist ON public.owner_proposals(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_owner_proposals_status ON public.owner_proposals(status);

-- Config Reasoning History (for §4.1b "Why things are the way they are")
CREATE TABLE IF NOT EXISTS public.config_reasoning_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    change_source TEXT NOT NULL CHECK (change_source IN ('onboarding', 'owner_approved', 'configurator_suggested', 'rollback')),
    owner_input TEXT,
    reasoning_notes TEXT,
    plan_text TEXT,
    config_snapshot JSONB,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_config_reasoning_receptionist ON public.config_reasoning_history(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_config_reasoning_version ON public.config_reasoning_history(receptionist_id, version_number DESC);

-- Autonomous Rules (owner-set rules that execute automatically)
CREATE TABLE IF NOT EXISTS public.owner_autonomous_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL CHECK (domain IN ('reminders', 'waitlist', 'reviews', 'inventory', 'staffing', 'custom')),
    name TEXT NOT NULL,
    description TEXT,
    condition TEXT NOT NULL,
    action TEXT NOT NULL,
    rule_json JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT NOT NULL CHECK (created_by IN ('owner', 'ai_suggested')),
    last_executed TIMESTAMPTZ,
    execution_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_autonomous_rules_receptionist ON public.owner_autonomous_rules(receptionist_id);

-- Owner Insights Log (proactive insights that didn't meet interrupt threshold)
CREATE TABLE IF NOT EXISTS public.owner_insights_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receptionist_id UUID NOT NULL REFERENCES public.receptionists(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('revenue_leak', 'capacity_waste', 'channel_decay', 'growth_pattern', 'risk', 'opportunity')),
    payload JSONB NOT NULL,
    score NUMERIC NOT NULL, -- EV × Confidence × Urgency
    surfaced BOOLEAN NOT NULL DEFAULT false,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_insights_receptionist ON public.owner_insights_log(receptionist_id);
CREATE INDEX IF NOT EXISTS idx_owner_insights_category ON public.owner_insights_log(category);
CREATE INDEX IF NOT EXISTS idx_owner_insights_score ON public.owner_insights_log(score DESC);

-- Explanation Cache (progressive disclosure levels)
CREATE TABLE IF NOT EXISTS public.explanation_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'policy', 'metric', 'recommendation', 'automation'
    entity_id TEXT NOT NULL,
    executive TEXT NOT NULL,
    understanding TEXT NOT NULL,
    technical TEXT NOT NULL,
    audit JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_type, entity_id)
);

-- Module Action Log (already exists from §4.3 but ensuring it's here)
-- This is created in 20260830000001_add_module_action_log.sql

-- RLS Policies
ALTER TABLE public.owner_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_reasoning_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_autonomous_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_insights_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.explanation_cache ENABLE ROW LEVEL SECURITY;

-- Owner chat messages: user can read/write their own receptionist's messages
CREATE POLICY "owner_chat_messages_select" ON public.owner_chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_chat_messages.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "owner_chat_messages_insert" ON public.owner_chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_chat_messages.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

-- Owner proposals: user can read/write their own receptionist's proposals
CREATE POLICY "owner_proposals_select" ON public.owner_proposals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_proposals.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "owner_proposals_insert" ON public.owner_proposals
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_proposals.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "owner_proposals_update" ON public.owner_proposals
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_proposals.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

-- Config reasoning history: user can read their own receptionist's history
CREATE POLICY "config_reasoning_select" ON public.config_reasoning_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = config_reasoning_history.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

-- Autonomous rules: user can manage their own receptionist's rules
CREATE POLICY "owner_autonomous_rules_all" ON public.owner_autonomous_rules
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_autonomous_rules.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

-- Insights log: user can read their own receptionist's insights
CREATE POLICY "owner_insights_select" ON public.owner_insights_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_insights_log.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "owner_insights_insert" ON public.owner_insights_log
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_insights_log.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

CREATE POLICY "owner_insights_update" ON public.owner_insights_log
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            WHERE r.id = owner_insights_log.receptionist_id
            AND r.user_id = auth.uid()
        )
    );

-- Explanation cache: user can read their own receptionist's explanations
CREATE POLICY "explanation_cache_select" ON public.explanation_cache
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.receptionists r
            JOIN public.config_reasoning_history crh ON crh.receptionist_id = r.id
            WHERE crh.config_snapshot @> jsonb_build_object('explanation_id', explanation_cache.id)
            AND r.user_id = auth.uid()
        )
    );

-- Service role can do everything
CREATE POLICY "owner_chat_messages_service" ON public.owner_chat_messages
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "owner_proposals_service" ON public.owner_proposals
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "config_reasoning_service" ON public.config_reasoning_history
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "owner_autonomous_rules_service" ON public.owner_autonomous_rules
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "owner_insights_service" ON public.owner_insights_log
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "explanation_cache_service" ON public.explanation_cache
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');