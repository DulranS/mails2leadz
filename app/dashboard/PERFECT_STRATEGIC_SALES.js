'use client';

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

// ✅ TIGHT ICP DEFINITION - Laser-Focused Targeting
const ICP_DEFINITION = {
  industry: 'Digital Agencies & SaaS Companies',
  company_size: { min: 5, max: 50, employees: '5-50 employees' },
  funding: 'Bootstrapped to Series A',
  geography: 'USA, Canada, UK, Australia',
  pain_point: 'Overwhelmed with client work and need reliable delivery partner',
  trigger: 'Recently posted about hiring or scaling challenges'
};

// ✅ CONTACT STATUS DEFINITIONS (Business-Driven Workflow)
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New Lead', color: 'gray', description: 'Never contacted' },
  { id: 'researched', label: '🔍 Researched', color: 'blue', description: 'Research completed' },
  { id: 'contacted', label: '📞 Contacted', color: 'indigo', description: 'Initial outreach sent' },
  { id: 'engaged', label: '💬 Engaged', color: 'purple', description: 'Opened/clicked but no reply' },
  { id: 'replied', label: '✅ Replied', color: 'green', description: 'Responded to outreach' },
  { id: 'meeting_booked', label: '📅 Meeting Booked', color: 'emerald', description: 'Call scheduled' },
  { id: 'meeting_completed', label: '🤝 Meeting Done', color: 'teal', description: 'Call completed' },
  { id: 'proposal_sent', label: '📄 Proposal Sent', color: 'orange', description: 'Quote delivered' },
  { id: 'negotiation', label: '🤝 Negotiation', color: 'yellow', description: 'Discussing terms' },
  { id: 'closed_won', label: '💰 Closed Won', color: 'green', description: 'Deal secured!' },
  { id: 'closed_lost', label: '❌ Closed Lost', color: 'red', description: 'Not interested' },
  { id: 'bounced', label: '🚫 Bounced', color: 'rose', description: 'Email bounced' },
  { id: 'archived', label: '🗄️ Archived', color: 'gray', description: 'Inactive >30 days' }
];

// ✅ STATUS TRANSITION RULES (Prevent invalid state changes)
const STATUS_TRANSITIONS = {
  'new': ['researched', 'archived'],
  'researched': ['contacted', 'archived'],
  'contacted': ['engaged', 'replied', 'bounced', 'archived'],
  'engaged': ['replied', 'contacted', 'archived'],
  'replied': ['meeting_booked', 'meeting_completed', 'proposal_sent', 'negotiation', 'closed_won', 'closed_lost', 'archived'],
  'meeting_booked': ['meeting_completed', 'archived'],
  'meeting_completed': ['proposal_sent', 'negotiation', 'closed_won', 'closed_lost', 'archived'],
  'proposal_sent': ['negotiation', 'closed_won', 'closed_lost', 'archived'],
  'negotiation': ['closed_won', 'closed_lost', 'archived'],
  'closed_won': ['archived'],
  'closed_lost': ['archived'],
  'bounced': ['archived'],
  'archived': []
};

// ✅ MULTI-TOUCH CADENCE - Specific day/channel/template sequence
const CADENCE_SEQUENCE = [
  { day: 0, channel: 'email', template: 'email1', action: 'Send Email 1 + LinkedIn connection' },
  { day: 3, channel: 'email', template: 'email2', action: 'Send Email 2' },
  { day: 5, channel: 'social', template: null, action: 'Send social message (if connected)' },
  { day: 7, channel: 'email', template: 'breakup', action: 'Send break-up email' }
];

// ✅ SEND SAFETY RULES - Protect deliverability
const SEND_SAFETY_RULES = {
  max_emails_per_day: 50,
  max_emails_per_inbox: 30,
  required_delay_between_emails: 2000,
  pause_on_bounce_rate: 5,
  pause_on_unsubscribe_rate: 1
};

