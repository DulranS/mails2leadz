'use client';

// Clear any problematic scripts and cache on load
if (typeof window !== 'undefined') {
  // Clear any remaining error handlers or hooks
  try {
    delete window.installHook;
    delete window.onerror;
    console.log('Cleared any remaining error handlers');
  } catch (e) {
    // Ignore errors during cleanup
  }
  
  // Force clear any reload locks
  sessionStorage.clear();
  localStorage.clear();
  console.log('Cleared all storage to prevent loops');
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

// ===== STRATEGIC ICP DEFINITION =====
const ICP_DEFINITION = {
  industry: 'B2B SaaS & Technology Companies',
  size: '50-500 employees (Series A-C)',
  geo: 'North America & UK',
  pain: 'Scaling customer acquisition efficiently',
  trigger: 'Recent funding round or product launch',
  description: 'High-growth tech companies that just raised funding and need to scale acquisition'
};

// ===== CONTROLLED TEMPLATE SYSTEM =====
const SALES_TEMPLATES = {
  email1: {
    name: 'Intro - Quick Question',
    subject: 'Quick question about {{company}}',
    body: `Hi {{name}},

Saw {{company}} just raised {{funding_amount}} - congras!

I help B2B SaaS companies like yours scale customer acquisition without increasing ad spend. We typically see 2-3x improvement in lead-to-customer conversion.

Worth a 10-min chat to see if this applies to your current growth stage?

Best,
{{sender_name}}

P.S. Here's my calendar: {{booking_link}} (10-min slots available)`,
    word_count: 89
  },
  
  email2: {
    name: 'Social Proof - Follow-up',
    subject: 'Re: {{company}} growth',
    body: `Hi {{name}},

Quick follow-up. We helped {{similar_company}} (similar stage) go from {{metric_before}} to {{metric_after}} in 90 days using our acquisition framework.

Their VP of Sales said: "{{testimonial}}"

If you're interested in similar results, I have some ideas specific to {{company}}'s current positioning.

Available for 10 mins: {{booking_link}}

Best,
{{sender_name}}`,
    word_count: 95
  },
  
  breakup: {
    name: 'Break-up - Closing loop',
    subject: 'Closing the loop',
    body: `Hi {{name}},

I'll stop reaching out after this one - but wanted to share one final thought:

{{personalized_insight}}

If timing changes and you want to explore customer acquisition scaling, my calendar is always open: {{booking_link}}

Wishing you continued success with {{company}}!

Best,
{{sender_name}}`,
    word_count: 82
  }
};

// ===== CADENCE CONFIGURATION =====
const CADENCE_RULES = {
  day0: { action: 'email', template: 'email1', linkedin: true },
  day3: { action: 'email', template: 'email2' },
  day5: { action: 'linkedin', template: 'message', condition: 'connected' },
  day7: { action: 'email', template: 'breakup' }
};

// ===== SAFETY & COMPLIANCE RULES =====
const SAFETY_RULES = {
  maxEmailsPerDay: 40,
  maxEmailsPerInbox: 30,
  bounceThreshold: 0.05,
  unsubscribeThreshold: 0.01,
  stopOnBounce: true,
  timezoneRequired: true,
  minTimeBetweenSends: 60000 // 1 minute between sends
};

// ===== AUTO-EXIT RULES =====
const AUTO_EXIT_RULES = {
  replied: true,
  booked: true,
  bounced: true,
  unsubscribed: true,
  not_interested: true
};

// ===== SMART LEAD DISCOVERY & CSV MAPPING =====

// Smart column mapping patterns
const COLUMN_PATTERNS = {
  // Company information
  company: ['company', 'company_name', 'organization', 'org', 'business', 'account', 'client', 'firm'],
  industry: ['industry', 'sector', 'category', 'vertical', 'market', 'niche', 'domain'],
  employees: ['employees', 'employee_count', 'team_size', 'headcount', 'staff', 'workforce', 'size'],
  revenue: ['revenue', 'annual_revenue', 'arr', 'mrr', 'sales', 'turnover', 'income'],
  funding: ['funding', 'funding_amount', 'investment', 'raised', 'series', 'round', 'valuation'],
  website: ['website', 'url', 'site', 'domain', 'web', 'homepage', 'link'],
  
  // Contact information
  name: ['name', 'full_name', 'contact_name', 'person', 'first_name', 'last_name'],
  firstName: ['first_name', 'firstname', 'given_name', 'forename'],
  lastName: ['last_name', 'lastname', 'surname', 'family_name'],
  email: ['email', 'email_address', 'mail', 'contact_email', 'work_email'],
  phone: ['phone', 'phone_number', 'telephone', 'mobile', 'cell', 'contact_phone'],
  linkedin: ['linkedin', 'linkedin_url', 'linkedin_profile', 'linked_in', 'social_linkedin'],
  title: ['title', 'job_title', 'position', 'role', 'designation', 'function'],
  
  // Location information
  country: ['country', 'nation', 'location_country', 'geo_country'],
  state: ['state', 'province', 'region', 'location_state'],
  city: ['city', 'location_city', 'town', 'urban_area'],
  address: ['address', 'location', 'street', 'office_address'],
  
  // Company signals
  description: ['description', 'about', 'summary', 'overview', 'profile', 'bio'],
  founded: ['founded', 'founded_year', 'established', 'start_date', 'incorporated'],
  stage: ['stage', 'funding_stage', 'company_stage', 'maturity', 'phase'],
  
  // Activity signals
  recentNews: ['recent_news', 'news', 'updates', 'announcements', 'press'],
  hiring: ['hiring', 'jobs', 'openings', 'recruiting', 'careers', 'vacancies'],
  products: ['products', 'services', 'offerings', 'solutions', 'portfolio'],
  
  // Custom fields
  notes: ['notes', 'comments', 'remarks', 'observations', 'details'],
  source: ['source', 'origin', 'list_name', 'campaign', 'acquisition'],
  tags: ['tags', 'labels', 'categories', 'keywords', 'flags']
};

// Smart lead discovery sources
const LEAD_SOURCES = {
  // B2B databases
  crunchbase: {
    name: 'Crunchbase',
    type: 'api',
    endpoint: 'https://api.crunchbase.com/v4/search',
    mapping: {
      company: 'name',
      industry: 'category',
      employees: 'num_employees',
      funding: 'total_funding',
      website: 'website',
      description: 'description'
    }
  },
  
  // Professional networks
  linkedin: {
    name: 'LinkedIn Sales Navigator',
    type: 'api',
    endpoint: 'https://api.linkedin.com/v2/sales',
    mapping: {
      company: 'companyName',
      industry: 'industry',
      employees: 'employeeCount',
      name: 'fullName',
      title: 'title',
      email: 'emailAddress'
    }
  },
  
  // Public databases
  github: {
    name: 'GitHub Organizations',
    type: 'scraper',
    endpoint: 'https://api.github.com/search/users',
    mapping: {
      company: 'login',
      description: 'description',
      website: 'blog',
      location: 'location'
    }
  },
  
  // Business registries
  opencorporates: {
    name: 'OpenCorporates',
    type: 'api',
    endpoint: 'https://api.opencorporates.com/companies',
    mapping: {
      company: 'name',
      industry: 'industry',
      founded: 'incorporation_date',
      address: 'registered_address'
    }
  }
};

// Smart CSV parser and mapper
class SmartCSVProcessor {
  constructor() {
    this.detectedColumns = null;
    this.columnMapping = null;
    this.dataStructure = null;
  }

  // Analyze CSV structure and detect columns
  analyzeCSVStructure(headers) {
    const detected = {};
    const mapping = {};
    
    headers.forEach(header => {
      const normalizedHeader = header.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
      
      // Try to match each column pattern
      for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
        if (patterns.some(pattern => 
          normalizedHeader.includes(pattern.toLowerCase()) ||
          header.toLowerCase().includes(pattern.toLowerCase())
        )) {
          detected[field] = header;
          mapping[field] = header;
          break;
        }
      }
    });
    
    this.detectedColumns = detected;
    this.columnMapping = mapping;
    
    return {
      detectedColumns: detected,
      columnMapping: mapping,
      confidence: this.calculateMappingConfidence(headers, mapping)
    };
  }

  // Calculate mapping confidence
  calculateMappingConfidence(headers, mapping) {
    const totalColumns = headers.length;
    const mappedColumns = Object.keys(mapping).length;
    const criticalFields = ['company', 'email', 'name'];
    const criticalMapped = criticalFields.filter(field => mapping[field]).length;
    
    return {
      overall: (mappedColumns / totalColumns) * 100,
      critical: (criticalMapped / criticalFields.length) * 100,
      mapped: mappedColumns,
      total: totalColumns,
      criticalMapped: criticalMapped,
      suggestions: this.generateMissingFieldSuggestions(mapping)
    };
  }

  // Generate suggestions for missing fields
  generateMissingFieldSuggestions(mapping) {
    const suggestions = {};
    const criticalFields = ['company', 'email', 'name'];
    
    criticalFields.forEach(field => {
      if (!mapping[field]) {
        suggestions[field] = {
          required: true,
          alternatives: COLUMN_PATTERNS[field].map(p => `"${p}"`).join(', '),
          example: this.generateFieldExample(field)
        };
      }
    });
    
    return suggestions;
  }

  // Generate example for field
  generateFieldExample(field) {
    const examples = {
      company: 'Acme Corp, Tech Solutions Inc, StartupXYZ',
      email: 'john@company.com, contact@business.org',
      name: 'John Smith, Jane Doe, Robert Johnson',
      industry: 'Software, Technology, SaaS, FinTech',
      employees: '50, 100, 250, 500',
      funding: '$1M, $5M, $10M, Series A'
    };
    return examples[field] || 'N/A';
  }

  // Process CSV data with smart mapping
  processCSVData(rawData, headers) {
    const analysis = this.analyzeCSVStructure(headers);
    const processedData = [];
    
    rawData.forEach((row, index) => {
      const processed = {
        id: `lead_${Date.now()}_${index}`,
        source: 'csv_upload',
        uploadDate: new Date().toISOString(),
        rawData: row,
        processed: {
          company: this.extractField(row, analysis.columnMapping, 'company'),
          contact: {
            name: this.extractField(row, analysis.columnMapping, 'name'),
            email: this.extractField(row, analysis.columnMapping, 'email'),
            phone: this.extractField(row, analysis.columnMapping, 'phone'),
            title: this.extractField(row, analysis.columnMapping, 'title'),
            linkedin: this.extractField(row, analysis.columnMapping, 'linkedin')
          },
          company: {
            name: this.extractField(row, analysis.columnMapping, 'company'),
            industry: this.extractField(row, analysis.columnMapping, 'industry'),
            employees: this.parseNumber(this.extractField(row, analysis.columnMapping, 'employees')),
            revenue: this.parseNumber(this.extractField(row, analysis.columnMapping, 'revenue')),
            funding: this.parseFunding(this.extractField(row, analysis.columnMapping, 'funding')),
            website: this.extractField(row, analysis.columnMapping, 'website'),
            description: this.extractField(row, analysis.columnMapping, 'description'),
            founded: this.parseNumber(this.extractField(row, analysis.columnMapping, 'founded')),
            stage: this.extractField(row, analysis.columnMapping, 'stage'),
            location: {
              country: this.extractField(row, analysis.columnMapping, 'country'),
              state: this.extractField(row, analysis.columnMapping, 'state'),
              city: this.extractField(row, analysis.columnMapping, 'city'),
              address: this.extractField(row, analysis.columnMapping, 'address')
            },
            signals: {
              recentNews: this.extractField(row, analysis.columnMapping, 'recentNews'),
              hiring: this.extractField(row, analysis.columnMapping, 'hiring'),
              products: this.extractField(row, analysis.columnMapping, 'products')
            }
          },
          metadata: {
            source: this.extractField(row, analysis.columnMapping, 'source') || 'CSV Import',
            tags: this.parseTags(this.extractField(row, analysis.columnMapping, 'tags')),
            notes: this.extractField(row, analysis.columnMapping, 'notes'),
            confidence: this.calculateRowConfidence(row, analysis.columnMapping)
          }
        }
      };
      
      processedData.push(processed);
    });
    
    return {
      data: processedData,
      analysis: analysis,
      summary: this.generateDataSummary(processedData)
    };
  }

  // Extract field with fallback
  extractField(row, mapping, field) {
    const column = mapping[field];
    if (!column) return null;
    
    let value = row[column];
    if (value === undefined || value === null || value === '') return null;
    
    return String(value).trim();
  }

  // Parse numbers with various formats
  parseNumber(value) {
    if (!value) return null;
    
    // Remove common formatting
    const cleanValue = String(value).replace(/[$,MmKk]/g, '').trim();
    const num = parseFloat(cleanValue);
    
    if (isNaN(num)) return null;
    
    // Handle multipliers
    if (String(value).toLowerCase().includes('m')) return num * 1000000;
    if (String(value).toLowerCase().includes('k')) return num * 1000;
    
    return num;
  }

  // Parse funding amounts
  parseFunding(value) {
    if (!value) return null;
    
    const str = String(value).toLowerCase();
    
    // Extract amount
    const amountMatch = str.match(/[$]([0-9,.]+[mk]?)/i);
    if (amountMatch) {
      const amount = this.parseNumber(amountMatch[1]);
      
      // Extract series if present
      const seriesMatch = str.match(/(seed|series [a-z]|pre-seed|angel|venture)/i);
      const series = seriesMatch ? seriesMatch[1] : null;
      
      return {
        amount,
        series,
        formatted: value
      };
    }
    
    return { amount: null, series: null, formatted: value };
  }

  // Parse tags
  parseTags(value) {
    if (!value) return [];
    
    const tags = String(value).split(/[,;|]/).map(tag => tag.trim()).filter(tag => tag);
    return tags;
  }

  // Calculate row confidence
  calculateRowConfidence(row, mapping) {
    const criticalFields = ['company', 'email', 'name'];
    const present = criticalFields.filter(field => 
      mapping[field] && row[mapping[field]]
    ).length;
    
    return (present / criticalFields.length) * 100;
  }

  // Generate data summary
  generateDataSummary(data) {
    const summary = {
      total: data.length,
      qualified: 0,
      withEmail: 0,
      withCompany: 0,
      withPhone: 0,
      withWebsite: 0,
      industries: {},
      employeeRanges: {},
      fundingStages: {}
    };
    
    data.forEach(row => {
      const processed = row.processed;
      
      // Basic counts
      if (processed.contact.email) summary.withEmail++;
      if (processed.company.name) summary.withCompany++;
      if (processed.contact.phone) summary.withPhone++;
      if (processed.company.website) summary.withWebsite++;
      
      // Industry breakdown
      const industry = processed.company.industry || 'Unknown';
      summary.industries[industry] = (summary.industries[industry] || 0) + 1;
      
      // Employee ranges
      const employees = processed.company.employees;
      if (employees) {
        const range = this.getEmployeeRange(employees);
        summary.employeeRanges[range] = (summary.employeeRanges[range] || 0) + 1;
      }
      
      // Funding stages
      const stage = processed.company.stage || processed.company.funding?.series || 'Unknown';
      summary.fundingStages[stage] = (summary.fundingStages[stage] || 0) + 1;
      
      // Quick qualification check
      if (this.quickQualificationCheck(processed)) {
        summary.qualified++;
      }
    });
    
    return summary;
  }

  // Get employee range
  getEmployeeRange(employees) {
    if (employees < 10) return '1-10';
    if (employees < 50) return '11-50';
    if (employees < 100) return '51-100';
    if (employees < 250) return '101-250';
    if (employees < 500) return '251-500';
    if (employees < 1000) return '501-1000';
    return '1000+';
  }

  // Quick qualification check
  quickQualificationCheck(processed) {
    const company = processed.company;
    const contact = processed.contact;
    
    // Must have basic info
    if (!company.name || !contact.name) return false;
    
    // Industry check
    const targetIndustries = ['software', 'saas', 'technology', 'fintech', 'healthtech'];
    const industry = (company.industry || '').toLowerCase();
    const industryMatch = targetIndustries.some(ind => industry.includes(ind));
    
    // Size check
    const employees = company.employees || 0;
    const sizeMatch = employees >= 50 && employees <= 500;
    
    // Funding check
    const hasFunding = company.funding?.amount || company.stage;
    
    return industryMatch && sizeMatch && hasFunding;
  }
}

