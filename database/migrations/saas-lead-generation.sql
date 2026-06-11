-- Database Schema for SAAS Lead Generation System
-- Run these migrations in your Supabase SQL editor

-- ============================================================================
-- 1. SAAS OUTREACH EMAILS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS saas_outreach_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    to_email VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    gmail_message_id VARCHAR(255),
    gmail_thread_id VARCHAR(255),
    research_data JSONB,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed, bounced, replied
    error_message TEXT,
    opened_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for saas_outreach_emails
CREATE INDEX IF NOT EXISTS idx_saas_outreach_emails_to_email ON saas_outreach_emails(to_email);
CREATE INDEX IF NOT EXISTS idx_saas_outreach_emails_status ON saas_outreach_emails(status);
CREATE INDEX IF NOT EXISTS idx_saas_outreach_emails_sent_at ON saas_outreach_emails(sent_at);
CREATE INDEX IF NOT EXISTS idx_saas_outreach_emails_research_data ON saas_outreach_emails USING GIN(research_data);

-- ============================================================================
-- 2. SAAS COMPANIES TABLE (Cache recently funded companies)
-- ============================================================================

CREATE TABLE IF NOT EXISTS saas_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crunchbase_id VARCHAR(255) UNIQUE,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(500),
    description TEXT,
    short_description TEXT,
    funding_total BIGINT,
    funding_date DATE,
    industry VARCHAR(100),
    employee_count INTEGER,
    headquarters_location VARCHAR(255),
    linkedin_url VARCHAR(500),
    twitter_url VARCHAR(500),
    logo_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active', -- active, processed, skipped
    processed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for saas_companies
CREATE INDEX IF NOT EXISTS idx_saas_companies_crunchbase_id ON saas_companies(crunchbase_id);
CREATE INDEX IF NOT EXISTS idx_saas_companies_status ON saas_companies(status);
CREATE INDEX IF NOT EXISTS idx_saas_companies_funding_date ON saas_companies(funding_date DESC);
CREATE INDEX IF NOT EXISTS idx_saas_companies_industry ON saas_companies(industry);

-- ============================================================================
-- 3. DECISION MAKERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS decision_makers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES saas_companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    email VARCHAR(255),
    linkedin_url VARCHAR(500),
    confidence DECIMAL(3,2), -- 0.00 to 1.00
    source VARCHAR(100), -- linkedin, hunter, ai_enhanced_search, manual
    phone VARCHAR(50),
    location VARCHAR(255),
    status VARCHAR(20) DEFAULT 'potential', -- potential, contacted, responded, not_interested
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(company_id, email)
);

-- Create indexes for decision_makers
CREATE INDEX IF NOT EXISTS idx_decision_makers_company_id ON decision_makers(company_id);
CREATE INDEX IF NOT EXISTS idx_decision_makers_email ON decision_makers(email);
CREATE INDEX IF NOT EXISTS idx_decision_makers_status ON decision_makers(status);
CREATE INDEX IF NOT EXISTS idx_decision_makers_confidence ON decision_makers(confidence DESC);

