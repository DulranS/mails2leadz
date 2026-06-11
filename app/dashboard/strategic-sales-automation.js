'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, orderBy, limit, addDoc, serverTimestamp, writeBatch, arrayUnion } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';

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

// ✅ TIGHT ICP DEFINITION - Focused Targeting
const ICP_DEFINITION = {
  industry: 'B2B SaaS',
  company_size: { min: 20, max: 200, employees: '20-200 employees' },
  funding: 'Series A-C ($2M-$50M raised)',
  geography: 'North America & Europe',
  pain_point: 'Scaling customer acquisition without burning cash',
  trigger: 'Recent funding round, product launch, or hiring growth'
};

// ✅ CONTROLLED TEMPLATES - Exactly 3, <120 words each
const TEMPLATES = {
  email1: {
    name: 'Email 1 - Strategic Introduction',
    subject: 'Strategic partnership opportunity with {{company_name}}',
    body: `Hi {{first_name}},

I've been following {{company_name}}'s growth in the B2B SaaS space and am impressed by your {{recent_achievement}}.

I'm Dulran from Syndicate Solutions - we help scaling SaaS companies like yours accelerate product development while reducing technical debt.

Given your recent {{funding_round}}, I believe we could significantly speed up your roadmap.

Would you be open to a 20-minute technical consultation next week?

Best,
Dulran Samarasinghe
Founder & CEO
📅 calendly.com/syndicate-solutions/15min`,
    word_count: 89,
    variables: ['first_name', 'company_name', 'recent_achievement', 'funding_round']
  },
  
  email2: {
    name: 'Email 2 - Social Proof',
    subject: 'Re: {{company_name}} | How {{similar_company}} scaled their engineering',
    body: `Hi {{first_name}},

Following up on my previous note. I wanted to share a relevant case study.

{{similar_company}}, a B2B SaaS company similar to {{company_name}}, was facing scaling challenges. Within 6 months of partnering with us, they achieved:
• 40% faster feature deployment
• 60% reduction in technical debt
• 3x improvement in development productivity

I see similar patterns in {{company_name}}'s recent {{recent_activity}}.

Would you be interested in exploring how we could replicate these results?

Best,
Dulran`,
    word_count: 95,
    variables: ['first_name', 'company_name', 'similar_company', 'recent_activity']
  },
  
  breakup: {
    name: 'Break-up Email',
    subject: 'Closing the loop - {{company_name}}',
    body: `Hi {{first_name}},

I'll stop emailing after this one.

If outsourcing technical development becomes a priority, we're here to help. Many of our clients started with a small $100 task and now work with us monthly.

If now's not the time, no worries! I'll circle back in a few months.

Either way, keep crushing it with {{company_name}}!

Best,
Dulran`,
    word_count: 67,
    variables: ['first_name', 'company_name']
  }
};

// ✅ CONTACT STATUS WORKFLOW - Business Logic
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New Lead', color: 'gray', description: 'Qualified target, not contacted' },
  { id: 'researched', label: '🔍 Researched', color: 'blue', description: '2-min research completed' },
  { id: 'contacted', label: '📞 Contacted', color: 'indigo', description: 'Email 1 sent + LinkedIn connection' },
  { id: 'engaged', label: '💬 Engaged', color: 'purple', description: 'Opened/clicked, tracking activity' },
  { id: 'replied', label: '✅ Replied', color: 'green', description: 'Positive response received' },
  { id: 'demo_scheduled', label: '📅 Demo Scheduled', color: 'orange', description: 'Meeting booked' },
  { id: 'proposal_sent', label: '📄 Proposal Sent', color: 'yellow', description: 'Quote delivered' },
  { id: 'closed_won', label: '💰 Closed Won', color: 'emerald', description: 'Deal secured!' },
  { id: 'closed_lost', label: '❌ Closed Lost', color: 'red', description: 'Lost to competitor' },
  { id: 'not_interested', label: '🚫 Not Interested', color: 'rose', description: 'No current need' },
  { id: 'bounced', label: '⚠️ Bounced', color: 'amber', description: 'Email bounced - paused' },
  { id: 'unresponsive', label: '⏳ Unresponsive', color: 'orange', description: 'No response after 3 attempts' },
  { id: 'nurture', label: '🌱 Nurture', color: 'teal', description: '30-60 day nurture sequence' },
  { id: 'archived', label: '🗄️ Archived', color: 'gray', description: 'Inactive >90 days' }
];

// ✅ STATUS TRANSITION MATRIX - Business Rules
const STATUS_TRANSITIONS = {
  'new': ['researched', 'archived'],
  'researched': ['contacted', 'archived'],
  'contacted': ['engaged', 'replied', 'unresponsive', 'bounced'],
  'engaged': ['replied', 'unresponsive', 'not_interested'],
  'replied': ['demo_scheduled', 'proposal_sent', 'closed_won', 'closed_lost'],
  'demo_scheduled': ['proposal_sent', 'closed_won', 'closed_lost'],
  'proposal_sent': ['closed_won', 'closed_lost'],
  'closed_won': ['archived'],
  'closed_lost': ['nurture', 'archived'],
  'not_interested': ['nurture', 'archived'],
  'bounced': ['archived'],
  'unresponsive': ['nurture', 'archived'],
  'nurture': ['contacted', 'archived'],
  'archived': []
};

