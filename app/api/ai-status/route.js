// app/api/ai-status/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import { getProcessorStatus } from '../../../lib/ai-background-processor';

// ============================================================================
// GET HANDLER - COMPREHENSIVE AI SYSTEM STATUS
// ============================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const today = new Date().toISOString().slice(0, 10);
    
    // Get AI settings
    const { data: settings } = await supabaseAdmin
      .from('ai_settings')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Get today's statistics
    const [
      aiResponsesResult,
      followupsResult,
      unprocessedRepliesResult,
      dueFollowupsResult,
      recentActivityResult
    ] = await Promise.all([
      // AI responses today
      supabaseAdmin
        .from('ai_responses')
        .select('*', { count: 'exact' })
        .gte('created_at', today)
        .eq('lead_id', supabaseAdmin
          .from('leads')
          .select('id')
          .eq('user_id', userId)
        ),
      
      // Followups completed today
      supabaseAdmin
        .from('follow_up_schedule')
        .select('*', { count: 'exact' })
        .eq('status', 'completed')
        .gte('completed_at', today)
        .eq('lead_id', supabaseAdmin
          .from('leads')
          .select('id')
          .eq('user_id', userId)
        ),
      
      // Unprocessed replies
      supabaseAdmin
        .from('email_threads')
        .select('*', { count: 'exact' })
        .eq('direction', 'received')
        .eq('processed', false)
        .eq('lead_id', supabaseAdmin
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('auto_reply_enabled', true)
        ),
      
      // Due followups
      supabaseAdmin
        .from('follow_up_schedule')
        .select('*', { count: 'exact' })
        .eq('status', 'pending')
        .lte('scheduled_date', today)
        .eq('lead_id', supabaseAdmin
          .from('leads')
          .select('id')
          .eq('user_id', userId)
          .eq('auto_reply_enabled', true)
        ),
      
      // Recent activity (last 24 hours)
      supabaseAdmin
        .from('ai_activity_log')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
    ]);
    
    // Get intent breakdown for today
    const { data: intentBreakdown } = await supabaseAdmin
      .from('ai_responses')
      .select('intent')
      .gte('created_at', today)
      .eq('lead_id', supabaseAdmin
        .from('leads')
        .select('id')
        .eq('user_id', userId)
      );
    
    const intentStats = intentBreakdown?.reduce((acc, response) => {
      acc[response.intent] = (acc[response.intent] || 0) + 1;
      return acc;
    }, {}) || {};
    
    // Get processor status
    const processorStatus = await getProcessorStatus();
    
    // Get lead statistics
    const { data: leadStats } = await supabaseAdmin
      .from('leads')
      .select('status, auto_reply_enabled')
      .eq('user_id', userId);
    
    const leadCounts = leadStats?.reduce((acc, lead) => {
      acc.total = (acc.total || 0) + 1;
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      if (lead.auto_reply_enabled) {
        acc.auto_reply_enabled = (acc.auto_reply_enabled || 0) + 1;
      }
      return acc;
    }, {}) || { total: 0 };
    
    const status = {
      system: {
        enabled: settings?.auto_reply_enabled || false,
        followup_enabled: settings?.auto_followup_enabled || false,
        processor_status: processorStatus,
        last_updated: settings?.updated_at
      },
      statistics: {
        today: {
          ai_responses: aiResponsesResult?.length || 0,
          followups_completed: followupsResult?.length || 0,
          intent_breakdown: intentStats
        },
        pending: {
          unprocessed_replies: unprocessedRepliesResult?.length || 0,
          due_followups: dueFollowupsResult?.length || 0
        },
        leads: leadCounts
      },
      settings: settings || {},
      recent_activity: recentActivityResult || [],
      health: {
        status: 'healthy',
        issues: []
      }
    };
    
    // Determine system health
    const issues = [];
    
    if (!settings?.auto_reply_enabled) {
      issues.push('Auto-reply is disabled');
    }
    
    if (unprocessedRepliesResult?.length > 10) {
      issues.push('High number of unprocessed replies');
    }
    
    if (dueFollowupsResult?.length > 20) {
      issues.push('High number of overdue followups');
    }
    
    if (processorStatus.error) {
      issues.push('Background processor error');
    }
    
    status.health.status = issues.length > 0 ? 'warning' : 'healthy';
    status.health.issues = issues;
    
    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[AI Status] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get AI system status',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST HANDLER - TRIGGER MANUAL PROCESSING
// ============================================================================
export async function POST(request) {
  try {
    const { action, userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    let result;
    let activityType;
    
    switch (action) {
      case 'process_auto_replies':
        const autoReplyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/auto-reply-processor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        result = await autoReplyResponse.json();
        activityType = 'manual_auto_reply_trigger';
        break;
        
      case 'process_followups':
        const followupResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/followup-scheduler`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        result = await followupResponse.json();
        activityType = 'manual_followup_trigger';
        break;
        
      case 'cleanup':
        const { triggerCleanup } = await import('../../../lib/ai-background-processor');
        result = await triggerCleanup();
        activityType = 'manual_cleanup_trigger';
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    // Log manual trigger
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id: userId,
      activity_type: activityType,
      activity_data: { action, result },
      status: result.success !== false ? 'success' : 'failed'
    });
    
    return NextResponse.json({
      success: true,
      message: `Manual ${action} triggered successfully`,
      result
    });
    
  } catch (error) {
    console.error('[AI Status] POST error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to trigger manual action',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