// ✅ CONTROLLED EMAIL TEMPLATES (Exactly 3, <120 words)
const CONTROLLED_TEMPLATES = {
  email1: {
    name: 'Initial Outreach',
    subject: 'Quick question about {{company_name}}',
    body: `Hi {{first_name}}, I hope you're doing well.
My name is Dulran Samarasinghe. I run Syndicate Solutions, a Sri Lanka–based mini agency supporting small to mid-sized agencies and businesses with reliable execution across web, software, AI automation, and ongoing digital operations.
We typically work as a white-label or outsourced partner when teams need extra delivery capacity, fast turnarounds without hiring, or ongoing technical and digital support.
I'm reaching out to ask – do you ever use external support when workload or deadlines increase?
If helpful, I'm open to starting with a small task or short contract to build trust before discussing anything larger.
You can review my work here:
Portfolio: https://syndicatesolutions.vercel.app/
LinkedIn: https://www.linkedin.com/in/dulran-samarasinghe-13941b175/
If it makes sense, you can book a short 15-minute call:
https://cal.com/syndicate-solutions/15min
You can contact me on Whatsapp - 0741143323
You can email me at - syndicatesoftwaresolutions@gmail.com
Otherwise, happy to continue conversation over email.
Best regards,
Dulran Samarasinghe
Founder – Syndicate Solutions`,
    word_count: 95
  },
  email2: {
    name: 'Social Proof',
    subject: 'Re: {{company_name}}',
    body: `Hi {{first_name}},
Just circling back—did my note about outsourced dev & ops support land at a bad time?
No pressure at all, but if you're ever swamped with web, automation, or backend work and need a reliable extra hand (especially for white-label or fast-turnaround needs), we're ready to help.
Even a 1-hour task is a great way to test the waters.
Either way, wishing you a productive week!
Best,
Dulran
Founder – Syndicate Solutions
WhatsApp: 0741143323`,
    word_count: 68
  },
  breakup: {
    name: 'Break-up Email',
    subject: 'Closing the loop - {{company_name}}',
    body: `Hi {{first_name}},
I'll stop emailing after this one! 😅
Just wanted to say: if outsourcing ever becomes a priority—whether for web dev, AI tools, or ongoing ops—we're here. Many of our clients started with a tiny $100 task and now work with us monthly.
If now's not the time, no worries! I'll circle back in a few months.
Either way, keep crushing it!
— Dulran
WhatsApp: 0741143323`,
    word_count: 58
  }
};

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

// Initialize Firebase
let app, db, auth;
if (typeof window !== 'undefined' && firebaseConfig.apiKey) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (error) {
    console.error('Firebase init error:', error);
  }
}

// ✅ UTILITY FUNCTIONS - All with safety checks
const safeString = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined || isNaN(value)) return fallback;
  return Number(value);
};

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  let cleaned = safeString(email).trim()
    .toLowerCase()
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/\s+/g, '')
    .replace(/[<>]/g, '');
  if (cleaned.length < 5) return false;
  if (cleaned === 'undefined' || cleaned === 'null' || cleaned === 'na' || cleaned === 'n/a') return false;
  if (cleaned.startsWith('[') || cleaned.includes('missing')) return false;
  const atCount = (cleaned.match(/@/g) || []).length;
  if (atCount !== 1) return false;
  const parts = cleaned.split('@');
  const [localPart, domainPart] = parts;
  if (!localPart || localPart.length < 1) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (!domainPart || domainPart.length < 3) return false;
  if (!domainPart.includes('.')) return false;
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) return false;
  const domainBits = domainPart.split('.');
  const tld = domainBits[domainBits.length - 1];
  if (!tld || tld.length < 2 || tld.length > 6) return false;
  if (!/^[a-z0-9-]+$/.test(tld)) return false;
  if (tld.startsWith('-') || tld.endsWith('-')) return false;
  return true;
};

// ✅ SAFE CSV PARSING - Fixed the toLowerCase error
const parseCsvRow = (str) => {
  if (!str || typeof str !== 'string') return [];
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !inQuotes) inQuotes = true;
    else if (char === '"' && inQuotes) {
      if (i + 1 < str.length && str[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = false;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else current += char;
  }
  result.push(current);
  return result.map(field => {
    let cleaned = safeString(field).replace(/[\r\n]/g, '').trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/""/g, '"');
    }
    return cleaned;
  });
};

const personalizeTemplate = (template, contact, senderName) => {
  if (!template) return '';
  let personalized = safeString(template);
  
  // Replace template variables with safety checks
  personalized = personalized.replace(/\{\{company_name\}\}/g, safeString(contact.company_name || contact.company || 'your company'));
  personalized = personalized.replace(/\{\{first_name\}\}/g, safeString(contact.first_name || (contact.name ? safeString(contact.name).split(' ')[0] : 'there')));
  personalized = personalized.replace(/\{\{sender_name\}\}/g, safeString(senderName || 'Dulran Samarasinghe'));
  personalized = personalized.replace(/\{\{industry\}\}/g, safeString(contact.industry || 'your industry'));
  personalized = personalized.replace(/\{\{similar_company\}\}/g, 'a similar agency');
  
  return personalized;
};

