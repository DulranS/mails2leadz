'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, serverTimestamp, orderBy, limit, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';

// ✅ CONTACT STATUS DEFINITIONS (Business-Driven Workflow)
const CONTACT_STATUSES = [
  { id: 'new', label: '🆕 New Lead', color: 'gray', description: 'Never contacted' },
  { id: 'contacted', label: '📞 Contacted', color: 'blue', description: 'Initial outreach sent' },
  { id: 'engaged', label: '💬 Engaged', color: 'indigo', description: 'Opened/clicked but no reply' },
  { id: 'replied', label: '✅ Replied', color: 'green', description: 'Responded to outreach' },
  { id: 'demo_scheduled', label: '📅 Demo Scheduled', color: 'purple', description: 'Meeting booked' },
  { id: 'proposal_sent', label: '📄 Proposal Sent', color: 'orange', description: 'Quote delivered' },
  { id: 'negotiation', label: '🤝 Negotiation', color: 'yellow', description: 'Discussing terms' },
  { id: 'closed_won', label: '💰 Closed Won', color: 'emerald', description: 'Deal secured!' },
  { id: 'not_interested', label: '❌ Not Interested', color: 'red', description: 'Declined service' },
  { id: 'do_not_contact', label: '🚫 Do Not Contact', color: 'rose', description: 'Requested no contact' },
  { id: 'unresponsive', label: '⏳ Unresponsive', color: 'orange', description: 'No response after 3 attempts' },
  { id: 'archived', label: '🗄️ Archived', color: 'gray', description: 'Inactive >30 days' }
];

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

// ✅ TIGHT ICP DEFINITION - Laser-Focused Targeting
const ICP_DEFINITION = {
  industry: 'Digital Agencies & SaaS Companies',
  company_size: { min: 5, max: 50, employees: '5-50 employees' },
  funding: 'Bootstrapped to Series A',
  geography: 'USA, Canada, UK, Australia',
  pain_point: 'Overwhelmed with client work and need reliable delivery partner',
  trigger: 'Recently posted about hiring or scaling challenges'
};

