'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, addDoc, serverTimestamp, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
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

// ✅ ENTERPRISE-GRADE TEMPLATES WITH ADVANCED PERSONALIZATION
const TEMPLATES = {
  // Tier 1: High-Value Prospecting
  tier1_prospect: {
    subject: 'Strategic partnership opportunity with {{company_name}}',
    body: `Hi {{first_name}},

I've been following {{company_name}}'s growth in the {{industry}} space and am impressed by your {{recent_achievement}}.

My name is Dulran Samarasinghe, and I lead Syndicate Solutions - a specialized technical partner for scaling SaaS companies like yours. We've helped {{similar_companies}} achieve:

• 40% faster feature deployment cycles
• 60% reduction in technical debt 
• 3x improvement in development team productivity
• 25% decrease in infrastructure costs

Given your recent {{funding_round}} and expansion into {{target_market}}, I believe we could significantly accelerate your product roadmap while allowing your core team to focus on strategic initiatives.

Would you be open to a 20-minute technical consultation next week? I'd like to share specific insights about your current tech stack and demonstrate how we've solved similar challenges.

Best regards,
Dulran Samarasinghe
Founder & CEO
Syndicate Solutions
📱 +94 741 143 323
🌐 syndicatesolutions.vercel.app
📅 calendly.com/syndicate-solutions/technical-consultation`,
    category: 'prospecting',
    score_weight: 0.8,
    personalization_fields: ['first_name', 'company_name', 'industry', 'recent_achievement', 'similar_companies', 'funding_round', 'target_market']
  },

  // Tier 2: Social Proof & Authority
  tier2_social_proof: {
    subject: 'Re: {{company_name}} | How {{competitor}} scaled their engineering',
    body: `Hi {{first_name}},

Following up on my previous note. I wanted to share a relevant case study that might resonate with your current challenges.

{{competitor}}, a {{competitor_industry}} company similar to {{company_name}}, was facing these exact issues:
• {{pain_point_1}}
• {{pain_point_2}}
• {{pain_point_3}}

Within 6 months of partnering with us, they achieved:
• {{result_1}}
• {{result_2}}
• {{result_3}}

Their CTO, {{competitor_cto}}, mentioned: "Syndicate Solutions transformed our development velocity. We shipped features that were planned for Q4 in just 8 weeks."

I see similar patterns in {{company_name}}'s recent {{recent_activity}}. Would you be interested in exploring how we could replicate these results for your team?

Happy to connect you with {{competitor_cto}} for a reference call.

Best,
Dulran

P.S. I noticed your job posting for {{job_role}} - we have immediate availability for this expertise.`,
    category: 'social_proof',
    score_weight: 0.9,
    personalization_fields: ['first_name', 'company_name', 'competitor', 'competitor_industry', 'pain_point_1', 'pain_point_2', 'pain_point_3', 'result_1', 'result_2', 'result_3', 'competitor_cto', 'recent_activity', 'job_role']
  },

  // Tier 3: Technical Deep Dive
  tier3_technical: {
    subject: 'Technical insights for {{company_name}}\'s {{tech_stack}}',
    body: `Hi {{first_name}},

I conducted a technical analysis of {{company_name}}'s current stack and noticed some optimization opportunities.

Current Architecture Analysis:
• Frontend: {{current_frontend}}
• Backend: {{current_backend}}
• Database: {{current_database}}
• Infrastructure: {{current_infrastructure}}

Identified Optimization Areas:
1. {{optimization_1}} - Potential {{impact_1}} improvement
2. {{optimization_2}} - Potential {{impact_2}} improvement  
3. {{optimization_3}} - Potential {{impact_3}} improvement

These insights are based on our work with {{tech_companies}} using similar stacks.

Would you be interested in a complimentary technical audit? We can provide:
• Performance benchmarking against industry standards
• Security vulnerability assessment
• Scalability roadmap for 12-24 month growth
• Cost optimization strategies

No obligation - pure value demonstration.

Technical regards,
Dulran Samarasinghe
Technical Architect
Syndicate Solutions

P.S. Your recent {{github_activity}} suggests you're scaling rapidly - perfect timing for this discussion.`,
    category: 'technical',
    score_weight: 0.95,
    personalization_fields: ['first_name', 'company_name', 'tech_stack', 'current_frontend', 'current_backend', 'current_database', 'current_infrastructure', 'optimization_1', 'impact_1', 'optimization_2', 'impact_2', 'optimization_3', 'impact_3', 'tech_companies', 'github_activity']
  }
};

