// app/api/lead-assignment/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';

/**
 * INTELLIGENT LEAD ASSIGNMENT ENGINE
 * 
 * Distributes leads based on:
 * - Sales rep capacity
 * - Territory assignment
 * - Lead quality/value
 * - Rep specialization/skills
 * - Historical conversion rates
 * - Workload balancing
 */

const assignLeadByCapacity = (leads, salesReps) => {
  if (!salesReps || salesReps.length === 0) return { assigned: [], unassigned: leads };
  
  const assigned = [];
  const unassigned = [];
  
  // Sort leads by value (high value first)
  const sortedLeads = [...leads].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
  
  // Sort reps by current workload (least busy first)
  const repCapacity = salesReps.map(rep => ({
    ...rep,
    currentLoad: leads.filter(l => l.assigned_to === rep.id).length,
    capacityRemaining: (rep.max_capacity || 50) - leads.filter(l => l.assigned_to === rep.id).length
  })).sort((a, b) => b.capacityRemaining - a.capacityRemaining);
  
  sortedLeads.forEach(lead => {
    const availableRep = repCapacity.find(rep => rep.capacityRemaining > 0);
    
    if (availableRep) {
      assigned.push({
        leadId: lead.id,
        assignedTo: availableRep.id,
        repName: availableRep.name,
        reason: 'capacity_based',
        leadValue: lead.deal_value || 0
      });
      availableRep.capacityRemaining--;
    } else {
      unassigned.push(lead);
    }
  });
  
  return { assigned, unassigned, repCapacity };
};

const assignByTerritory = (leads, territories) => {
  if (!territories || territories.length === 0) return { assigned: [], unassigned: leads };
  
  const assigned = [];
  const unassigned = [];
  
  leads.forEach(lead => {
    // Match lead to territory by country/region
    const leadCountry = lead.country || lead.location || '';
    const territory = territories.find(t => 
      t.regions.some(region => leadCountry.toLowerCase().includes(region.toLowerCase()))
    );
    
    if (territory) {
      assigned.push({
        leadId: lead.id,
        territoryId: territory.id,
        territoryName: territory.name,
        assignedRep: territory.assigned_rep_id,
        reason: 'territory_match'
      });
    } else {
      unassigned.push(lead);
    }
  });
  
  return { assigned, unassigned };
};

const assignByConversionRate = (leads, salesReps) => {
  if (!salesReps || salesReps.length === 0) return { assigned: [], unassigned: leads };
  
  // Calculate conversion rate for each rep based on historical data
  const repStats = salesReps.map(rep => ({
    ...rep,
    conversionRate: rep.closed_won / Math.max(1, rep.total_assigned) || 0,
    quality: 'average'
  }));
  
  // Determine rep quality tier
  const avgConversionRate = repStats.reduce((sum, r) => sum + r.conversionRate, 0) / repStats.length;
  repStats.forEach(rep => {
    if (rep.conversionRate > avgConversionRate * 1.5) rep.quality = 'high';
    else if (rep.conversionRate < avgConversionRate * 0.5) rep.quality = 'low';
  });
  
  const assigned = [];
  const unassigned = [];
  
  // Sort leads by value (high-value to top converters)
  const sortedLeads = [...leads].sort((a, b) => (b.deal_value || 0) - (a.deal_value || 0));
  const topConverters = repStats.filter(r => r.quality === 'high').sort((a, b) => b.conversionRate - a.conversionRate);
  
  sortedLeads.forEach(lead => {
    let assignedRep = null;
    
    if (lead.deal_value > 50000 && topConverters.length > 0) {
      // High-value leads go to top converters
      assignedRep = topConverters[0];
    } else {
      // Round-robin assignment
      assignedRep = repStats.sort((a, b) => 
        (a.currentLoad || 0) - (b.currentLoad || 0)
      )[0];
    }
    
    if (assignedRep) {
      assigned.push({
        leadId: lead.id,
        assignedTo: assignedRep.id,
        repName: assignedRep.name,
        reason: 'conversion_rate_optimized',
        repConversionRate: (assignedRep.conversionRate * 100).toFixed(1) + '%'
      });
      assignedRep.currentLoad = (assignedRep.currentLoad || 0) + 1;
    } else {
      unassigned.push(lead);
    }
  });
  
  return { assigned, unassigned, repStats };
};