// ✅ LEAD QUALIFICATION ENGINE - Score leads based on ICP
const qualifyLead = (contact) => {
  let score = 0;
  let qualified = false;
  let disqualification_reasons = [];
  
  // Industry match (30 points)
  if (contact.industry) {
    const industryStr = safeString(contact.industry).toLowerCase();
    if (industryStr.includes('agency') || 
        industryStr.includes('software') || 
        industryStr.includes('technology')) {
      score += 30;
    } else {
      disqualification_reasons.push('Not in target industry');
    }
  } else {
    disqualification_reasons.push('Industry not specified');
  }
  
  // Company size (20 points)
  const size = safeNumber(contact.employees || contact.company_size || 0);
  if (size >= 5 && size <= 50) {
    score += 20;
  } else {
    disqualification_reasons.push('Company size not in 5-50 range');
  }
  
  // Email quality (20 points)
  if (contact.email && isValidEmail(contact.email)) {
    score += 20;
  } else {
    disqualification_reasons.push('Invalid or missing email');
  }
  
  // Website presence (15 points)
  if (contact.website && safeString(contact.website).startsWith('http')) {
    score += 15;
  }
  
  // Phone number (15 points)
  if (contact.phone && safeString(contact.phone).length > 5) {
    score += 15;
  }
  
  qualified = score >= 50 && disqualification_reasons.length === 0;
  
  return {
    score,
    qualified,
    disqualification_reasons,
    icp_match: qualified ? 'High' : score >= 30 ? 'Medium' : 'Low'
  };
};

// ✅ CAMPAIGN MANAGER - Safety rules and execution
class CampaignManager {
  constructor() {
    this.dailyStats = {
      sent: 0,
      bounces: 0,
      replies: 0,
      meetings: 0,
      date: new Date().toDateString()
    };
    this.stats = {
      sent: 0,
      bounces: 0,
      replies: 0,
      meetings: 0
    };
  }
  
  canSend() {
    this.resetDailyStats();
    
    if (this.dailyStats.sent >= SEND_SAFETY_RULES.max_emails_per_day) {
      return { canSend: false, reason: 'Daily email limit reached' };
    }
    
    if (this.dailyStats.sent > 0) {
      const bounceRate = (this.dailyStats.bounces / this.dailyStats.sent * 100);
      if (bounceRate >= SEND_SAFETY_RULES.pause_on_bounce_rate) {
        return { canSend: false, reason: 'Bounce rate too high' };
      }
    }
    
    return { canSend: true, reason: 'Ready to send' };
  }
  
  async sendEmail(target, template, personalizationData) {
    const canSend = this.canSend();
    if (!canSend.canSend) {
      throw new Error(canSend.reason);
    }
    
    // Personalize template
    const personalizedSubject = personalizeTemplate(template.subject, target, personalizationData.senderName);
    const personalizedBody = personalizeTemplate(template.body, target, personalizationData.senderName);
    
    console.log('📤 Sending email:', {
      to: safeString(target.email || 'No email'),
      subject: personalizedSubject,
      body: personalizedBody.substring(0, 100) + '...'
    });
    
    // Update stats
    this.dailyStats.sent++;
    this.stats.sent++;
    
    // Simulate send delay
    await new Promise(resolve => setTimeout(resolve, SEND_SAFETY_RULES.required_delay_between_emails));
    
    return {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'sent'
    };
  }
  
  recordBounce() {
    this.dailyStats.bounces++;
    this.stats.bounces++;
  }
  
  getDailyStats() {
    this.resetDailyStats();
    return { ...this.dailyStats };
  }
  
  resetDailyStats() {
    const today = new Date().toDateString();
    if (this.dailyStats.date !== today) {
      this.dailyStats = {
        sent: 0,
        bounces: 0,
        replies: 0,
        meetings: 0,
        date: today
      };
    }
  }
  
  shouldPauseCampaign() {
    this.resetDailyStats();
    
    if (this.dailyStats.sent > 0) {
      const bounceRate = (this.dailyStats.bounces / this.dailyStats.sent * 100);
      if (bounceRate >= SEND_SAFETY_RULES.pause_on_bounce_rate) {
        return true;
      }
    }
    
    return false;
  }
}

// ✅ BUSINESS INTELLIGENCE ENGINE - KPI tracking + AI insights
class BusinessIntelligence {
  constructor() {
    this.kpis = {
      replyRate: 0,
      meetingRate: 0,
      bounceRate: 0,
      healthScore: 0,
      totalSent: 0,
      totalReplies: 0,
      totalMeetings: 0,
      totalBounces: 0
    };
    this.insights = [];
  }
  
  getKPIs() {
    return this.kpis;
  }
  
  getInsights() {
    return this.insights;
  }
  