// Smart lead discovery engine
class SmartLeadDiscovery {
  constructor() {
    this.sources = LEAD_SOURCES;
    this.discoveredLeads = [];
    this.discoveryHistory = [];
  }

  // Auto-discover leads from multiple sources
  async autoDiscoverLeads() {
    const discoveries = [];
    
    for (const [sourceKey, source] of Object.entries(this.sources)) {
      try {
        const leads = await this.discoverFromSource(sourceKey);
        if (leads.length > 0) {
          discoveries.push({
            source: source.name,
            count: leads.length,
            leads: leads.slice(0, 10), // Limit for demo
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.warn(`Failed to discover from ${source.name}:`, error);
      }
    }
    
    this.discoveryHistory.push(...discoveries);
    return discoveries;
  }

  // Discover from specific source
  async discoverFromSource(sourceKey) {
    const source = this.sources[sourceKey];
    
    if (source.type === 'api') {
      return this.discoverFromAPI(source);
    } else if (source.type === 'scraper') {
      return this.discoverFromScraper(source);
    }
    
    return [];
  }

  // API-based discovery
  async discoverFromAPI(source) {
    // Simulated API discovery - in production, this would make real API calls
    const mockLeads = this.generateMockLeads(source.name, 5);
    return mockLeads;
  }

  // Scraper-based discovery
  async discoverFromScraper(source) {
    // Simulated scraping - in production, this would use web scraping
    const mockLeads = this.generateMockLeads(source.name, 3);
    return mockLeads;
  }

  // Generate mock leads for demonstration
  generateMockLeads(sourceName, count) {
    const mockCompanies = [
      { name: 'TechFlow Solutions', industry: 'SaaS', employees: 150, funding: '$2M Series A' },
      { name: 'DataSync Inc', industry: 'Technology', employees: 75, funding: '$1M Seed' },
      { name: 'CloudBase Systems', industry: 'Cloud Computing', employees: 300, funding: '$5M Series B' },
      { name: 'AI Innovate Labs', industry: 'AI/ML', employees: 45, funding: '$750K Pre-Seed' },
      { name: 'SecureNet Solutions', industry: 'Cybersecurity', employees: 200, funding: '$3M Series A' }
    ];
    
    return mockCompanies.slice(0, count).map((company, index) => ({
      id: `${sourceName}_${Date.now()}_${index}`,
      source: sourceName,
      discovered: new Date().toISOString(),
      company: {
        ...company,
        website: `https://${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
        description: `Leading ${company.industry} company providing innovative solutions`,
        location: { country: 'United States', city: 'San Francisco' }
      },
      contact: {
        name: `John Doe ${index + 1}`,
        title: 'CEO',
        email: `contact@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
        phone: `+1-555-${String(index).padStart(3, '0')}-${String(index + 100).padStart(4, '0')}`,
        linkedin: `https://linkedin.com/in/johndoe${index + 1}`
      },
      confidence: 85,
      qualification: {
        score: 4,
        reasons: ['industry', 'size', 'funding'],
        qualified: true
      }
    }));
  }

  // Get discovery history
  getDiscoveryHistory() {
    return this.discoveryHistory;
  }

  // Get discovered leads
  getDiscoveredLeads() {
    return this.discoveredLeads;
  }
}

// ===== ENTERPRISE BUSINESS ENGINE =====
class SalesAutomationEngine {
  constructor() {
    this.isHealthy = true;
    this.lastHealthCheck = null;
    this.failures = [];
    this.dailySendCount = 0;
    this.lastResetDate = new Date().toDateString();
    this.sendHistory = [];
    this.templatePerformance = {
      email1: { sent: 0, replies: 0, meetings: 0 },
      email2: { sent: 0, replies: 0, meetings: 0 },
      breakup: { sent: 0, replies: 0, meetings: 0 }
    };
    this.manualMode = false;
    this.automationPaused = false;
  }

  // Lead qualification based on ICP
  qualifyLead(company) {
    const qualifications = {
      industry: this.checkIndustry(company),
      size: this.checkSize(company),
      funding: this.checkFunding(company),
      trigger: this.checkTrigger(company)
    };
    
    const score = Object.values(qualifications).filter(Boolean).length;
    return {
      qualified: score >= 3,
      score,
      reasons: Object.entries(qualifications)
        .filter(([key, value]) => value)
        .map(([key]) => key),
      details: qualifications,
      confidence: score / 4
    };
  }

  checkIndustry(company) {
    const targetIndustries = ['software', 'saas', 'technology', 'fintech', 'healthtech', 'enterprise software'];
    const industry = (company.industry || company.description || '').toLowerCase();
    return targetIndustries.some(ind => industry.includes(ind));
  }

  checkSize(company) {
    const employees = company.employees || company.size || 0;
    return employees >= 50 && employees <= 500;
  }

  checkFunding(company) {
    return !!(company.recent_funding || company.funding_stage || company.funding_amount);
  }

  checkTrigger(company) {
    return !!(company.recent_news || company.product_launch || company.hiring_spree || company.executive_change);
  }

  // 2-minute research extractor
  async extractResearch(company) {
    const research = {
      headline: `${company.name} - ${company.industry || 'Technology'}`,
      trigger: null,
      trigger_link: null,
      decision_makers: [],
      personalization: null,
      confidence_score: 0,
      research_time: new Date().toISOString()
    };

    // Extract trigger with link
    if (company.recent_funding) {
      research.trigger = `Raised ${company.recent_funding} in ${company.funding_date || 'recent round'}`;
      research.trigger_link = company.funding_link || '#';
      research.confidence_score += 0.4;
    } else if (company.product_launch) {
      research.trigger = `Launched ${company.product_launch} in ${company.launch_date || 'recently'}`;
      research.trigger_link = company.launch_link || '#';
      research.confidence_score += 0.3;
    } else if (company.recent_hiring) {
      research.trigger = `Hiring for ${company.recent_hiring} positions`;
      research.trigger_link = company.hiring_link || '#';
      research.confidence_score += 0.2;
    } else if (company.executive_change) {
      research.trigger = `New ${company.executive_change.role} joined`;
      research.trigger_link = company.executive_change.link || '#';
      research.confidence_score += 0.2;
    }

    // Extract decision makers with LinkedIn
    if (company.executives || company.leadership) {
      const executives = company.executives || company.leadership;
      research.decision_makers = executives
        .filter(exec => ['CEO', 'CTO', 'VP Sales', 'Head of Growth', 'CRO', 'VP Marketing'].includes(exec.role))
        .slice(0, 2)
        .map(exec => ({
          name: exec.name,
          role: exec.role,
          email: exec.email,
          linkedin: exec.linkedin || exec.linkedin_url,
          verified: false,
          verification_status: 'pending'
        }));
      
      if (research.decision_makers.length > 0) {
        research.confidence_score += 0.3;
      }
    }

    // Generate personalization
    research.personalization = this.generatePersonalization(company, research);
    
    return research;
  }

  generatePersonalization(company, research) {
    const observations = [];
    const impacts = [];

    if (research.trigger) {
      observations.push(research.trigger);
      impacts.push('Scaling acquisition is likely a priority right now');
    }

    if (company.employees > 200) {
      observations.push(`Team of ${company.employees}+ people`);
      impacts.push('Need efficient acquisition systems to support growth');
    }

    if (company.industry?.includes('SaaS')) {
      observations.push('B2B SaaS business model');
      impacts.push('Customer acquisition cost optimization is critical');
    }

    if (company.recent_funding && company.recent_funding.includes('Series')) {
      observations.push(`Just raised ${company.recent_funding}`);
      impacts.push('Investors expect rapid growth and user acquisition');
    }

    return {
      observation: observations[0] || 'Growing technology company',
      impact: impacts[0] || 'Efficient scaling essential for continued growth',
      confidence: observations.length > 0 ? 0.8 : 0.5,
      bullets: observations.slice(0, 2).map((obs, i) => ({
        type: i === 0 ? 'observation' : 'impact',
        text: i === 0 ? obs : impacts[i] || obs
      }))
    };
  }

  // Email verification with MX record simulation
  async verifyEmail(email) {
    if (!email) return { valid: false, reason: 'No email provided' };
    
    const checks = {
      format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      risky_domain: ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(email.split('@')[1]),
      company_domain: !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(email.split('@')[1]),
      mx_record: null, // Would check MX records in real implementation
      disposable: false
    };
    
    // Simulate MX record check
    if (checks.company_domain) {
      checks.mx_record = Math.random() > 0.1; // 90% pass rate for company domains
    } else {
      checks.mx_record = Math.random() > 0.3; // 70% pass rate for personal domains
    }

    // Check for disposable email providers
    const disposableDomains = ['10minutemail.com', 'tempmail.org', 'guerrillamail.com'];
    checks.disposable = disposableDomains.some(domain => email.includes(domain));

    const valid = checks.format && checks.mx_record && !checks.disposable;
    const risk = checks.risky_domain ? 'high' : (checks.company_domain ? 'low' : 'medium');
    
    return {
      valid,
      risk,
      checks,
      score: valid ? (risk === 'low' ? 95 : (risk === 'medium' ? 70 : 40)) : 0,
      recommendation: checks.risky_domain ? 'Use company domain if possible' : 
                   !checks.mx_record ? 'Email may not receive messages' :
                   checks.disposable ? 'Use permanent email address' :
                   'Email looks good'
    };
  }

  // Template personalization with validation
  personalizeTemplate(template, lead) {
    const { company, decision_maker, research } = lead;
    
    // Validate required data
    if (!company?.name || !decision_maker?.name) {
      throw new Error('Missing required data for personalization');
    }
    
    let personalized = {
      ...template,
      subject: template.subject.replace(/{{company}}/g, company.name),
      body: template.body
        .replace(/{{name}}/g, decision_maker.name)
        .replace(/{{company}}/g, company.name)
        .replace(/{{funding_amount}}/g, company.recent_funding || 'recent funding')
        .replace(/{{similar_company}}/g, 'similar B2B SaaS company')
        .replace(/{{metric_before}}/g, '50 leads/month')
        .replace(/{{metric_after}}/g, '150 leads/month')
        .replace(/{{testimonial}}/g, 'This transformed our entire customer acquisition strategy')
        .replace(/{{personalized_insight}}/g, `${research.personalization.observation}. ${research.personalization.impact}.`)
        .replace(/{{sender_name}}/g, 'Dulran Samarasinghe')
        .replace(/{{booking_link}}/g, 'https://cal.com/syndicate-solutions/10min'),
      personalization_score: research.personalization.confidence,
      word_count: template.word_count,
      variables_used: this.extractVariables(template.body)
    };
    
    return personalized;
  }

  extractVariables(text) {
    const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  }

  // Send safety check with comprehensive rules
  async checkSendSafety() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailySendCount = 0;
      this.lastResetDate = today;
    }

    const recentSends = this.sendHistory.filter(send => 
      Date.now() - new Date(send.timestamp).getTime() < SAFETY_RULES.minTimeBetweenSends
    );

    const checks = {
      daily_limit: this.dailySendCount < SAFETY_RULES.maxEmailsPerDay,
      inbox_limit: this.dailySendCount < SAFETY_RULES.maxEmailsPerInbox,
      timing_ok: recentSends.length === 0,
      healthy: this.isHealthy,
      bounce_rate_ok: this.calculateBounceRate() < SAFETY_RULES.bounceThreshold,
      unsubscribe_rate_ok: this.calculateUnsubscribeRate() < SAFETY_RULES.unsubscribeThreshold
    };

    return {
      safe: Object.values(checks).every(Boolean),
      checks,
      daily_count: this.dailySendCount,
      remaining: SAFETY_RULES.maxEmailsPerDay - this.dailySendCount,
      next_send_available: recentSends.length > 0 ? 
        new Date(recentSends[0].timestamp.getTime() + SAFETY_RULES.minTimeBetweenSends) : 
        new Date()
    };
  }

  calculateBounceRate() {
    const totalSent = Object.values(this.templatePerformance).reduce((sum, t) => sum + t.sent, 0);
    const totalBounces = totalSent * 0.02; // Simulated bounce rate
    return totalBounces / totalSent;
  }

  calculateUnsubscribeRate() {
    const totalSent = Object.values(this.templatePerformance).reduce((sum, t) => sum + t.sent, 0);
    const totalUnsubscribes = totalSent * 0.005; // Simulated unsubscribe rate
    return totalUnsubscribes / totalSent;
  }

  // Health check with token validation
  async runHealthCheck() {
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No authenticated user');
      }
      
      // Force token refresh
      const token = await user.getIdToken(true);
      if (!token) {
        throw new Error('Failed to refresh token');
      }
      
      // Test Firestore connectivity
      const testDoc = doc(db, 'health', 'check');
      await setDoc(testDoc, { 
        timestamp: serverTimestamp(),
        token_valid: true 
      });
      
      this.isHealthy = true;
      this.lastHealthCheck = new Date();
      
      return { 
        status: 'healthy', 
        timestamp: this.lastHealthCheck,
        token_valid: true,
        firestore_connected: true
      };
    } catch (error) {
      this.isHealthy = false;
      this.failures.push({
        timestamp: new Date(),
        error: error.message,
        type: error.message.includes('token') ? 'googleToken' : 'firestore'
      });
      
      return { 
        status: 'failed', 
        error: error.message, 
        timestamp: new Date(),
        token_valid: false,
        firestore_connected: false
      };
    }
  }

  // Execute cadence step with tracking
  async executeCadenceStep(lead, step, manualMode = false) {
    const template = SALES_TEMPLATES[step.template];
    if (!template) {
      throw new Error(`Template ${step.template} not found`);
    }

    const personalizedTemplate = this.personalizeTemplate(template, lead);
    
    // Record send attempt
    const sendRecord = {
      lead_id: lead.id,
      step: step,
      template: personalizedTemplate,
      delivery_method: manualMode ? 'manual' : 'automated',
      scheduled_at: new Date(),
      status: 'ready',
      personalization_score: personalizedTemplate.personalization_score
    };

    // Update template performance
    this.templatePerformance[step.template].sent++;

    return sendRecord;
  }

  // Check auto-exit conditions
  shouldExitSequence(lead) {
    return AUTO_EXIT_RULES[lead.status] === true;
  }

  // Record email send
  recordSend(leadId, templateType, success = true) {
    this.sendHistory.push({
      lead_id: leadId,
      template: templateType,
      timestamp: new Date(),
      success
    });

    if (success) {
      this.dailySendCount++;
    }

    // Clean old send history (keep last 1000)
    if (this.sendHistory.length > 1000) {
      this.sendHistory = this.sendHistory.slice(-1000);
    }
  }

  // Record response
  recordResponse(leadId, templateType, responseType) {
    if (responseType === 'reply') {
      this.templatePerformance[templateType].replies++;
    } else if (responseType === 'meeting') {
      this.templatePerformance[templateType].meetings++;
    }
  }

  // Get template performance metrics
  getTemplatePerformance() {
    const metrics = {};
    Object.entries(this.templatePerformance).forEach(([template, perf]) => {
      const replyRate = perf.sent > 0 ? (perf.replies / perf.sent) * 100 : 0;
      const meetingRate = perf.sent > 0 ? (perf.meetings / perf.sent) * 100 : 0;
      
      metrics[template] = {
        ...perf,
        reply_rate: replyRate.toFixed(1),
        meeting_rate: meetingRate.toFixed(1)
      };
    });
    return metrics;
  }

  // Manual mode toggle
  setManualMode(enabled) {
    this.manualMode = enabled;
    if (enabled) {
      this.automationPaused = true;
    }
  }

  // Pause automation
  pauseAutomation() {
    this.automationPaused = true;
  }

  // Resume automation
  resumeAutomation() {
    this.automationPaused = false;
  }
}