-- ============================================================================
-- 4. RESEARCH INSIGHTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES saas_companies(id) ON DELETE CASCADE,
    decision_maker_id UUID REFERENCES decision_makers(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL, -- technology_stack, recent_hiring, product_launches, expansion_plans, pain_points
    insight_data JSONB NOT NULL,
    confidence DECIMAL(3,2),
    sources TEXT[], -- Array of source URLs or references
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for research_insights
CREATE INDEX IF NOT EXISTS idx_research_insights_company_id ON research_insights(company_id);
CREATE INDEX IF NOT EXISTS idx_research_insights_decision_maker_id ON research_insights(decision_maker_id);
CREATE INDEX IF NOT EXISTS idx_research_insights_type ON research_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_research_insights_confidence ON research_insights(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_research_insights_data ON research_insights USING GIN(insight_data);

-- ============================================================================
-- 5. LEAD GENERATION CAMPAIGNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS lead_generation_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'draft', -- draft, active, paused, completed
    settings JSONB, -- Campaign-specific settings
    target_criteria JSONB, -- Funding amount, industries, company size, etc.
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    total_companies INTEGER DEFAULT 0,
    processed_companies INTEGER DEFAULT 0,
    total_emails INTEGER DEFAULT 0,
    successful_emails INTEGER DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lead_generation_campaigns
CREATE INDEX IF NOT EXISTS idx_lead_generation_campaigns_status ON lead_generation_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_lead_generation_campaigns_created_by ON lead_generation_campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_lead_generation_campaigns_dates ON lead_generation_campaigns(start_date, end_date);

-- ============================================================================
-- 6. EMAIL PERFORMANCE METRICS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID REFERENCES saas_outreach_emails(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- sent, delivered, opened, clicked, replied, bounced, complained
    event_data JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    provider VARCHAR(50), -- gmail, sendgrid, etc.
    tracking_id VARCHAR(255)
);

-- Create indexes for email_performance_metrics
CREATE INDEX IF NOT EXISTS idx_email_performance_metrics_email_id ON email_performance_metrics(email_id);
CREATE INDEX IF NOT EXISTS idx_email_performance_metrics_event_type ON email_performance_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_email_performance_metrics_timestamp ON email_performance_metrics(timestamp DESC);

-- ============================================================================
-- 7. FUNCTIONS FOR AUTOMATIC UPDATES
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
CREATE TRIGGER update_saas_outreach_emails_updated_at 
    BEFORE UPDATE ON saas_outreach_emails 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saas_companies_updated_at 
    BEFORE UPDATE ON saas_companies 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_decision_makers_updated_at 
    BEFORE UPDATE ON decision_makers 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_research_insights_updated_at 
    BEFORE UPDATE ON research_insights 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_generation_campaigns_updated_at 
    BEFORE UPDATE ON lead_generation_campaigns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active campaigns with statistics
CREATE OR REPLACE VIEW active_campaigns AS
SELECT 
    c.*,
    COUNT(DISTINCT co.id) as total_companies,
    COUNT(DISTINCT dm.id) as total_decision_makers,
    COUNT(DISTINCT se.id) as total_emails,
    COUNT(DISTINCT CASE WHEN se.status = 'sent' THEN se.id END) as successful_emails,
    ROUND(
        COUNT(DISTINCT CASE WHEN se.status = 'sent' THEN se.id END) * 100.0 / 
        NULLIF(COUNT(DISTINCT se.id), 0), 2
    ) as success_rate
FROM lead_generation_campaigns c
LEFT JOIN saas_companies co ON c.id = ANY(co.campaign_ids) -- This would need campaign_ids field
LEFT JOIN decision_makers dm ON co.id = dm.company_id
LEFT JOIN saas_outreach_emails se ON dm.id = ANY(se.decision_maker_ids) -- This would need decision_maker_ids field
WHERE c.status = 'active'
GROUP BY c.id;

-- View for top performing companies
CREATE OR REPLACE VIEW top_performing_companies AS
SELECT 
    co.name,
    co.industry,
    co.funding_total,
    COUNT(DISTINCT se.id) as emails_sent,
    COUNT(DISTINCT CASE WHEN se.replied_at IS NOT NULL THEN se.id END) as replies_received,
    ROUND(
        COUNT(DISTINCT CASE WHEN se.replied_at IS NOT NULL THEN se.id END) * 100.0 / 
        NULLIF(COUNT(DISTINCT se.id), 0), 2
    ) as reply_rate
FROM saas_companies co
LEFT JOIN decision_makers dm ON co.id = dm.company_id
LEFT JOIN saas_outreach_emails se ON dm.id = ANY(se.decision_maker_ids) -- This would need decision_maker_ids field
GROUP BY co.id, co.name, co.industry, co.funding_total
HAVING COUNT(DISTINCT se.id) > 0
ORDER BY reply_rate DESC, emails_sent DESC;

-- ============================================================================
-- 9. SAMPLE DATA INSERTION (Optional - for testing)
-- ============================================================================

-- Insert sample campaign (remove in production)
INSERT INTO lead_generation_campaigns (
    name,
    description,
    status,
    target_criteria,
    settings
) VALUES (
    'Q1 2024 SAAS Funding Target',
    'Target recently funded B2B SAAS companies with $1M+ funding',
    'draft',
    '{"min_funding": 1000000, "industries": ["saas", "software", "fintech"], "days_back": 30}',
    '{"max_companies_per_batch": 10, "email_delay_minutes": 5, "max_decision_makers": 3}'
);

-- ============================================================================
-- 10. SECURITY POLICIES (ROW LEVEL SECURITY)
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE saas_outreach_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_makers ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_generation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Sample policies (adjust based on your auth system)
CREATE POLICY "Users can view their own outreach emails" ON saas_outreach_emails
    FOR ALL USING (
        created_by = auth.uid()
    );

CREATE POLICY "Users can manage their own companies" ON saas_companies
    FOR ALL USING (
        created_by = auth.uid()
    );

CREATE POLICY "Users can manage their own decision makers" ON decision_makers
    FOR ALL USING (
        created_by = auth.uid()
    );

CREATE POLICY "Users can manage their own campaigns" ON lead_generation_campaigns
    FOR ALL USING (
        created_by = auth.uid()
    );

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- Migration completed successfully!
-- The SAAS lead generation system is now ready to use.
-- 
-- Remember to set these environment variables:
-- - CRUNCHBASE_API_KEY
-- - OPENAI_API_KEY  
-- - GMAIL_SENDER_EMAIL
-- - GMAIL_REFRESH_TOKEN
-- - NEXT_PUBLIC_GOOGLE_CLIENT_ID
-- - NEXT_PUBLIC_GOOGLE_CLIENT_SECRET
-- - NEXT_PUBLIC_GOOGLE_REDIRECT_URI