// ✅ ENTERPRISE ICP DEFINITIONS
const ENTERPRISE_ICP = {
  primary: {
    name: "High-Growth Series A-C SaaS",
    industries: ["B2B SaaS", "FinTech", "HealthTech", "EdTech", "Martech"],
    company_size: {
      employees_min: 20,
      employees_max: 500,
      revenue_min: 2000000,
      revenue_max: 50000000
    },
    funding: {
      stages: ["Series A", "Series B", "Series C"],
      amount_min: 2000000,
      amount_max: 100000000
    },
    geography: ["North America", "Western Europe", "Australia"],
    tech_stack: ["React", "Node.js", "Python", "AWS", "GCP", "Azure"],
    pain_points: [
      "Scaling engineering teams",
      "Technical debt accumulation", 
      "Slow feature delivery",
      "Infrastructure costs",
      "Talent acquisition challenges"
    ],
    triggers: [
      "Recent funding round",
      "Product launch",
      "Hiring engineers",
      "Expanding to new markets",
      "C-level hiring"
    ]
  },
  secondary: {
    name: "Enterprise Digital Transformation",
    industries: ["Enterprise Software", "Digital Banking", "Insurance Tech", "Supply Chain"],
    company_size: {
      employees_min: 500,
      employees_max: 5000,
      revenue_min: 10000000,
      revenue_max: 500000000
    },
    funding: {
      stages: ["Series C+", "Private Equity", "Public Company"],
      amount_min: 50000000,
      amount_max: 1000000000
    }
  }
};

// ✅ ADVANCED LEAD SCORING ALGORITHM
class EnterpriseLeadScorer {
  constructor() {
    this.weights = {
      industry_match: 0.25,
      company_size_match: 0.20,
      funding_stage_match: 0.20,
      tech_stack_match: 0.15,
      recent_activity: 0.10,
      decision_maker: 0.10
    };
  }

  calculateScore(lead, icp = ENTERPRISE_ICP.primary) {
    let score = 0;
    const factors = {};

    // Industry matching
    if (icp.industries.includes(lead.industry)) {
      factors.industry_match = 100;
    } else if (lead.industry?.includes('Software') || lead.industry?.includes('SaaS')) {
      factors.industry_match = 80;
    } else {
      factors.industry_match = 40;
    }

    // Company size matching
    const size = parseInt(lead.employees) || 0;
    if (size >= icp.company_size.employees_min && size <= icp.company_size.employees_max) {
      factors.company_size_match = 100;
    } else if (size >= icp.company_size.employees_min * 0.5) {
      factors.company_size_match = 70;
    } else {
      factors.company_size_match = 30;
    }

    // Funding stage matching
    if (icp.funding.stages.includes(lead.funding_stage)) {
      factors.funding_stage_match = 100;
    } else if (lead.funding_stage?.includes('Series')) {
      factors.funding_stage_match = 80;
    } else {
      factors.funding_stage_match = 40;
    }

    // Tech stack matching
    const techMatch = this.calculateTechStackMatch(lead.tech_stack || [], icp.tech_stack);
    factors.tech_stack_match = techMatch;

    // Recent activity scoring
    factors.recent_activity = this.calculateActivityScore(lead);

    // Decision maker detection
    factors.decision_maker = this.calculateDecisionMakerScore(lead);

    // Calculate weighted score
    Object.entries(this.weights).forEach(([factor, weight]) => {
      score += (factors[factor] || 0) * weight;
    });

    return {
      total_score: Math.round(score),
      factors,
      grade: this.getGrade(score),
      tier: this.getTier(score),
      recommended_actions: this.getRecommendedActions(factors)
    };
  }

  calculateTechStackMatch(leadTech, icpTech) {
    if (!leadTech.length) return 50;
    
    const matches = leadTech.filter(tech => 
      icpTech.some(icp => 
        tech.toLowerCase().includes(icp.toLowerCase()) || 
        icp.toLowerCase().includes(tech.toLowerCase())
      )
    );
    
    return Math.min(100, (matches.length / Math.max(leadTech.length, icpTech.length)) * 100);
  }

  calculateActivityScore(lead) {
    let score = 50; // Base score
    
    if (lead.recent_funding) score += 20;
    if (lead.recent_hiring) score += 15;
    if (lead.product_launch) score += 15;
    if (lead.expansion) score += 10;
    if (lead.linkedin_activity) score += 10;
    if (lead.github_commits) score += 5;
    
    return Math.min(100, score);
  }

  calculateDecisionMakerScore(lead) {
    let score = 30; // Base score
    
    if (lead.title?.match(/(CTO|CIO|VP Engineering|Head of Engineering)/i)) score += 40;
    else if (lead.title?.match(/(Engineering Manager|Tech Lead|Senior Engineer)/i)) score += 25;
    else if (lead.title?.match(/(Director|Manager)/i)) score += 15;
    else if (lead.title?.match(/(Engineer|Developer)/i)) score += 5;
    
    if (lead.reports_to_c_level) score += 20;
    if (lead.budget_authority) score += 10;
    
    return Math.min(100, score);
  }

  getGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'A-';
    if (score >= 75) return 'B+';
    if (score >= 70) return 'B';
    if (score >= 65) return 'B-';
    if (score >= 60) return 'C+';
    if (score >= 55) return 'C';
    return 'D';
  }

  getTier(score) {
    if (score >= 85) return 'Tier 1 - Priority';
    if (score >= 70) return 'Tier 2 - High Value';
    if (score >= 55) return 'Tier 3 - Standard';
    return 'Tier 4 - Low Priority';
  }

  getRecommendedActions(factors) {
    const actions = [];
    
    if (factors.industry_match < 80) {
      actions.push('Research industry-specific pain points');
    }
    if (factors.company_size_match < 70) {
      actions.push('Verify company size and revenue');
    }
    if (factors.funding_stage_match < 80) {
      actions.push('Check recent funding announcements');
    }
    if (factors.tech_stack_match < 60) {
      actions.push('Analyze current tech stack');
    }
    if (factors.recent_activity < 60) {
      actions.push('Look for recent company activities');
    }
    if (factors.decision_maker < 70) {
      actions.push('Identify actual decision makers');
    }
    
    return actions;
  }
}

// ✅ ENTERPRISE SALES SEQUENCE MANAGER
class EnterpriseSalesSequence {
  constructor() {
    this.sequences = {
      tier1_priority: {
        name: "Tier 1 - Priority Engagement",
        touches: [
          { day: 0, channel: 'email', template: 'tier1_prospect', priority: 'high' },
          { day: 1, channel: 'linkedin', template: 'tier1_prospect', priority: 'high' },
          { day: 3, channel: 'email', template: 'tier2_social_proof', priority: 'high' },
          { day: 7, channel: 'email', template: 'tier3_technical', priority: 'medium' },
          { day: 14, channel: 'email', template: 'tier3_technical', priority: 'low' }
        ],
        max_duration: 30,
        success_criteria: ['reply', 'meeting_booked', 'demo_scheduled']
      },
      tier2_high_value: {
        name: "Tier 2 - High Value Nurturing",
        touches: [
          { day: 0, channel: 'email', template: 'tier2_social_proof', priority: 'high' },
          { day: 2, channel: 'linkedin', template: 'tier2_social_proof', priority: 'high' },
          { day: 5, channel: 'email', template: 'tier3_technical', priority: 'medium' },
          { day: 10, channel: 'email', template: 'tier3_technical', priority: 'low' },
          { day: 20, channel: 'breakup', template: 'breakup', priority: 'low' }
        ],
        max_duration: 45,
        success_criteria: ['reply', 'meeting_booked', 'demo_scheduled']
      }
    };
  }

  generateSequence(lead, score_result) {
    const tier = score_result.tier;
    const sequence = this.sequences[tier === 'Tier 1 - Priority' ? 'tier1_priority' : 'tier2_high_value'];
    
    return sequence.touches.map(touch => ({
      ...touch,
      scheduled_date: this.calculateScheduledDate(touch.day),
      personalized_content: this.personalizeTemplate(TEMPLATES[touch.template], lead),
      status: 'scheduled',
      sent: false,
      opened: false,
      replied: false
    }));
  }

  calculateScheduledDate(daysFromNow) {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    
    // Optimize for best send times
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) date.setDate(date.getDate() + 1); // Skip Sunday
    if (dayOfWeek === 6) date.setDate(date.getDate() + 2); // Skip Saturday
    
    date.setHours(10, 0, 0, 0); // 10 AM local time
    return date;
  }

  personalizeTemplate(template, lead) {
    let content = { ...template };
    
    // Replace all personalization fields
    template.personalization_fields.forEach(field => {
      const regex = new RegExp(`{{${field}}}`, 'g');
      const value = lead[field] || `[${field}]`;
      
      content.subject = content.subject.replace(regex, value);
      content.body = content.body.replace(regex, value);
    });
    
    return content;
  }
}

// ✅ ENTERPRISE ANALYTICS ENGINE
class EnterpriseAnalytics {
  constructor() {
    this.metrics = {
      funnel: {
        discovery: 0,
        qualified: 0,
        contacted: 0,
        engaged: 0,
        replied: 0,
        demo_scheduled: 0,
        proposal_sent: 0,
        closed_won: 0,
        closed_lost: 0
      },
      performance: {
        reply_rate: 0,
        meeting_rate: 0,
        conversion_rate: 0,
        avg_deal_size: 0,
        sales_cycle_length: 0,
        cost_per_acquisition: 0
      },
      predictive: {
        next_month_revenue: 0,
        pipeline_health: 0,
        at_risk_leads: 0,
        recommended_actions: []
      }
    };
  }

  calculateMetrics(contacts, activities) {
    // Funnel analysis
    this.metrics.funnel = this.analyzeFunnel(contacts);
    
    // Performance metrics
    this.metrics.performance = this.calculatePerformance(contacts, activities);
    
    // Predictive analytics
    this.metrics.predictive = this.generatePredictiveInsights(contacts);
    
    return this.metrics;
  }

