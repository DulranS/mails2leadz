// app/api/saas-research/route.js
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseClient';
import { CrunchbaseClient, DecisionMakerFinder, SmartResearchAgent } from '../../../lib/saas-lead-finder';

// ============================================================================
// ADVANCED RESEARCH ENDPOINT
// ============================================================================

export async function POST(request) {
  try {
    const { action, data } = await request.json();
    
    switch (action) {
      case 'research-company':
        return await researchCompany(data);
      case 'find-decision-makers':
        return await findDecisionMakers(data);
      case 'enhance-research':
        return await enhanceResearch(data);
      case 'validate-contacts':
        return await validateContacts(data);
      default:
        return NextResponse.json(
          { error: 'Invalid research action' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('[SAAS Research] Error:', error);
    return NextResponse.json(
      { error: 'Research operation failed', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// DEEP COMPANY RESEARCH
// ============================================================================
async function researchCompany({ companyName, crunchbaseId }) {
  try {
    console.log(`[SAAS Research] Deep researching company: ${companyName}`);
    
    const crunchbaseClient = new CrunchbaseClient();
    let company;
    
    if (crunchbaseId) {
      // Get specific company from Crunchbase
      company = await crunchbaseClient.request('/entities/organizations', {
        'field_ids': 'funding_total,website,description,short_description,name,uuid,employee_count,headquarters_location,linkedin_url,twitter_url,logo_url',
        'where[uuid]': crunchbaseId
      });
      company = company.entities?.[0];
    } else {
      // Search for company
      company = await crunchbaseClient.request('/entities/organizations', {
        'field_ids': 'funding_total,website,description,short_description,name,uuid,employee_count,headquarters_location,linkedin_url,twitter_url,logo_url',
        'where[name]': companyName,
        'limit': 1
      });
      company = company.entities?.[0];
    }
    
    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }
    
    // Store in database
    const { data: storedCompany, error: storeError } = await supabaseAdmin
      .from('saas_companies')
      .upsert({
        crunchbase_id: company.uuid,
        name: company.name,
        website: company.website,
        description: company.description,
        short_description: company.short_description,
        funding_total: company.funding_total || 0,
        industry: 'saas', // Would be determined by analysis
        employee_count: company.employee_count || 0,
        headquarters_location: company.headquarters_location,
        linkedin_url: company.linkedin_url,
        twitter_url: company.twitter_url,
        logo_url: company.logo_url,
        status: 'active'
      }, {
        onConflict: 'crunchbase_id',
        returning: '*'
      })
      .select()
      .single();
    
    if (storeError) throw storeError;
    
    return NextResponse.json({
      success: true,
      company: storedCompany,
      message: 'Company research completed successfully'
    });
    
  } catch (error) {
    console.error('[SAAS Research] Company research error:', error);
    return NextResponse.json(
      { error: 'Failed to research company', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// DECISION MAKER DISCOVERY
// ============================================================================
async function findDecisionMakers({ companyId, companyName, maxResults = 5 }) {
  try {
    console.log(`[SAAS Research] Finding decision makers for: ${companyName}`);
    
    // Get company from database
    const { data: company, error: companyError } = await supabaseAdmin
      .from('saas_companies')
      .select('*')
      .eq('id', companyId)
      .single();
    
    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Company not found in database' },
        { status: 404 }
      );
    }
    
    const decisionMakerFinder = new DecisionMakerFinder();
    const decisionMakers = await decisionMakerFinder.findDecisionMakers(company);
    
    // Store decision makers in database
    const storedDecisionMakers = [];
    for (const dm of decisionMakers) {
      const { data: stored, error: dmError } = await supabaseAdmin
        .from('decision_makers')
        .upsert({
          company_id: companyId,
          name: dm.name,
          title: dm.title,
          email: dm.email,
          linkedin_url: dm.linkedin,
          confidence: dm.confidence,
          source: dm.source,
          phone: dm.phone,
          location: dm.location,
          status: 'potential'
        }, {
          onConflict: ['company_id', 'email'],
          returning: '*'
        })
        .select()
        .single();
      
      if (!dmError) {
        storedDecisionMakers.push(stored);
      }
    }
    
    return NextResponse.json({
      success: true,
      decisionMakers: storedDecisionMakers,
      company: company,
      message: `Found ${decisionMakers.length} decision makers`
    });
    
  } catch (error) {
    console.error('[SAAS Research] Decision maker finding error:', error);
    return NextResponse.json(
      { error: 'Failed to find decision makers', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// ENHANCED RESEARCH WITH AI
// ============================================================================
async function enhanceResearch({ companyId, decisionMakerId }) {
  try {
    console.log(`[SAAS Research] Enhancing research for company ${companyId}, decision maker ${decisionMakerId}`);
    
    // Get company and decision maker data
    const [companyResult, dmResult] = await Promise.all([
      supabaseAdmin
        .from('saas_companies')
        .select('*')
        .eq('id', companyId)
        .single(),
      
      supabaseAdmin
        .from('decision_makers')
        .select('*')
        .eq('id', decisionMakerId)
        .single()
    ]);
    
    if (companyResult.error || dmResult.error || !companyResult.data || !dmResult.data) {
      return NextResponse.json(
        { error: 'Company or decision maker not found' },
        { status: 404 }
      );
    }
    
    const researchAgent = new SmartResearchAgent();
    const researchData = await researchAgent.researchCompany(companyResult.data, dmResult.data);
    
    // Store research insights
    const insightsToStore = Object.entries(researchData.insights).map(([type, data]) => ({
      company_id: companyId,
      decision_maker_id: decisionMakerId,
      insight_type: type,
      insight_data: data,
      confidence: data.confidence,
      sources: data.sources
    }));
    
    const { data: storedInsights, error: insightsError } = await supabaseAdmin
      .from('research_insights')
      .insert(insightsToStore)
      .select();
    
    if (insightsError) throw insightsError;
    
    return NextResponse.json({
      success: true,
      researchData,
      insights: storedInsights,
      message: 'Research enhancement completed'
    });
    
  } catch (error) {
    console.error('[SAAS Research] Research enhancement error:', error);
    return NextResponse.json(
      { error: 'Failed to enhance research', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// CONTACT VALIDATION
// ============================================================================
async function validateContacts({ contacts }) {
  try {
    console.log(`[SAAS Research] Validating ${contacts.length} contacts`);
    
    const validationResults = [];
    
    for (const contact of contacts) {
      const validation = await validateSingleContact(contact);
      validationResults.push(validation);
    }
    
    // Update decision makers with validation results
    for (const result of validationResults) {
      if (result.isValid && result.decisionMakerId) {
        await supabaseAdmin
          .from('decision_makers')
          .update({
            confidence: result.confidence,
            status: 'validated',
            notes: result.notes
          })
          .eq('id', result.decisionMakerId);
      }
    }
    
    return NextResponse.json({
      success: true,
      validationResults,
      summary: {
        total: contacts.length,
        valid: validationResults.filter(r => r.isValid).length,
        invalid: validationResults.filter(r => !r.isValid).length
      }
    });
    
  } catch (error) {
    console.error('[SAAS Research] Contact validation error:', error);
    return NextResponse.json(
      { error: 'Failed to validate contacts', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// SINGLE CONTACT VALIDATION
// ============================================================================
async function validateSingleContact(contact) {
  try {
    const validation = {
      email: contact.email,
      isValid: true,
      confidence: 0.5,
      notes: '',
      checks: {}
    };
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    validation.checks.emailFormat = emailRegex.test(contact.email);
    
    // Domain validation
    if (contact.email) {
      const domain = contact.email.split('@')[1];
      validation.checks.domainExists = await checkDomainExists(domain);
    }
    
    // LinkedIn URL validation
    if (contact.linkedin) {
      validation.checks.linkedinValid = await validateLinkedInURL(contact.linkedin);
    }
    
    // Calculate overall confidence
    const validChecks = Object.values(validation.checks).filter(Boolean).length;
    const totalChecks = Object.keys(validation.checks).length;
    validation.confidence = validChecks / totalChecks;
    
    validation.isValid = validation.confidence >= 0.6;
    
    return validation;
    
  } catch (error) {
    console.error('[SAAS Research] Contact validation error:', error);
    return {
      email: contact.email,
      isValid: false,
      confidence: 0,
      notes: error.message,
      checks: {}
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function checkDomainExists(domain) {
  try {
    // Simple DNS check (in production, use a proper domain validation service)
    const response = await fetch(`https://dns.google/resolve?name=${domain}&type=A`);
    return response.ok && response.status === 200;
  } catch {
    return false;
  }
}

async function validateLinkedInURL(url) {
  try {
    if (!url) return false;
    
    const linkedinRegex = /^https?:\/\/(www\.)?linkedin\.com\/in\/[\w-]+$/;
    return linkedinRegex.test(url);
  } catch {
    return false;
  }
}