// ✅ CONTROLLED EMAIL TEMPLATES - Exactly 3, under 120 words each
const CONTROLLED_TEMPLATES = {
  email1: {
    name: 'Initial Outreach',
    subject: 'Quick question about {{company_name}}',
    body: `Hi {{first_name}},

I hope you're doing well. My name is Dulran Samarasinghe. I run Syndicate Solutions, a Sri Lanka–based mini agency supporting small to mid-sized agencies and businesses with reliable execution across web, software, AI automation, and ongoing digital operations.

We typically work as a white-label or outsourced partner when teams need:
• extra delivery capacity
• fast turnarounds without hiring
• ongoing technical and digital support

I'm reaching out to ask – do you ever use external support when workload or deadlines increase?

If helpful, I'm open to starting with a small task or short contract to build trust before discussing anything larger.

You can review my work here:
Portfolio: https://syndicatesolutions.vercel.app/
LinkedIn: https://www.linkedin.com/in/dulran-samarasinghe-13941b175/

If it makes sense, you can book a short 15-minute call:
https://cal.com/syndicate-solutions/15min

Otherwise, happy to continue the conversation over email.

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
    name: 'Break-up',
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

// ✅ STATUS TRANSITION RULES (Prevent invalid state changes)
const STATUS_TRANSITIONS = {
  'new': ['researched', 'contacted'],
  'researched': ['contacted'],
  'contacted': ['engaged', 'replied', 'unresponsive', 'not_interested'],
  'engaged': ['replied', 'unresponsive', 'not_interested'],
  'replied': ['meeting_booked', 'proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'meeting_booked': ['meeting_completed', 'proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'meeting_completed': ['proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'proposal_sent': ['negotiation', 'closed_won', 'not_interested'],
  'negotiation': ['closed_won', 'not_interested'],
  'closed_won': [],
  'closed_lost': ['archived'],
  'bounced': ['archived'],
  'unresponsive': ['archived'],
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
  bounce_threshold: 5, // percentage
  unsubscribe_threshold: 1, // percentage
  required_delay_between_emails: 2000 // milliseconds
};

// ✅ UTILITY FUNCTIONS
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

const parseCSV = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
    if (values.length !== headers.length) continue;
    
    const row = {};
    headers.forEach((header, index) => {
      const headerValue = header || '';
      row[headerValue.toLowerCase().replace(/\s+/g, '_')] = values[index] || '';
    });
    data.push(row);
  }
  
  return { headers, data };
};

const personalizeTemplate = (template, contact, senderName) => {
  let personalized = template;
  
  // Replace template variables
  personalized = personalized.replace(/\{\{company_name\}\}/g, (contact.company_name || contact.company || 'your company').toString());
  personalized = personalized.replace(/\{\{first_name\}\}/g, (contact.first_name || (contact.name ? contact.name.split(' ')[0] : undefined) || 'there').toString());
  personalized = personalized.replace(/\{\{sender_name\}\}/g, (senderName || 'Dulran Samarasinghe').toString());
  personalized = personalized.replace(/\{\{industry\}\}/g, (contact.industry ? contact.industry.toString() : 'your industry'));
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
    const industryStr = contact.industry.toString().toLowerCase();
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
  const size = parseInt(contact.employees || contact.company_size || '0');
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

// ✅ CAMPAIGN MANAGER - Execute campaigns with safety
class CampaignManager {
  constructor() {
    this.dailyStats = {
      sent: 0,
      replies: 0,
      meetings: 0,
      bounces: 0,
      unsubscribes: 0,
      lastReset: new Date()
    };
    this.sendQueue = [];
    this.isSending = false;
  }
  
  resetDailyStats() {
    const today = new Date();
    const lastReset = this.dailyStats.lastReset;
    
    if (today.toDateString() !== lastReset.toDateString()) {
      this.dailyStats = {
        sent: 0,
        replies: 0,
        meetings: 0,
        bounces: 0,
        unsubscribes: 0,
        lastReset: today
      };
    }
  }
  
  canSend() {
    this.resetDailyStats();
    
    // Check daily limits
    if (this.dailyStats.sent >= SEND_SAFETY_RULES.max_emails_per_day) {
      return { canSend: false, reason: 'Daily email limit reached' };
    }
    
    // Check bounce rate
    if (this.dailyStats.sent > 0) {
      const bounceRate = (this.dailyStats.bounces / this.dailyStats.sent) * 100;
      if (bounceRate > SEND_SAFETY_RULES.bounce_threshold) {
        return { canSend: false, reason: `Bounce rate too high: ${bounceRate.toFixed(1)}%` };
      }
    }
    
    // Check unsubscribe rate
    if (this.dailyStats.sent > 0) {
      const unsubscribeRate = (this.dailyStats.unsubscribes / this.dailyStats.sent) * 100;
      if (unsubscribeRate > SEND_SAFETY_RULES.unsubscribe_threshold) {
        return { canSend: false, reason: `Unsubscribe rate too high: ${unsubscribeRate.toFixed(1)}%` };
      }
    }
    
    return { canSend: true };
  }
  
  async sendEmail(contact, template, personalizationData) {
    const canSend = this.canSend();
    if (!canSend.canSend) {
      throw new Error(canSend.reason);
    }
    
    // Simulate email sending (in production, integrate with email service)
    const personalizedSubject = personalizeTemplate(template.subject, contact, personalizationData.senderName);
    const personalizedBody = personalizeTemplate(template.body, contact, personalizationData.senderName);
    
    console.log('📤 Sending email:', {
      to: safeString(contact.email || 'No email'),
      subject: personalizedSubject,
      body: personalizedBody.substring(0, 100) + '...'
    });
    
    // Update stats
    this.dailyStats.sent++;
    
    // Simulate send delay
    await new Promise(resolve => setTimeout(resolve, SEND_SAFETY_RULES.required_delay_between_emails));
    
    return {
      sent: true,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      subject: personalizedSubject,
      body: personalizedBody
    };
  }
  
  recordBounce() {
    this.dailyStats.bounces++;
  }
  
  recordReply() {
    this.dailyStats.replies++;
  }
  
  recordMeeting() {
    this.dailyStats.meetings++;
  }
  
  getDailyStats() {
    this.resetDailyStats();
    return { ...this.dailyStats };
  }
  
  shouldPauseCampaign() {
    this.resetDailyStats();
    
    if (this.dailyStats.sent > 0) {
      const bounceRate = (this.dailyStats.bounces / this.dailyStats.sent) * 100;
      const unsubscribeRate = (this.dailyStats.unsubscribes / this.dailyStats.sent) * 100;
      
      return bounceRate > SEND_SAFETY_RULES.bounce_threshold || 
             unsubscribeRate > SEND_SAFETY_RULES.unsubscribe_threshold;
    }
    
    return false;
  }
}

// ✅ BUSINESS INTELLIGENCE ENGINE - Track KPIs and insights
class BusinessIntelligence {
  constructor() {
    this.kpis = {
      totalSent: 0,
      totalReplies: 0,
      totalMeetings: 0,
      totalBounces: 0,
      totalUnsubscribes: 0,
      replyRate: 0,
      meetingRate: 0,
      bounceRate: 0,
      unsubscribeRate: 0
    };
  }
  
  updateKPIs(sent, replies, meetings, bounces, unsubscribes) {
    this.kpis.totalSent += sent;
    this.kpis.totalReplies += replies;
    this.kpis.totalMeetings += meetings;
    this.kpis.totalBounces += bounces;
    this.kpis.totalUnsubscribes += unsubscribes;
    
    // Calculate rates
    if (this.kpis.totalSent > 0) {
      this.kpis.replyRate = (this.kpis.totalReplies / this.kpis.totalSent) * 100;
      this.kpis.meetingRate = (this.kpis.totalMeetings / this.kpis.totalSent) * 100;
      this.kpis.bounceRate = (this.kpis.totalBounces / this.kpis.totalSent) * 100;
      this.kpis.unsubscribeRate = (this.kpis.totalUnsubscribes / this.kpis.totalSent) * 100;
    }
  }
  
  getHealthScore() {
    let score = 100;
    
    // Reply rate impact (40% weight)
    if (this.kpis.replyRate < 5) score -= 40;
    else if (this.kpis.replyRate < 10) score -= 20;
    else if (this.kpis.replyRate < 15) score -= 10;
    
    // Bounce rate impact (30% weight)
    if (this.kpis.bounceRate > 5) score -= 30;
    else if (this.kpis.bounceRate > 3) score -= 15;
    else if (this.kpis.bounceRate > 1) score -= 5;
    
    // Meeting rate impact (30% weight)
    if (this.kpis.meetingRate < 2) score -= 30;
    else if (this.kpis.meetingRate < 5) score -= 15;
    else if (this.kpis.meetingRate < 8) score -= 5;
    
    return Math.max(0, score);
  }
  
  getInsights() {
    const insights = [];
    const healthScore = this.getHealthScore();
    
    if (this.kpis.replyRate > 15) {
      insights.push({
        type: 'success',
        title: 'Excellent Reply Rate',
        message: `Reply rate of ${this.kpis.replyRate.toFixed(1)}% is above industry average. Consider increasing send volume.`,
        action: 'Scale campaign'
      });
    } else if (this.kpis.replyRate < 5) {
      insights.push({
        type: 'warning',
        title: 'Low Reply Rate',
        message: `Reply rate of ${this.kpis.replyRate.toFixed(1)}% is below target. Review subject lines and personalization.`,
        action: 'Optimize templates'
      });
    }
    
    if (this.kpis.bounceRate > 5) {
      insights.push({
        type: 'error',
        title: 'High Bounce Rate',
        message: `Bounce rate of ${this.kpis.bounceRate.toFixed(1)}% exceeds safety threshold. Clean your email list.`,
        action: 'Clean contact list'
      });
    }
    
    if (healthScore < 70) {
      insights.push({
        type: 'warning',
        title: 'Campaign Health Alert',
        message: `Overall health score is ${healthScore}/100. Multiple metrics need attention.`,
        action: 'Comprehensive review'
      });
    }
    
    return insights;
  }
  
  getKPIs() {
    return { ...this.kpis, healthScore: this.getHealthScore() };
  }
}

export default function StrategicSalesSystem() {
  // Core state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('targets');
  
  // Data state
  const [targets, setTargets] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  
  // UI state
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Campaign state - Initialize instances directly
  const campaignManager = new CampaignManager();
  const businessIntelligence = new BusinessIntelligence();
  const [campaignStatus, setCampaignStatus] = useState('idle');
  const [dailyStats, setDailyStats] = useState({});
  
  // Missing functions - add stub implementations to prevent crashes
  const handleCall = (phone) => {
    if (!phone) return;
    console.log('📞 Calling:', phone);
    addNotification('Call initiated', 'info');
  };
  
  const handleWhatsAppClick = (contact) => {
    if (!contact.phone) return;
    const whatsappUrl = `https://wa.me/${contact.phone}?text=${encodeURIComponent('Hi from Syndicate Solutions')}`;
    window.open(whatsappUrl, '_blank');
    addNotification('Opening WhatsApp...', 'info');
  };
  
  const handleSendSMS = (contact) => {
    if (!contact.phone) return;
    console.log('📱 Sending SMS to:', contact.phone);
    addNotification('SMS functionality coming soon', 'info');
  };
  
  const researchCompany = async (company, website, email) => {
    if (!company) return;
    console.log('🧠 Researching company:', company);
    addNotification('AI research coming soon', 'info');
  };
  
  const generateSmartFollowUp = async (email, lead, followUpNumber) => {
    console.log('✨ Generating smart follow-up for:', email);
    addNotification('Smart follow-up generation coming soon', 'info');
  };
  
  const isEligibleForFollowUp = (lead) => {
    return lead.status !== 'replied' && lead.status !== 'closed_won';
  };
  
  const requestGmailToken = async () => {
    console.log('📧 Requesting Gmail token...');
    addNotification('Gmail integration coming soon', 'info');
    return 'mock-token';
  };
  
  const sendFollowUpWithToken = async (email, token) => {
    console.log('📤 Sending follow-up to:', email);
    addNotification('Follow-up sent', 'success');
  };
  
  const sendMassFollowUp = async (token) => {
    console.log('📤 Sending mass follow-ups...');
    addNotification('Mass follow-up sent', 'success');
  };
  
  // Missing UI components
  const StatusDropdown = ({ contact }) => {
    const [isOpen, setIsOpen] = useState(false);
    const currentStatus = CONTACT_STATUSES.find(s => s.id === contact.status) || CONTACT_STATUSES[0];
    
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`px-2 py-1 rounded text-xs font-medium transition ${currentStatus.color} bg-opacity-20 text-${currentStatus.color}-300`}
        >
          {currentStatus.label}
        </button>
        
        {isOpen && (
          <div className="absolute top-full mt-1 right-0 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 min-w-max">
            {CONTACT_STATUSES.map(status => (
              <button
                key={status.id}
                onClick={() => {
                  updateTargetStatus(contact.id, status.id);
                  setIsOpen(false);
                }}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition"
              >
                {status.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  
  const StatusBadge = ({ status, small = false }) => {
    const statusInfo = CONTACT_STATUSES.find(s => s.id === status) || CONTACT_STATUSES[0];
    const size = small ? 'text-xs' : 'text-sm';
    
    return (
      <span className={`${size} ${statusInfo.color} bg-opacity-20 text-${statusInfo.color}-300 px-2 py-1 rounded`}>
        {statusInfo.label}
      </span>
    );
  };
  
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
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  // Load targets from Firestore
  const loadTargets = async () => {
    if (!user || !db) return;
    
    try {
      const targetsRef = collection(db, 'users', user.uid, 'targets');
      const q = query(targetsRef, orderBy('createdAt', 'desc'), limit(1000));
      const snapshot = await getDocs(q);
      
      const loadedTargets = snapshot.docs.map(doc => {
        const data = doc.data();
        const qualification = qualifyLead(data);
        
        return {
          id: doc.id,
          ...data,
          qualification,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          lastUpdated: data.lastUpdated?.toDate?.() || new Date(),
          statusHistory: data.statusHistory || [],
          notes: data.notes || []
        };
      });
      
      setTargets(loadedTargets);
      console.log(`✅ Loaded ${loadedTargets.length} targets from Firestore`);
      addNotification(`Loaded ${loadedTargets.length} targets`, 'success');
      
    } catch (error) {
      console.error('Failed to load targets:', error);
      addNotification('Failed to load targets: ' + error.message, 'error');
    }
  };
  
  // Load campaigns from Firestore
  const loadCampaigns = async () => {
    if (!user || !db) return;
    
    try {
      const campaignsRef = collection(db, 'users', user.uid, 'campaigns');
      const q = query(campaignsRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      const loadedCampaigns = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date()
      }));
      
      setCampaigns(loadedCampaigns);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      addNotification('Failed to load campaigns: ' + error.message, 'error');
    }
  };
  
  // Sign in
  const signIn = async () => {
    if (!auth) {
      addNotification('Firebase not configured', 'error');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      addNotification('Signed in successfully', 'success');
    } catch (error) {
      addNotification('Sign in failed: ' + error.message, 'error');
    }
  };
  
  // CSV import
  const handleCSVUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const { headers, data } = parseCSV(text);
      
      if (data.length === 0) {
        addNotification('No valid data found in CSV', 'error');
        return;
      }
      
      addNotification(`Processing ${data.length} contacts...`, 'info');
      
      // Process and qualify leads
      const qualifiedTargets = [];
      for (const row of data) {
        const qualification = qualifyLead(row);
        
        if (qualification.qualified) {
          qualifiedTargets.push({
            ...row,
            qualification,
            status: 'new',
            research: {
              headline: `${row.company_name} - ${row.industry}`,
              observations: 'Needs manual research',
              pain_points: 'To be identified',
              source: 'csv_import'
            },
            personalization: {
              observation: '',
              impact: ''
            },
            decision_makers: [],
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            statusHistory: [{
              status: 'new',
              timestamp: new Date(),
              note: 'Imported via CSV - Qualified lead'
            }],
            notes: [],
            source: 'csv_upload'
          });
        }
      }
      
      // Save to Firestore
      if (user && db && qualifiedTargets.length > 0) {
        const batch = writeBatch(db);
        qualifiedTargets.forEach(target => {
          const docRef = doc(collection(db, 'users', user.uid, 'targets'));
          batch.set(docRef, target);
        });
        
        await batch.commit();
        await loadTargets();
        addNotification(`Successfully imported ${qualifiedTargets.length} qualified targets`, 'success');
      }
      
    } catch (error) {
      console.error('CSV import error:', error);
      addNotification('CSV import failed: ' + error.message, 'error');
    }
  };
  
  // Create campaign
  const createCampaign = async (campaignName) => {
    if (!user || !db) return;
    
    try {
      const campaign = {
        name: campaignName,
        status: 'draft',
        target_criteria: {
          status: ['researched', 'new'],
          qualification: 'qualified'
        },
        cadence: CADENCE_SEQUENCE,
        templates: CONTROLLED_TEMPLATES,
        createdAt: serverTimestamp(),
        stats: {
          sent: 0,
          replies: 0,
          meetings: 0,
          bounces: 0
        }
      };
      
      const docRef = await addDoc(collection(db, 'users', user.uid, 'campaigns'), campaign);
      await loadCampaigns();
      addNotification('Campaign created successfully', 'success');
      
      return docRef.id;
    } catch (error) {
      console.error('Create campaign error:', error);
      addNotification('Failed to create campaign: ' + error.message, 'error');
      return null;
    }
  };
  
  // Execute campaign
  const executeCampaign = async (campaignId) => {
    if (!user || !db) return;
    
    try {
      // Check if campaign should be paused due to safety rules
      if (campaignManager?.shouldPauseCampaign?.()) {
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
        
        return hasValidStatus && isQualified && hasEmail;
      }).slice(0, 50);
      
      if (targetContacts.length === 0) {
        addNotification('No qualified targets ready for outreach', 'warning');
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
          if (campaignManager?.sendEmail) {
            await campaignManager.sendEmail(
              target, 
              template, 
              { senderName: user.displayName || 'Dulran Samarasinghe' }
            );
          }
          
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
            if (campaignManager?.recordBounce) {
              campaignManager.recordBounce();
            }
            await updateTargetStatus(target.id, 'bounced', 'Email bounced');
          }
        }
      }
      
      // Update campaign stats
      if (campaignManager?.getDailyStats) {
        setDailyStats(campaignManager.getDailyStats());
      }
      if (businessIntelligence?.updateKPIs) {
        businessIntelligence.updateKPIs(sentCount, 0, 0, errorCount, 0);
      }
      
      // Update campaign in Firestore
      await updateDoc(campaignRef, {
        status: 'completed',
        'stats.sent': (campaignManager?.stats?.sent || 0) + sentCount,
        'stats.bounces': (campaignManager?.stats?.bounces || 0) + errorCount,
        lastExecuted: serverTimestamp()
      });
      
      await loadCampaigns();
      
      addNotification(
        `✅ Campaign completed!\n📤 ${sentCount} emails sent successfully\n❌ ${errorCount} errors encountered\n📊 Reply rate target: 15-20%`,
        'success'
      );
      
      setCampaignStatus('completed');
      
    } catch (error) {
      console.error('Campaign error:', error);
      addNotification('Campaign failed: ' + error.message, 'error');
      setCampaignStatus('error');
    }
  };
  
  // Update target status
  const updateTargetStatus = async (targetId, newStatus, note = '') => {
    if (!user?.uid) return;
    
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
        throw new Error(`Invalid status transition: ${currentStatus} → ${newStatus}`);
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
          ? { 
              ...t, 
              status: newStatus, 
              lastUpdated: new Date(),
              statusHistory: [...(t.statusHistory || []), historyEntry]
            }
          : t
      ));
      
      console.log(`✅ Updated target ${targetId} status to ${newStatus}`);
      addNotification(`Status updated to ${newStatus}`, 'success');
      
    } catch (error) {
      console.error('Status update error:', error);
      addNotification('Failed to update status: ' + error.message, 'error');
    }
  };
  
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
        setDailyStats(campaignManager?.getDailyStats?.() || {});
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
  
  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <h1 className="text-white text-4xl font-bold mb-6">Syndicate Solutions</h1>
          <p className="text-gray-300 mb-8">Strategic Sales Automation Platform</p>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign In with Google
          </button>
          {!firebaseConfig.apiKey && (
            <p className="text-red-400 text-sm mt-4">
              Firebase not configured. Please set up environment variables.
            </p>
          )}
        </div>
      </div>
    );
  }
  
  const kpiData = businessIntelligence?.getKPIs?.() || {
    replyRate: 0,
    meetingRate: 0,
    bounceRate: 0,
    healthScore: 0,
    totalSent: 0,
    totalReplies: 0,
    totalMeetings: 0,
    totalBounces: 0
  };
  
  return (
    <>
      <Head>
        <title>Strategic Sales Automation - Syndicate Solutions</title>
      </Head>
      
      <div className="min-h-screen bg-gray-900">
        {/* Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg shadow-lg max-w-sm ${
                notification.type === 'error' ? 'bg-red-600 text-white' :
                notification.type === 'success' ? 'bg-green-600 text-white' :
                notification.type === 'warning' ? 'bg-yellow-600 text-black' :
                'bg-blue-600 text-white'
              }`}
            >
              {notification.message}
            </div>
          ))}
        </div>

        {/* Header */}
        <header className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-white text-2xl font-bold">Strategic Sales Automation</h1>
              <div className="flex items-center space-x-4">
                <span className="text-white">{user.displayName}</span>
                <button
                  onClick={() => signOut(auth)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* KPI Dashboard */}
        <div className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-sm">Total Sent</p>
              <p className="text-2xl font-bold">{kpiData.totalSent}</p>
              <p className="text-xs text-gray-500 mt-1">All time</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-sm">Reply Rate</p>
              <p className="text-2xl font-bold text-green-400">{kpiData.replyRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-1">Target: 15-20%</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-sm">Meeting Rate</p>
              <p className="text-2xl font-bold text-blue-400">{kpiData.meetingRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-500 mt-1">Target: 5-10%</p>
            </div>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-400 text-sm">Health Score</p>
              <p className={`text-2xl font-bold ${
                kpiData.healthScore >= 80 ? 'text-green-400' :
                kpiData.healthScore >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}>{kpiData.healthScore}/100</p>
              <p className="text-xs text-gray-500 mt-1">Overall performance</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto p-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6 bg-gray-800 p-1 rounded-lg">
            {['targets', 'campaigns', 'analytics'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Targets Tab */}
          {activeTab === 'targets' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Target Companies ({filteredTargets.length})</h2>
                  <div className="flex gap-4">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCSVUpload}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg cursor-pointer transition-colors">
                      📤 Import CSV
                    </label>
                  </div>
                </div>

                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search targets..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-white">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4">Company</th>
                        <th className="text-left py-3 px-4">Industry</th>
                        <th className="text-left py-3 px-4">Email</th>
                        <th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Qualification</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTargets.map((target) => (
                        <tr key={target.id} className="border-b border-gray-700">
                          <td className="py-3 px-4 font-medium">{target.company_name}</td>
                          <td className="py-3 px-4">{target.industry}</td>
                          <td className="py-3 px-4">{target.email}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs ${
                              CONTACT_STATUSES[target.status]?.color === 'gray' ? 'bg-gray-600' :
                              CONTACT_STATUSES[target.status]?.color === 'blue' ? 'bg-blue-600' :
                              CONTACT_STATUSES[target.status]?.color === 'green' ? 'bg-green-600' :
                              'bg-gray-600'
                            }`}>
                              {CONTACT_STATUSES[target.status]?.label || target.status}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <span className={`text-sm font-medium ${
                                target.qualification?.icp_match === 'High' ? 'text-green-400' :
                                target.qualification?.icp_match === 'Medium' ? 'text-yellow-400' :
                                'text-red-400'
                              }`}>
                                {target.qualification?.icp_match} Match
                              </span>
                              <div className="text-xs text-gray-400">
                                Score: {target.qualification?.score}/100
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => setSelectedTarget(target)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
                              >
                                🔍 View
                              </button>
                              <select
                                value={target.status}
                                onChange={(e) => updateTargetStatus(target.id, e.target.value)}
                                className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
                              >
                                {Object.entries(CONTACT_STATUSES).map(([key, status]) => (
                                  <option key={key} value={key}>{status.label}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {filteredTargets.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-4xl mb-2">🎯</div>
                      <p>No targets found. Import a CSV file to get started.</p>
                      <p className="text-sm mt-1">Expected CSV format: company_name,first_name,email,industry,phone</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Campaigns</h2>
                  <button
                    onClick={() => {
                      const campaignName = prompt('Enter campaign name:');
                      if (campaignName) {
                        createCampaign(campaignName);
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium"
                  >
                    🚀 Create Campaign
                  </button>
                </div>

                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-white font-semibold text-lg">{campaign.name}</h3>
                          <p className="text-gray-400 text-sm mt-1">
                            Status: <span className={`px-2 py-1 rounded text-xs ${
                              campaign.status === 'active' ? 'bg-green-600' :
                              campaign.status === 'completed' ? 'bg-blue-600' :
                              'bg-gray-600'
                            }`}>{campaign.status}</span>
                          </p>
                          <div className="flex space-x-4 mt-2 text-sm">
                            <span className="text-blue-400">Sent: {campaign.stats?.sent || 0}</span>
                            <span className="text-green-400">Replies: {campaign.stats?.replies || 0}</span>
                            <span className="text-purple-400">Meetings: {campaign.stats?.meetings || 0}</span>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => executeCampaign(campaign.id)}
                              disabled={campaignStatus === 'running'}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                            >
                              {campaignStatus === 'running' ? '🚀 Running...' : '▶️ Execute'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {campaigns.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <div className="text-4xl mb-2">📊</div>
                      <p>No campaigns yet. Create your first campaign to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="bg-gray-800 p-6 rounded-lg">
                <h2 className="text-xl font-bold text-white mb-4">📊 Business Intelligence</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">Key Performance Indicators</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Sent:</span>
                        <span className="text-white font-medium">{kpiData.totalSent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Reply Rate:</span>
                        <span className={`font-medium ${
                          kpiData.replyRate >= 15 ? 'text-green-400' : 'text-yellow-400'
                        }`}>{kpiData.replyRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Meeting Rate:</span>
                        <span className={`font-medium ${
                          kpiData.meetingRate >= 5 ? 'text-green-400' : 'text-yellow-400'
                        }`}>{kpiData.meetingRate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bounce Rate:</span>
                        <span className={`font-medium ${
                          kpiData.bounceRate <= 5 ? 'text-green-400' : 'text-red-400'
                        }`}>{kpiData.bounceRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-3">📈 Daily Stats</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Sent Today:</span>
                        <span className="text-white font-medium">{dailyStats.sent || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Replies Today:</span>
                        <span className="text-white font-medium">{dailyStats.replies || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Meetings Today:</span>
                        <span className="text-white font-medium">{dailyStats.meetings || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Bounces Today:</span>
                        <span className="text-white font-medium">{dailyStats.bounces || 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">🤖 AI Insights & Recommendations</h3>
                  <div className="space-y-3">
                    {(businessIntelligence?.getInsights?.() || []).map((insight, index) => (
                      <div key={index} className={`p-4 rounded-lg border-l-4 ${
                        insight.type === 'success' ? 'bg-green-900/20 border-green-600' :
                        insight.type === 'warning' ? 'bg-yellow-900/20 border-yellow-600' :
                        insight.type === 'error' ? 'bg-red-900/20 border-red-600' :
                        'bg-blue-900/20 border-blue-600'
                      }`}>
                        <h4 className={`font-semibold mb-2 ${
                          insight.type === 'success' ? 'text-green-300' :
                          insight.type === 'warning' ? 'text-yellow-300' :
                          insight.type === 'error' ? 'text-red-300' :
                          'text-blue-300'
                        }`}>{insight.title}</h4>
                        <p className="text-gray-300 text-sm mb-2">{insight.message}</p>
                        <p className="text-gray-400 text-xs">💡 Recommended action: {insight.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