  analyzeFunnel(contacts) {
    const funnel = {};
    
    CONTACT_STATUSES.forEach(status => {
      funnel[status.id] = contacts.filter(c => c.status === status.id).length;
    });
    
    return funnel;
  }

  calculatePerformance(contacts, activities) {
    const total = contacts.length;
    const replied = contacts.filter(c => c.status === 'replied').length;
    const demos = contacts.filter(c => c.status === 'demo_scheduled').length;
    const won = contacts.filter(c => c.status === 'closed_won').length;
    
    return {
      reply_rate: total > 0 ? ((replied / total) * 100).toFixed(1) : 0,
      meeting_rate: total > 0 ? ((demos / total) * 100).toFixed(1) : 0,
      conversion_rate: total > 0 ? ((won / total) * 100).toFixed(1) : 0,
      avg_deal_size: this.calculateAverageDealSize(contacts),
      sales_cycle_length: this.calculateAverageSalesCycle(contacts),
      cost_per_acquisition: this.calculateCPA(contacts, activities)
    };
  }

  generatePredictiveInsights(contacts) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const atRisk = contacts.filter(c => 
      c.status === 'contacted' && 
      new Date(c.last_contacted) < thirtyDaysAgo
    );
    
    const highValue = contacts.filter(c => 
      c.lead_score >= 80 && 
      ['new', 'contacted'].includes(c.status)
    );

    return {
      next_month_revenue: this.predictNextMonthRevenue(contacts),
      pipeline_health: this.calculatePipelineHealth(contacts),
      at_risk_leads: atRisk.length,
      recommended_actions: [
        `Follow up with ${atRisk.length} at-risk leads`,
        `Prioritize ${highValue.length} high-value opportunities`,
        'Schedule weekly pipeline review'
      ]
    };
  }

  // Additional analytics methods...
  calculateAverageDealSize(contacts) {
    const wonDeals = contacts.filter(c => c.status === 'closed_won' && c.deal_value);
    if (wonDeals.length === 0) return 0;
    
    const total = wonDeals.reduce((sum, deal) => sum + deal.deal_value, 0);
    return total / wonDeals.length;
  }

  calculateAverageSalesCycle(contacts) {
    const wonDeals = contacts.filter(c => 
      c.status === 'closed_won' && 
      c.first_contacted && 
      c.closed_date
    );
    
    if (wonDeals.length === 0) return 0;
    
    const totalDays = wonDeals.reduce((sum, deal) => {
      const first = new Date(deal.first_contacted);
      const closed = new Date(deal.closed_date);
      return sum + (closed - first) / (1000 * 60 * 60 * 24);
    }, 0);
    
    return totalDays / wonDeals.length;
  }

  calculateCPA(contacts, activities) {
    // Implementation for cost per acquisition
    return 0; // Placeholder
  }

  predictNextMonthRevenue(contacts) {
    const inPipeline = contacts.filter(c => 
      ['demo_scheduled', 'proposal_sent', 'negotiation'].includes(c.status)
    );
    
    const avgDealSize = this.calculateAverageDealSize(contacts);
    const conversionRate = this.calculatePerformance(contacts, []).conversion_rate / 100;
    
    return inPipeline.length * avgDealSize * conversionRate;
  }

  calculatePipelineHealth(contacts) {
    const total = contacts.length;
    const active = contacts.filter(c => 
      ['new', 'contacted', 'engaged', 'replied'].includes(c.status)
    ).length;
    
    return (active / total) * 100;
  }
}

// ✅ CONTACT STATUS DEFINITIONS
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New', color: 'gray', description: 'Lead identified, not contacted' },
  { id: 'researched', label: '🔍 Researched', color: 'blue', description: 'Company and contact researched' },
  { id: 'qualified', label: '⭐ Qualified', color: 'indigo', description: 'Meets ICP criteria' },
  { id: 'contacted', label: '📞 Contacted', color: 'purple', description: 'Initial outreach sent' },
  { id: 'engaged', label: '💬 Engaged', color: 'green', description: 'Opened/clicked, tracking activity' },
  { id: 'replied', label: '✅ Replied', color: 'emerald', description: 'Positive response received' },
  { id: 'demo_scheduled', label: '📅 Demo Scheduled', color: 'orange', description: 'Meeting booked' },
  { id: 'proposal_sent', label: '📄 Proposal Sent', color: 'yellow', description: 'Formal proposal delivered' },
  { id: 'negotiation', label: '🤝 Negotiation', color: 'pink', description: 'Terms discussion active' },
  { id: 'closed_won', label: '💰 Closed Won', color: 'green', description: 'Deal successfully closed' },
  { id: 'closed_lost', label: '❌ Closed Lost', color: 'red', description: 'Deal lost to competitor' },
  { id: 'not_interested', label: '🚫 Not Interested', color: 'rose', description: 'No current need' },
  { id: 'do_not_contact', label: '🔇 Do Not Contact', color: 'gray', description: 'Requested no contact' },
  { id: 'archived', label: '🗄️ Archived', color: 'gray', description: 'Inactive >90 days' }
];