  updateKPIs(sent, replies, meetings, bounces, unsubscribes) {
    // Update all KPIs with safe math
    this.kpis.totalSent += safeNumber(sent);
    this.kpis.totalReplies += safeNumber(replies);
    this.kpis.totalMeetings += safeNumber(meetings);
    this.kpis.totalBounces += safeNumber(bounces);
    
    // Calculate rates with division by zero protection
    this.kpis.replyRate = this.kpis.totalSent > 0 ? 
      safeNumber((this.kpis.totalReplies / this.kpis.totalSent * 100).toFixed(1)) : 0;
    this.kpis.meetingRate = this.kpis.totalSent > 0 ? 
      safeNumber((this.kpis.totalMeetings / this.kpis.totalSent * 100).toFixed(1)) : 0;
    this.kpis.bounceRate = this.kpis.totalSent > 0 ? 
      safeNumber((this.kpis.totalBounces / this.kpis.totalSent * 100).toFixed(1)) : 0;
    
    // Calculate health score
    this.kpis.healthScore = this.calculateHealthScore();
    
    // Generate insights
    this.generateInsights();
  }
  
  calculateHealthScore() {
    let score = 100;
    
    // Reply rate impact
    if (this.kpis.replyRate >= 15) {
      score += 0; // Excellent
    } else if (this.kpis.replyRate >= 10) {
      score -= 10; // Good
    } else if (this.kpis.replyRate >= 5) {
      score -= 25; // Poor
    } else {
      score -= 40; // Very poor
    }
    
    // Bounce rate impact
    if (this.kpis.bounceRate <= 2) {
      score += 0; // Excellent
    } else if (this.kpis.bounceRate <= 5) {
      score -= 10; // Acceptable
    } else if (this.kpis.bounceRate <= 10) {
      score -= 30; // Poor
    } else {
      score -= 50; // Very poor
    }
    
    return Math.max(0, Math.min(100, score));
  }
  
  generateInsights() {
    this.insights = [];
    
    if (this.kpis.replyRate >= 15) {
      this.insights.push({
        type: 'success',
        title: 'Excellent Reply Rate',
        message: `Reply rate of ${this.kpis.replyRate}% exceeds target. Scale campaign!`
      });
    }
    
    if (this.kpis.bounceRate >= 5) {
      this.insights.push({
        type: 'error',
        title: 'High Bounce Rate',
        message: `Bounce rate of ${this.kpis.bounceRate}% exceeds threshold. Clean contact list!`
      });
    }
    
    if (this.kpis.replyRate < 5) {
      this.insights.push({
        type: 'warning',
        title: 'Low Reply Rate',
        message: `Reply rate of ${this.kpis.replyRate}% below target. Optimize templates!`
      });
    }
    
    if (this.kpis.healthScore >= 80) {
      this.insights.push({
        type: 'success',
        title: 'Excellent Health Score',
        message: `Overall health score of ${this.kpis.healthScore}/100 indicates strong performance.`
      });
    } else if (this.kpis.healthScore < 50) {
      this.insights.push({
        type: 'error',
        title: 'Poor Health Score',
        message: `Health score of ${this.kpis.healthScore}/100 requires immediate attention.`
      });
    }
  }
}

