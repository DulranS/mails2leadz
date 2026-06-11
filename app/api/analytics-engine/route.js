// app/api/analytics-engine/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * ADVANCED ANALYTICS ENGINE
 * 
 * Real business value features:
 * 1. ROI Tracking - Calculate actual return on investment
 * 2. Conversion Funnel - See drop-off points
 * 3. Channel Performance - Know which channels work best
 * 4. Revenue Attribution - Track revenue per lead source
 * 5. Cohort Analysis - Compare performance by time periods
 * 6. Customer Lifetime Value - Predict long-term revenue
 */

const calculateROI = (data) => {
  const totalCost = data.emails_sent * 0.01 + data.calls_made * 2.50 + data.sms_sent * 0.05;
  const revenue = data.closed_won_count * (data.avg_deal_value || 5000);
  const roi = totalCost > 0 ? ((revenue - totalCost) / totalCost) * 100 : 0;
  
  return {
    totalCost: Math.round(totalCost * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    profitMargin: revenue > 0 ? ((revenue - totalCost) / revenue) * 100 : 0
  };
};

const calculateConversionFunnel = (data) => {
  const funnel = {
    leads_sent: data.emails_sent || 0,
    leads_opened: Math.round((data.emails_sent || 1) * (data.open_rate || 0.25)),
    leads_clicked: Math.round((data.emails_sent || 1) * (data.click_rate || 0.08)),
    demos_scheduled: data.demos_scheduled || 0,
    proposals_sent: data.proposals_sent || 0,
    closed_won: data.closed_won_count || 0,
    closed_lost: data.closed_lost_count || 0
  };
  
  return {
    funnel,
    conversionRates: {
      sent_to_open: funnel.leads_opened / Math.max(1, funnel.leads_sent),
      open_to_click: funnel.leads_clicked / Math.max(1, funnel.leads_opened),
      click_to_demo: funnel.demos_scheduled / Math.max(1, funnel.leads_clicked),
      demo_to_proposal: funnel.proposals_sent / Math.max(1, funnel.demos_scheduled),
      proposal_to_close: funnel.closed_won / Math.max(1, funnel.proposals_sent),
      overall: funnel.closed_won / Math.max(1, funnel.leads_sent)
    }
  };
};

const calculateChannelPerformance = (data) => {
  const channels = {
    email: {
      sent: data.email_sent || 0,
      replies: data.email_replies || 0,
      conversions: data.email_conversions || 0,
      cost: (data.email_sent || 0) * 0.01,
      cac: 0 // Cost per Acquisition
    },
    whatsapp: {
      sent: data.whatsapp_sent || 0,
      replies: data.whatsapp_replies || 0,
      conversions: data.whatsapp_conversions || 0,
      cost: (data.whatsapp_sent || 0) * 0.04,
      cac: 0
    },
    sms: {
      sent: data.sms_sent || 0,
      replies: data.sms_replies || 0,
      conversions: data.sms_conversions || 0,
      cost: (data.sms_sent || 0) * 0.05,
      cac: 0
    },
    calls: {
      made: data.calls_made || 0,
      connected: data.calls_connected || 0,
      conversions: data.calls_conversions || 0,
      cost: (data.calls_made || 0) * 2.50,
      cac: 0
    }
  };
  
  // Calculate CAC for each channel
  Object.keys(channels).forEach(channel => {
    channels[channel].cac = channels[channel].conversions > 0 
      ? channels[channel].cost / channels[channel].conversions 
      : 0;
  });
  
  // Calculate response rates
  Object.keys(channels).forEach(channel => {
    const sent = channels[channel].sent || channels[channel].made || 0;
    channels[channel].responseRate = sent > 0 ? (channels[channel].replies / sent) : 0;
    channels[channel].conversionRate = sent > 0 ? (channels[channel].conversions / sent) : 0;
  });
  
  return channels;
};

const calculateCohortMetrics = (data, cohortField = 'source') => {
  const cohorts = {};
  
  if (data.leads && Array.isArray(data.leads)) {
    data.leads.forEach(lead => {
      const cohortKey = lead[cohortField] || 'unknown';
      
      if (!cohorts[cohortKey]) {
        cohorts[cohortKey] = {
          count: 0,
          conversions: 0,
          revenue: 0,
          avgDealValue: 0,
          conversionRate: 0
        };
      }
      
      cohorts[cohortKey].count++;
      if (lead.status === 'closed_won') {
        cohorts[cohortKey].conversions++;
        cohorts[cohortKey].revenue += lead.deal_value || 0;
      }
    });
  }
  
  // Calculate metrics
  Object.keys(cohorts).forEach(cohort => {
    cohorts[cohort].conversionRate = cohorts[cohort].conversions / Math.max(1, cohorts[cohort].count);
    cohorts[cohort].avgDealValue = cohorts[cohort].conversions > 0 
      ? cohorts[cohort].revenue / cohorts[cohort].conversions 
      : 0;
  });
  
  return cohorts;
};

const calculateLTV = (data) => {
  // Customer Lifetime Value = (ARPU × Gross Margin % × Customer Lifespan in months) / (Monthly Churn Rate %)
  const arpu = data.avg_deal_value || 5000;
  const grossMargin = (data.gross_margin || 0.75);
  const customerLifespan = data.customer_lifespan_months || 24;
  const monthlyChurnRate = data.monthly_churn_rate || 0.05;
  
  const ltv = (arpu * grossMargin * customerLifespan) / Math.max(0.01, monthlyChurnRate);
  const cac = data.customer_acquisition_cost || 500;
  const ltv_cac_ratio = ltv / Math.max(1, cac);
  
  return {
    ltv: Math.round(ltv),
    cac: Math.round(cac),
    ltv_cac_ratio: (ltv_cac_ratio).toFixed(2),
    healthy: ltv_cac_ratio >= 3 ? true : false,
    recommendation: ltv_cac_ratio >= 3 
      ? '✅ Healthy LTV:CAC ratio - Good for scaling'
      : '⚠️ Low LTV:CAC - Need to improve conversion or reduce acquisition cost'
  };
};

const calculatePipelineHealth = (data) => {
  const stages = {
    leads: data.leads_contacted || 0,
    qualified: data.qualified_leads || 0,
    proposals: data.proposals_sent || 0,
    negotiation: data.in_negotiation || 0,
    closed_won: data.closed_won_count || 0,
    closed_lost: data.closed_lost_count || 0
  };
  
  const totalValue = (data.pipeline_value || 0);
  const expectedRevenue = totalValue * (data.win_probability || 0.30);
  const avgDealValue = stages.closed_won > 0 
    ? expectedRevenue / stages.closed_won 
    : data.avg_deal_value || 5000;
  
  return {
    stages,
    totalPipelineValue: totalValue,
    expectedRevenue: Math.round(expectedRevenue),
    avgDealValue: Math.round(avgDealValue),
    dealsNeeded: Math.ceil((data.revenue_target || 100000) / Math.max(1, avgDealValue)),
    winRate: stages.leads > 0 ? (stages.closed_won / stages.leads) : 0
  };
};

export async function POST(request) {
  try {
    const { userId, action, timeframe = '30d', data = {} } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      );
    }

    // Fetch user's lead and contact data from sent_emails collection
    const leadsQuery = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId)
    );
    const leadsSnapshot = await getDocs(leadsQuery);
    const leads = leadsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Aggregate statistics
    const stats = {
      emails_sent: leads?.filter(l => l.channel === 'email').length || 0,
      email_replies: leads?.filter(l => l.channel === 'email' && l.replied).length || 0,
      whatsapp_sent: leads?.filter(l => l.channel === 'whatsapp').length || 0,
      whatsapp_replies: leads?.filter(l => l.channel === 'whatsapp' && l.replied).length || 0,
      sms_sent: leads?.filter(l => l.channel === 'sms').length || 0,
      calls_made: leads?.filter(l => l.channel === 'call').length || 0,
      closed_won_count: leads?.filter(l => l.status === 'closed_won').length || 0,
      closed_lost_count: leads?.filter(l => l.status === 'closed_lost').length || 0,
      open_rate: 0.25,
      click_rate: 0.08,
      avg_deal_value: data.avg_deal_value || 5000,
      leads: leads || []
    };
    
    let response = {};
    
    switch (action) {
      case 'roi':
        response = calculateROI(stats);
        break;
        
      case 'funnel':
        response = calculateConversionFunnel(stats);
        break;
        
      case 'channel_performance':
        response = calculateChannelPerformance(stats);
        break;
        
      case 'cohort':
        response = calculateCohortMetrics(stats, data.cohortField || 'source');
        break;
        
      case 'ltv':
        response = calculateLTV(data);
        break;
        
      case 'pipeline':
        response = calculatePipelineHealth(data);
        break;
        
      case 'comprehensive':
        response = {
          roi: calculateROI(stats),
          funnel: calculateConversionFunnel(stats),
          channelPerformance: calculateChannelPerformance(stats),
          ltv: calculateLTV(data),
          pipeline: calculatePipelineHealth(data),
          timeframe
        };
        break;
        
      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({
      success: true,
      action,
      timeframe,
      stats,
      analytics: response
    });
    
  } catch (error) {
    console.error('Analytics engine error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action') || 'comprehensive';
    const timeframe = searchParams.get('timeframe') || '30d';
    
    // Reuse POST logic
    return POST(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ userId, action, timeframe })
      })
    );
  } catch (error) {
    console.error('GET analytics error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
