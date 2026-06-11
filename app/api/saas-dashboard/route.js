// app/api/saas-dashboard/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import { SAASLeadGenerationOrchestrator, CrunchbaseClient, DecisionMakerFinder, SmartResearchAgent } from '../../../lib/saas-lead-finder';

// ============================================================================
// SAAS LEAD GENERATION DASHBOARD API
// ============================================================================

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'overview';
    const timeRange = searchParams.get('timeRange') || '30'; // days
    
    switch (view) {
      case 'overview':
        return await getOverviewData(timeRange);
      case 'companies':
        return await getCompaniesData(searchParams);
      case 'decision-makers':
        return await getDecisionMakersData(searchParams);
      case 'campaigns':
        return await getCampaignsData();
      case 'performance':
        return await getPerformanceData(timeRange);
      default:
        return await getOverviewData(timeRange);
    }
    
  } catch (error) {
    console.error('[SAAS Dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// OVERVIEW DATA
// ============================================================================
async function getOverviewData(timeRange) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(timeRange));
  
  try {
    // Get key metrics
    const [
      companiesResult,
      emailsResult,
      decisionMakersResult,
      campaignsResult
    ] = await Promise.all([
      // Recently funded companies
      supabaseAdmin
        .from('saas_companies')
        .select('*', { count: 'exact' })
        .gte('funding_date', startDate.toISOString().slice(0, 10)),
      
      // Emails sent
      supabaseAdmin
        .from('saas_outreach_emails')
        .select('*', { count: 'exact' })
        .gte('sent_at', startDate.toISOString()),
      
      // Decision makers found
      supabaseAdmin
        .from('decision_makers')
        .select('*', { count: 'exact' })
        .gte('created_at', startDate.toISOString()),
      
      // Active campaigns
      supabaseAdmin
        .from('lead_generation_campaigns')
        .select('*', { count: 'exact' })
        .eq('status', 'active')
    ]);
    
    const totalCompanies = companiesResult.count || 0;
    const totalEmails = emailsResult.count || 0;
    const totalDecisionMakers = decisionMakersResult.count || 0;
    const activeCampaigns = campaignsResult.count || 0;
    
    // Get email performance
    const { data: emailStats } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('status')
      .gte('sent_at', startDate.toISOString());
    
    const sentEmails = emailStats?.filter(e => e.status === 'sent').length || 0;
    const failedEmails = emailStats?.filter(e => e.status === 'failed').length || 0;
    const repliedEmails = emailStats?.filter(e => e.status === 'replied').length || 0;
    
    const successRate = totalEmails > 0 ? (sentEmails / totalEmails) * 100 : 0;
    const replyRate = sentEmails > 0 ? (repliedEmails / sentEmails) * 100 : 0;
    
    // Get industry breakdown
    const { data: industryData } = await supabaseAdmin
      .from('saas_companies')
      .select('industry')
      .gte('funding_date', startDate.toISOString().slice(0, 10));
    
    const industryCounts = industryData?.reduce((acc, company) => {
      const industry = company.industry || 'Other';
      acc[industry] = (acc[industry] || 0) + 1;
      return acc;
    }, {});
    
    return NextResponse.json({
      success: true,
      view: 'overview',
      timeRange: `${timeRange} days`,
      metrics: {
        totalCompanies,
        totalEmails,
        totalDecisionMakers,
        activeCampaigns,
        emailPerformance: {
          sent: sentEmails,
          failed: failedEmails,
          replied: repliedEmails,
          successRate: Math.round(successRate * 100) / 100,
          replyRate: Math.round(replyRate * 100) / 100
        },
        industryBreakdown: industryCounts
      },
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[SAAS Dashboard] Overview error:', error);
    throw error;
  }
}

// ============================================================================
// COMPANIES DATA
// ============================================================================
async function getCompaniesData(searchParams) {
  try {
    const limit = parseInt(searchParams.get('limit')) || 20;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const status = searchParams.get('status') || 'all';
    const industry = searchParams.get('industry');
    
    let query = supabaseAdmin
      .from('saas_companies')
      .select(`
        *,
        decision_makers!inner(count),
        saas_outreach_emails!inner(count)
      `)
      .order('funding_date', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status !== 'all') {
      query = query.eq('status', status);
    }
    
    if (industry) {
      query = query.eq('industry', industry);
    }
    
    const { data: companies, error } = await query;
    
    if (error) throw error;
    
    // Get total count
    const { count: totalCount } = await supabaseAdmin
      .from('saas_companies')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({
      success: true,
      view: 'companies',
      companies: companies || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0)
      }
    });
    
  } catch (error) {
    console.error('[SAAS Dashboard] Companies error:', error);
    throw error;
  }
}