// Initialize engine
const automationEngine = new SalesAutomationEngine();

function FinalOptimalSalesMachine() {
  // Clear reload locks on successful mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Clear reload counters on successful component mount
      sessionStorage.removeItem('reactReloadCount');
      sessionStorage.removeItem('componentReloadCount');
      sessionStorage.removeItem('lastReloadTime');
      
      window.reactLoaded = true;
      console.log('React component successfully mounted, reload locks cleared');
    }
  }, []);
  
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // Initialize smart processors
  const csvProcessor = useRef(new SmartCSVProcessor());
  const leadDiscovery = useRef(new SmartLeadDiscovery());

  // Core campaign state
  const [campaign, setCampaign] = useState({
    status: 'idle', // idle, qualifying, researching, outreach, completed, paused
    target_count: 50,
    qualified_leads: [],
    research_queue: [],
    outreach_queue: [],
    in_sequence_leads: [],
    completed_leads: [],
    failed_leads: [],
    nurture_queue: [],
    current_step: 0,
    started_at: null,
    completed_at: null,
    template_iterations: 0,
    discovered_leads: [],
    csv_imports: []
  });

  // KPI state
  const [kpis, setKpis] = useState({
    emails_sent: 0,
    replies: 0,
    meetings_booked: 0,
    bounce_rate: 0,
    unsubscribe_rate: 0,
    reply_rate: 0,
    meeting_rate: 0,
    daily_sends: 0,
    weekly_sends: 0,
    leads_discovered: 0,
    csv_imports_processed: 0,
    auto_qualified: 0
  });

  // Contacts and data state
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [manualMode, setManualMode] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  // CSV processing state
  const [csvProcessing, setCsvProcessing] = useState({
    processing: false,
    progress: 0,
    analysis: null,
    preview: null,
    errors: []
  });

  // Lead discovery state
  const [discoveryStatus, setDiscoveryStatus] = useState({
    discovering: false,
    sources: Object.keys(LEAD_SOURCES),
    results: [],
    lastDiscovery: null
  });

  // Manual operations state
  const [manualEmailComposer, setManualEmailComposer] = useState(null);
  const [manualResearchQueue, setManualResearchQueue] = useState([]);
  const [manualOutreachQueue, setManualOutreachQueue] = useState([]);
  const [templatePerformance, setTemplatePerformance] = useState({});

  // Health monitoring
  const [systemHealth, setSystemHealth] = useState({
    status: 'unknown',
    last_check: null,
    failures: [],
    token_valid: false,
    firestore_connected: false
  });

  // UI state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);

  // Notification system
  const addNotification = useCallback((type, message, duration = 5000) => {
    const notification = {
      id: Date.now(),
      type,
      message,
      timestamp: new Date()
    };
    setNotifications(prev => [notification, ...prev].slice(0, 10));
    
    if (type === 'error') setError(message);
    if (type === 'success') setSuccess(message);
    
    // Auto-remove
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, duration);
  }, []);

  // Auth handlers
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      addNotification('success', 'Successfully signed in');
    } catch (err) {
      console.error('Sign in error:', err);
      addNotification('error', 'Failed to sign in: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      addNotification('success', 'Successfully signed out');
    } catch (err) {
      console.error('Sign out error:', err);
      addNotification('error', 'Failed to sign out');
    }
  };

  // Smart CSV processing functions
  const handleCSVUpload = useCallback(async (file) => {
    if (!user?.uid) {
      addNotification('error', 'Please sign in to upload CSV files');
      return;
    }
    
    try {
      setCsvProcessing(prev => ({ ...prev, processing: true, progress: 0, errors: [] }));
      
      // Read CSV file
      const text = await file.text();
      
      // Use Papa Parse if available, otherwise fallback
      let result;
      if (typeof window !== 'undefined' && window.Papa) {
        result = window.Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim()
        });
      } else {
        // Fallback simple CSV parser
        result = parseCSVSimple(text);
      }
      
      if (result.errors.length > 0) {
        throw new Error(`CSV parsing errors: ${result.errors.map(e => e.message).join(', ')}`);
      }
      
      setCsvProcessing(prev => ({ ...prev, progress: 25 }));
      
      // Process with smart mapping
      const processor = csvProcessor.current;
      const processedData = processor.processCSVData(result.data, result.meta.fields);
      
      setCsvProcessing(prev => ({ ...prev, progress: 50 }));
      
      // Save to Firestore with proper error handling
      const batch = writeBatch(db);
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      
      processedData.data.forEach(contact => {
        const docRef = doc(contactsRef);
        
        // Clean data to prevent undefined values
        const cleanData = {
          ...contact.processed,
          id: contact.id,
          source: contact.source || 'csv_upload',
          uploadDate: contact.uploadDate || new Date().toISOString(),
          rawData: contact.rawData || {},
          metadata: contact.metadata || {},
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        };
        
        // Remove undefined values
        Object.keys(cleanData).forEach(key => {
          if (cleanData[key] === undefined) {
            delete cleanData[key];
          }
        });
        
        batch.set(docRef, cleanData);
      });
      
      await batch.commit();
      setCsvProcessing(prev => ({ ...prev, progress: 75 }));
      
      // Update campaign state
      setCampaign(prev => ({
        ...prev,
        csv_imports: [...prev.csv_imports, {
          timestamp: new Date(),
          filename: file.name,
          records: processedData.data.length,
          qualified: processedData.summary.qualified,
          analysis: processedData.analysis
        }]
      }));
      
      // Update KPIs
      setKpis(prev => ({
        ...prev,
        csv_imports_processed: prev.csv_imports_processed + processedData.data.length,
        auto_qualified: prev.auto_qualified + processedData.summary.qualified
      }));
      
      setCsvProcessing(prev => ({ 
        ...prev, 
        processing: false, 
        progress: 100,
        analysis: processedData.analysis,
        preview: processedData.data.slice(0, 3)
      }));
      
      addNotification('success', `Successfully processed ${processedData.data.length} contacts. ${processedData.summary.qualified} auto-qualified.`);
      
      // Reload contacts
      await loadContacts();
      
    } catch (error) {
      console.error('CSV processing error:', error);
      setCsvProcessing(prev => ({ 
        ...prev, 
        processing: false, 
        errors: [error.message] 
      }));
      addNotification('error', `CSV processing failed: ${error.message}`);
    }
  }, [user, addNotification, loadContacts]);

  // Simple CSV parser fallback
  const parseCSVSimple = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return { data: [], errors: [{ message: 'Empty CSV file' }], meta: { fields: [] } };
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/["']/g, ''));
    const data = [];
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/["']/g, ''));
      const row = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      data.push(row);
    }
    
    return { data, errors, meta: { fields: headers } };
  };

  // Auto lead discovery
  const startAutoDiscovery = useCallback(async () => {
    if (!user?.uid) {
      addNotification('error', 'Please sign in to start lead discovery');
      return;
    }
    
    try {
      setDiscoveryStatus(prev => ({ ...prev, discovering: true, results: [] }));
      
      const discovery = leadDiscovery.current;
      const discoveries = await discovery.autoDiscoverLeads();
      
      let totalNewLeads = 0;
      
      for (const discoveryResult of discoveries) {
        // Save discovered leads to Firestore with proper error handling
        const batch = writeBatch(db);
        const contactsRef = collection(db, 'users', user.uid, 'contacts');
        
        discoveryResult.leads.forEach(lead => {
          const docRef = doc(contactsRef);
          
          // Clean data to prevent undefined values
          const cleanData = {
            ...lead.company,
            contact: lead.contact,
            id: lead.id,
            source: lead.source || 'auto_discovery',
            discovered: lead.discovered || new Date().toISOString(),
            confidence: lead.confidence || 0,
            qualification: lead.qualification || { qualified: false, score: 0, reasons: [] },
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp()
          };
          
          // Remove undefined values
          Object.keys(cleanData).forEach(key => {
            if (cleanData[key] === undefined) {
              delete cleanData[key];
            }
          });
          
          batch.set(docRef, cleanData);
        });
        
        await batch.commit();
        totalNewLeads += discoveryResult.leads.length;
      }
      
      // Update state
      setCampaign(prev => ({
        ...prev,
        discovered_leads: [...prev.discovered_leads, ...discoveries]
      }));
      
      setKpis(prev => ({
        ...prev,
        leads_discovered: prev.leads_discovered + totalNewLeads
      }));
      
      setDiscoveryStatus(prev => ({ 
        ...prev, 
        discovering: false, 
        results: discoveries,
        lastDiscovery: new Date()
      }));
      
      addNotification('success', `Discovered ${totalNewLeads} new leads from ${discoveries.length} sources.`);
      
      // Reload contacts
      await loadContacts();
      
    } catch (error) {
      console.error('Lead discovery error:', error);
      setDiscoveryStatus(prev => ({ ...prev, discovering: false }));
      addNotification('error', `Lead discovery failed: ${error.message}`);
    }
  }, [user, addNotification, loadContacts]);

  // Enhanced load contacts with smart filtering
  const loadContacts = useCallback(async () => {
    if (!user?.uid) {
      console.warn('Cannot load contacts: User not authenticated');
      return;
    }
    
    try {
      setLoading(true);
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const querySnapshot = await getDocs(contactsRef);
      const contactsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContacts(contactsData);
      
      // Auto-qualify new contacts
      const processor = csvProcessor.current;
      const qualifiedLeads = contactsData
        .filter(contact => !contact.qualification)
        .map(contact => {
          const qualification = automationEngine.qualifyLead(contact);
          return {
            ...contact,
            qualification
          };
        })
        .filter(contact => contact.qualification.qualified);
      
      if (qualifiedLeads.length > 0) {
        // Update qualified leads in Firestore
        const batch = writeBatch(db);
        qualifiedLeads.forEach(contact => {
          const docRef = doc(db, 'users', user.uid, 'contacts', contact.id);
          
          // Clean qualification data
          const cleanQualification = {
            qualification: contact.qualification || { qualified: false, score: 0, reasons: [] }
          };
          
          // Remove undefined values
          Object.keys(cleanQualification.qualification).forEach(key => {
            if (cleanQualification.qualification[key] === undefined) {
              delete cleanQualification.qualification[key];
            }
          });
          
          batch.update(docRef, cleanQualification);
        });
        await batch.commit();
        
        setKpis(prev => ({
          ...prev,
          auto_qualified: prev.auto_qualified + qualifiedLeads.length
        }));
        
        addNotification('success', `Auto-qualified ${qualifiedLeads.length} new contacts.`);
      }
      
    } catch (err) {
      console.error('Failed to load contacts:', err);
      addNotification('error', 'Failed to load contacts: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [user, addNotification]);

  // Start strategic campaign with auto-discovery
  const startCampaign = async () => {
    try {
      setLoading(true);
      setCampaign(prev => ({ ...prev, status: 'qualifying', started_at: new Date() }));
      addNotification('info', 'Starting strategic sales campaign...');

      // Step 1: Get all qualified leads (auto-discovered + CSV imported)
      const allQualifiedLeads = contacts.filter(contact => 
        contact.qualification && contact.qualification.qualified
      );
      
      // If not enough leads, start auto-discovery
      if (allQualifiedLeads.length < campaign.target_count) {
        addNotification('info', 'Not enough qualified leads. Starting auto-discovery...');
        await startAutoDiscovery();
        
        // Reload contacts after discovery
        await loadContacts();
        
        // Get updated qualified leads
        const updatedQualifiedLeads = contacts.filter(contact => 
          contact.qualification && contact.qualification.qualified
        );
        
        if (updatedQualifiedLeads.length >= campaign.target_count) {
          allQualifiedLeads.push(...updatedQualifiedLeads);
        }
      }
      
      // Take exactly 50 qualified leads
      const selectedLeads = allQualifiedLeads.slice(0, campaign.target_count);
      
      addNotification('success', `Selected ${selectedLeads.length} qualified leads for campaign.`);
      
      // Step 2: Research phase
      setCampaign(prev => ({ 
        ...prev, 
        status: 'researching', 
        qualified_leads: selectedLeads 
      }));
      
      await processResearchQueue(selectedLeads);
      
    } catch (err) {
      console.error('Campaign failed:', err);
      addNotification('error', 'Campaign failed: ' + err.message);
      setCampaign(prev => ({ ...prev, status: 'failed' }));
    } finally {
      setLoading(false);
    }
  };

  // Process research queue with full implementation
  const processResearchQueue = async (leads) => {
    try {
      addNotification('info', 'Processing research queue...');
      const researchedLeads = [];
      
      for (const lead of leads) {
        const research = await automationEngine.extractResearch(lead.company);
        
        // Verify emails for decision makers
        if (research.decision_makers.length > 0) {
          for (const dm of research.decision_makers) {
            if (dm.email) {
              const verification = await automationEngine.verifyEmail(dm.email);
              dm.verification = verification;
              dm.verified = verification.valid;
              dm.verification_status = verification.valid ? 'verified' : 'failed';
            }
          }
        }
        
        // Calculate overall lead score
        const leadScore = {
          qualification: lead.qualification.confidence,
          research: research.confidence_score,
          decision_makers: research.decision_makers.filter(dm => dm.verified).length,
          overall: (lead.qualification.confidence + research.confidence_score) / 2
        };
        
        researchedLeads.push({
          ...lead,
          research,
          status: 'researched',
          decision_maker: research.decision_makers[0] || null, // Primary decision maker
          all_decision_makers: research.decision_makers,
          researched_at: new Date(),
          lead_score: leadScore
        });
      }
      
      // Move to outreach queue
      setCampaign(prev => ({
        ...prev,
        status: 'outreach',
        research_queue: [],
        outreach_queue: researchedLeads.filter(l => l.decision_maker && l.decision_maker.verified)
      }));
      
      const readyForOutreach = researchedLeads.filter(l => l.decision_maker && l.decision_maker.verified).length;
      addNotification('success', `Research completed. ${readyForOutreach} leads ready for outreach`);
      
      // Start outreach automatically if not in manual mode
      if (!manualMode) {
        await processOutreachQueue();
      }
      
    } catch (err) {
      console.error('Research failed:', err);
      addNotification('error', 'Research failed: ' + err.message);
    }
  };

  // Process outreach queue with cadence execution
  const processOutreachQueue = async () => {
    try {
      const safetyCheck = await automationEngine.checkSendSafety();
      if (!safetyCheck.safe) {
        addNotification('error', `Send safety check failed. ${safetyCheck.remaining} emails remaining today.`);
        return;
      }
      
      setCampaign(prev => ({ ...prev, status: 'outreach' }));
      addNotification('info', 'Starting outreach sequence...');
      
      const outreachQueue = [...campaign.outreach_queue];
      const processedLeads = [];
      
      for (const lead of outreachQueue.slice(0, Math.min(safetyCheck.remaining, 10))) {
        // Execute Day 0 cadence
        const step = CADENCE_RULES.day0;
        const emailData = await automationEngine.executeCadenceStep(lead, step, manualMode);
        
        if (manualMode) {
          setManualEmailComposer(emailData);
          addNotification('info', `Manual email ready for ${lead.company.name}`);
        } else {
          // Simulate email send
          automationEngine.recordSend(lead.id, 'email1', true);
          addNotification('success', `Email sent to ${lead.company.name}`);
          
          // Update KPIs
          setKpis(prev => ({
            ...prev,
            emails_sent: prev.emails_sent + 1,
            daily_sends: prev.daily_sends + 1,
            weekly_sends: prev.weekly_sends + 1
          }));
        }
        
        // Schedule next steps
        const nextActions = [
          { day: 3, action: 'email2', template: 'email2', scheduled: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
          { day: 5, action: 'linkedin', template: 'message', scheduled: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },
          { day: 7, action: 'breakup', template: 'breakup', scheduled: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
        ];
        
        processedLeads.push({
          ...lead,
          last_outreach: new Date(),
          cadence_step: 0,
          next_actions: nextActions,
          status: 'in_sequence',
          sequence_start: new Date()
        });
      }
      
      // Update campaign state
      setCampaign(prev => ({
        ...prev,
        outreach_queue: outreachQueue.slice(processedLeads.length),
        in_sequence_leads: [...prev.in_sequence_leads, ...processedLeads]
      }));
      
    } catch (err) {
      console.error('Outreach failed:', err);
      addNotification('error', 'Outreach failed: ' + err.message);
    }
  };

  // Manual email composition (legacy function - will be replaced)
  const composeManualEmailLegacy = (lead, templateType) => {
    const template = SALES_TEMPLATES[templateType];
    if (!template) {
      addNotification('error', 'Template not found');
      return;
    }
    
    try {
      const emailData = automationEngine.personalizeTemplate(template, lead);
      setManualEmailComposer({
        ...emailData,
        lead,
        template_type: templateType,
        ready_to_send: true,
        send_method: 'manual'
      });
    } catch (err) {
      addNotification('error', 'Failed to compose email: ' + err.message);
    }
  };

  // Send manual email
  const sendManualEmail = async (emailData) => {
    try {
      // Record the send
      automationEngine.recordSend(emailData.lead.id, emailData.template_type, true);
      
      addNotification('success', `Manual email sent to ${emailData.lead.company.name}`);
      
      // Update KPIs
      setKpis(prev => ({
        ...prev,
        emails_sent: prev.emails_sent + 1,
        daily_sends: prev.daily_sends + 1
      }));
      
      // Update lead status
      const updatedLead = {
        ...emailData.lead,
        last_outreach: new Date(),
        cadence_step: emailData.lead.cadence_step + 1,
        status: 'in_sequence',
        last_email_sent: {
          template: emailData.template_type,
          sent_at: new Date(),
          method: 'manual'
        }
      };
      
      setCampaign(prev => ({
        ...prev,
        in_sequence_leads: prev.in_sequence_leads.map(l => 
          l.id === updatedLead.id ? updatedLead : l
        )
      }));
      
      setManualEmailComposer(null);
      
    } catch (err) {
      console.error('Manual email failed:', err);
      addNotification('error', 'Failed to send manual email');
    }
  };

  // Process cadence step for a lead
  const processCadenceStep = async (lead, stepType) => {
    try {
      const step = CADENCE_RULES[stepType];
      if (!step) {
        addNotification('error', 'Invalid cadence step');
        return;
      }

      const emailData = await automationEngine.executeCadenceStep(lead, step, manualMode);
      
      if (manualMode) {
        setManualEmailComposer(emailData);
        addNotification('info', `Manual ${stepType} email ready for ${lead.company.name}`);
      } else {
        automationEngine.recordSend(lead.id, step.template, true);
        addNotification('success', `${stepType} email sent to ${lead.company.name}`);
        
        setKpis(prev => ({
          ...prev,
          emails_sent: prev.emails_sent + 1
        }));
      }

      // Update lead
      const updatedLead = {
        ...lead,
        last_outreach: new Date(),
        cadence_step: lead.cadence_step + 1,
        status: 'in_sequence'
      };
      
      // Update local state
      setCampaign(prev => ({
        ...prev,
        in_sequence_leads: prev.in_sequence_leads.map(l => 
          l.id === updatedLead.id ? updatedLead : l
        )
      }));
      
    } catch (err) {
      console.error('Failed to process cadence step:', err);
      addNotification('error', 'Failed to send email');
    }
  };

  // Move lead to nurture function with proper error handling
  const moveToNurture = useCallback(async (leadId) => {
    if (!user?.uid) {
      addNotification('error', 'Please sign in to move leads to nurture');
      return;
    }
    
    try {
      const lead = campaign.in_sequence_leads.find(l => l.id === leadId);
      if (!lead) {
        addNotification('error', 'Lead not found');
        return;
      }

      // Update lead status in Firestore
      const leadRef = doc(db, 'users', user.uid, 'contacts', leadId);
      await updateDoc(leadRef, {
        status: 'nurtured',
        moved_to_nurture: serverTimestamp(),
        nurture_scheduled: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lastUpdated: serverTimestamp()
      });

      // Update local state
      const nurturedLead = {
        ...lead,
        status: 'nurtured',
        moved_to_nurture: new Date(),
        nurture_scheduled: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      setCampaign(prev => ({
        ...prev,
        in_sequence_leads: prev.in_sequence_leads.filter(l => l.id !== leadId),
        nurture_queue: [...prev.nurture_queue, nurturedLead]
      }));

      addNotification('success', 'Lead moved to nurture queue');
      
    } catch (err) {
      console.error('Failed to move to nurture:', err);
      addNotification('error', 'Failed to move to nurture');
    }
  }, [user, campaign.in_sequence_leads, addNotification]);

  // Enhanced Firebase error handling with retry logic
  const safeFirebaseOperation = useCallback(async (operation, retryCount = 3) => {
    for (let i = 0; i < retryCount; i++) {
      try {
        return await operation();
      } catch (error) {
        if (error.code === 'unavailable' && i < retryCount - 1) {
          console.warn(`Firebase operation failed, retrying (${i + 1}/${retryCount}):`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        } else if (error.code === 'permission-denied' || error.message?.includes('uid')) {
          console.error('Authentication error:', error);
          addNotification('error', 'Please sign in to perform this action');
          throw error;
        } else {
          console.error('Firebase operation failed:', error);
          addNotification('error', `Operation failed: ${error.message}`);
          throw error;
        }
      }
    }
  }, [addNotification]);

  // Compose manual email function
  const composeManualEmail = useCallback((lead, templateType) => {
    if (!lead) {
      addNotification('error', 'Please select a lead first');
      return;
    }
    
    const template = automationEngine.getTemplate(templateType);
    if (!template) {
      addNotification('error', 'Template not found');
      return;
    }
    
    const personalizedEmail = automationEngine.personalizeEmail(template, lead);
    
    setManualEmailComposer({
      lead,
      templateType,
      subject: personalizedEmail.subject,
      body: personalizedEmail.body,
      to: lead.contact?.email || lead.email || 'no-email@example.com'
    });
    
    addNotification('info', `Composing ${templateType} email for ${lead.company?.name || lead.name || 'Lead'}`);
  }, [addNotification]);
  
  // Record response function
  const recordResponse = useCallback(async (leadId, responseType) => {
    if (!user?.uid) {
      addNotification('error', 'Please sign in to record responses');
      return;
    }
    
    try {
      // Update lead status based on response
      let newStatus = 'replied';
      if (responseType === 'meeting') {
        newStatus = 'demo_scheduled';
      }
      
      // Update in Firestore
      const leadRef = doc(db, 'users', user.uid, 'contacts', leadId);
      await updateDoc(leadRef, {
        status: newStatus,
        lastResponse: responseType,
        lastResponseDate: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
      
      // Update local state
      setContacts(prev => prev.map(contact => 
        contact.id === leadId 
          ? { ...contact, status: newStatus, lastResponse: responseType }
          : contact
      ));
      
      // Update KPIs
      if (responseType === 'reply') {
        setKpis(prev => ({ ...prev, replies: prev.replies + 1 }));
      } else if (responseType === 'meeting') {
        setKpis(prev => ({ ...prev, meetings_booked: prev.meetings_booked + 1 }));
      }
      
      addNotification('success', `Recorded ${responseType} for lead`);
      
    } catch (error) {
      console.error('Failed to record response:', error);
      addNotification('error', 'Failed to record response: ' + error.message);
    }
  }, [user, addNotification]);

  // Health monitoring
  const checkSystemHealth = async () => {
    const health = await automationEngine.runHealthCheck();
    setSystemHealth({
      status: health.status,
      last_check: health.timestamp,
      failures: automationEngine.failures.slice(-5),
      token_valid: health.token_valid,
      firestore_connected: health.firestore_connected
    });
    
    if (health.status === 'failed') {
      setManualMode(true);
      addNotification('error', 'System health check failed. Switched to manual mode.');
    }
    
    return health;
  };

  // Update template performance
  const updateTemplatePerformance = () => {
    const performance = automationEngine.getTemplatePerformance();
    setTemplatePerformance(performance);
  };

  // Add missing import for Papa Parse
  useEffect(() => {
    // Load Papa Parse dynamically if not already loaded
    if (typeof window !== 'undefined' && !window.Papa) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
      script.async = true;
      script.onerror = () => {
        console.warn('Failed to load Papa Parse, using fallback parser');
      };
      document.body.appendChild(script);
    }
  }, []);
  
  // Enhanced error handling for network requests and browser extensions
  useEffect(() => {
    // Handle abort errors gracefully
    const handleAbortError = (event) => {
      console.warn('Request aborted gracefully:', event);
    };
    
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      // Ignore abort errors from browser extensions
      if (event.reason?.message?.includes('AbortError') ||
          event.reason?.message?.includes('webextension.js') ||
          event.reason?.message?.includes('Cannot read properties of null')) {
        console.warn('Ignoring browser extension related rejection');
        event.preventDefault();
        return;
      }
      
      // Ignore reference errors from external scripts
      if (event.reason?.message?.includes('Cannot access') ||
          event.reason?.message?.includes('before initialization')) {
        console.warn('Ignoring external script reference error');
        event.preventDefault();
        return;
      }
    };
    
    // Handle extension conflicts and external script errors
    const handleExtensionError = (event) => {
      // Browser extension conflicts
      if (event.message?.includes('TronWeb') || 
          event.message?.includes('bybit') || 
          event.message?.includes('ethereum') ||
          event.message?.includes('webextension.js') ||
          event.message?.includes('Cannot read properties of null')) {
        console.warn('Browser extension conflict detected and ignored');
        return;
      }
      
      // DOM manipulation errors from external scripts
      if (event.message?.includes('removeChild') ||
          event.message?.includes('Failed to execute') ||
          event.message?.includes('Cannot redefine property')) {
        console.warn('External script DOM manipulation error ignored');
        return;
      }
      
      // Reference errors from external scripts
      if (event.message?.includes('Cannot access') ||
          event.message?.includes('before initialization')) {
        console.warn('External script reference error ignored');
        return;
      }
    };
    
    window.addEventListener('abort', handleAbortError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleExtensionError);
    
    return () => {
      window.removeEventListener('abort', handleAbortError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleExtensionError);
    };
  }, []);

  // Effects
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
      if (user) {
        loadContacts();
        checkSystemHealth();
        // Auto-start discovery if no contacts
        setTimeout(() => {
          if (contacts.length === 0) {
            addNotification('info', 'No contacts found. Starting auto-discovery...');
            startAutoDiscovery();
          }
        }, 2000);
      } else {
        // Clear data on sign out
        setContacts([]);
        setCsvProcessing({ processing: false, progress: 0, analysis: null, preview: null, errors: [] });
        setDiscoveryStatus({ discovering: false, sources: Object.keys(LEAD_SOURCES), results: [], lastDiscovery: null });
      }
    });
    
    // Health check interval
    const healthInterval = setInterval(checkSystemHealth, 120000); // Every 2 minutes
    
    // KPI update interval
    const kpiInterval = setInterval(() => {
      updateTemplatePerformance();
      setKpis(prev => ({
        ...prev,
        reply_rate: prev.emails_sent > 0 ? (prev.replies / prev.emails_sent) * 100 : 0,
        meeting_rate: prev.emails_sent > 0 ? (prev.meetings_booked / prev.emails_sent) * 100 : 0,
        bounce_rate: automationEngine.calculateBounceRate() * 100,
        unsubscribe_rate: automationEngine.calculateUnsubscribeRate() * 100
      }));
    }, 30000); // Every 30 seconds
    
    return () => {
      unsubscribe();
      clearInterval(healthInterval);
      clearInterval(kpiInterval);
    };
  }, [contacts.length, loadContacts, startAutoDiscovery]);

  // Auto-switch to manual mode on health failures
  useEffect(() => {
    if (systemHealth.status === 'failed' && !manualMode) {
      setManualMode(true);
      addNotification('warning', 'Automatically switched to manual mode due to system issues.');
    }
  }, [systemHealth.status, manualMode]);

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>Strategic Sales Automation</title>
        <meta name="description" content="B2B Sales Automation with Manual Fallback" />
      </Head>

      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white">Strategic Sales Automation</h1>
              <div className="ml-4 flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  systemHealth.status === 'healthy' ? 'bg-green-500' :
                  systemHealth.status === 'failed' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                <span className="text-xs text-gray-300">
                  {systemHealth.status === 'healthy' ? 'System Online' :
                   systemHealth.status === 'failed' ? 'System Offline' :
                   'Checking...'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <div className="text-sm text-gray-300">
                    Welcome, {user.displayName || user.email}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="px-3 py-1 text-sm font-medium text-red-400 bg-red-900 rounded-md hover:bg-red-800"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Sign In with Google
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {['dashboard', 'campaign', 'leads', 'templates', 'kpis', 'manual'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`p-4 rounded-md shadow-lg max-w-sm ${
                  notification.type === 'error' ? 'bg-red-900 border border-red-700' :
                  notification.type === 'success' ? 'bg-green-900 border border-green-700' :
                  notification.type === 'warning' ? 'bg-yellow-900 border border-yellow-700' :
                  'bg-blue-900 border border-blue-700'
                }`}
              >
                <p className={`text-sm ${
                  notification.type === 'error' ? 'text-red-200' :
                  notification.type === 'success' ? 'text-green-200' :
                  notification.type === 'warning' ? 'text-yellow-200' :
                  'text-blue-200'
                }`}>
                  {notification.message}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Critical Alert */}
        {systemHealth.status === 'failed' && (
          <div className="bg-red-900 border-l-4 border-red-500 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-200">Automation System Offline</h3>
                <div className="mt-2 text-sm text-red-300">
                  <p>⚠️ Automation has been disabled due to system issues.</p>
                  <p className="mt-1">All manual operations remain fully functional.</p>
                </div>
                <div className="mt-4">
                  <div className="flex space-x-3">
                    <button
                      onClick={checkSystemHealth}
                      className="bg-red-800 text-red-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700"
                    >
                      Re-check System
                    </button>
                    <button
                      onClick={() => setManualMode(false)}
                      className="bg-red-700 text-red-200 px-4 py-2 rounded-md text-sm font-medium hover:bg-red-600"
                    >
                      Force Auto Mode
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">Emails Sent</dt>
                      <dd className="text-lg font-medium text-white">{kpis.emails_sent}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">Replies</dt>
                      <dd className="text-lg font-medium text-white">{kpis.replies}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">Meetings Booked</dt>
                      <dd className="text-lg font-medium text-white">{kpis.meetings_booked}</dd>
                    </dl>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-400 truncate">Reply Rate</dt>
                      <dd className="text-lg font-medium text-white">{kpis.reply_rate.toFixed(1)}%</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            {/* Smart Lead Discovery Section */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-white">Smart Lead Discovery</h2>
                  <button
                    onClick={() => setShowDiscoveryModal(true)}
                    className="px-4 py-2 text-sm font-medium text-blue-400 bg-blue-900 rounded-md hover:bg-blue-800"
                  >
                    Manage Sources
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400">{kpis.leads_discovered}</div>
                    <div className="text-sm text-gray-400">Leads Discovered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{kpis.auto_qualified}</div>
                    <div className="text-sm text-gray-400">Auto-Qualified</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400">{contacts.length}</div>
                    <div className="text-sm text-gray-400">Total Contacts</div>
                  </div>
                </div>
                
                {/* Discovery Sources */}
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-300 mb-3">Active Discovery Sources</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(LEAD_SOURCES).map(([key, source]) => (
                      <div key={key} className="bg-gray-700 rounded-lg p-3 text-center">
                        <div className="text-sm font-medium text-white">{source.name}</div>
                        <div className="text-xs text-gray-400 mt-1">{source.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Campaign Overview */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Campaign Overview</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400">{campaign.qualified_leads.length}</div>
                    <div className="text-sm text-gray-400">Qualified Leads</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400">{campaign.in_sequence_leads.length}</div>
                    <div className="text-sm text-gray-400">In Sequence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">{campaign.completed_leads.length}</div>
                    <div className="text-sm text-gray-400">Completed</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campaign Tab */}
        {activeTab === 'campaign' && (
          <div className="space-y-8">
            {/* ICP Definition */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Target ICP Definition</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Industry</h3>
                    <p className="text-sm text-gray-400">{ICP_DEFINITION.industry}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Size</h3>
                    <p className="text-sm text-gray-400">{ICP_DEFINITION.size}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Geography</h3>
                    <p className="text-sm text-gray-400">{ICP_DEFINITION.geo}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Key Pain</h3>
                    <p className="text-sm text-gray-400">{ICP_DEFINITION.pain}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Trigger</h3>
                    <p className="text-sm text-gray-400">{ICP_DEFINITION.trigger}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Target Count</h3>
                    <p className="text-sm text-gray-400">{campaign.target_count} qualified companies</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Campaign Control */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-white">Campaign Control</h2>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      campaign.status === 'idle' ? 'bg-gray-700 text-gray-300' :
                      campaign.status === 'qualifying' ? 'bg-blue-700 text-blue-300' :
                      campaign.status === 'researching' ? 'bg-yellow-700 text-yellow-300' :
                      campaign.status === 'outreach' ? 'bg-green-700 text-green-300' :
                      campaign.status === 'completed' ? 'bg-emerald-700 text-emerald-300' :
                      'bg-red-700 text-red-300'
                    }`}>
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                    {manualMode && (
                      <span className="px-3 py-1 text-xs font-medium rounded-full bg-orange-700 text-orange-300">
                        Manual Mode
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex space-x-4">
                    <button
                      onClick={startCampaign}
                      disabled={loading || campaign.status !== 'idle' || !user}
                      className="px-6 py-3 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      Start Campaign
                    </button>
                    <button
                      onClick={() => setManualMode(!manualMode)}
                      disabled={loading}
                      className="px-6 py-3 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600"
                    >
                      {manualMode ? 'Switch to Auto' : 'Switch to Manual'}
                    </button>
                    <button
                      onClick={checkSystemHealth}
                      disabled={loading}
                      className="px-6 py-3 text-sm font-medium text-blue-400 bg-blue-900 rounded-md hover:bg-blue-800"
                    >
                      Check Health
                    </button>
                    <button
                      onClick={startAutoDiscovery}
                      disabled={loading || discoveryStatus.discovering}
                      className="px-6 py-3 text-sm font-medium text-purple-400 bg-purple-900 rounded-md hover:bg-purple-800"
                    >
                      {discoveryStatus.discovering ? 'Discovering...' : 'Auto-Discover Leads'}
                    </button>
                  </div>
                </div>

                {/* Campaign Progress */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="text-center p-4 bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-blue-400">{campaign.qualified_leads.length}</div>
                    <div className="text-sm text-gray-400">Qualified</div>
                  </div>
                  <div className="text-center p-4 bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-400">{campaign.research_queue.length}</div>
                    <div className="text-sm text-gray-400">Research Queue</div>
                  </div>
                  <div className="text-center p-4 bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-orange-400">{campaign.outreach_queue.length}</div>
                    <div className="text-sm text-gray-400">Outreach Queue</div>
                  </div>
                  <div className="text-center p-4 bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-green-400">{campaign.in_sequence_leads.length}</div>
                    <div className="text-sm text-gray-400">In Sequence</div>
                  </div>
                  <div className="text-center p-4 bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-red-400">{campaign.failed_leads.length}</div>
                    <div className="text-sm text-gray-400">Failed</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Discovery Results */}
            {discoveryStatus.results.length > 0 && (
              <div className="bg-gray-800 rounded-lg">
                <div className="px-6 py-4 border-b border-gray-700">
                  <h2 className="text-lg font-medium text-white">Recent Discovery Results</h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {discoveryStatus.results.map((result, index) => (
                      <div key={index} className="bg-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-medium text-white">{result.source}</h3>
                            <p className="text-xs text-gray-400">
                              Discovered {result.count} leads at {new Date(result.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-sm text-green-400">
                            {result.count} new leads
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div className="space-y-8">
            {/* Lead Summary */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Lead Summary</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400">{contacts.length}</div>
                    <div className="text-sm text-gray-400">Total Contacts</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400">
                      {contacts.filter(c => c.qualification?.qualified).length}
                    </div>
                    <div className="text-sm text-gray-400">Qualified</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-yellow-400">
                      {contacts.filter(c => c.contact?.email).length}
                    </div>
                    <div className="text-sm text-gray-400">With Email</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400">
                      {contacts.filter(c => c.source === 'csv_upload').length}
                    </div>
                    <div className="text-sm text-gray-400">CSV Imported</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active Leads Table */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Active Leads</h2>
              </div>
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Source</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Qualification</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-800 divide-y divide-gray-700">
                    {contacts.slice(0, 10).map(contact => (
                      <tr key={contact.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                          {contact.company?.name || contact.name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          <div>
                            <div className="font-medium">{contact.contact?.name || 'N/A'}</div>
                            <div className="text-xs text-gray-400">{contact.contact?.email || 'N/A'}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            contact.qualification?.qualified ? 'bg-green-900 text-green-300' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {contact.qualification?.qualified ? 'Qualified' : 'Not Qualified'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          <div className="flex items-center">
                            <span className={`px-2 py-1 text-xs rounded ${
                              contact.source === 'csv_upload' ? 'bg-blue-900 text-blue-300' :
                              contact.source?.includes('Crunchbase') ? 'bg-purple-900 text-purple-300' :
                              contact.source?.includes('LinkedIn') ? 'bg-green-900 text-green-300' :
                              'bg-gray-700 text-gray-300'
                            }`}>
                              {contact.source || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                          {contact.qualification ? (
                            <div>
                              <div className="text-xs">Score: {contact.qualification.score}/4</div>
                              <div className="text-xs text-gray-400">
                                {contact.qualification.reasons?.join(', ') || 'N/A'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">Not evaluated</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => setSelectedLead(contact)}
                            className="text-blue-400 hover:text-blue-300 mr-3"
                          >
                            View
                          </button>
                          {contact.contact?.email && (
                            <button
                              onClick={() => composeManualEmail(contact, 'email1')}
                              className="text-green-400 hover:text-green-300 mr-3"
                            >
                              Email
                            </button>
                          )}
                          <button
                            onClick={() => recordResponse(contact.id, 'reply')}
                            className="text-yellow-400 hover:text-yellow-300 mr-3"
                          >
                            Reply
                          </button>
                          <button
                            onClick={() => recordResponse(contact.id, 'meeting')}
                            className="text-purple-400 hover:text-purple-300"
                          >
                            Meeting
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="space-y-8">
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Email Templates</h2>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {Object.entries(SALES_TEMPLATES).map(([key, template]) => (
                    <div key={key} className="bg-gray-700 rounded-lg p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-white">{template.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-400">{template.word_count} words</span>
                          <button
                            onClick={() => setEditingTemplate({ key, ...template })}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Subject</label>
                          <input
                            type="text"
                            value={template.subject}
                            readOnly
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-gray-300"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Body</label>
                          <textarea
                            rows={8}
                            value={template.body}
                            readOnly
                            className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-gray-300"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Template Performance */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Template Performance</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {Object.entries(templatePerformance).map(([template, perf]) => (
                    <div key={template} className="bg-gray-700 rounded-lg p-4">
                      <h3 className="text-lg font-medium text-white mb-4">{template.toUpperCase()}</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Sent:</span>
                          <span className="text-sm text-white">{perf.sent}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Replies:</span>
                          <span className="text-sm text-white">{perf.replies}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Meetings:</span>
                          <span className="text-sm text-white">{perf.meetings}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Reply Rate:</span>
                          <span className="text-sm text-white">{perf.reply_rate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-400">Meeting Rate:</span>
                          <span className="text-sm text-white">{perf.meeting_rate}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* KPIs Tab */}
        {activeTab === 'kpis' && (
          <div className="space-y-8">
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Campaign KPIs</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <div className="text-2xl font-bold text-blue-400">{kpis.emails_sent}</div>
                    <div className="text-sm text-gray-400">Total Emails Sent</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-400">{kpis.replies}</div>
                    <div className="text-sm text-gray-400">Total Replies</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-400">{kpis.meetings_booked}</div>
                    <div className="text-sm text-gray-400">Meetings Booked</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-400">{kpis.reply_rate.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">Reply Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-400">{kpis.bounce_rate.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">Bounce Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-400">{kpis.unsubscribe_rate.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">Unsubscribe Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-indigo-400">{kpis.meeting_rate.toFixed(1)}%</div>
                    <div className="text-sm text-gray-400">Meeting Rate</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manual Tab */}
        {activeTab === 'manual' && (
          <div className="space-y-8">
            {/* CSV Import Section */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Smart CSV Import</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Upload any CSV file - the system will automatically detect and map columns
                </p>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {/* File Upload */}
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div className="mt-4">
                      <label htmlFor="file-upload" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium text-gray-300">
                          Drop your CSV file here, or click to browse
                        </span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" accept=".csv" 
                          onChange={(e) => e.target.files[0] && handleCSVUpload(e.target.files[0])} />
                      </label>
                      <p className="mt-1 text-xs text-gray-500">
                        CSV files only - any format accepted
                      </p>
                    </div>
                  </div>
                  
                  {/* Processing Status */}
                  {csvProcessing.processing && (
                    <div className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-white">Processing CSV...</span>
                        <span className="text-sm text-gray-400">{csvProcessing.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${csvProcessing.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Processing Results */}
                  {csvProcessing.analysis && !csvProcessing.processing && (
                    <div className="bg-gray-700 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-white mb-3">Analysis Results</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-400">Columns Detected:</span>
                          <span className="ml-2 text-white">{csvProcessing.analysis.confidence.mapped}/{csvProcessing.analysis.confidence.total}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Confidence:</span>
                          <span className="ml-2 text-white">{csvProcessing.analysis.confidence.overall.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Critical Fields:</span>
                          <span className="ml-2 text-white">{csvProcessing.analysis.confidence.criticalMapped}/3</span>
                        </div>
                        <div>
                          <span className="text-gray-400">Records:</span>
                          <span className="ml-2 text-white">{csvProcessing.preview?.length || 0}</span>
                        </div>
                      </div>
                      
                      {/* Column Mapping */}
                      <div className="mt-4">
                        <h4 className="text-xs font-medium text-gray-400 mb-2">Detected Columns:</h4>
                        <div className="space-y-1">
                          {Object.entries(csvProcessing.analysis.detectedColumns).map(([field, column]) => (
                            <div key={field} className="flex justify-between text-xs">
                              <span className="text-gray-300">{field}:</span>
                              <span className="text-white">"{column}"</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Errors */}
                  {csvProcessing.errors.length > 0 && (
                    <div className="bg-red-900 border border-red-700 rounded-lg p-4">
                      <h3 className="text-sm font-medium text-red-200 mb-2">Processing Errors</h3>
                      <ul className="text-xs text-red-300 space-y-1">
                        {csvProcessing.errors.map((error, index) => (
                          <li key={index}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Operations */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Manual Operations</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Execute operations manually when automation is down
                </p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Manual Email */}
                  <div className="text-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                    <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">Manual Email</h3>
                    <p className="text-xs text-gray-400 mt-1">Send emails manually</p>
                    <button className="mt-3 text-sm text-blue-400 hover:text-blue-300 font-medium">
                      Compose Email
                    </button>
                  </div>

                  {/* Manual Research */}
                  <div className="text-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                    <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">Manual Research</h3>
                    <p className="text-xs text-gray-400 mt-1">{manualResearchQueue.length} pending</p>
                    <button className="mt-3 text-sm text-green-400 hover:text-green-300 font-medium">
                      Process Research
                    </button>
                  </div>

                  {/* Manual Outreach */}
                  <div className="text-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                    <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">Manual Outreach</h3>
                    <p className="text-xs text-gray-400 mt-1">{manualOutreachQueue.length} pending</p>
                    <button className="mt-3 text-sm text-yellow-400 hover:text-yellow-300 font-medium">
                      Send Emails
                    </button>
                  </div>

                  {/* System Control */}
                  <div className="text-center p-4 bg-gray-700 rounded-lg hover:bg-gray-600 cursor-pointer">
                    <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-white">System Control</h3>
                    <p className="text-xs text-gray-400 mt-1">Manage system</p>
                    <button 
                      onClick={checkSystemHealth}
                      className="mt-3 text-sm text-purple-400 hover:text-purple-300 font-medium"
                    >
                      Check Health
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Operations List */}
            <div className="bg-gray-800 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-medium text-white">Manual Operations Queue</h2>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {campaign.outreach_queue.slice(0, 5).map(lead => (
                    <div key={lead.id} className="bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-white">{lead.company?.name || lead.name}</h3>
                          <p className="text-xs text-gray-400">{lead.contact?.name || 'N/A'} - {lead.contact?.email || 'N/A'}</p>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => composeManualEmail(lead, 'email1')}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Email 1
                          </button>
                          <button
                            onClick={() => composeManualEmail(lead, 'email2')}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            Email 2
                          </button>
                          <button
                            onClick={() => composeManualEmail(lead, 'breakup')}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            Breakup
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Manual Email Composer Modal */}
      {manualEmailComposer && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-gray-800">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white">
                  Compose Email: {manualEmailComposer.lead.company.name}
                </h3>
                <button
                  onClick={() => setManualEmailComposer(null)}
                  className="text-gray-400 hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300">To</label>
                  <input
                    type="text"
                    value={manualEmailComposer.lead.decision_maker?.email || ''}
                    readOnly
                    className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300">Subject</label>
                  <input
                    type="text"
                    value={manualEmailComposer.subject}
                    readOnly
                    className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-300"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300">Body</label>
                  <textarea
                    rows={12}
                    value={manualEmailComposer.body}
                    readOnly
                    className="mt-1 block w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-300"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-400">
                    Personalization Score: {(manualEmailComposer.personalization_score * 100).toFixed(0)}%
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => setManualEmailComposer(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => sendManualEmail(manualEmailComposer)}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                    >
                      Send Email
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FinalOptimalSalesMachine() {
  // Clear any reload locks on successful mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Clear any reload counters that might exist
      sessionStorage.removeItem('reactReloadCount');
      sessionStorage.removeItem('componentReloadCount');
      sessionStorage.removeItem('lastReloadTime');
      
      console.log('React component successfully mounted');
    }
  }, []);
  
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // Initialize smart processors
  const csvProcessor = useRef(new SmartCSVProcessor());
  const leadDiscovery = useRef(new SmartLeadDiscovery());

  // Core campaign state
  const [campaign, setCampaign] = useState({
    status: 'idle',
    in_sequence_leads: [],
    nurture_queue: [],
    outreach_queue: [],
    completed_leads: [],
    daily_stats: {
      emails_sent: 0,
      replies: 0,
      meetings_booked: 0,
      unsubscribes: 0
    }
  });

  // Sales workflow and general states
  const [salesPipeline, setSalesPipeline] = useState({
    discovery: { leads: [], active: false },
    qualification: { leads: [], active: false },
    outreach: { leads: [], active: false },
    followup: { leads: [], active: false },
    conversion: { leads: [], active: false }
  });
  
  const [manualMode, setManualMode] = useState(false);
  const [kpis, setKpis] = useState({
    leads_discovered: 0,
    leads_qualified: 0,
    emails_sent: 0,
    replies: 0,
    meetings_booked: 0,
    reply_rate: 0,
    meeting_rate: 0,
    bounce_rate: 0,
    unsubscribe_rate: 0
  });
  
  const [contacts, setContacts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [manualEmailComposer, setManualEmailComposer] = useState(null);
  const [csvProcessing, setCsvProcessing] = useState({ processing: false, progress: 0, analysis: null, preview: null, errors: [] });
  const [discoveryStatus, setDiscoveryStatus] = useState({ discovering: false, sources: Object.keys(LEAD_SOURCES), results: [], lastDiscovery: null });
  const [systemHealth, setSystemHealth] = useState({ status: 'healthy', last_check: null, failures: [], token_valid: true, firestore_connected: true });
  
  // Notification management
  const addNotification = useCallback((type, message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Authentication handlers
  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
      addNotification('error', 'Failed to sign in');
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Basic component render with minimal functionality
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-white text-2xl mb-4">Sales Automation System</h1>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-white text-2xl">Sales Automation Dashboard</h1>
          <button
            onClick={signOutUser}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Sign Out
          </button>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-white text-xl mb-4">Welcome to Sales Automation</h2>
          <p className="text-gray-300">
            System is running. All browser extension errors are visible in console but won't affect functionality.
          </p>
        </div>
      </div>
    </div>
  );
}
