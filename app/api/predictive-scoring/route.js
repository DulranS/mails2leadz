// app/api/predictive-scoring/route.js
import { NextResponse } from 'next/server';
import { db } from '../../../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

/**
 * PREDICTIVE SCORING ENGINE
 * 
 * ML-inspired lead scoring that predicts:
 * - Deal closure probability
 * - Best contact time
 * - Churn risk for existing customers
 * - Upsell opportunity detection
 * - Price sensitivity estimation
 */

const predictClosureProbability = (lead, historicalData = {}) => {
  let score = 50; // Start neutral
  
  // Lead source quality
  const sourceQuality = {
    'referral': 0.9,
    'inbound': 0.8,
    'paid_ads': 0.7,
    'organic_search': 0.75,
    'cold_outreach': 0.4,
    'directory': 0.5
  };
  
  if (lead.source) {
    score = (score * 0.5) + (sourceQuality[lead.source] || 0.5) * 50;
  }
  
  // Engagement signals
  if (lead.email_opens > 2) score += 15;
  if (lead.email_clicks > 1) score += 10;
  if (lead.replied) score += 25;
  if (lead.demo_scheduled) score += 20;
  if (lead.proposal_sent) score += 15;
  
  // Company signals
  if (lead.company_size === 'enterprise') score += 10;
  else if (lead.company_size === 'mid_market') score += 7;
  
  // Recency - fresher leads score higher
  const daysSinceContact = Math.floor((Date.now() - new Date(lead.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceContact < 7) score += 5;
  else if (daysSinceContact > 60) score -= 10;
  
  // Budget alignment
  if (lead.estimated_budget && lead.deal_value) {
    const variance = Math.abs(lead.estimated_budget - lead.deal_value) / lead.estimated_budget;
    if (variance < 0.2) score += 10; // Budget aligned
    else if (variance > 0.5) score -= 5; // Budget mismatch
  }
  
  // Decision maker presence
  if (lead.decision_maker_found === 'Yes') score += 15;
  if (lead.multiple_stakeholders) score += 8;
  
  // Competitive threat
  if (lead.competitor_mentioned) score -= 10;
  
  // Cap between 0 and 100
  score = Math.min(100, Math.max(0, score));
  
  return {
    closureProbability: (score / 100).toFixed(2),
    probabilityPercent: Math.round(score),
    factors: {
      source: sourceQuality[lead.source] || 0.5,
      engagement: lead.replied ? 'high' : lead.email_opens ? 'medium' : 'low',
      recency: daysSinceContact < 14 ? 'fresh' : daysSinceContact < 30 ? 'recent' : 'stale',
      budgetAlignment: lead.estimated_budget ? 'tracked' : 'unknown',
      decisionMaker: lead.decision_maker_found === 'Yes' ? 'identified' : 'unknown'
    }
  };
};

const predictBestContactTime = (lead, historicalData = {}) => {
  // Day of week analysis
  const dayScores = {
    'Monday': 0.8,
    'Tuesday': 0.9,
    'Wednesday': 0.95,
    'Thursday': 0.85,
    'Friday': 0.6,
    'Saturday': 0.1,
    'Sunday': 0.15
  };
  
  // Time of day analysis
  const timeScores = {
    'early_morning': 0.5,    // 6-9 AM
    'morning': 0.9,          // 9-12 PM
    'midday': 0.7,           // 12-2 PM
    'afternoon': 0.85,       // 2-5 PM
    'evening': 0.4,          // 5-7 PM
    'night': 0.1             // 7 PM+
  };
  
  // Determine timezone
  const timezone = lead.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  // Calculate best time
  const now = new Date();
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  
  // Find best day
  const bestDay = Object.entries(dayScores).sort((a, b) => b[1] - a[1])[0][0];
  
  // Find best time
  const bestTime = Object.entries(timeScores).sort((a, b) => b[1] - a[1])[0];
  
  return {
    recommendedDay: bestDay,
    recommendedTime: bestTime[0],
    timezone,
    confidence: Math.max(...Object.values(dayScores)),
    alternativeTimes: Object.entries(timeScores)
      .sort((a, b) => b[1] - a[1])
      .slice(1, 4)
      .map(([time, score]) => ({ time, score }))
  };
};

const predictChurnRisk = (customer, historicalData = {}) => {
  let riskScore = 0; // 0 = no risk, 100 = high risk
  
  // Recent engagement
  const daysSinceLastContact = Math.floor((Date.now() - new Date(customer.last_contact || Date.now()).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceLastContact > 60) riskScore += 30;
  else if (daysSinceLastContact > 30) riskScore += 15;
  
  // Support tickets
  if (customer.open_support_tickets > 3) riskScore += 20;
  if (customer.unresolved_issues > 0) riskScore += 15;
  
  // Payment history
  if (customer.late_payments > 0) riskScore += 25;
  if (customer.payment_failures > 2) riskScore += 20;
  
  // Usage metrics
  if (customer.feature_usage < 20) riskScore += 25; // Low usage
  if (customer.login_frequency < 2) riskScore += 20; // Rare logins
  
  // NPS and satisfaction
  if (customer.nps_score < 0) riskScore += 30;
  else if (customer.nps_score < 30) riskScore += 15;
  
  // Renewal indicators
  if (customer.renewal_approaching && customer.auto_renew === false) riskScore += 20;
  
  // Contract value trend
  if (customer.contract_value_trend === 'decreasing') riskScore += 20;
  
  const riskLevel = riskScore > 70 ? 'Critical' : riskScore > 40 ? 'High' : riskScore > 20 ? 'Medium' : 'Low';
  
  return {
    churnRiskScore: Math.min(100, riskScore),
    riskLevel,
    recommendation: riskScore > 50 
      ? '🚨 Immediate action required - Schedule executive touch-base'
      : riskScore > 30
      ? '⚠️ Proactive engagement recommended - Offer support or upsell'
      : '✅ Healthy customer - Continue regular engagement'
  };
};

const detectUpsellOpportunities = (customer, historicalData = {}) => {
  const opportunities = [];
  
  // Usage-based upsell
  if (customer.current_plan === 'starter' && customer.feature_usage > 70) {
    opportunities.push({
      type: 'plan_upgrade',
      recommendation: 'Upgrade to Professional plan',
      reason: 'High feature usage on starter plan',
      potential_revenue: 50000 - customer.current_arpu
    });
  }
  
  // Feature expansion
  if (customer.unused_features > 5) {
    opportunities.push({
      type: 'feature_enablement',
      recommendation: 'Training session on advanced features',
      reason: 'Underutilized features - customer not getting full value',
      potential_revenue: 5000
    });
  }
  
  // Cross-sell
  if (customer.core_product_active && !customer.has_addon_a) {
    opportunities.push({
      type: 'addon_cross_sell',
      recommendation: 'Offer Premium Add-on (Analytics)',
      reason: 'Natural fit with current usage patterns',
      potential_revenue: 2000
    });
  }
  
  // Expansion into new territory
  if (customer.active_locations === 1 && customer.company_size === 'enterprise') {
    opportunities.push({
      type: 'territory_expansion',
      recommendation: 'Multi-location enterprise plan',
      reason: 'Enterprise customer with expansion opportunity',
      potential_revenue: customer.current_arpu * 5
    });
  }
  
  return {
    opportunityCount: opportunities.length,
    totalPotentialRevenue: opportunities.reduce((sum, o) => sum + (o.potential_revenue || 0), 0),
    opportunities: opportunities.sort((a, b) => (b.potential_revenue || 0) - (a.potential_revenue || 0))
  };
};

const estimatePriceSensitivity = (lead, historicalData = {}) => {
  let sensitivity = 50; // 0 = price insensitive, 100 = very price sensitive
  
  // Company size - larger companies are less price sensitive
  if (lead.company_size === 'enterprise') sensitivity -= 20;
  else if (lead.company_size === 'mid_market') sensitivity -= 10;
  else if (lead.company_size === 'startup') sensitivity += 15;
  
  // Budget allocation
  if (lead.budget_flexibility === 'high') sensitivity -= 15;
  else if (lead.budget_flexibility === 'low') sensitivity += 20;
  
  // Lead source
  if (lead.source === 'cold_outreach') sensitivity += 10; // Cold leads more price sensitive
  if (lead.source === 'referral') sensitivity -= 10; // Referrals less price sensitive
  
  // Deal stage
  if (lead.stage === 'proposal_sent') sensitivity -= 5; // Later stage less price sensitive
  
  // Competitive landscape
  if (lead.competitor_mentioned) sensitivity += 10; // More options = more price sensitive
  
  // Payment model preference
  if (lead.prefers_subscription) sensitivity -= 5; // Subscription = commitment
  if (lead.prefers_pay_per_use) sensitivity += 10; // PPAU = more sensitive
  
  sensitivity = Math.min(100, Math.max(0, sensitivity));
  
  const tier = sensitivity > 70 ? 'High' : sensitivity > 40 ? 'Medium' : 'Low';
  const strategy = sensitivity > 70 
    ? 'Offer value-based pricing, volume discounts, or freemium model'
    : sensitivity > 40
    ? 'Standard pricing with ROI justification'
    : 'Premium positioning, focus on value, not price';
  
  return {
    priceSensitivity: sensitivity,
    sensitivityTier: tier,
    recommendedStrategy: strategy,
    recommendations: {
      offer_discount: sensitivity > 60,
      emphasize_roi: sensitivity > 40,
      premium_positioning: sensitivity < 40,
      flexible_payment_terms: sensitivity > 70
    }
  };
};

export async function POST(request) {
  try {
    const { userId, leadId, action, data = {} } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      );
    }

    // Fetch lead data
    let lead = null;
    if (leadId) {
      const leadDoc = await getDoc(doc(db, 'deals', leadId));
      if (leadDoc.exists()) {
        lead = { id: leadDoc.id, ...leadDoc.data() };
      }
    } else if (data.lead) {
      lead = data.lead;
    }
    
    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }
    
    let response = {};
    
    switch (action) {
      case 'closure_probability':
        response = predictClosureProbability(lead);
        break;
        
      case 'best_contact_time':
        response = predictBestContactTime(lead);
        break;
        
      case 'churn_risk':
        response = predictChurnRisk(lead);
        break;
        
      case 'upsell_opportunities':
        response = detectUpsellOpportunities(lead);
        break;
        
      case 'price_sensitivity':
        response = estimatePriceSensitivity(lead);
        break;
        
      case 'comprehensive':
        response = {
          closureProbability: predictClosureProbability(lead),
          bestContactTime: predictBestContactTime(lead),
          churnRisk: predictChurnRisk(lead),
          upsellOpportunities: detectUpsellOpportunities(lead),
          priceSensitivity: estimatePriceSensitivity(lead)
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
      leadId: lead.id,
      leadEmail: lead.email,
      predictions: response
    });
    
  } catch (error) {
    console.error('Predictive scoring error:', error);
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
    const leadId = searchParams.get('leadId');
    const action = searchParams.get('action') || 'comprehensive';
    
    return POST(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify({ userId, leadId, action })
      })
    );
  } catch (error) {
    console.error('GET predictive scoring error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
