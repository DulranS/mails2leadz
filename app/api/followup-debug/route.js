// app/api/followup-debug/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';

// ============================================================================
// DEBUG FOLLOWUP SYSTEM - COMPREHENSIVE ANALYSIS
// ============================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const followupId = searchParams.get('followupId');
    
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      userId,
      analysis: {}
    };
    
    // 1. Check user integrations
    const { data: integrations, error: integrationError } = await supabaseAdmin
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('service', 'gmail');
    
    debugInfo.analysis.integrations = {
      found: integrations?.length || 0,
      active: integrations?.filter(i => i.is_active).length || 0,
      details: integrations || [],
      error: integrationError?.message
    };
    
    // 2. Check leads with auto-reply enabled
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('id, email, business_name, status, auto_reply_enabled, follow_up_count, last_contacted_at')
      .eq('user_id', userId)
      .eq('auto_reply_enabled', true);
    
    debugInfo.analysis.leads = {
      total: leads?.length || 0,
      withAutoReply: leads?.filter(l => l.auto_reply_enabled).length || 0,
      details: leads || [],
      error: leadsError?.message
    };
    
    // 3. Check followup schedules
    let followupQuery = supabaseAdmin
      .from('follow_up_schedule')
      .select(`
        *,
        leads!inner(
          email,
          business_name,
          status,
          auto_reply_enabled
        )
      `)
      .eq('leads.user_id', userId);
    
    if (followupId) {
      followupQuery = followupQuery.eq('follow_up_schedule.id', followupId);
    }
    
    const { data: followups, error: followupsError } = await followupQuery;
    
    debugInfo.analysis.followups = {
      total: followups?.length || 0,
      pending: followups?.filter(f => f.status === 'pending').length || 0,
      completed: followups?.filter(f => f.status === 'completed').length || 0,
      failed: followups?.filter(f => f.status === 'failed').length || 0,
      overdue: followups?.filter(f => 
        f.status === 'pending' && 
        new Date(f.scheduled_date) <= new Date()
      ).length || 0,
      details: followups || [],
      error: followupsError?.message
    };
    
    // 4. Check email threads for tracking
    const { data: threads, error: threadsError } = await supabaseAdmin
      .from('email_threads')
      .select(`
        *,
        leads!inner(
          email,
          business_name
        )
      `)
      .eq('leads.user_id', userId)
      .eq('is_followup', true)
      .order('sent_at', { ascending: false })
      .limit(20);
    
    debugInfo.analysis.emailThreads = {
      total: threads?.length || 0,
      sent: threads?.filter(t => t.direction === 'sent').length || 0,
      processed: threads?.filter(t => t.processed).length || 0,
      withAiReply: threads?.filter(t => t.ai_reply_sent).length || 0,
      recent: threads?.slice(0, 5) || [],
      error: threadsError?.message
    };
    
    // 5. Check AI responses
    const { data: aiResponses, error: aiError } = await supabaseAdmin
      .from('ai_responses')
      .select(`
        *,
        leads!inner(
          email,
          business_name
        )
      `)
      .eq('leads.user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    debugInfo.analysis.aiResponses = {
      total: aiResponses?.length || 0,
      withReplies: aiResponses?.filter(r => r.ai_reply).length || 0,
      intents: aiResponses?.reduce((acc, r) => {
        acc[r.intent] = (acc[r.intent] || 0) + 1;
        return acc;
      }, {}) || {},
      recent: aiResponses?.slice(0, 5) || [],
      error: aiError?.message
    };
    
    // 6. Check activity logs
    const { data: activityLogs, error: activityError } = await supabaseAdmin
      .from('ai_activity_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(15);
    
    debugInfo.analysis.activityLogs = {
      total: activityLogs?.length || 0,
      byType: activityLogs?.reduce((acc, log) => {
        acc[log.activity_type] = (acc[log.activity_type] || 0) + 1;
        return acc;
      }, {}) || {},
      recent: activityLogs?.slice(0, 5) || [],
      error: activityError?.message
    };
    
    // 7. System health check
    const healthChecks = {
      integrationsOk: debugInfo.analysis.integrations.active > 0,
      leadsOk: debugInfo.analysis.leads.withAutoReply > 0,
      followupsOk: debugInfo.analysis.followups.total >= 0,
      threadsOk: debugInfo.analysis.emailThreads.total >= 0,
      aiOk: debugInfo.analysis.aiResponses.total >= 0
    };
    
    debugInfo.health = {
      overall: Object.values(healthChecks).every(check => check) ? 'healthy' : 'needs_attention',
      checks: healthChecks,
      issues: []
    };
    
    // Identify specific issues
    if (!healthChecks.integrationsOk) {
      debugInfo.health.issues.push('No active Gmail integrations found');
    }
    if (!healthChecks.leadsOk) {
      debugInfo.health.issues.push('No leads with auto-reply enabled');
    }
    if (debugInfo.analysis.followups.overdue > 0) {
      debugInfo.health.issues.push(`${debugInfo.analysis.followups.overdue} overdue followups`);
    }
    if (debugInfo.analysis.followups.failed > 0) {
      debugInfo.health.issues.push(`${debugInfo.analysis.followups.failed} failed followups`);
    }
    
    return NextResponse.json({
      success: true,
      debugInfo
    });
    
  } catch (error) {
    console.error('[Followup Debug] Error:', error);
    return NextResponse.json(
      { 
        error: 'Debug analysis failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST HANDLER - MANUAL FOLLOWUP TRIGGER
// ============================================================================
export async function POST(request) {
  try {
    const { followupId, userId, forceSend } = await request.json();
    
    if (!followupId || !userId) {
      return NextResponse.json(
        { error: 'Followup ID and User ID are required' },
        { status: 400 }
      );
    }
    
    console.log(`[Followup Debug] Manual trigger for followup ${followupId}`);
    
    // Get followup details
    const { data: followup, error: followupError } = await supabaseAdmin
      .from('follow_up_schedule')
      .select(`
        *,
        leads!inner(
          id,
          email,
          business_name,
          status,
          auto_reply_enabled,
          user_id
        ),
        user_integrations!inner(
          access_token,
          refresh_token,
          email,
          provider,
          service,
          is_active
        )
      `)
      .eq('id', followupId)
      .eq('leads.user_id', userId)
      .single();
    
    if (followupError || !followup) {
      return NextResponse.json(
        { error: 'Followup not found', details: followupError?.message },
        { status: 404 }
      );
    }
    
    // Check if followup can be processed
    if (!forceSend && followup.status !== 'pending') {
      return NextResponse.json(
        { error: `Followup status is ${followup.status}, cannot process` },
        { status: 400 }
      );
    }
    
    // Import and use the processFollowup function
    const { processFollowup } = await import('../followup-scheduler/route.js');
    
    // Update status to processing
    await supabaseAdmin
      .from('follow_up_schedule')
      .update({ 
        status: 'processing',
        attempted_at: new Date().toISOString()
      })
      .eq('id', followupId);
    
    // Process the followup
    const result = await processFollowup(followup);
    
    // Log the manual trigger
    await supabaseAdmin.from('ai_activity_log').insert({
      user_id: userId,
      lead_id: followup.leads.id,
      activity_type: 'manual_followup_trigger',
      activity_data: { followupId, forceSend, result },
      status: result.success ? 'success' : 'failed'
    });
    
    return NextResponse.json({
      success: true,
      message: 'Followup processed successfully',
      result
    });
    
  } catch (error) {
    console.error('[Followup Debug] Manual trigger error:', error);
    return NextResponse.json(
      { 
        error: 'Manual followup trigger failed',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
