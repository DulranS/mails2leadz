// app/api/deal-pipeline/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * DEAL PIPELINE MANAGEMENT ENGINE
 * 
 * Manages the entire deal lifecycle:
 * - Deal stages with probability weighting
 * - Expected revenue calculations
 * - Automatic stage progression
 * - Sales forecasting
 * - Win/loss analysis
 */

const DEAL_STAGES = {
  lead: { order: 1, probability: 0.05, name: 'Lead' },
  qualified: { order: 2, probability: 0.15, name: 'Qualified' },
  demo_scheduled: { order: 3, probability: 0.30, name: 'Demo Scheduled' },
  proposal_sent: { order: 4, probability: 0.50, name: 'Proposal Sent' },
  negotiation: { order: 5, probability: 0.75, name: 'Negotiation' },
  closed_won: { order: 6, probability: 1.00, name: 'Closed Won' },
  closed_lost: { order: 0, probability: 0.00, name: 'Closed Lost' }
};

const calculateExpectedRevenue = (deals) => {
  let totalExpected = 0;
  const byStage = {};
  
  Object.keys(DEAL_STAGES).forEach(stage => {
    byStage[stage] = { count: 0, value: 0, expected: 0 };
  });
  
  deals.forEach(deal => {
    const stage = deal.stage || 'lead';
    const value = deal.deal_value || 0;
    const probability = DEAL_STAGES[stage]?.probability || 0;
    const expected = value * probability;
    
    if (!byStage[stage]) byStage[stage] = { count: 0, value: 0, expected: 0 };
    
    byStage[stage].count++;
    byStage[stage].value += value;
    byStage[stage].expected += expected;
    totalExpected += expected;
  });
  
  return { totalExpected, byStage };
};

const calculateForecast = (deals, targetDays = 90) => {
  const won = deals.filter(d => d.stage === 'closed_won');
  const avgCycleDays = won.length > 0 
    ? won.reduce((sum, d) => sum + (d.sales_cycle_days || 30), 0) / won.length
    : 30;
  
  const active = deals.filter(d => ['qualified', 'demo_scheduled', 'proposal_sent', 'negotiation'].includes(d.stage));
  const activeExpected = active.reduce((sum, d) => {
    const prob = DEAL_STAGES[d.stage]?.probability || 0;
    return sum + (d.deal_value || 0) * prob;
  }, 0);
  
  const dealsInWindow = active.filter(d => {
    const createdDays = Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return createdDays < avgCycleDays * 1.5;
  });
  
  const forecastedRevenue = dealsInWindow.reduce((sum, d) => {
    const prob = DEAL_STAGES[d.stage]?.probability || 0;
    return sum + (d.deal_value || 0) * prob;
  }, 0);
  
  return {
    avgSalesCycleDays: Math.round(avgCycleDays),
    activeDeals: active.length,
    dealsInForecastWindow: dealsInWindow.length,
    forecastedRevenue: Math.round(forecastedRevenue),
    confidenceLevel: Math.min(0.95, active.length > 0 ? activeExpected / (activeExpected + 1) : 0.5)
  };
};

const calculateWinRate = (deals) => {
  const closed = deals.filter(d => ['closed_won', 'closed_lost'].includes(d.stage));
  if (closed.length === 0) return { rate: 0, total: 0, won: 0, lost: 0 };
  
  const won = closed.filter(d => d.stage === 'closed_won').length;
  const lost = closed.filter(d => d.stage === 'closed_lost').length;
  
  return {
    rate: (won / closed.length) * 100,
    total: closed.length,
    won,
    lost
  };
};

