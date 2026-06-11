// lib/ai-background-processor.js
import { supabaseAdmin } from './supabaseClient';

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  AUTO_REPLY_INTERVAL_MINUTES: 5,
  FOLLOWUP_SCHEDULE_INTERVAL_MINUTES: 15,
  CLEANUP_INTERVAL_HOURS: 24,
  MAX_RETRIES: 3,
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
};

// ============================================================================
// AUTO-REPLY PROCESSOR
// ============================================================================
const processAutoReplies = async () => {
  try {
    console.log('[AI Background Processor] Processing auto-replies...');
    
    const response = await fetch(`${CONFIG.BASE_URL}/api/auto-reply-processor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Auto-reply processing failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('[AI Background Processor] Auto-reply processing completed:', result);
    
    return result;
  } catch (error) {
    console.error('[AI Background Processor] Auto-reply processing error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// FOLLOWUP SCHEDULER
// ============================================================================
const processFollowups = async () => {
  try {
    console.log('[AI Background Processor] Processing followups...');
    
    const response = await fetch(`${CONFIG.BASE_URL}/api/followup-scheduler`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Followup processing failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('[AI Background Processor] Followup processing completed:', result);
    
    return result;
  } catch (error) {
    console.error('[AI Background Processor] Followup processing error:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================================
// CLEANUP OLD DATA
// ============================================================================
const cleanupOldData = async () => {
  try {
    console.log('[AI Background Processor] Cleaning up old data...');
    
    // Clean up old activity logs (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { error: activityLogError } = await supabaseAdmin
      .from('ai_activity_log')
      .delete()
      .lt('created_at', thirtyDaysAgo.toISOString());
    
    if (activityLogError) {
      console.error('[AI Background Processor] Error cleaning activity logs:', activityLogError);
    }
    
    // Clean up old failed followup schedules (older than 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { error: followupError } = await supabaseAdmin
      .from('follow_up_schedule')
      .delete()
      .eq('status', 'failed')
      .lt('attempted_at', sevenDaysAgo.toISOString());
    
    if (followupError) {
      console.error('[AI Background Processor] Error cleaning followup schedules:', followupError);
    }
    
    console.log('[AI Background Processor] Cleanup completed');
    
  } catch (error) {
    console.error('[AI Background Processor] Cleanup error:', error);
  }
};

// ============================================================================
// LOG ACTIVITY
// ============================================================================
const logActivity = async (userId, leadId, activityType, activityData, status, errorMessage = null) => {
  try {
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id: userId,
      lead_id: leadId,
      activity_type: activityType,
      activity_data: activityData,
      status,
      error_message: errorMessage,
    });
  } catch (error) {
    console.error('[AI Background Processor] Error logging activity:', error);
  }
};

// ============================================================================
// MAIN PROCESSOR FUNCTION
// ============================================================================
const runBackgroundProcessor = async () => {
  console.log('[AI Background Processor] Starting background processor...');
  
  try {
    // Process auto-replies
    const autoReplyResult = await processAutoReplies();
    
    // Process followups
    const followupResult = await processFollowups();
    
    // Log overall processor activity
    await logActivity(
      null, // System activity
      null,
      'background_processor_run',
      {
        auto_reply_result: autoReplyResult,
        followup_result: followupResult,
        timestamp: new Date().toISOString()
      },
      autoReplyResult.success && followupResult.success ? 'success' : 'failed'
    );
    
    console.log('[AI Background Processor] Background processor run completed');
    
  } catch (error) {
    console.error('[AI Background Processor] Background processor error:', error);
    
    await logActivity(
      null,
      null,
      'background_processor_run',
      { error: error.message, timestamp: new Date().toISOString() },
      'failed',
      error.message
    );
  }
};

// ============================================================================
// SCHEDULER SETUP
// ============================================================================
let autoReplyInterval = null;
let followupInterval = null;
let cleanupInterval = null;

export const startBackgroundProcessor = () => {
  console.log('[AI Background Processor] Starting background processors...');
  
  // Start auto-reply processor
  if (autoReplyInterval) clearInterval(autoReplyInterval);
  autoReplyInterval = setInterval(
    processAutoReplies,
    CONFIG.AUTO_REPLY_INTERVAL_MINUTES * 60 * 1000
  );
  
  // Start followup scheduler
  if (followupInterval) clearInterval(followupInterval);
  followupInterval = setInterval(
    processFollowups,
    CONFIG.FOLLOWUP_SCHEDULE_INTERVAL_MINUTES * 60 * 1000
  );
  
  // Start cleanup processor
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(
    cleanupOldData,
    CONFIG.CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000
  );
  
  // Run initial processing
  setTimeout(processAutoReplies, 5000); // Wait 5 seconds after startup
  setTimeout(processFollowups, 10000); // Wait 10 seconds after startup
  
  console.log('[AI Background Processor] Background processors started');
  console.log(`[AI Background Processor] Auto-reply interval: ${CONFIG.AUTO_REPLY_INTERVAL_MINUTES} minutes`);
  console.log(`[AI Background Processor] Followup interval: ${CONFIG.FOLLOWUP_SCHEDULE_INTERVAL_MINUTES} minutes`);
  console.log(`[AI Background Processor] Cleanup interval: ${CONFIG.CLEANUP_INTERVAL_HOURS} hours`);
};

export const stopBackgroundProcessor = () => {
  console.log('[AI Background Processor] Stopping background processors...');
  
  if (autoReplyInterval) {
    clearInterval(autoReplyInterval);
    autoReplyInterval = null;
  }
  
  if (followupInterval) {
    clearInterval(followupInterval);
    followupInterval = null;
  }
  
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  
  console.log('[AI Background Processor] Background processors stopped');
};

// ============================================================================
// MANUAL TRIGGERS
// ============================================================================
export const triggerAutoReplyProcessing = async () => {
  return await processAutoReplies();
};

export const triggerFollowupProcessing = async () => {
  return await processFollowups();
};

export const triggerCleanup = async () => {
  return await cleanupOldData();
};

// ============================================================================
// STATUS CHECKS
// ============================================================================
export const getProcessorStatus = async () => {
  try {
    const [autoReplyStatus, followupStatus] = await Promise.all([
      fetch(`${CONFIG.BASE_URL}/api/auto-reply-processor`),
      fetch(`${CONFIG.BASE_URL}/api/followup-scheduler`)
    ]);
    
    const autoReplyData = autoReplyStatus.ok ? await autoReplyStatus.json() : null;
    const followupData = followupStatus.ok ? await followupStatus.json() : null;
    
    return {
      autoReply: {
        active: !!autoReplyInterval,
        status: autoReplyData,
        lastCheck: new Date().toISOString()
      },
      followup: {
        active: !!followupInterval,
        status: followupData,
        lastCheck: new Date().toISOString()
      },
      cleanup: {
        active: !!cleanupInterval,
        lastCheck: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[AI Background Processor] Error getting status:', error);
    return {
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// ============================================================================
// EXPORTS
// ============================================================================
export default {
  startBackgroundProcessor,
  stopBackgroundProcessor,
  triggerAutoReplyProcessing,
  triggerFollowupProcessing,
  triggerCleanup,
  getProcessorStatus,
  runBackgroundProcessor
};