const balanceWorkload = (leads, salesReps) => {
  if (!salesReps || salesReps.length === 0) return { assigned: [], unassigned: leads };
  
  const repWorkload = salesReps.map(rep => ({
    ...rep,
    assignedLeads: [],
    totalValue: 0,
    count: 0
  }));
  
  // Sort leads to distribute evenly
  const sortedLeads = [...leads].sort(() => Math.random() - 0.5);
  
  let repIndex = 0;
  sortedLeads.forEach(lead => {
    const rep = repWorkload[repIndex % repWorkload.length];
    rep.assignedLeads.push(lead.id);
    rep.totalValue += lead.deal_value || 0;
    rep.count++;
    repIndex++;
  });
  
  const assigned = [];
  repWorkload.forEach(rep => {
    rep.assignedLeads.forEach(leadId => {
      assigned.push({
        leadId,
        assignedTo: rep.id,
        repName: rep.name,
        reason: 'workload_balanced'
      });
    });
  });
  
  return { 
    assigned, 
    workloadDistribution: repWorkload.map(r => ({
      repId: r.id,
      repName: r.name,
      assignedCount: r.count,
      totalValue: r.totalValue
    }))
  };
};

const recommendAssignment = (lead, salesReps, history = {}) => {
  const recommendations = [];
  
  // Check specialization match
  if (lead.industry && salesReps.length > 0) {
    const industrySpecialists = salesReps.filter(rep => 
      rep.specialized_industries?.includes(lead.industry)
    );
    
    if (industrySpecialists.length > 0) {
      recommendations.push({
        rep: industrySpecialists[0],
        score: 0.9,
        reason: 'Industry specialization match'
      });
    }
  }
  
  // Check company size match
  if (lead.company_size && salesReps.length > 0) {
    const sizeMatch = salesReps.filter(rep =>
      rep.target_company_sizes?.includes(lead.company_size)
    );
    
    if (sizeMatch.length > 0) {
      recommendations.push({
        rep: sizeMatch[0],
        score: 0.8,
        reason: 'Company size expertise'
      });
    }
  }
  
  // Check language capability
  if (lead.language && salesReps.length > 0) {
    const languageSpeakers = salesReps.filter(rep =>
      rep.languages?.includes(lead.language)
    );
    
    if (languageSpeakers.length > 0) {
      recommendations.push({
        rep: languageSpeakers[0],
        score: 0.7,
        reason: 'Language capability'
      });
    }
  }
  
  // Check capacity
  if (salesReps.length > 0) {
    const leastBusy = salesReps.sort((a, b) => 
      (a.current_workload || 0) - (b.current_workload || 0)
    )[0];
    
    recommendations.push({
      rep: leastBusy,
      score: 0.6,
      reason: 'Lowest current workload'
    });
  }
  
  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);
  
  return recommendations.slice(0, 3);
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
    
    // Fetch leads and sales reps
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('user_id', userId);
    
    if (leadsError) {
      console.error('Error fetching leads:', leadsError);
      return NextResponse.json(
        { error: 'Failed to fetch leads' },
        { status: 500 }
      );
    }
    
    // For demo, create sample sales reps
    const salesReps = data.salesReps || [
      { id: 'rep_1', name: 'Sarah Chen', max_capacity: 50, current_workload: 15 },
      { id: 'rep_2', name: 'James Rodriguez', max_capacity: 45, current_workload: 20 },
      { id: 'rep_3', name: 'Priya Patel', max_capacity: 40, current_workload: 10 }
    ];
    
    let response = {};
    
    switch (action) {
      case 'by_capacity':
        response = assignLeadByCapacity(leads || [], salesReps);
        break;
        
      case 'by_territory':
        response = assignByTerritory(leads || [], data.territories || []);
        break;
        
      case 'by_conversion_rate':
        response = assignByConversionRate(leads || [], salesReps);
        break;
        
      case 'balance_workload':
        response = balanceWorkload(leads || [], salesReps);
        break;
        
      case 'recommend':
        const leadToAssign = leads?.[0];
        if (leadToAssign) {
          response = {
            leadId: leadToAssign.id,
            recommendations: recommendAssignment(leadToAssign, salesReps)
          };
        }
        break;
        
      case 'comprehensive':
        response = {
          byCapacity: assignLeadByCapacity(leads || [], salesReps),
          byConversionRate: assignByConversionRate(leads || [], salesReps),
          workloadBalance: balanceWorkload(leads || [], salesReps),
          salesReps: salesReps.length
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
      leadCount: leads?.length || 0,
      assignment: response
    });
    
  } catch (error) {
    console.error('Lead assignment error:', error);
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
    console.error('GET lead assignment error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