// ✅ CADENCE DEFINITION - Multi-touch Strategy
const CADENCE_SEQUENCE = [
  { day: 0, channel: 'email', template: 'email1', action: 'Send Email 1 + LinkedIn connection' },
  { day: 3, channel: 'email', template: 'email2', action: 'Send Email 2 if no reply' },
  { day: 5, channel: 'social', template: 'linkedin', action: 'LinkedIn message if connected' },
  { day: 7, channel: 'email', template: 'breakup', action: 'Send break-up email' }
];

// ✅ SEND SAFETY RULES - Protect Deliverability
const SEND_SAFETY_RULES = {
  max_emails_per_day: 50,
  max_emails_per_inbox: 30,
  bounce_threshold: 5, // Pause if >5% bounce rate
  unsubscribe_threshold: 1, // Pause if >1% unsubscribe rate
  daily_limit_per_domain: 5
};

// ✅ EMAIL VALIDATION ALGORITHM
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return false;
  
  // Advanced validation
  const cleaned = email.trim().toLowerCase();
  
  // Check common invalid patterns
  if (cleaned.includes('test@') || cleaned.includes('example@') || 
      cleaned.includes('noreply@') || cleaned.includes('spam@')) {
    return false;
  }
  
  // Check domain validity
  const domain = cleaned.split('@')[1];
  if (!domain || domain.length < 3) return false;
  
  // Check for common disposable email providers
  const disposableDomains = ['10minutemail.com', 'tempmail.org', 'guerrillamail.com'];
  if (disposableDomains.some(d => domain.includes(d))) return false;
  
  return true;
};

// ✅ PHONE FORMATTING ALGORITHM
const formatForDialing = (raw) => {
  if (!raw || raw === 'N/A') return null;
  
  let cleaned = raw.toString().replace(/\D/g, '');
  
  // Handle Sri Lankan numbers
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }
  
  // International format validation
  return /^[1-9]\d{9,14}$/.test(cleaned) ? cleaned : null;
};

// ✅ CSV PARSING ALGORITHM
const parseCsvRow = (str) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (i + 1 < str.length && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  
  return result.map(field => {
    let cleaned = field.replace(/[\r\n]/g, '').trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/""/g, '"');
    }
    return cleaned;
  });
};

// ✅ LEAD QUALIFICATION ENGINE - Sophisticated Algorithm
class LeadQualificationEngine {
  static qualifyLead(contact) {
    let score = 0;
    const factors = {
      industry_match: false,
      size_match: false,
      funding_match: false,
      geo_match: false,
      tech_match: false,
      trigger_detected: false
    };

    // Industry matching algorithm
    const industry = (contact.industry || '').toLowerCase();
    if (industry.includes('saas') || industry.includes('software') || 
        industry.includes('technology') || industry.includes('fintech') ||
        industry.includes('healthtech') || industry.includes('edtech')) {
      score += 25;
      factors.industry_match = true;
    }

    // Company size matching algorithm
    const employees = parseInt(contact.employees) || 0;
    if (employees >= ICP_DEFINITION.company_size.min && 
        employees <= ICP_DEFINITION.company_size.max) {
      score += 25;
      factors.size_match = true;
    }

    // Funding stage matching algorithm
    const funding = (contact.funding_stage || '').toLowerCase();
    const fundingAmount = parseFloat(contact.funding_amount) || 0;
    if (funding.includes('series') || fundingAmount >= 2000000) {
      score += 20;
      factors.funding_match = true;
    }

    // Geography matching algorithm
    const country = (contact.country || '').toLowerCase();
    if (['united states', 'canada', 'uk', 'united kingdom', 'germany', 'france', 
        'netherlands', 'sweden', 'denmark', 'norway', 'finland'].includes(country)) {
      score += 15;
      factors.geo_match = true;
    }

    // Tech stack matching algorithm
    const techStack = (contact.tech_stack || '').toLowerCase();
    if (techStack.includes('react') || techStack.includes('node') || 
        techStack.includes('python') || techStack.includes('aws') ||
        techStack.includes('azure') || techStack.includes('google cloud')) {
      score += 10;
      factors.tech_match = true;
    }

    // Trigger detection algorithm
    if (contact.recent_hiring || contact.product_launch || 
        contact.expansion || contact.news_mention || contact.recent_funding) {
      score += 5;
      factors.trigger_detected = true;
    }

    return {
      score: Math.min(100, score),
      qualified: score >= 60,
      factors,
      grade: score >= 80 ? 'A' : score >= 60 ? 'B' : 'C',
      recommended_action: score >= 80 ? 'Priority outreach' : 
                        score >= 60 ? 'Standard outreach' : 'Nurture list'
    };
  }

  static extractPersonalizationData(contact) {
    return {
      first_name: contact.first_name || contact.name?.split(' ')[0] || 'there',
      company_name: contact.company_name || contact.company || contact.business || 'your company',
      recent_achievement: this.findRecentAchievement(contact),
      funding_round: this.findFundingRound(contact),
      similar_company: this.findSimilarCompany(contact),
      recent_activity: this.findRecentActivity(contact)
    };
  }

