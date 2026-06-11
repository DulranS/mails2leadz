-- Database Schema Updates for AI Auto-Reply System
-- Run these migrations in your Supabase SQL editor

-- ============================================================================
-- 1. UPDATE LEADS TABLE FOR AUTO-REPLY FUNCTIONALITY
-- ============================================================================

-- Add auto-reply settings to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS ai_reply_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_ai_reply_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- ============================================================================
-- 2. CREATE AI_RESPONSES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,
    intent VARCHAR(50) NOT NULL, -- interested, not_interested, needs_info, out_of_office, unsubscribe
    ai_reply TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for ai_responses
CREATE INDEX IF NOT EXISTS idx_ai_responses_lead_id ON ai_responses(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_intent ON ai_responses(intent);
CREATE INDEX IF NOT EXISTS idx_ai_responses_sent_at ON ai_responses(sent_at);

-- ============================================================================
-- 3. CREATE FOLLOW_UP_SCHEDULE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS follow_up_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    scheduled_date DATE NOT NULL,
    follow_up_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, completed, cancelled, failed
    followup_type VARCHAR(50) DEFAULT 'general', -- hot_lead, warm_lead, cold_lead, information_request, ooo_followup
    intent_context VARCHAR(50), -- The intent that triggered this followup
    gmail_message_id VARCHAR(255), -- Message ID of sent followup
    completed_at TIMESTAMPTZ,
    attempted_at TIMESTAMPTZ,
    notes TEXT,
    error_message TEXT,
    created_by VARCHAR(50) DEFAULT 'manual', -- manual, ai_system
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for follow_up_schedule
CREATE INDEX IF NOT EXISTS idx_follow_up_schedule_lead_id ON follow_up_schedule(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedule_status ON follow_up_schedule(status);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedule_scheduled_date ON follow_up_schedule(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_follow_up_schedule_followup_type ON follow_up_schedule(followup_type);

-- ============================================================================
-- 4. UPDATE EMAIL_THREADS TABLE FOR AI PROCESSING
-- ============================================================================

-- Add AI processing fields to email_threads
ALTER TABLE email_threads 
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ai_intent VARCHAR(50),
ADD COLUMN IF NOT EXISTS ai_reply_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_followup BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS followup_number INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- Create indexes for email_threads AI fields
CREATE INDEX IF NOT EXISTS idx_email_threads_processed ON email_threads(processed);
CREATE INDEX IF NOT EXISTS idx_email_threads_direction_processed ON email_threads(direction, processed);
CREATE INDEX IF NOT EXISTS idx_email_threads_ai_intent ON email_threads(ai_intent);

-- ============================================================================
-- 5. CREATE USER_INTEGRATIONS TABLE FOR GMAIL CREDENTIALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    provider VARCHAR(50) NOT NULL, -- google, microsoft, etc.
    service VARCHAR(50) NOT NULL, -- gmail, outlook, etc.
    email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, provider, service)
);

-- Create indexes for user_integrations
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_id ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_integrations_provider_service ON user_integrations(provider, service);
CREATE INDEX IF NOT EXISTS idx_user_integrations_email ON user_integrations(email);

-- ============================================================================
-- 6. CREATE AI_SETTINGS TABLE FOR CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    auto_reply_enabled BOOLEAN DEFAULT true,
    auto_followup_enabled BOOLEAN DEFAULT true,
    max_followups_per_lead INTEGER DEFAULT 3,
    reply_delay_minutes INTEGER DEFAULT 5, -- Delay before sending AI reply
    followup_intervals JSONB DEFAULT '{"hot_lead": [1, 3, 7], "warm_lead": [3, 7, 14], "cold_lead": [7, 14, 30]}',
    working_hours_start TIME DEFAULT '09:00:00',
    working_hours_end TIME DEFAULT '17:00:00',
    timezone VARCHAR(50) DEFAULT 'UTC',
    custom_instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id)
);

-- ============================================================================
-- 7. CREATE AI_ACTIVITY_LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL, -- auto_reply, followup_scheduled, followup_sent, error
    activity_data JSONB, -- Store relevant activity details
    status VARCHAR(20) NOT NULL, -- success, failed, pending
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for ai_activity_log
CREATE INDEX IF NOT EXISTS idx_ai_activity_log_user_id ON ai_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_activity_log_activity_type ON ai_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_ai_activity_log_created_at ON ai_activity_log(created_at);

-- ============================================================================
-- 8. CREATE FUNCTIONS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_ai_responses_updated_at BEFORE UPDATE ON ai_responses 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_follow_up_schedule_updated_at BEFORE UPDATE ON follow_up_schedule 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_integrations_updated_at BEFORE UPDATE ON user_integrations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON ai_settings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. CREATE VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active followups
CREATE OR REPLACE VIEW active_followups AS
SELECT 
    f.*,
    l.email as lead_email,
    l.business_name,
    l.status as lead_status,
    u.user_id
FROM follow_up_schedule f
JOIN leads l ON f.lead_id = l.id
JOIN user_integrations u ON l.user_id = u.user_id
WHERE f.status = 'pending'
  AND l.auto_reply_enabled = true
  AND u.is_active = true;

-- View for AI response statistics
CREATE OR REPLACE VIEW ai_response_stats AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    intent,
    COUNT(*) as total_responses,
    COUNT(CASE WHEN ai_reply IS NOT NULL THEN 1 END) as replies_sent,
    COUNT(CASE WHEN sent_at IS NOT NULL THEN 1 END) as replies_delivered
FROM ai_responses
GROUP BY DATE_TRUNC('day', created_at), intent
ORDER BY date DESC;

-- ============================================================================
-- 10. INSERT DEFAULT AI SETTINGS FOR EXISTING USERS
-- ============================================================================

-- Insert default settings for users who don't have them
INSERT INTO ai_settings (user_id)
SELECT DISTINCT user_id FROM leads
WHERE user_id NOT IN (SELECT user_id FROM ai_settings);

-- ============================================================================
-- 11. SECURITY POLICIES (ROW LEVEL SECURITY)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE ai_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_activity_log ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your auth system)
-- These are example policies - adjust according to your user authentication setup

CREATE POLICY "Users can view their own AI responses" ON ai_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM leads l 
            WHERE l.id = ai_responses.lead_id 
            AND l.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view their own followup schedules" ON follow_up_schedule
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM leads l 
            WHERE l.id = follow_up_schedule.lead_id 
            AND l.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their own integrations" ON user_integrations
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own AI settings" ON ai_settings
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users can view their own activity logs" ON ai_activity_log
    FOR SELECT USING (user_id = auth.uid());

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- Migration completed successfully!
-- The AI auto-reply system is now ready to use.
-- Remember to set up the required environment variables:
-- - OPENAI_API_KEY
-- - CALENDLY_LINK
-- - NEXT_PUBLIC_GOOGLE_CLIENT_ID
-- - NEXT_PUBLIC_GOOGLE_CLIENT_SECRET
-- - NEXT_PUBLIC_GOOGLE_REDIRECT_URI
-- - GMAIL_WEBHOOK_SECRET (for webhook security)
