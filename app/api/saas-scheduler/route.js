// app/api/saas-scheduler/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import SAASLeadGenerationOrchestrator from '../../../lib/saas-lead-finder';

// ============================================================================
// AUTOMATED SCHEDULER FOR SAAS LEAD GENERATION
// ============================================================================

let schedulerInterval = null;
let isRunning = false;

// Configuration
const SCHEDULE_CONFIG = {
  RUN_INTERVAL_HOURS: 6, // Run every 6 hours
  MAX_COMPANIES_PER_RUN: 15,
  MAX_EMAILS_PER_HOUR: 50, // Gmail rate limit
  WORKING_HOURS_START: 9, // 9 AM UTC
  WORKING_HOURS_END: 18, // 6 PM UTC
  TIMEZONE: 'UTC'
};

// ============================================================================
// START SCHEDULER
// ============================================================================
export async function POST(request) {
  try {
    const { action, settings } = await request.json();
    
    switch (action) {
      case 'start':
        return startScheduler(settings);
      case 'stop':
        return stopScheduler();
      case 'status':
        return getSchedulerStatus();
      case 'run-now':
        return runNow();
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('[SAAS Scheduler] Error:', error);
    return NextResponse.json(
      { error: 'Scheduler operation failed', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET HANDLER - STATUS
// ============================================================================
export async function GET(request) {
  try {
    return getSchedulerStatus();
  } catch (error) {
    console.error('[SAAS Scheduler] Status error:', error);
    return NextResponse.json(
      { error: 'Failed to get scheduler status', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// START SCHEDULER FUNCTION
// ============================================================================
async function startScheduler(settings = {}) {
  try {
    if (isRunning) {
      return NextResponse.json({
        success: false,
        message: 'Scheduler is already running'
      });
    }
    
    // Update config with provided settings
    const config = { ...SCHEDULE_CONFIG, ...settings };
    
    console.log('[SAAS Scheduler] Starting automated scheduler with config:', config);
    
    // Start the interval
    schedulerInterval = setInterval(async () => {
      await runScheduledLeadGeneration(config);
    }, config.RUN_INTERVAL_HOURS * 60 * 60 * 1000);
    
    isRunning = true;
    
    // Run immediately
    setTimeout(() => runScheduledLeadGeneration(config), 5000);
    
    // Log scheduler start
    await supabaseAdmin.from('scheduler_logs').insert({
      action: 'started',
      config,
      status: 'active',
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      message: 'Scheduler started successfully',
      config,
      nextRun: new Date(Date.now() + config.RUN_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
    });
    
  } catch (error) {
    console.error('[SAAS Scheduler] Start error:', error);
    return NextResponse.json(
      { error: 'Failed to start scheduler', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// STOP SCHEDULER FUNCTION
// ============================================================================
async function stopScheduler() {
  try {
    if (!isRunning) {
      return NextResponse.json({
        success: false,
        message: 'Scheduler is not running'
      });
    }
    
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
    
    isRunning = false;
    
    console.log('[SAAS Scheduler] Stopped');
    
    // Log scheduler stop
    await supabaseAdmin.from('scheduler_logs').insert({
      action: 'stopped',
      status: 'inactive',
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      message: 'Scheduler stopped successfully'
    });
    
  } catch (error) {
    console.error('[SAAS Scheduler] Stop error:', error);
    return NextResponse.json(
      { error: 'Failed to stop scheduler', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET SCHEDULER STATUS
// ============================================================================
async function getSchedulerStatus() {
  try {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const isWorkingHours = currentHour >= SCHEDULE_CONFIG.WORKING_HOURS_START && 
                          currentHour < SCHEDULE_CONFIG.WORKING_HOURS_END;
    
    // Get recent scheduler logs
    const { data: recentLogs } = await supabaseAdmin
      .from('scheduler_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(10);
    
    // Get today's run statistics
    const today = now.toISOString().slice(0, 10);
    const { data: todayStats } = await supabaseAdmin
      .from('scheduler_logs')
      .select('*', { count: 'exact' })
      .eq('action', 'run_completed')
      .gte('timestamp', today);
    
    // Get next scheduled run time
    let nextRunTime = null;
    if (isRunning && schedulerInterval) {
      nextRunTime = new Date(now.getTime() + SCHEDULE_CONFIG.RUN_INTERVAL_HOURS * 60 * 60 * 1000);
    }
    
    return NextResponse.json({
      success: true,
      status: {
        isRunning,
        isWorkingHours,
        config: SCHEDULE_CONFIG,
        nextRunTime,
        todayRuns: todayStats?.length || 0,
        recentLogs: recentLogs || [],
        uptime: isRunning ? calculateUptime(recentLogs) : 0
      }
    });
    
  } catch (error) {
    console.error('[SAAS Scheduler] Status error:', error);
    throw error;
  }
}

// ============================================================================
// RUN SCHEDULED LEAD GENERATION
// ============================================================================
async function runScheduledLeadGeneration(config) {
  const startTime = new Date();
  const currentHour = startTime.getUTCHours();
  
  try {
    console.log(`[SAAS Scheduler] Running scheduled lead generation at ${startTime.toISOString()}`);
    
    // Check if within working hours
    if (currentHour < config.WORKING_HOURS_START || currentHour >= config.WORKING_HOURS_END) {
      console.log('[SAAS Scheduler] Outside working hours, skipping run');
      return;
    }
    
    // Check rate limiting
    const emailsLastHour = await getEmailsLastHour();
    if (emailsLastHour >= config.MAX_EMAILS_PER_HOUR) {
      console.log('[SAAS Scheduler] Rate limit reached, skipping run');
      return;
    }
    
    // Initialize and run the orchestrator
    const orchestrator = new SAASLeadGenerationOrchestrator();
    await orchestrator.emailSender.initialize();
    
    // Run with limited batch size
    const originalMaxCompanies = orchestrator.crunchbaseClient.MAX_COMPANIES_PER_BATCH;
    orchestrator.crunchbaseClient.MAX_COMPANIES_PER_BATCH = config.MAX_COMPANIES_PER_RUN;
    
    await orchestrator.runLeadGeneration();
    
    // Restore original config
    orchestrator.crunchbaseClient.MAX_COMPANIES_PER_BATCH = originalMaxCompanies;
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    console.log(`[SAAS Scheduler] Run completed in ${duration}ms`);
    
    // Log successful run
    await supabaseAdmin.from('scheduler_logs').insert({
      action: 'run_completed',
      config,
      status: 'success',
      duration_ms: duration,
      companies_processed: config.MAX_COMPANIES_PER_RUN,
      timestamp: startTime.toISOString()
    });
    
  } catch (error) {
    console.error('[SAAS Scheduler] Run error:', error);
    
    // Log failed run
    await supabaseAdmin.from('scheduler_logs').insert({
      action: 'run_completed',
      config,
      status: 'failed',
      error_message: error.message,
      timestamp: startTime.toISOString()
    });
  }
}

// ============================================================================
// RUN NOW (MANUAL TRIGGER)
// ============================================================================
async function runNow() {
  try {
    console.log('[SAAS Scheduler] Manual trigger initiated');
    
    const orchestrator = new SAASLeadGenerationOrchestrator();
    await orchestrator.emailSender.initialize();
    
    // Run in background
    orchestrator.runLeadGeneration().catch(error => {
      console.error('[SAAS Scheduler] Manual run error:', error);
    });
    
    return NextResponse.json({
      success: true,
      message: 'Manual lead generation started',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SAAS Scheduler] Manual run error:', error);
    return NextResponse.json(
      { error: 'Failed to start manual run', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getEmailsLastHour() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const { data: emails } = await supabaseAdmin
    .from('saas_outreach_emails')
    .select('*', { count: 'exact' })
    .gte('sent_at', oneHourAgo.toISOString());
  
  return emails?.length || 0;
}

function calculateUptime(logs) {
  if (!logs || logs.length === 0) return 0;
  
  const startLog = logs.find(log => log.action === 'started');
  const stopLog = logs.find(log => log.action === 'stopped');
  
  if (!startLog) return 0;
  if (stopLog) return 0; // Currently stopped
  
  const startTime = new Date(startLog.timestamp);
  return Date.now() - startTime.getTime();
}

// ============================================================================
// CLEANUP ON SERVER SHUTDOWN
// ============================================================================

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[SAAS Scheduler] Received SIGTERM, shutting down gracefully');
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  isRunning = false;
  
  try {
    if (supabaseAdmin) {
      await supabaseAdmin.from('scheduler_logs').insert({
        action: 'shutdown',
        status: 'inactive',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[SAAS Scheduler] Error logging shutdown:', error);
  }
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[SAAS Scheduler] Received SIGINT, shutting down gracefully');
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  isRunning = false;
  
  try {
    if (supabaseAdmin) {
      await supabaseAdmin.from('scheduler_logs').insert({
        action: 'shutdown',
        status: 'inactive',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[SAAS Scheduler] Error logging shutdown:', error);
  }
  
  process.exit(0);
});