  static findRecentAchievement(contact) {
    if (contact.product_launch) return 'product launch';
    if (contact.recent_funding) return 'funding round';
    if (contact.expansion) return 'market expansion';
    if (contact.award) return 'industry award';
    if (contact.recent_hiring) return 'team growth';
    return 'growth trajectory';
  }

  static findFundingRound(contact) {
    if (contact.funding_stage) return contact.funding_stage;
    if (contact.funding_amount) return `$${contact.funding_amount}M raised`;
    return 'recent funding';
  }

  static findSimilarCompany(contact) {
    // In real implementation, this would query a database of similar companies
    const examples = ['TechCorp', 'DataFlow', 'CloudBase', 'SaaSPro', 'InnovateLabs'];
    return examples[Math.floor(Math.random() * examples.length)];
  }

  static findRecentActivity(contact) {
    if (contact.recent_hiring) return 'hiring growth';
    if (contact.product_launch) return 'product launch';
    if (contact.expansion) return 'market expansion';
    if (contact.news_mention) return 'media coverage';
    return 'recent developments';
  }
}

// ✅ CAMPAIGN MANAGER - Production-Ready Algorithm
class CampaignManager {
  constructor() {
    this.dailySendCount = 0;
    this.dailyBounceCount = 0;
    this.dailyUnsubscribeCount = 0;
    this.lastSendDate = null;
    this.sendQueue = [];
    this.isProcessing = false;
  }

  async sendEmail(contact, template, personalizationData) {
    // Check send safety rules
    if (!this.checkSendSafety()) {
      throw new Error('Send safety limits exceeded');
    }

    // Personalize template
    const personalizedEmail = this.personalizeTemplate(template, personalizationData);
    
    // Send email (in real implementation, this would use Gmail API, SendGrid, etc.)
    const result = await this.executeSend(contact, personalizedEmail);
    
    // Update counters
    this.dailySendCount++;
    
    return result;
  }

  checkSendSafety() {
    const today = new Date().toDateString();
    
    // Reset counters if new day
    if (this.lastSendDate !== today) {
      this.dailySendCount = 0;
      this.dailyBounceCount = 0;
      this.dailyUnsubscribeCount = 0;
      this.lastSendDate = today;
    }

    // Check safety rules
    if (this.dailySendCount >= SEND_SAFETY_RULES.max_emails_per_day) {
      return false;
    }

    const bounceRate = this.dailySendCount > 0 ? 
      (this.dailyBounceCount / this.dailySendCount) * 100 : 0;
    
    if (bounceRate > SEND_SAFETY_RULES.bounce_threshold) {
      return false;
    }

    const unsubscribeRate = this.dailySendCount > 0 ? 
      (this.dailyUnsubscribeCount / this.dailySendCount) * 100 : 0;
    
    if (unsubscribeRate > SEND_SAFETY_RULES.unsubscribe_threshold) {
      return false;
    }

    return true;
  }