const analyzeBottlenecks = (deals) => {
  const bottlenecks = {};
  
  Object.keys(DEAL_STAGES).forEach(stage => {
    const stageDeals = deals.filter(d => d.stage === stage);
    const avgTimeInStage = stageDeals.length > 0
      ? stageDeals.reduce((sum, d) => {
          const daysInStage = Math.floor((Date.now() - new Date(d.stage_entered_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24));
          return sum + daysInStage;
        }, 0) / stageDeals.length
      : 0;
    
    bottlenecks[stage] = {
      count: stageDeals.length,
      avgTimeInStage: Math.round(avgTimeInStage),
      expectedTimeInStage: stage === 'lead' ? 7 : stage === 'qualified' ? 5 : stage === 'demo_scheduled' ? 10 : stage === 'proposal_sent' ? 14 : 10,
      isBottleneck: avgTimeInStage > 20
    };
  });
  
  return bottlenecks;
};

const suggestNextActions = (deals) => {
  const suggestions = [];
  
  // Identify stalled deals
  const stalledDeals = deals.filter(d => {
    if (['closed_won', 'closed_lost'].includes(d.stage)) return false;
    const daysSinceUpdate = Math.floor((Date.now() - new Date(d.stage_entered_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24));
    return daysSinceUpdate > 14;
  });
  
  if (stalledDeals.length > 0) {
    suggestions.push({
      type: 'stalled_deals',
      count: stalledDeals.length,
      action: `Follow up on ${stalledDeals.length} stalled deal${stalledDeals.length > 1 ? 's' : ''}`,
      priority: 'high',
      deals: stalledDeals.slice(0, 5)
    });
  }
  
  // Identify deals ready to progress
  const readyToProgress = deals.filter(d => {
    if (d.stage === 'qualified' || d.stage === 'demo_scheduled') {
      const daysInStage = Math.floor((Date.now() - new Date(d.stage_entered_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return daysInStage > 5;
    }
    return false;
  });
  
  if (readyToProgress.length > 0) {
    suggestions.push({
      type: 'ready_to_progress',
      count: readyToProgress.length,
      action: `Move ${readyToProgress.length} deal${readyToProgress.length > 1 ? 's' : ''} to next stage`,
      priority: 'medium',
      deals: readyToProgress.slice(0, 5)
    });
  }
  
  // High-value deal early warning
  const highValueEarly = deals.filter(d => {
    if (d.stage === 'lead' && (d.deal_value || 0) > 50000) {
      return true;
    }
    return false;
  });
  
  if (highValueEarly.length > 0) {
    suggestions.push({
      type: 'high_value_leads',
      count: highValueEarly.length,
      action: `Prioritize ${highValueEarly.length} high-value lead${highValueEarly.length > 1 ? 's' : ''} (>${highValueEarly[0]?.deal_value || 50000})`,
      priority: 'high',
      deals: highValueEarly.slice(0, 5)
    });
  }
  
  return suggestions;
};

export async function POST(request) {
  try {
    const { userId, action, data = {} } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      );
    }

    // Fetch deals from deals collection
    const dealsQuery = query(
      collection(db, 'deals'),
      where('userId', '==', userId)
    );
    const dealsSnapshot = await getDocs(dealsQuery);
    const deals = dealsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    let response = {};
    
    switch (action) {
      case 'expected_revenue':
        response = calculateExpectedRevenue(deals || []);
        break;
        
      case 'forecast':
        response = calculateForecast(deals || [], data.targetDays || 90);
        break;
        
      case 'win_rate':
        response = calculateWinRate(deals || []);
        break;
        
      case 'bottlenecks':
        response = analyzeBottlenecks(deals || []);
        break;
        
      case 'suggestions':
        response = suggestNextActions(deals || []);
        break;
        
      case 'comprehensive':
        response = {
          expectedRevenue: calculateExpectedRevenue(deals || []),
          forecast: calculateForecast(deals || [], data.targetDays || 90),
          winRate: calculateWinRate(deals || []),
          bottlenecks: analyzeBottlenecks(deals || []),
          suggestions: suggestNextActions(deals || []),
          dealStages: DEAL_STAGES
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
      dealCount: deals?.length || 0,
      pipeline: response
    });
    
  } catch (error) {
    console.error('Deal pipeline error:', error);
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
    
    return POST(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ userId, action })
      })
    );
  } catch (error) {
    console.error('GET deal pipeline error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