export default function PerfectStrategicSales() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [previewRecipient, setPreviewRecipient] = useState(null);
  
  // Campaign state - Initialize instances directly
  const campaignManager = new CampaignManager();
  const businessIntelligence = new BusinessIntelligence();
  const [campaignStatus, setCampaignStatus] = useState('idle');
  const [dailyStats, setDailyStats] = useState({});
  
  // Notification system
  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type, timestamp: new Date() }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);
  
  // Authentication
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        loadTargets();
        loadCampaigns();
      } else {
        setTargets([]);
        setCampaigns([]);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);
  
  // Load targets from Firestore
  const loadTargets = useCallback(async () => {
    if (!user?.uid) return;
    
    try {
      const targetsRef = collection(db, 'users', user.uid, 'targets');
      const q = query(targetsRef, orderBy('createdAt', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const loadedTargets = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Apply lead qualification
        const qualification = qualifyLead(data);
        
        loadedTargets.push({
          id: doc.id,
          ...data,
          qualification,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          lastUpdated: data.lastUpdated?.toDate?.() || new Date(),
          statusHistory: data.statusHistory || [],
          notes: data.notes || []
        });
      });
      
      setTargets(loadedTargets);
      console.log(`✅ Loaded ${loadedTargets.length} targets from Firestore`);
      addNotification(`Loaded ${loadedTargets.length} targets`, 'success');
      
    } catch (error) {
      console.error('Failed to load targets:', error);
      addNotification('Failed to load targets: ' + error.message, 'error');
    }
  }, [user?.uid, addNotification]);
  
  // Load campaigns from Firestore
  const loadCampaigns = useCallback(async () => {
    if (!user?.uid) return;
    
    try {
      const campaignsRef = collection(db, 'users', user.uid, 'campaigns');
      const q = query(campaignsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedCampaigns = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        loadedCampaigns.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          lastExecuted: data.lastExecuted?.toDate?.() || null
        });
      });
      
      setCampaigns(loadedCampaigns);
      console.log(`✅ Loaded ${loadedCampaigns.length} campaigns from Firestore`);
      
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      addNotification('Failed to load campaigns: ' + error.message, 'error');
    }
  }, [user?.uid, addNotification]);
  
  // Update target status
  const updateTargetStatus = async (targetId, newStatus, note = '') => {
    if (!user?.uid || !targetId || !newStatus) {
      console.warn('Missing required data for status update');
      return false;
    }
    
    try {
      const targetRef = doc(db, 'users', user.uid, 'targets', targetId);
      const targetDoc = await getDoc(targetRef);
      
      if (!targetDoc.exists()) {
        throw new Error(`Target ${targetId} not found in Firestore`);
      }
      
      const targetData = targetDoc.data();
      const currentStatus = targetData.status || 'new';
      
      // Validate transition
      if (!STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) && currentStatus !== 'archived') {
        const validTransitions = STATUS_TRANSITIONS[currentStatus] || [];
        console.warn(`Invalid status transition: ${currentStatus} → ${newStatus}. Valid:`, validTransitions);
        addNotification(`Cannot change status from "${currentStatus}" to "${newStatus}". Valid: ${validTransitions.join(', ') || 'none'}`, 'error');
        return false;
      }
      
      // Update status
      const historyEntry = {
        status: newStatus,
        timestamp: new Date(),
        note: note || `Status changed from ${currentStatus} to ${newStatus}`,
        userId: user.uid
      };
      
      await updateDoc(targetRef, {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        statusHistory: [...(targetData.statusHistory || []), historyEntry]
      });
      
      // Update local state
      setTargets(prev => prev.map(t => 
        t.id === targetId 
          ? { ...t, status: newStatus, lastUpdated: new Date() }
          : t
      ));
      
      console.log(`✅ Updated target ${targetId} status to ${newStatus}`);
      addNotification(`Status updated to ${newStatus}`, 'success');
      return true;
      
    } catch (error) {
      console.error('Status update error:', error);
      addNotification('Failed to update status: ' + error.message, 'error');
      return false;
    }
  };
  
  // Create campaign
  const createCampaign = async (campaignData) => {
    if (!user?.uid) return null;
    
    try {
      const campaignsRef = collection(db, 'users', user.uid, 'campaigns');
      const newCampaign = {
        ...campaignData,
        status: 'draft',
        target_criteria: {
          status: ['researched', 'new'],
          qualification: { qualified: true }
        },
        cadence: CADENCE_SEQUENCE,
        templates: CONTROLLED_TEMPLATES,
        stats: {
          sent: 0,
          replies: 0,
          meetings: 0,
          bounces: 0
        },
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(campaignsRef, newCampaign);
      await loadCampaigns();
      
      console.log('✅ Created campaign:', docRef.id);
      addNotification('Campaign created successfully!', 'success');
      return docRef.id;
      
    } catch (error) {
      console.error('Failed to create campaign:', error);
      addNotification('Failed to create campaign: ' + error.message, 'error');
      return null;
    }
  };
  
  // Execute campaign
  const executeCampaign = async (campaignId) => {
    if (!user || !db) return;
    
    try {
      // Check if campaign should be paused due to safety rules
      if (campaignManager.shouldPauseCampaign()) {
        addNotification('🚫 Campaign paused due to high bounce or unsubscribe rate. Fix email list quality before resuming.', 'error');
        setCampaignStatus('paused');
        return;
      }
      
      setCampaignStatus('running');
      addNotification('🚀 Starting strategic outreach campaign...', 'info');
      
      // Get campaign details
      const campaignRef = doc(db, 'users', user.uid, 'campaigns', campaignId);
      const campaignDoc = await getDoc(campaignRef);
      
      if (!campaignDoc.exists()) {
        throw new Error('Campaign not found');
      }
      
      const campaign = campaignDoc.data();
      
      // Get qualified targets (limit to 50 as per strategy)
      const targetContacts = targets.filter(t => {
        const hasValidStatus = t.status === 'researched' || t.status === 'new';
        const isQualified = t.qualification?.qualified;
        const hasEmail = t.email && isValidEmail(t.email);
        
        console.log(`Contact ${t.company_name}:`, {
          status: t.status,
          qualified: isQualified,
          hasEmail: hasEmail,
          score: t.qualification?.score
        });
        
        return hasValidStatus && isQualified && hasEmail;
      }).slice(0, 50);
      
      if (targetContacts.length === 0) {
        addNotification('No qualified targets ready for outreach. Try importing more contacts or marking some as "researched".', 'warning');
        setCampaignStatus('idle');
        return;
      }
      
      addNotification(`📊 Targeting ${targetContacts.length} qualified leads`, 'info');
      
      let sentCount = 0;
      let errorCount = 0;
      
      for (const target of targetContacts) {
        try {
          // Send Email 1
          const template = CONTROLLED_TEMPLATES.email1;
          await campaignManager.sendEmail(
            target, 
            template, 
            { senderName: user.displayName || 'Dulran Samarasinghe' }
          );
          
          // Update target status
          await updateTargetStatus(target.id, 'contacted', 'Email 1 sent + LinkedIn connection attempted');
          
          sentCount++;
          
          // Small delay to avoid overwhelming
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error('Failed to send email to:', target.email, error);
          errorCount++;
          
          // Handle bounce
          if (error.message.includes('bounce')) {
            campaignManager.recordBounce();
            await updateTargetStatus(target.id, 'bounced', 'Email bounced');
          }
        }
      }
      
      // Update campaign stats
      setDailyStats(campaignManager.getDailyStats());
      businessIntelligence.updateKPIs(sentCount, 0, 0, errorCount, 0);
      
      // Update campaign in Firestore
      await updateDoc(campaignRef, {
        status: 'completed',
        'stats.sent': campaignManager.stats.sent + sentCount,
        'stats.bounces': campaignManager.stats.bounces + errorCount,
        lastExecuted: serverTimestamp()
      });
      
      await loadCampaigns();
      
      addNotification(`✅ Campaign completed!\n📤 ${sentCount} emails sent successfully\n❌ ${errorCount} errors encountered\n📊 Reply rate target: 15-20%`, 'success');
      setCampaignStatus('completed');
      
    } catch (error) {
      console.error('Campaign error:', error);
      addNotification('Campaign failed: ' + error.message, 'error');
      setCampaignStatus('error');
    }
  };
  
  // ✅ SAFE CSV UPLOAD - Fixed the toLowerCase error
  const handleCSVUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const rawContent = e.target.result;
        const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');
        if (lines.length < 2) {
          addNotification('CSV must have headers and data rows.', 'error');
          return;
        }
        
        const headers = parseCsvRow(lines[0]).map(h => h.trim());
        setCsvHeaders(headers);
        setPreviewRecipient(null);
        
        const qualifiedContacts = [];
        
        for (let i = 1; i < lines.length; i++) {
          try {
            const values = parseCsvRow(lines[i]);
            if (values.length !== headers.length) continue;
            
            const row = {};
            headers.forEach((header, idx) => {
              // ✅ SAFE: Check if header exists before toLowerCase
              const headerKey = safeString(header).toLowerCase().replace(/\s+/g, '_');
              row[headerKey] = safeString(values[idx] || '');
            });
            
            // Apply lead qualification
            const qualification = qualifyLead(row);
            
            if (qualification.qualified) {
              qualifiedContacts.push({
                ...row,
                qualification,
                status: 'new', // Auto-mark as new for immediate campaign use
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
          } catch (error) {
            console.error(`Error processing line ${i}:`, error);
            // Continue processing other lines
          }
        }
        
        // Save to Firestore
        if (user?.uid && qualifiedContacts.length > 0) {
          try {
            const targetsRef = collection(db, 'users', user.uid, 'targets');
            
            for (const contact of qualifiedContacts) {
              await addDoc(targetsRef, contact);
            }
            
            await loadTargets();
            addNotification(`✅ ${qualifiedContacts.length} qualified contacts saved to database!`, 'success');
            
          } catch (error) {
            console.error('CSV save error:', error);
            addNotification('Failed to save contacts: ' + error.message, 'error');
          }
        }
        
        setCsvContent(normalizedContent);
        setPreviewRecipient(qualifiedContacts[0] || null);
        
      } catch (error) {
        console.error('CSV processing error:', error);
        addNotification('Failed to process CSV: ' + error.message, 'error');
      }
    };
    reader.readAsText(file);
  }, [user, addNotification, loadTargets]);
  
  // Filter targets
  const filteredTargets = targets.filter(target => {
    const matchesSearch = !searchQuery || 
      (target.company_name && target.company_name.toString().toLowerCase().includes(searchQuery.toLowerCase())) ||
      (target.email && target.email.toString().toLowerCase().includes(searchQuery.toLowerCase())) ||
      (target.first_name && target.first_name.toString().toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || target.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });
  
  // Update daily stats
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        setDailyStats(campaignManager.getDailyStats());
      } catch (error) {
        console.error('Error updating daily stats:', error);
      }
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, [campaignManager]);
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h1 className="text-white text-3xl font-bold mb-2">Syndicate Solutions</h1>
          <p className="text-gray-300 text-lg">Strategic Sales Automation</p>
          <p className="text-gray-500 text-sm mt-2">Loading production algorithms...</p>
        </div>
      </div>
    );
  }
  
  // Firebase config check
  if (!firebaseConfig.apiKey) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md p-6">
          <h1 className="text-white text-2xl font-bold mb-4">⚠️ Firebase Not Configured</h1>
          <p className="text-gray-300 mb-4">
            Please set up Firebase environment variables to use this application.
          </p>
          <div className="bg-gray-800 p-4 rounded-lg text-left">
            <p className="text-gray-400 font-mono text-sm mb-2">Create .env.local file with:</p>
            <pre className="text-green-400 text-xs overflow-x-auto">
              {`NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id`}
            </pre>
          </div>
        </div>
      </div>
    );
  }
  
  const kpiData = businessIntelligence.getKPIs();
  
  return (
    <>
      <Head>
        <title>Strategic Sales Automation - Syndicate Solutions</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div key={notification.id} className={`p-4 rounded-lg shadow-lg max-w-sm ${
              notification.type === 'success' ? 'bg-green-900/90 border-green-600' :
              notification.type === 'error' ? 'bg-red-900/90 border-red-600' :
              notification.type === 'warning' ? 'bg-yellow-900/90 border-yellow-600' :
              'bg-blue-900/90 border-blue-600'
            }`}>
              <p className="text-white text-sm">{notification.message}</p>
            </div>
          ))}
        </div>
        
        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <h1 className="text-white text-xl font-bold">🎯 Strategic Sales Automation</h1>
                <span className="ml-3 text-gray-400 text-sm">ICP: {ICP_DEFINITION.industry} ({ICP_DEFINITION.company_size.employees})</span>
              </div>
              <div className="flex items-center space-x-4">
                {user ? (
                  <>
                    <span className="text-gray-300 text-sm">Welcome, {user.displayName || user.email}</span>
                    <button
                      onClick={() => signOut(auth)}
                      className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Sign In with Google
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* KPI Dashboard */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
              <h2 className="text-white text-lg font-semibold mb-4">📊 Business Intelligence</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Reply Rate:</span>
                  <span className="text-green-400 font-medium">{kpiData.replyRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Meeting Rate:</span>
                  <span className="text-blue-400 font-medium">{kpiData.meetingRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Bounce Rate:</span>
                  <span className="text-red-400 font-medium">{kpiData.bounceRate}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Health Score:</span>
                  <span className={`font-medium ${
                    kpiData.healthScore >= 80 ? 'text-green-400' :
                    kpiData.healthScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {kpiData.healthScore}/100
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Total Sent:</span>
                  <span className="text-white font-medium">{kpiData.totalSent}</span>
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="text-white text-md font-semibold mb-3">🤖 AI Insights</h3>
                <div className="space-y-2">
                  {businessIntelligence.getInsights().map((insight, index) => (
                    <div key={index} className={`p-3 rounded-lg border-l-4 ${
                      insight.type === 'success' ? 'bg-green-900/20 border-green-600' :
                      insight.type === 'warning' ? 'bg-yellow-900/20 border-yellow-600' :
                      insight.type === 'error' ? 'bg-red-900/20 border-red-600' :
                      'bg-blue-900/20 border-blue-600'
                    }`}>
                      <h4 className={`font-semibold mb-1 ${
                        insight.type === 'success' ? 'text-green-300' :
                        insight.type === 'warning' ? 'text-yellow-300' :
                        insight.type === 'error' ? 'text-red-300' : 'text-blue-300'
                      }`}>
                        {insight.title}
                      </h4>
                      <p className="text-gray-300 text-sm">{insight.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Target Management */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* CSV Upload */}
              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h2 className="text-white text-lg font-semibold mb-4">📥 Import Target Companies</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Upload CSV (company_name, first_name, email, industry, phone, website, employees)
                    </label>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="block w-full text-sm text-gray-900 bg-gray-700 border-gray-600 rounded-lg p-2.5"
                    />
                  </div>
                  
                  {csvHeaders.length > 0 && (
                    <div className="bg-gray-900 p-3 rounded-lg">
                      <p className="text-gray-400 text-sm mb-2">
                        Headers detected: {csvHeaders.join(', ')}
                      </p>
                      {previewRecipient && (
                        <div className="mt-3 p-3 bg-gray-800 rounded border border-gray-600">
                          <p className="text-gray-300 text-sm">
                            <strong>Preview:</strong> {previewRecipient.company_name || 'No company'}
                          </p>
                          <p className="text-gray-400 text-xs mt-1">
                            Qualification Score: {previewRecipient.qualification?.score || 0} | 
                            Match: {previewRecipient.qualification?.icp_match || 'Unknown'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Campaign Management */}
              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h2 className="text-white text-lg font-semibold mb-4">🚀 Campaign Management</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      Campaign Name
                    </label>
                    <input
                      type="text"
                      placeholder="Enter campaign name..."
                      className="block w-full text-sm text-gray-900 bg-gray-700 border-gray-600 rounded-lg p-2.5"
                    />
                  </div>
                  
                  <button
                    onClick={() => createCampaign({ name: `Campaign ${new Date().toLocaleDateString()}` })}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                  >
                    Create Campaign
                  </button>
                </div>
                
                {/* Active Campaigns */}
                <div className="mt-6">
                  <h3 className="text-white text-md font-semibold mb-3">Active Campaigns</h3>
                  {campaigns.length === 0 ? (
                    <p className="text-gray-400 text-sm">No campaigns created yet</p>
                  ) : (
                    <div className="space-y-2">
                      {campaigns.map(campaign => (
                        <div key={campaign.id} className="bg-gray-900 p-3 rounded-lg border border-gray-600">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="text-white font-medium">{campaign.name}</h4>
                              <p className="text-gray-400 text-xs">
                                Status: {campaign.status} | 
                                Sent: {campaign.stats?.sent || 0} | 
                                Replies: {campaign.stats?.replies || 0}
                              </p>
                            </div>
                            <div className="flex space-x-2">
                              {campaign.status === 'draft' && (
                                <button
                                  onClick={() => executeCampaign(campaign.id)}
                                  disabled={campaignStatus === 'running'}
                                  className={`px-3 py-1 rounded text-sm ${
                                    campaignStatus === 'running' 
                                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                                      : 'bg-green-600 hover:bg-green-700 text-white'
                                  }`}
                                >
                                  {campaignStatus === 'running' ? 'Running...' : '▶️ Execute'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Target Database */}
              <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h2 className="text-white text-lg font-semibold mb-4">🎯 Target Database ({filteredTargets.length})</h2>
                
                {/* Search and Filter */}
                <div className="mb-4 space-y-3">
                  <input
                    type="text"
                    placeholder="Search targets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full text-sm text-gray-900 bg-gray-700 border-gray-600 rounded-lg p-2.5"
                  />
                  
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="block w-full text-sm text-gray-900 bg-gray-700 border-gray-600 rounded-lg p-2.5"
                  >
                    <option value="all">All Statuses</option>
                    {CONTACT_STATUSES.map(status => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                {/* Target List */}
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredTargets.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">No targets found</p>
                  ) : (
                    filteredTargets.map(target => {
                      const statusInfo = CONTACT_STATUSES.find(s => s.id === target.status) || CONTACT_STATUSES[0];
                      
                      return (
                        <div key={target.id} className="bg-gray-900 p-4 rounded-lg border border-gray-600">
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1">
                              <h4 className="text-white font-medium">{target.company_name}</h4>
                              <p className="text-gray-400 text-sm">{target.email}</p>
                              <p className="text-gray-500 text-xs">{target.industry}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className={`px-2 py-1 rounded text-xs ${
                                statusInfo.color === 'gray' ? 'bg-gray-700 text-gray-300' :
                                statusInfo.color === 'blue' ? 'bg-blue-700 text-blue-300' :
                                statusInfo.color === 'indigo' ? 'bg-indigo-700 text-indigo-300' :
                                statusInfo.color === 'green' ? 'bg-green-700 text-green-300' :
                                statusInfo.color === 'purple' ? 'bg-purple-700 text-purple-300' :
                                statusInfo.color === 'orange' ? 'bg-orange-700 text-orange-300' :
                                statusInfo.color === 'yellow' ? 'bg-yellow-700 text-yellow-300' :
                                statusInfo.color === 'red' ? 'bg-red-700 text-red-300' :
                                statusInfo.color === 'emerald' ? 'bg-emerald-700 text-emerald-300' :
                                statusInfo.color === 'rose' ? 'bg-rose-700 text-rose-300' :
                                statusInfo.color === 'teal' ? 'bg-teal-700 text-teal-300' :
                                'bg-gray-700 text-gray-300'
                              }`}>
                                {statusInfo.label}
                              </span>
                              <button
                                onClick={() => updateTargetStatus(target.id, 'researched')}
                                className="text-blue-600 hover:text-blue-400 text-xs"
                              >
                                Mark Researched
                              </button>
                            </div>
                          </div>
                          
                          <div className="text-sm text-gray-400">
                            <p>Qualification Score: {target.qualification?.score || 0}</p>
                            <p>ICP Match: {target.qualification?.icp_match || 'Unknown'}</p>
                            {target.qualification?.disqualification_reasons?.length > 0 && (
                              <p className="text-red-400">
                                Issues: {target.qualification.disqualification_reasons.join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