// ✅ STATUS TRANSITION MATRIX
const STATUS_TRANSITIONS = {
  'new': ['researched', 'qualified', 'not_interested', 'do_not_contact'],
  'researched': ['qualified', 'not_interested', 'do_not_contact'],
  'qualified': ['contacted', 'not_interested', 'do_not_contact'],
  'contacted': ['engaged', 'replied', 'not_interested', 'do_not_contact'],
  'engaged': ['replied', 'demo_scheduled', 'not_interested', 'do_not_contact'],
  'replied': ['demo_scheduled', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost', 'not_interested'],
  'demo_scheduled': ['proposal_sent', 'negotiation', 'closed_won', 'closed_lost', 'not_interested'],
  'proposal_sent': ['negotiation', 'closed_won', 'closed_lost', 'not_interested'],
  'negotiation': ['closed_won', 'closed_lost', 'not_interested'],
  'closed_won': ['archived'],
  'closed_lost': ['archived'],
  'not_interested': ['archived'],
  'do_not_contact': ['archived'],
  'archived': []
};

export default function EnterpriseSalesAutomation() {
  // Core state management
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // Initialize enterprise systems
  const leadScorer = useRef(new EnterpriseLeadScorer());
  const sequenceManager = useRef(new EnterpriseSalesSequence());
  const analytics = useRef(new EnterpriseAnalytics());

  // Application state
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  // Campaign management
  const [campaigns, setCampaigns] = useState([]);
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [campaignAnalytics, setCampaignAnalytics] = useState(null);

  // UI state
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);
  const [showLeadDetails, setShowLeadDetails] = useState(null);

  // Data processing state
  const [csvProcessing, setCsvProcessing] = useState({ processing: false, progress: 0, analysis: null });
  const [enrichmentStatus, setEnrichmentStatus] = useState({ processing: false, count: 0 });

  // Notification system
  const addNotification = useCallback((type, message, duration = 5000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, type, message, timestamp: new Date() }]);
    
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  // Authentication handlers
  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
      addNotification('error', 'Failed to sign in: ' + error.message);
    }
  };

  const signOutUser = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  // Load contacts with enterprise-grade processing
  const loadContacts = useCallback(async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, orderBy('lead_score', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const loadedContacts = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Apply enterprise lead scoring
        const scoreResult = leadScorer.current.calculateScore(data);
        
        const contact = {
          id: doc.id,
          ...data,
          score_result: scoreResult,
          activities: data.activities || [],
          tags: data.tags || [],
          custom_fields: data.custom_fields || {},
          created_at: data.created_at?.toDate?.() || new Date(),
          updated_at: data.updated_at?.toDate?.() || new Date()
        };
        
        loadedContacts.push(contact);
      });
      
      setContacts(loadedContacts);
      
      // Generate analytics
      const analyticsResult = analytics.current.calculateMetrics(loadedContacts, []);
      setCampaignAnalytics(analyticsResult);
      
    } catch (error) {
      console.error('Failed to load contacts:', error);
      addNotification('error', 'Failed to load contacts: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, addNotification]);

  // Enterprise CSV processing with advanced validation
  const handleCSVUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setCsvProcessing(prev => ({ ...prev, processing: true, progress: 0 }));
    
    try {
      addNotification('info', 'Processing enterprise CSV with advanced validation...');
      
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV must contain headers and data rows');
      }
      
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const contacts = [];
      let processedCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        if (values.length !== headers.length) continue;
        
        const contact = {};
        headers.forEach((header, index) => {
          contact[header] = values[index] || '';
        });
        
        // Apply enterprise validation
        if (isValidEnterpriseContact(contact)) {
          // Apply lead scoring
          const scoreResult = leadScorer.current.calculateScore(contact);
          
          contacts.push({
            ...contact,
            lead_score: scoreResult.total_score,
            score_result: scoreResult,
            tier: scoreResult.tier,
            grade: scoreResult.grade,
            source: 'csv_upload',
            created_at: new Date(),
            updated_at: new Date(),
            status: 'new',
            activities: [],
            tags: extractTags(contact),
            custom_fields: extractCustomFields(contact, headers)
          });
          
          processedCount++;
        }
        
        // Update progress
        if (i % 10 === 0) {
          setCsvProcessing(prev => ({ 
            ...prev, 
            progress: Math.round((i / lines.length) * 100) 
          }));
        }
      }
      
      // Save to Firestore with batch processing
      await saveContactsBatch(contacts, user.uid);
      
      setCsvProcessing({
        processing: false,
        progress: 100,
        analysis: {
          total_processed: lines.length - 1,
          valid_contacts: contacts.length,
          invalid_contacts: (lines.length - 1) - contacts.length,
          tier_distribution: calculateTierDistribution(contacts),
          quality_score: calculateAverageQuality(contacts)
        }
      });
      
      addNotification('success', `Successfully processed ${contacts.length} enterprise contacts`);
      await loadContacts();
      
    } catch (error) {
      console.error('CSV processing error:', error);
      setCsvProcessing(prev => ({ 
        ...prev, 
        processing: false, 
        errors: [error.message] 
      }));
      addNotification('error', 'CSV processing failed: ' + error.message);
    }
  }, [user?.uid, addNotification, loadContacts]);

  // Enterprise contact validation
  const isValidEnterpriseContact = (contact) => {
    // Required fields validation
    if (!contact.email && !contact.phone) return false;
    if (contact.email && !isValidEmail(contact.email)) return false;
    if (!contact.company_name) return false;
    
    // ICP validation
    const employees = parseInt(contact.employees) || 0;
    if (employees < 20 || employees > 5000) return false;
    
    return true;
  };

  // Batch save with error handling
  const saveContactsBatch = async (contacts, userId) => {
    const batchSize = 500; // Firestore batch limit
    const batches = Math.ceil(contacts.length / batchSize);
    
    for (let i = 0; i < batches; i++) {
      const batch = writeBatch(db);
      const start = i * batchSize;
      const end = Math.min(start + batchSize, contacts.length);
      
      for (let j = start; j < end; j++) {
        const contact = contacts[j];
        const docRef = doc(collection(db, 'users', userId, 'contacts'));
        
        batch.set(docRef, {
          ...contact,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp()
        });
      }
      
      try {
        await batch.commit();
        addNotification('info', `Saved batch ${i + 1}/${batches} to database`);
      } catch (error) {
        console.error('Batch save error:', error);
        addNotification('error', `Failed to save batch ${i + 1}: ${error.message}`);
      }
    }
  };

  // Utility functions
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const extractTags = (contact) => {
    const tags = [];
    if (contact.industry) tags.push(contact.industry.toLowerCase());
    if (contact.funding_stage) tags.push(contact.funding_stage.toLowerCase());
    if (contact.employees) {
      const size = parseInt(contact.employees);
      if (size < 50) tags.push('startup');
      else if (size < 200) tags.push('mid-market');
      else tags.push('enterprise');
    }
    return [...new Set(tags)];
  };

  const extractCustomFields = (contact, headers) => {
    const standardFields = ['company_name', 'email', 'phone', 'first_name', 'last_name', 'industry', 'employees', 'funding_stage', 'tech_stack'];
    const customFields = {};
    
    headers.forEach(header => {
      if (!standardFields.includes(header) && contact[header]) {
        customFields[header] = contact[header];
      }
    });
    
    return customFields;
  };

  const calculateTierDistribution = (contacts) => {
    const distribution = {};
    contacts.forEach(contact => {
      const tier = contact.tier || 'Unknown';
      distribution[tier] = (distribution[tier] || 0) + 1;
    });
    return distribution;
  };

  const calculateAverageQuality = (contacts) => {
    if (contacts.length === 0) return 0;
    const totalScore = contacts.reduce((sum, contact) => sum + (contact.lead_score || 0), 0);
    return Math.round(totalScore / contacts.length);
  };

  // Filter and sort contacts with enterprise logic
  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => 
        contact.company_name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.first_name?.toLowerCase().includes(query) ||
        contact.last_name?.toLowerCase().includes(query) ||
        contact.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contact => contact.status === statusFilter);
    }
    
    // Apply tier filter
    if (tierFilter !== 'all') {
      filtered = filtered.filter(contact => contact.tier === tierFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'score') {
        return (b.lead_score || 0) - (a.lead_score || 0);
      } else if (sortBy === 'company') {
        return (a.company_name || '').localeCompare(b.company_name || '');
      } else if (sortBy === 'recent') {
        return new Date(b.updated_at) - new Date(a.updated_at);
      }
      return 0;
    });
    
    return filtered;
  }, [contacts, searchQuery, statusFilter, tierFilter, sortBy]);

  // Authentication state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
      if (user) {
        loadContacts();
      }
    });

    return () => unsubscribe();
  }, [loadContacts]);

  // Loading state
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500 mx-auto mb-6"></div>
          <h1 className="text-white text-3xl font-bold mb-2">Syndicate Solutions</h1>
          <p className="text-gray-300 text-lg">Enterprise Sales Automation Platform</p>
          <p className="text-gray-500 text-sm mt-2">Initializing secure connection...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-2xl">
          <div className="mb-8">
            <h1 className="text-white text-5xl font-bold mb-4">Syndicate Solutions</h1>
            <p className="text-gray-300 text-xl mb-2">Enterprise Sales Automation Platform</p>
            <p className="text-gray-500 text-base">Advanced B2B Sales Intelligence & Automation</p>
          </div>
          
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-white text-2xl font-semibold mb-6">🎯 Enterprise ICP Focus</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              <div>
                <h3 className="text-blue-400 font-semibold mb-3">Primary Target</h3>
                <div className="space-y-2 text-gray-300">
                  <p><strong>Industry:</strong> {ENTERPRISE_ICP.primary.industries.join(', ')}</p>
                  <p><strong>Size:</strong> {ENTERPRISE_ICP.primary.company_size.employees_min}-{ENTERPRISE_ICP.primary.company_size.employees_max} employees</p>
                  <p><strong>Revenue:</strong> ${(ENTERPRISE_ICP.primary.company_size.revenue_min/1000000).toFixed(1)}M-${(ENTERPRISE_ICP.primary.company_size.revenue_max/1000000).toFixed(1)}M</p>
                  <p><strong>Funding:</strong> {ENTERPRISE_ICP.primary.funding.stages.join(', ')}</p>
                  <p><strong>Geography:</strong> {ENTERPRISE_ICP.primary.geography.join(', ')}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-purple-400 font-semibold mb-3">Key Pain Points</h3>
                <div className="space-y-2 text-gray-300">
                  {ENTERPRISE_ICP.primary.pain_points.map((pain, index) => (
                    <p key={index} className="flex items-start">
                      <span className="text-red-400 mr-2">•</span>
                      <span>{pain}</span>
                    </p>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="text-green-400 font-semibold mb-3">Triggers for Outreach</h3>
              <div className="flex flex-wrap gap-2">
                {ENTERPRISE_ICP.primary.triggers.map((trigger, index) => (
                  <span key={index} className="bg-green-900 text-green-300 px-3 py-1 rounded-full text-sm">
                    {trigger}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          <button
            onClick={signIn}
            className="mt-8 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
          >
            🔐 Sign In with Google
          </button>
          
          <div className="mt-6 text-gray-500 text-sm">
            <p>✨ Enterprise-grade security & compliance</p>
            <p>📊 Advanced analytics & AI insights</p>
            <p>🚀 Multi-channel sales automation</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Syndicate Solutions - Enterprise Sales Automation</title>
        <meta name="description" content="Advanced B2B sales automation platform for enterprise SaaS companies" />
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        {/* Notification System */}
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg shadow-xl border transform transition-all duration-300 ${
                notification.type === 'error' ? 'bg-red-900 border-red-700 text-red-100' :
                notification.type === 'success' ? 'bg-green-900 border-green-700 text-green-100' :
                notification.type === 'warning' ? 'bg-yellow-900 border-yellow-700 text-yellow-100' :
                'bg-blue-900 border-blue-700 text-blue-100'
              }`}
            >
              <div className="flex items-start">
                <div className="flex-shrink-0 mr-3">
                  {notification.type === 'error' && '⚠️'}
                  {notification.type === 'success' && '✅'}
                  {notification.type === 'warning' && '⚡'}
                  {notification.type === 'info' && 'ℹ️'}
                </div>
                <div>
                  <p className="font-medium">{notification.message}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {notification.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
          <div className="container mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h1 className="text-white text-2xl font-bold">Syndicate Solutions</h1>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                  Enterprise
                </span>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <p className="text-white font-medium">{user.displayName}</p>
                  <p className="text-gray-400 text-sm">{user.email}</p>
                </div>
                <button
                  onClick={signOutUser}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard */}
        <main className="container mx-auto px-6 py-8">
          {/* Enterprise KPI Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Total Leads</h3>
                <span className="text-blue-400">📊</span>
              </div>
              <p className="text-white text-3xl font-bold">{contacts.length}</p>
              <p className="text-gray-500 text-xs mt-1">In database</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Tier 1 Leads</h3>
                <span className="text-purple-400">⭐</span>
              </div>
              <p className="text-purple-400 text-3xl font-bold">
                {contacts.filter(c => c.tier === 'Tier 1 - Priority').length}
              </p>
              <p className="text-gray-500 text-xs mt-1">High priority</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Reply Rate</h3>
                <span className="text-green-400">📈</span>
              </div>
              <p className="text-green-400 text-3xl font-bold">
                {campaignAnalytics?.performance?.reply_rate || 0}%
              </p>
              <p className="text-gray-500 text-xs mt-1">Industry average: 15%</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Pipeline Value</h3>
                <span className="text-yellow-400">💰</span>
              </div>
              <p className="text-yellow-400 text-3xl font-bold">
                ${(campaignAnalytics?.predictive?.next_month_revenue || 0).toLocaleString()}
              </p>
              <p className="text-gray-500 text-xs mt-1">Predicted next 30 days</p>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
            <h2 className="text-white text-xl font-bold mb-6">🚀 Enterprise Actions</h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  📤 Import Enterprise CSV
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  disabled={csvProcessing.processing}
                  className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                />
                {csvProcessing.processing && (
                  <div className="mt-2 bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-400"></div>
                      <span className="text-blue-300 text-sm">Processing: {csvProcessing.progress}%</span>
                    </div>
                  </div>
                )}
                {csvProcessing.analysis && (
                  <div className="mt-2 bg-green-900/30 border border-green-800 rounded-lg p-3">
                    <p className="text-green-300 text-sm font-medium">✅ Analysis Complete</p>
                    <div className="text-green-200 text-xs mt-2 space-y-1">
                      <p>Valid: {csvProcessing.analysis.valid_contacts} / {csvProcessing.analysis.total_processed}</p>
                      <p>Avg Score: {csvProcessing.analysis.quality_score}</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  🔍 Advanced Search & Filters
                </label>
                <input
                  type="text"
                  placeholder="Search companies, contacts, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm mb-3"
                />
                
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  >
                    <option value="all">All Statuses</option>
                    {CONTACT_STATUSES.map(status => (
                      <option key={status.id} value={status.id}>{status.label}</option>
                    ))}
                  </select>
                  
                  <select
                    value={tierFilter}
                    onChange={(e) => setTierFilter(e.target.value)}
                    className="p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  >
                    <option value="all">All Tiers</option>
                    <option value="Tier 1 - Priority">Tier 1 - Priority</option>
                    <option value="Tier 2 - High Value">Tier 2 - High Value</option>
                    <option value="Tier 3 - Standard">Tier 3 - Standard</option>
                    <option value="Tier 4 - Low Priority">Tier 4 - Low Priority</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  📊 Analytics & Insights
                </label>
                <button
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-lg font-medium transition-colors mb-3"
                >
                  {showAnalytics ? 'Hide Analytics' : 'Show Advanced Analytics'}
                </button>
                
                <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-lg font-medium transition-colors">
                  📈 Generate Performance Report
                </button>
              </div>
              
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  🚀 Campaign Management
                </label>
                <button className="w-full bg-green-600 hover:bg-green-700 text-white p-3 rounded-lg font-medium transition-colors mb-3">
                  Create New Campaign
                </button>
                
                <button className="w-full bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-lg font-medium transition-colors">
                  📬 Sequence Automation
                </button>
              </div>
            </div>
          </div>

          {/* Enterprise Contacts Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-white text-xl font-bold">📋 Enterprise Contact Database</h2>
                <div className="flex items-center space-x-4">
                  <span className="text-gray-400 text-sm">
                    Showing {filteredContacts.length} of {contacts.length}
                  </span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  >
                    <option value="score">Score ↓</option>
                    <option value="company">Company A-Z</option>
                    <option value="recent">Recent First</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tier</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {filteredContacts.slice(0, 50).map((contact) => (
                    <tr key={contact.id} className="hover:bg-gray-750 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-white font-medium">{contact.company_name}</div>
                          <div className="text-gray-400 text-sm">{contact.industry}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {contact.tags?.slice(0, 3).map(tag => (
                              <span key={tag} className="bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-xs">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white text-sm">{contact.first_name} {contact.last_name}</div>
                        <div className="text-gray-400 text-sm">{contact.email}</div>
                        <div className="text-gray-500 text-xs">{contact.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            contact.tier === 'Tier 1 - Priority' ? 'bg-purple-900 text-purple-300' :
                            contact.tier === 'Tier 2 - High Value' ? 'bg-blue-900 text-blue-300' :
                            contact.tier === 'Tier 3 - Standard' ? 'bg-green-900 text-green-300' :
                            'bg-gray-700 text-gray-300'
                          }`}>
                            {contact.tier}
                          </span>
                          <span className="text-gray-400 text-xs">{contact.grade}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white font-bold">{contact.lead_score}</div>
                        <div className="text-gray-400 text-xs">
                          {contact.score_result?.factors?.industry_match || 0}% industry match
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={contact.status}
                          onChange={(e) => {/* Update status logic */}}
                          className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                        >
                          {CONTACT_STATUSES.map(status => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button className="text-blue-400 hover:text-blue-300" title="Send Email">
                            ✉️
                          </button>
                          <button className="text-green-400 hover:text-green-300" title="Call">
                            📞
                          </button>
                          <button className="text-purple-400 hover:text-purple-300" title="View Details">
                            📊
                          </button>
                          <button className="text-orange-400 hover:text-orange-300" title="Edit">
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredContacts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">🔍</div>
                  <p className="text-xl font-medium mb-2">No contacts found</p>
                  <p className="text-sm">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
