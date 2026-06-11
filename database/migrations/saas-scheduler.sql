-- Additional tables for SAAS Lead Generation System
-- Add to existing database

-- ============================================================================
-- SCHEDULER LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(50) NOT NULL, -- started, stopped, run_completed, shutdown
    config JSONB,
    status VARCHAR(20) NOT NULL, -- active, inactive, success, failed
    duration_ms INTEGER,
    companies_processed INTEGER,
    error_message TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for scheduler_logs
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_action ON scheduler_logs(action);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_status ON scheduler_logs(status);
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_timestamp ON scheduler_logs(timestamp DESC);

-- ============================================================================
-- UPDATE SAAS_COMPANIES TABLE FOR CAMPAIGN SUPPORT
-- ============================================================================

-- Add campaign_ids array to saas_companies if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'saas_companies' 
        AND column_name = 'campaign_ids'
    ) THEN
        ALTER TABLE saas_companies ADD COLUMN campaign_ids UUID[];
    END IF;
END$$;

-- Add decision_maker_ids array to saas_outreach_emails if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'saas_outreach_emails' 
        AND column_name = 'decision_maker_ids'
    ) THEN
        ALTER TABLE saas_outreach_emails ADD COLUMN decision_maker_ids UUID[];
    END IF;
END$$;

-- ============================================================================
-- SAMPLE SCHEDULER LOG ENTRY
-- ============================================================================

INSERT INTO scheduler_logs (
    action,
    status,
    timestamp
) VALUES (
    'system_initialized',
    'success',
    NOW()
);

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

-- Additional scheduler tables created successfully!
-- The automated SAAS lead generation system is now complete.