// ============================================================================
// DECISION MAKERS DATA
// ============================================================================
async function getDecisionMakersData(searchParams) {
  try {
    const limit = parseInt(searchParams.get('limit')) || 20;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const status = searchParams.get('status') || 'all';
    const confidence = parseFloat(searchParams.get('confidence')) || 0;
    
    let query = supabaseAdmin
      .from('decision_makers')
      .select(`
        *,
        saas_companies!inner(name, industry, funding_total),
        saas_outreach_emails!inner(sent_at, status, subject)
      `)
      .order('confidence', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (status !== 'all') {
      query = query.eq('decision_makers.status', status);
    }
    
    if (confidence > 0) {
      query = query.gte('decision_makers.confidence', confidence);
    }
    
    const { data: decisionMakers, error } = await query;
    
    if (error) throw error;
    
    // Get total count
    const { count: totalCount } = await supabaseAdmin
      .from('decision_makers')
      .select('*', { count: 'exact', head: true });
    
    return NextResponse.json({
      success: true,
      view: 'decision-makers',
      decisionMakers: decisionMakers || [],
      pagination: {
        total: totalCount || 0,
        limit,
        offset,
        hasMore: (offset + limit) < (totalCount || 0)
      }
    });
    
  } catch (error) {
    console.error('[SAAS Dashboard] Decision makers error:', error);
    throw error;
  }
}

// ============================================================================
// CAMPAIGNS DATA
// ============================================================================
async function getCampaignsData() {
  try {
    const { data: campaigns, error } = await supabaseAdmin
      .from('lead_generation_campaigns')
      .select(`
        *,
        saas_companies(count),
        decision_makers(count),
        saas_outreach_emails(count)
      `)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      view: 'campaigns',
      campaigns: campaigns || []
    });
    
  } catch (error) {
    console.error('[SAAS Dashboard] Campaigns error:', error);
    throw error;
  }
}

// ============================================================================
// PERFORMANCE DATA
// ============================================================================
async function getPerformanceData(timeRange) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(timeRange));
  
  try {
    // Get daily email statistics
    const { data: dailyStats } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('status, sent_at')
      .gte('sent_at', startDate.toISOString());
    
    // Group by day
    const dailyData = {};
    dailyStats?.forEach(email => {
      const day = email.sent_at?.slice(0, 10);
      if (day) {
        if (!dailyData[day]) {
          dailyData[day] = { sent: 0, successful: 0, failed: 0, replied: 0 };
        }
        dailyData[day].sent++;
        if (email.status === 'sent') dailyData[day].successful++;
        if (email.status === 'failed') dailyData[day].failed++;
        if (email.status === 'replied') dailyData[day].replied++;
      }
    });
    
    // Convert to array for charts
    const performanceArray = Object.entries(dailyData)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
    
    // Get top performing content
    const { data: topContent } = await supabaseAdmin
      .from('saas_outreach_emails')
      .select('subject, status, research_data')
      .eq('status', 'sent')
      .gte('sent_at', startDate.toISOString());
    
    const subjectPerformance = topContent?.reduce((acc, email) => {
      const subject = email.subject;
      if (!acc[subject]) {
        acc[subject] = { count: 0, replies: 0 };
      }
      acc[subject].count++;
      if (email.replied_at) acc[subject].replies++;
      return acc;
    }, {});
    
    const topSubjects = Object.entries(subjectPerformance)
      .map(([subject, stats]) => ({ subject, ...stats, replyRate: stats.count > 0 ? stats.replies / stats.count : 0 }))
      .sort((a, b) => b.replyRate - a.replyRate)
      .slice(0, 10);
    
    return NextResponse.json({
      success: true,
      view: 'performance',
      timeRange: `${timeRange} days`,
      data: {
        dailyPerformance: performanceArray,
        topSubjects,
        totalEmails: dailyStats?.length || 0
      }
    });
    
  } catch (error) {
    console.error('[SAAS Dashboard] Performance error:', error);
    throw error;
  }
}