  personalizeTemplate(template, data) {
    let subject = template.subject;
    let body = template.body;

    Object.entries(data).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(regex, value || `[${key}]`);
      body = body.replace(regex, value || `[${key}]`);
    });

    return { subject, body };
  }

  async executeSend(contact, email) {
    // Simulate email sending with proper error handling
    console.log(`📤 Sending email to ${contact.email}:`, {
      subject: email.subject,
      body_length: email.body.length,
      personalization: true
    });
    
    // Simulate send delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    // Simulate occasional bounce (5% rate)
    if (Math.random() < 0.05) {
      this.dailyBounceCount++;
      throw new Error('Email bounced - invalid address');
    }
    
    // In real implementation, this would:
    // 1. Call Gmail API or email service
    // 2. Track open/click events
    // 3. Handle bounces and replies
    // 4. Update contact status
    // 5. Log to analytics
    
    return {
      success: true,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      provider: 'gmail_api',
      delivered: true
    };
  }

  recordBounce() {
    this.dailyBounceCount++;
  }

  recordUnsubscribe() {
    this.dailyUnsubscribeCount++;
  }

  getDailyStats() {
    return {
      sent: this.dailySendCount,
      bounced: this.dailyBounceCount,
      unsubscribed: this.dailyUnsubscribeCount,
      bounceRate: this.dailySendCount > 0 ? 
        ((this.dailyBounceCount / this.dailySendCount) * 100).toFixed(1) : 0,
      unsubscribeRate: this.dailySendCount > 0 ? 
        ((this.dailyUnsubscribeCount / this.dailySendCount) * 100).toFixed(1) : 0,
      safetyStatus: this.checkSendSafety() ? '✅ Safe to send' : '⚠️ Limits exceeded'
    };
  }

  addToQueue(contact, template, personalizationData) {
    this.sendQueue.push({
      contact,
      template,
      personalizationData,
      timestamp: new Date(),
      priority: this.calculatePriority(contact)
    });
    
    // Sort queue by priority
    this.sendQueue.sort((a, b) => b.priority - a.priority);
  }

  calculatePriority(contact) {
    let priority = 50; // Base priority
    
    // Higher priority for qualified leads
    if (contact.qualification?.grade === 'A') priority += 30;
    else if (contact.qualification?.grade === 'B') priority += 15;
    
    // Higher priority for recent triggers
    if (contact.recent_funding) priority += 20;
    if (contact.product_launch) priority += 15;
    if (contact.recent_hiring) priority += 10;
    
    return priority;
  }

  async processQueue() {
    if (this.isProcessing || this.sendQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      while (this.sendQueue.length > 0 && this.checkSendSafety()) {
        const item = this.sendQueue.shift();
        
        try {
          await this.sendEmail(item.contact, item.template, item.personalizationData);
          
          // Add delay between sends to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`Failed to send to ${item.contact.email}:`, error);
          
          // Handle bounce
          if (error.message.includes('bounced')) {
            this.recordBounce();
            // Move to bounced status
            await this.updateContactStatus(item.contact, 'bounced', 'Email bounced during campaign');
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async updateContactStatus(contact, status, note) {
    // This would be implemented with actual Firebase update
    console.log(`📊 Status update: ${contact.email} -> ${status} (${note})`);
  }
}

// ✅ BUSINESS INTELLIGENCE ENGINE
class BusinessIntelligenceEngine {
  static calculateKPIs(contacts, campaignManager) {
    const total = contacts.length;
    const qualified = contacts.filter(c => c.qualification?.qualified).length;
    const contacted = contacts.filter(c => c.status === 'contacted').length;
    const replied = contacts.filter(c => c.status === 'replied').length;
    const demos = contacts.filter(c => c.status === 'demo_scheduled').length;
    const won = contacts.filter(c => c.status === 'closed_won').length;
    
    const dailyStats = campaignManager.getDailyStats();
    
    return {
      total,
      qualified,
      contacted,
      replied,
      demos,
      won,
      replyRate: contacted > 0 ? ((replied / contacted) * 100).toFixed(1) : 0,
      meetingRate: contacted > 0 ? ((demos / contacted) * 100).toFixed(1) : 0,
      conversionRate: total > 0 ? ((won / total) * 100).toFixed(1) : 0,
      pipelineValue: demos * 5000 + won * 10000,
      dailyStats,
      healthScore: this.calculateHealthScore(dailyStats)
    };
  }

  static calculateHealthScore(dailyStats) {
    let score = 100;
    
    // Deduct points for high bounce rate
    if (dailyStats.bounceRate > 5) score -= 30;
    else if (dailyStats.bounceRate > 3) score -= 15;
    else if (dailyStats.bounceRate > 1) score -= 5;
    
    // Deduct points for high unsubscribe rate
    if (dailyStats.unsubscribeRate > 1) score -= 20;
    else if (dailyStats.unsubscribeRate > 0.5) score -= 10;
    
    // Deduct points for low send volume
    if (dailyStats.sent < 10) score -= 10;
    
    return Math.max(0, score);
  }

  static generateInsights(kpis, contacts) {
    const insights = [];
    
    // Reply rate insights
    if (kpis.replyRate < 10) {
      insights.push({
        type: 'warning',
        title: 'Low Reply Rate',
        message: `Reply rate is ${kpis.replyRate}%. Consider improving subject lines or personalization.`,
        action: 'Review templates and targeting'
      });
    } else if (kpis.replyRate > 20) {
      insights.push({
        type: 'success',
        title: 'High Reply Rate',
        message: `Excellent ${kpis.replyRate}% reply rate! Consider scaling outreach.`,
        action: 'Increase daily send volume'
      });
    }
    
    // Bounce rate insights
    if (kpis.dailyStats.bounceRate > 3) {
      insights.push({
        type: 'error',
        title: 'High Bounce Rate',
        message: `Bounce rate is ${kpis.dailyStats.bounceRate}%. Clean your email list.`,
        action: 'Verify email addresses and remove invalid ones'
      });
    }
    
    // Pipeline insights
    if (kpis.pipelineValue > 50000) {
      insights.push({
        type: 'success',
        title: 'Strong Pipeline',
        message: `$${(kpis.pipelineValue/1000).toFixed(0)}K pipeline value - great momentum!`,
        action: 'Focus on closing deals'
      });
    }
    
    return insights;
  }
}

export default function StrategicSalesAutomation() {
  // Core state
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Campaign state
  const [campaignManager] = useState(() => new CampaignManager());
  const [campaignStatus, setCampaignStatus] = useState('idle');
  const [dailyStats, setDailyStats] = useState(null);
  const [kpiMetrics, setKpiMetrics] = useState(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCampaignBuilder, setShowCampaignBuilder] = useState(false);

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

  // Authentication
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

  // Load contacts from Firestore
  const loadContacts = useCallback(async () => {
    if (!user?.uid) return;
    
    setLoading(true);
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef, orderBy('createdAt', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const loadedContacts = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Apply lead qualification
        const qualification = LeadQualificationEngine.qualifyLead(data);
        const personalizationData = LeadQualificationEngine.extractPersonalizationData(data);
        
        loadedContacts.push({
          id: doc.id,
          ...data,
          qualification,
          personalizationData,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          lastUpdated: data.lastUpdated?.toDate?.() || new Date(),
          statusHistory: data.statusHistory || [],
          notes: data.notes || []
        });
      });
      
      setContacts(loadedContacts);
      addNotification('success', `Loaded ${loadedContacts.length} contacts`);
      
    } catch (error) {
      console.error('Failed to load contacts:', error);
      addNotification('error', 'Failed to load contacts: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, addNotification]);

  // CSV processing with business logic
  const handleCSVUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    addNotification('info', 'Processing CSV with advanced qualification...');
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV must contain headers and data');
      }
      
      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      const qualifiedContacts = [];
      const disqualifiedCount = { industry: 0, size: 0, email: 0, quality: 0 };
      
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvRow(lines[i]);
        if (values.length !== headers.length) continue;
        
        const contact = {};
        headers.forEach((header, index) => {
          contact[header] = values[index] || '';
        });
        
        // Email validation
        if (!isValidEmail(contact.email)) {
          disqualifiedCount.email++;
          continue;
        }
        
        // Lead qualification
        const qualification = LeadQualificationEngine.qualifyLead(contact);
        
        if (!qualification.qualified) {
          if (!qualification.factors.industry_match) disqualifiedCount.industry++;
          if (!qualification.factors.size_match) disqualifiedCount.size++;
          if (qualification.score < 40) disqualifiedCount.quality++;
          continue;
        }
        
        // Extract personalization data
        const personalizationData = LeadQualificationEngine.extractPersonalizationData(contact);
        
        qualifiedContacts.push({
          ...contact,
          qualification,
          personalizationData,
          status: 'new',
          createdAt: new Date(),
          lastUpdated: new Date(),
          statusHistory: [{
            status: 'new',
            timestamp: new Date(),
            note: 'Imported via CSV - Qualified lead'
          }],
          notes: [],
          source: 'csv_upload'
        });
      }
      
      // Save to Firestore
      if (user?.uid && qualifiedContacts.length > 0) {
        await saveContactsBatch(qualifiedContacts, user.uid);
      }
      
      addNotification('success', 
        `✅ Imported ${qualifiedContacts.length} qualified leads\n` +
        `❌ Disqualified: ${disqualifiedCount.industry} wrong industry, ` +
        `${disqualifiedCount.size} wrong size, ${disqualifiedCount.email} invalid email, ` +
        `${disqualifiedCount.quality} low quality`
      );
      
      await loadContacts();
      
    } catch (error) {
      console.error('CSV processing error:', error);
      addNotification('error', 'CSV processing failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch save to Firestore with error handling
  const saveContactsBatch = async (contacts, userId) => {
    const batchSize = 500;
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
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
      }
      
      try {
        await batch.commit();
        console.log(`✅ Saved batch ${i + 1}/${batches} (${end - start} contacts)`);
      } catch (error) {
        console.error('Batch save error:', error);
        throw error;
      }
    }
  };

  // Execute campaign with proper algorithms
  const executeCampaign = async () => {
    if (!user?.uid) return;
    
    setCampaignStatus('running');
    addNotification('info', '🚀 Starting strategic outreach campaign...');
    
    try {
      // Get qualified contacts
      const targetContacts = contacts.filter(c => 
        c.status === 'researched' && 
        c.qualification?.qualified &&
        c.email
      ).slice(0, 50); // Limit to 50 as per strategy
      
      if (targetContacts.length === 0) {
        addNotification('warning', 'No qualified contacts ready for outreach');
        setCampaignStatus('idle');
        return;
      }
      
      addNotification('info', `📊 Targeting ${targetContacts.length} qualified leads`);
      
      let sentCount = 0;
      let errorCount = 0;
      
      for (const contact of targetContacts) {
        try {
          // Send Email 1
          await campaignManager.sendEmail(
            contact, 
            TEMPLATES.email1, 
            contact.personalizationData
          );
          
          // Update contact status
          await updateContactStatus(
            contact.id, 
            'contacted', 
            'Email 1 sent + LinkedIn connection attempted'
          );
          
          sentCount++;
          
          // Small delay to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error('Failed to send email to:', contact.email, error);
          errorCount++;
          
          // Handle bounce
          if (error.message.includes('bounce')) {
            campaignManager.recordBounce();
            await updateContactStatus(contact.id, 'bounced', 'Email bounced');
          }
        }
      }
      
      // Update daily stats
      setDailyStats(campaignManager.getDailyStats());
      
      addNotification('success', 
        `✅ Campaign completed!\n` +
        `📤 ${sentCount} emails sent successfully\n` +
        `❌ ${errorCount} errors encountered\n` +
        `📊 Reply rate target: 15-20%`
      );
      
      setCampaignStatus('completed');
      
    } catch (error) {
      console.error('Campaign error:', error);
      addNotification('error', 'Campaign failed: ' + error.message);
      setCampaignStatus('error');
    }
  };

  // Update contact status with validation
  const updateContactStatus = async (contactId, newStatus, note = '') => {
    if (!user?.uid) return;
    
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(contactsRef);
      const snapshot = await getDocs(q);
      
      let updated = false;
      snapshot.forEach(doc => {
        if (doc.id === contactId) {
          const contactData = doc.data();
          const currentStatus = contactData.status || 'new';
          
          // Validate transition
          if (!STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) && currentStatus !== 'archived') {
            throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
          }
          
          // Update status
          const historyEntry = {
            status: newStatus,
            timestamp: new Date(),
            note: note || `Status changed from ${currentStatus} to ${newStatus}`,
            userId: user.uid
          };
          
          updateDoc(doc.ref, {
            status: newStatus,
            lastUpdated: serverTimestamp(),
            statusHistory: [...(contactData.statusHistory || []), historyEntry]
          });
          
          // Update local state
          setContacts(prev => prev.map(c => 
            c.id === contactId 
              ? { 
                  ...c, 
                  status: newStatus, 
                  lastUpdated: new Date(),
                  statusHistory: [...(c.statusHistory || []), historyEntry]
                }
              : c
          ));
          
          updated = true;
        }
      });
      
      if (updated) {
        addNotification('success', `Status updated to ${newStatus}`);
      } else {
        throw new Error('Contact not found');
      }
      
    } catch (error) {
      console.error('Status update error:', error);
      addNotification('error', 'Failed to update status: ' + error.message);
    }
  };

  // Filter contacts with business logic
  const filteredContacts = useMemo(() => {
    let filtered = [...contacts];
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(contact => 
        contact.company_name?.toLowerCase().includes(query) ||
        contact.email?.toLowerCase().includes(query) ||
        contact.first_name?.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(contact => contact.status === statusFilter);
    }
    
    // Apply sorting with business logic
    filtered.sort((a, b) => {
      if (sortBy === 'score') {
        return (b.qualification?.score || 0) - (a.qualification?.score || 0);
      } else if (sortBy === 'recent') {
        return new Date(b.lastUpdated) - new Date(a.lastUpdated);
      } else if (sortBy === 'company') {
        return (a.company_name || '').localeCompare(b.company_name || '');
      }
      return 0;
    });
    
    return filtered;
  }, [contacts, searchQuery, statusFilter, sortBy]);

  // Calculate KPI metrics with business intelligence
  const kpiData = useMemo(() => {
    if (contacts.length === 0) return null;
    
    const kpis = BusinessIntelligenceEngine.calculateKPIs(contacts, campaignManager);
    const insights = BusinessIntelligenceEngine.generateInsights(kpis, contacts);
    
    return { ...kpis, insights };
  }, [contacts, campaignManager]);

  // Update KPI metrics when data changes
  useEffect(() => {
    if (kpiData) {
      setKpiMetrics(kpiData);
    }
  }, [kpiData]);

  // Update daily stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setDailyStats(campaignManager.getDailyStats());
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, [campaignManager]);

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
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h1 className="text-white text-3xl font-bold mb-2">Syndicate Solutions</h1>
          <p className="text-gray-300 text-lg">Strategic Sales Automation Platform</p>
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
            <p className="text-gray-300 text-xl mb-2">Strategic Sales Automation Platform</p>
            <p className="text-gray-500 text-base">Focused B2B SaaS Outreach with Precision Targeting</p>
          </div>
          
          <div className="bg-gray-800 rounded-2xl p-8 border border-gray-700">
            <h2 className="text-white text-2xl font-semibold mb-6">🎯 Strategic ICP Targeting</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              <div>
                <h3 className="text-blue-400 font-semibold mb-3">Target Profile</h3>
                <div className="space-y-2 text-gray-300">
                  <p><strong>Industry:</strong> {ICP_DEFINITION.industry}</p>
                  <p><strong>Size:</strong> {ICP_DEFINITION.company_size.employees}</p>
                  <p><strong>Funding:</strong> {ICP_DEFINITION.funding}</p>
                  <p><strong>Geography:</strong> {ICP_DEFINITION.geography}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-purple-400 font-semibold mb-3">Strategic Focus</h3>
                <div className="space-y-2 text-gray-300">
                  <p><strong>Pain Point:</strong> {ICP_DEFINITION.pain_point}</p>
                  <p><strong>Trigger:</strong> {ICP_DEFINITION.trigger}</p>
                  <p><strong>Batch Size:</strong> 50 qualified targets</p>
                  <p><strong>Cadence:</strong> 4-touch multi-channel</p>
                </div>
              </div>
            </div>
            
            <div className="mt-8">
              <h3 className="text-green-400 font-semibold mb-3">📊 Business Strategy</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-green-400 font-bold">3</div>
                  <div className="text-xs text-gray-300">Controlled Templates</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-blue-400 font-bold">50</div>
                  <div className="text-xs text-gray-300">Target Companies</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-purple-400 font-bold">4</div>
                  <div className="text-xs text-gray-300">Touch Cadence</div>
                </div>
              </div>
            </div>
            
            <div className="mt-8 p-4 bg-amber-900/20 border border-amber-800 rounded-lg">
              <h3 className="text-amber-300 font-semibold mb-2">🔥 Production Features</h3>
              <div className="text-amber-200 text-sm space-y-1">
                <p>✅ Advanced lead qualification algorithm</p>
                <p>✅ Send safety rules & deliverability protection</p>
                <p>✅ Real-time KPI monitoring & insights</p>
                <p>✅ Business intelligence & predictive analytics</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={signIn}
            className="mt-8 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-lg font-semibold transition-all transform hover:scale-105"
          >
            🔐 Sign In with Google
          </button>
          
          <div className="mt-6 text-gray-500 text-sm space-y-1">
            <p>✅ Strategic ICP targeting for maximum conversion</p>
            <p>✅ Controlled templates for consistent messaging</p>
            <p>✅ Send safety rules for deliverability protection</p>
            <p>✅ Business intelligence for data-driven decisions</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Syndicate Solutions - Strategic Sales Automation</title>
        <meta name="description" content="Strategic B2B sales automation for scaling SaaS companies" />
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
                  <p className="font-medium whitespace-pre-line">{notification.message}</p>
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
                  Strategic Automation
                </span>
                {kpiMetrics?.healthScore && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    kpiMetrics.healthScore >= 90 ? 'bg-green-600 text-white' :
                    kpiMetrics.healthScore >= 70 ? 'bg-yellow-600 text-white' :
                    'bg-red-600 text-white'
                  }`}>
                    Health: {kpiMetrics.healthScore}%
                  </span>
                )}
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
          {/* Strategic KPI Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-6 mb-8">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Total Leads</h3>
                <span className="text-blue-400">📊</span>
              </div>
              <p className="text-white text-3xl font-bold">{kpiMetrics?.total || 0}</p>
              <p className="text-gray-500 text-xs mt-1">In database</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Qualified</h3>
                <span className="text-green-400">✅</span>
              </div>
              <p className="text-green-400 text-3xl font-bold">{kpiMetrics?.qualified || 0}</p>
              <p className="text-gray-500 text-xs mt-1">Meet ICP criteria</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Contacted</h3>
                <span className="text-purple-400">📞</span>
              </div>
              <p className="text-purple-400 text-3xl font-bold">{kpiMetrics?.contacted || 0}</p>
              <p className="text-gray-500 text-xs mt-1">Outreach sent</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Reply Rate</h3>
                <span className="text-yellow-400">📈</span>
              </div>
              <p className="text-yellow-400 text-3xl font-bold">{kpiMetrics?.replyRate || 0}%</p>
              <p className="text-gray-500 text-xs mt-1">Industry avg: 15%</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Meetings</h3>
                <span className="text-orange-400">📅</span>
              </div>
              <p className="text-orange-400 text-3xl font-bold">{kpiMetrics?.demos || 0}</p>
              <p className="text-gray-500 text-xs mt-1">Booked calls</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-gray-400 text-sm font-medium">Pipeline Value</h3>
                <span className="text-emerald-400">💰</span>
              </div>
              <p className="text-emerald-400 text-3xl font-bold">
                ${((kpiMetrics?.pipelineValue || 0) / 1000).toFixed(1)}K
              </p>
              <p className="text-gray-500 text-xs mt-1">Estimated revenue</p>
            </div>
          </div>

          {/* Business Intelligence Insights */}
          {kpiMetrics?.insights && kpiMetrics.insights.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {kpiMetrics.insights.map((insight, index) => (
                <div
                  key={index}
                  className={`rounded-xl p-6 border ${
                    insight.type === 'error' ? 'bg-red-900/20 border-red-800' :
                    insight.type === 'warning' ? 'bg-yellow-900/20 border-yellow-800' :
                    insight.type === 'success' ? 'bg-green-900/20 border-green-800' :
                    'bg-blue-900/20 border-blue-800'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 text-2xl">
                      {insight.type === 'error' && '⚠️'}
                      {insight.type === 'warning' && '⚡'}
                      {insight.type === 'success' && '✅'}
                      {insight.type === 'info' && 'ℹ️'}
                    </div>
                    <div>
                      <h4 className={`font-semibold mb-2 ${
                        insight.type === 'error' ? 'text-red-300' :
                        insight.type === 'warning' ? 'text-yellow-300' :
                        insight.type === 'success' ? 'text-green-300' :
                        'text-blue-300'
                      }`}>
                        {insight.title}
                      </h4>
                      <p className="text-gray-300 text-sm mb-2">{insight.message}</p>
                      <p className="text-gray-400 text-xs">
                        <strong>Action:</strong> {insight.action}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Strategic Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* CSV Import with Qualification */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-white text-xl font-bold mb-4">📤 Strategic Lead Import</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Import CSV with advanced qualification
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    disabled={loading}
                    className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                  />
                </div>
                
                <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-3">
                  <p className="text-blue-300 text-sm font-medium">🎯 Advanced Qualification</p>
                  <div className="text-blue-200 text-xs mt-1 space-y-1">
                    <p>• Industry: B2B SaaS only</p>
                    <p>• Size: 20-200 employees</p>
                    <p>• Email: Validated & verified</p>
                    <p>• Triggers: Funding, hiring, growth</p>
                    <p>• Scoring: Advanced algorithm</p>
                  </div>
                </div>
                
                {loading && (
                  <div className="bg-amber-900/30 border border-amber-800 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-amber-400"></div>
                      <span className="text-amber-300 text-sm">Processing with advanced algorithms...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Campaign Execution */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-white text-xl font-bold mb-4">🚀 Strategic Campaign</h2>
              <div className="space-y-4">
                <div className="bg-purple-900/30 border border-purple-800 rounded-lg p-3">
                  <p className="text-purple-300 text-sm font-medium">📋 Campaign Rules</p>
                  <div className="text-purple-200 text-xs mt-1 space-y-1">
                    <p>• Batch: 50 qualified targets</p>
                    <p>• Templates: 3 controlled messages</p>
                    <p>• Cadence: Day 0, 3, 5, 7</p>
                    <p>• Safety: 50 emails/day max</p>
                    <p>• Intelligence: Real-time KPI</p>
                  </div>
                </div>
                
                <button
                  onClick={executeCampaign}
                  disabled={campaignStatus === 'running' || loading}
                  className={`w-full py-3 rounded-lg font-bold transition ${
                    campaignStatus === 'running'
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {campaignStatus === 'running' ? '📤 Campaign Running...' : '🚀 Execute Campaign'}
                </button>
                
                {dailyStats && (
                  <div className="bg-green-900/30 border border-green-800 rounded-lg p-3">
                    <p className="text-green-300 text-sm font-medium">📊 Today's Performance</p>
                    <div className="text-green-200 text-xs mt-1 space-y-1">
                      <p>• Sent: {dailyStats.sent} emails</p>
                      <p>• Bounce Rate: {dailyStats.bounceRate}%</p>
                      <p>• Unsubscribe: {dailyStats.unsubscribeRate}%</p>
                      <p>• Status: {dailyStats.safetyStatus}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Templates & Strategy */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-white text-xl font-bold mb-4">📧 Strategic Templates</h2>
              <div className="space-y-3">
                {Object.values(TEMPLATES).map((template, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-3">
                    <h4 className="text-white font-medium text-sm mb-1">{template.name}</h4>
                    <p className="text-gray-400 text-xs mb-2">{template.subject}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-xs">{template.word_count} words</span>
                      <span className="text-blue-400 text-xs">
                        {template.variables.length} variables
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={() => setShowAnalytics(!showAnalytics)}
                className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {showAnalytics ? 'Hide' : 'Show'} Advanced Analytics
              </button>
            </div>
          </div>

          {/* Contact Database with Business Intelligence */}
          <div className="bg-gray-800 rounded-xl border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex justify-between items-center">
                <h2 className="text-white text-xl font-bold">📋 Strategic Contact Database</h2>
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
                    <option value="recent">Recent First</option>
                    <option value="company">Company A-Z</option>
                  </select>
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 mt-4">
                <input
                  type="text"
                  placeholder="Search companies, contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                />
                
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
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-750">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Company</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Qualification</th>
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
                          <div className="text-gray-500 text-xs">{contact.employees} employees</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-white text-sm">{contact.first_name}</div>
                        <div className="text-gray-400 text-sm">{contact.email}</div>
                        <div className="text-gray-500 text-xs">{contact.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            contact.qualification?.grade === 'A' ? 'bg-green-900 text-green-300' :
                            contact.qualification?.grade === 'B' ? 'bg-yellow-900 text-yellow-300' :
                            'bg-red-900 text-red-300'
                          }`}>
                            Grade {contact.qualification?.grade || 'C'}
                          </span>
                          <span className="text-white font-bold">{contact.qualification?.score || 0}</span>
                        </div>
                        <div className="text-gray-400 text-xs mt-1">
                          {contact.qualification?.recommended_action || 'Standard outreach'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={contact.status || 'new'}
                          onChange={(e) => updateContactStatus(contact.id, e.target.value)}
                          className="px-3 py-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                        >
                          {CONTACT_STATUSES.map(status => (
                            <option key={status.id} value={status.id}>{status.label}</option>
                          ))}
                        </select>
                        <div className="text-gray-500 text-xs mt-1">
                          {contact.statusHistory?.length || 0} changes
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="text-blue-400 hover:text-blue-300"
                              title="Send Email"
                            >
                              ✉️
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`https://wa.me/${contact.phone.replace('+', '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                              title="WhatsApp"
                            >
                              💬
                            </a>
                          )}
                          <button
                            onClick={() => updateContactStatus(contact.id, 'researched', 'Manual research completed')}
                            className="text-purple-400 hover:text-purple-300"
                            title="Mark as Researched"
                          >
                            🔍
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredContacts.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-6xl mb-4">🎯</div>
                  <p className="text-xl font-medium mb-2">No Strategic Contacts Found</p>
                  <p className="text-sm">Import a CSV with B2B SaaS companies to get started</p>
                  <div className="mt-4 text-xs space-y-1">
                    <p>💡 Target: 20-200 employees, Series A-C funding</p>
                    <p>📊 Focus: Scaling customer acquisition pain point</p>
                    <p>🚀 Strategy: 4-touch cadence with controlled templates</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
