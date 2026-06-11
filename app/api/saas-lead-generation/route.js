// app/api/saas-lead-generation/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import SAASLeadGenerationOrchestrator from '../../../lib/saas-lead-finder';

// ============================================================================
// MAIN LEAD GENERATION ENDPOINT
// ============================================================================
export async function POST(request) {
  try {
    const { action, settings } = await request.json();
    
    if (action === 'start') {
      console.log('[SAAS Lead Gen API] Starting automated lead generation...');
      
      // Initialize the orchestrator
      const orchestrator = new SAASLeadGenerationOrchestrator();
      await orchestrator.emailSender.initialize();
      
      // Run in background (don't wait for completion)
      orchestrator.runLeadGeneration().catch(error => {
        console.error('[SAAS Lead Gen API] Background process error:', error);
      });
      
      return NextResponse.json({
        success: true,
        message: 'Lead generation started in background',
        timestamp: new Date().toISOString()
      });
    }
    
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('[SAAS Lead Gen API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start lead generation',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET HANDLER - STATUS AND RESULTS
// ============================================================================
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'status':
        return await getLeadGenerationStatus();
        
      case 'results':
        return await getLeadGenerationResults(searchParams);
        
      case 'analytics':
        return await getLeadGenerationAnalytics();
        
      default:
        return NextResponse.json(
          { error: 'Invalid action parameter' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('[SAAS Lead Gen API] GET error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get data',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// STATUS CHECK
// ============================================================================
async function getLeadGenerationStatus() {
  try {
    // Get recent activity
    const { data: recentActivity } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(10);
    
    // Get today's statistics
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayStats } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('status', { count: 'exact' })
      .gte('sent_at', today);
    
    const sentCount = todayStats?.filter(stat => stat.status === 'sent').length || 0;
    const failedCount = todayStats?.filter(stat => stat.status === 'failed').length || 0;
    
    return NextResponse.json({
      success: true,
      status: {
        isRunning: true, // This would be tracked by a real job queue
        todayStats: {
          sent: sentCount,
          failed: failedCount,
          total: sentCount + failedCount
        },
        recentActivity: recentActivity || [],
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('[SAAS Lead Gen API] Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to get status', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// RESULTS RETRIEVAL
// ============================================================================
async function getLeadGenerationResults(searchParams) {
  try {
    const limit = parseInt(searchParams.get('limit')) || 20;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const status = searchParams.get('status') || 'all';
    
    let query = supabaseAdmin
      .from('saas_outreach_emails')
      .select(`
        *,
        research_data
      `)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    const { data: results, error } = await query;
    
    if (error) throw error;
    
    // Get total count
    const { count: totalCount } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({
      success: true,
      results: results || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0)
      }
    });
    
  } catch (error) {
    console.error('[SAAS Lead Gen API] Results retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to get results', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// ANALYTICS DASHBOARD
// ============================================================================
async function getLeadGenerationAnalytics() {
  try {
    const today = new Date();
    const last30Days = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    // Get 30-day statistics
    const { data: analytics } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('status, sent_at, research_data')
      .gte('sent_at', last30Days.toISOString());
    
    if (!analytics) {
      return NextResponse.json({
        success: true,
        analytics: {
          totalEmails: 0,
          successRate: 0,
          topCompanies: [],
          dailyTrends: [],
          researchInsights: {}
        }
      });
    }
    
    const totalEmails = analytics.length;
    const successfulEmails = analytics.filter(email => email.status === 'sent').length;
    const successRate = totalEmails > 0 ? (successfulEmails / totalEmails) * 100 : 0;
    
    // Top companies by email count
    const companyCounts = {};
    analytics.forEach(email => {
      if (email.research_data?.company) {
        companyCounts[email.research_data.company] = (companyCounts[email.research_data.company] || 0) + 1;
      }
    });
    
    const topCompanies = Object.entries(companyCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([company, count]) => ({ company, count }));
    
    // Daily trends
    const dailyTrends = {};
    analytics.forEach(email => {
      const day = email.sent_at?.slice(0, 10);
      if (day) {
        dailyTrends[day] = (dailyTrends[day] || 0) + 1;
      }
    });
    
    const dailyTrendArray = Object.entries(dailyTrends)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Research insights analysis
    const researchInsights = {
      avgConfidence: 0,
      topIndustries: {},
      commonPainPoints: {}
    };
    
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    analytics.forEach(email => {
      if (email.research_data?.confidence) {
        totalConfidence += email.research_data.confidence;
        confidenceCount++;
      }
    });
    
    researchInsights.avgConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;
    
    return NextResponse.json({
      success: true,
      analytics: {
        totalEmails,
        successRate: Math.round(successRate * 100) / 100,
        topCompanies,
        dailyTrends: dailyTrendArray,
        researchInsights,
        period: 'Last 30 days'
      }
    });
    
  } catch (error) {
    console.error('[SAAS Lead Gen API] Analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to get analytics', details: error.message },
      { status: 500 }
    );
  }
}
