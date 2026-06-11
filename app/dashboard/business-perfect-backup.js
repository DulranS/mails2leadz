'use client';

/**
 * ============================================================================
 * SYNDICATE SOLUTIONS - ENTERPRISE B2B GROWTH ENGINE
 * ============================================================================
 * 
 * ARCHITECTURE: Original Code + AI Enhancement Layer
 * 1. Your complete original business logic (PRESERVED)
 * 2. AI features as ADDITION (graceful degradation)
 * 3. All manual functionality works regardless of AI status
 * 4. Enterprise-grade error handling and fallbacks
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

// Firebase imports - CLIENT-SIDE ONLY with enterprise error handling
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

// ============================================================================
// FIREBASE INITIALIZATION - ENTERPRISE GRADE (CLIENT-SIDE ONLY)
// ============================================================================
let app;
let db;
let auth;

// Client-side only Firebase initialization with enterprise error handling
if (typeof window !== 'undefined') {
  try {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
      app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      db = getFirestore(app);
      auth = getAuth(app);
      console.log('✅ Firebase initialized successfully');
    } else {
      console.warn('⚠️ Firebase configuration incomplete - running in demo mode');
      db = null;
      auth = null;
    }
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    db = null;
    auth = null;
  }
} else {
  console.log('🔄 Firebase initialization deferred to client-side');
}

// ============================================================================
// YOUR ORIGINAL BUSINESS TEMPLATES (COMPLETELY PRESERVED)
// ============================================================================
const DEFAULT_TEMPLATE_A = {
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}}, 😊👋🏻
I hope you're doing well.
My name is Dulran Samarasinghe. I run Syndicate Solutions, a Sri Lanka–based mini agency supporting
small to mid-sized agencies and businesses with reliable execution across web, software,
AI automation, and ongoing digital operations.
We typically work as a white-label or outsourced partner when teams need:
• extra delivery capacity
• fast turnarounds without hiring
• ongoing technical and digital support
I'm reaching out to ask – do you ever use external support when workload or deadlines increase?
If helpful, I'm open to starting with a small task or short contract to build trust before
discussing anything larger.
You can review my work here:
Portfolio: https://syndicatesolutions.vercel.app/
LinkedIn: https://www.linkedin.com/in/dulran-samarasinghe-13941b175/
If it makes sense, you can book a short 15-minute call:
https://cal.com/syndicate-solutions/15min
You can contact me on Whatsapp - 0741143323
You can email me at - syndicatesoftwaresolutions@gmail.com
Otherwise, happy to continue the conversation over email.
Best regards,
Dulran Samarasinghe
Founder – Syndicate Solutions`
};

const FOLLOW_UP_1 = {
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}},
Just circling back—did my note about outsourced dev & ops support land at a bad time?
No pressure at all, but if you're ever swamped with web, automation, or backend work and need a reliable extra hand (especially for white-label or fast-turnaround needs), we're ready to help.
Even a 1-hour task is a great way to test the waters.
Either way, wishing you a productive week!
Best,
Dulran
Founder – Syndicate Solutions
WhatsApp: 0741143323`
};

const FOLLOW_UP_2 = {
  subject: '{{business_name}}, a quick offer (no strings)',
  body: `Hi again,
I noticed you haven't had a chance to reply—totally understand!
To make this zero-risk: **I'll audit one of your digital workflows (e.g., lead capture, client onboarding, internal tooling) for free** and send 2–3 actionable automation ideas you can implement immediately—even if you never work with us.
Zero sales pitch. Just value.
Interested? Hit "Yes" or reply with a workflow you'd like optimized.
Cheers,
Dulran
Portfolio: https://syndicatesolutions.vercel.app/
Book a call: https://cal.com/syndicate-solutions/15min`
};

const FOLLOW_UP_3 = {
  subject: 'Closing the loop',
  body: `Hi {{business_name}},
I'll stop emailing after this one! 😅
Just wanted to say: if outsourcing ever becomes a priority—whether for web dev, AI tools, or ongoing ops—we're here. Many of our clients started with a tiny $100 task and now work with us monthly.
If now's not the time, no worries! I'll circle back in a few months.
Either way, keep crushing it!
— Dulran
WhatsApp: 0741143323`
};

const DEFAULT_TEMPLATE_B = FOLLOW_UP_1;
const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{business_name}} 👋😊
Hope you're doing well.
I'm {{sender_name}} from Sri Lanka – I run a small digital mini-agency supporting businesses with websites, content, and AI automation.
Quick question:
Are you currently working on anything digital that's taking too much time or not delivering the results you want?
If yes, I'd be happy to share a quick idea – no pressure at all.`;

const DEFAULT_SMS_TEMPLATE = `Hi {{business_name}} 👋
This is {{sender_name}} from Syndicate Solutions.
Quick question – are you currently working on any digital work that's delayed or not giving results?
Reply YES or NO.`;

// ============================================================================
// YOUR ORIGINAL CONTACT STATUS WORKFLOW (COMPLETELY PRESERVED)
// ============================================================================
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

const STATUS_TRANSITIONS = {
  'new': ['contacted', 'do_not_contact'],
  'contacted': ['engaged', 'replied', 'unresponsive', 'not_interested'],
  'engaged': ['replied', 'unresponsive', 'not_interested'],
  'replied': ['demo_scheduled', 'proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'demo_scheduled': ['proposal_sent', 'negotiation', 'closed_won', 'not_interested'],
  'proposal_sent': ['negotiation', 'closed_won', 'not_interested'],
  'negotiation': ['closed_won', 'not_interested'],
  'closed_won': [],
  'not_interested': ['archived'],
  'do_not_contact': ['archived'],
  'unresponsive': ['archived', 're_engage'],
  'archived': ['re_engage']
};

// ============================================================================
// YOUR ORIGINAL UTILITY FUNCTIONS (COMPLETELY PRESERVED)
// ============================================================================
function formatForDialing(raw) {
  if (!raw || raw === 'N/A') return null;
  let cleaned = raw.toString().replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }
  return /^[1-9]\d{9,14}$/.test(cleaned) ? cleaned : null;
}

const extractTemplateVariables = (text) => {
  if (!text) return [];
  const matches = text.match(/\{\{\s*([^}]+?)\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, '').trim()))];
};

const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  let cleaned = email.trim()
    .toLowerCase()
    .replace(/^["'`]+/, '')
    .replace(/["'`]+$/, '')
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

const parseCsvRow = (str) => {
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
    let cleaned = field.replace(/[\r\n]/g, '').trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/""/g, '"');
    }
    return cleaned;
  });
};

const renderPreviewText = (text, recipient, mappings, sender) => {
  if (!text) return '';
  let result = text;
  Object.entries(mappings).forEach(([varName, col]) => {
    const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
    if (varName === 'sender_name') {
      result = result.replace(regex, sender || 'Team');
    } else if (recipient && col && recipient[col] !== undefined) {
      result = result.replace(regex, String(recipient[col]));
    } else {
      result = result.replace(regex, `[MISSING: ${varName}]`);
    }
  });
  return result;
};

// Export templates for API use
export { FOLLOW_UP_1, FOLLOW_UP_2, FOLLOW_UP_3 };

// ============================================================================
// AI ENHANCEMENT LAYER - ADDITION ONLY (graceful degradation)
// ============================================================================
class AIEnhancementLayer {
  constructor() {
    this.enabled = true;
    this.fallbackMode = false;
    this.lastError = null;
  }

  async researchCompany(companyName, website, email) {
    if (!this.enabled || this.fallbackMode) {
      return this.getFallbackResearch(companyName);
    }

    try {
      // Mock AI research - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      return {
        strategy: `Focus on their recent ${companyName} projects and mention how automation could improve their workflow.`,
        insights: [
          'Company appears to be growing rapidly',
          'Likely needs scalable solutions', 
          'Decision maker seems responsive to innovation'
        ],
        approach: 'Direct value proposition with clear ROI',
        subjectLine: `Innovation opportunity for ${companyName}`,
        emailTemplate: `Hi {{first_name}},\n\nBased on my research of ${companyName}, I noticed...\n\n[Personalized content based on AI analysis]\n\nBest regards,\n{{sender_name}}`,
        confidence: 85,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('AI research failed, using fallback:', error);
      this.lastError = error.message;
      this.fallbackMode = true;
      return this.getFallbackResearch(companyName);
    }
  }

  getFallbackResearch(companyName) {
    return {
      strategy: `Focus on ${companyName}'s business needs and offer tailored solutions`,
      insights: [
        'Business likely needs digital optimization',
        'May benefit from automation solutions',
        'Consider their specific industry challenges'
      ],
      approach: 'Value-first approach with clear benefits',
      subjectLine: `Quick question for ${companyName}`,
      emailTemplate: `Hi {{first_name}},\n\nI'm reaching out to ${companyName} because...\n\n[Manual research content]\n\nBest regards,\n{{sender_name}}`,
      confidence: 60,
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  async generatePredictiveScore(contactData) {
    if (!this.enabled || this.fallbackMode) {
      return this.getFallbackScore(contactData);
    }

    try {
      // Mock predictive scoring
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const score = Math.floor(Math.random() * 40) + 60; // 60-100 range
      return {
        score,
        replyProbability: Math.floor(Math.random() * 30) + 70, // 70-100%
        recommendedAction: score > 80 ? 'Contact immediately' : 'Wait for optimal time',
        confidence: 75,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Predictive scoring failed, using fallback:', error);
      this.lastError = error.message;
      return this.getFallbackScore(contactData);
    }
  }

  getFallbackScore(contactData) {
    const score = contactData.email ? 70 : 50;
    return {
      score,
      replyProbability: 65,
      recommendedAction: 'Standard outreach sequence',
      confidence: 50,
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  async generateSmartFollowUp(contactData, followUpNumber) {
    if (!this.enabled || this.fallbackMode) {
      return this.getFallbackFollowUp(contactData, followUpNumber);
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const urgency = followUpNumber === 1 ? 'medium' : followUpNumber === 2 ? 'high' : 'low';
      
      return {
        subjectLine: `Following up: {{business_name}}`,
        body: `Hi {{first_name}},\n\nJust wanted to follow up on my previous email...\n\n[AI-generated content based on engagement patterns]\n\nBest regards,\n{{sender_name}}`,
        urgency,
        followUpNumber,
        confidence: 80,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Smart follow-up generation failed, using fallback:', error);
      this.lastError = error.message;
      return this.getFallbackFollowUp(contactData, followUpNumber);
    }
  }

  getFallbackFollowUp(contactData, followUpNumber) {
    const templates = [FOLLOW_UP_1, FOLLOW_UP_2, FOLLOW_UP_3];
    const template = templates[Math.min(followUpNumber - 1, 2)];
    
    return {
      subjectLine: template.subject,
      body: template.body,
      urgency: 'medium',
      followUpNumber,
      confidence: 50,
      fallback: true,
      generatedAt: new Date().toISOString()
    };
  }

  enable() {
    this.enabled = true;
    this.fallbackMode = false;
    this.lastError = null;
  }

  disable() {
    this.enabled = false;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      fallbackMode: this.fallbackMode,
      lastError: this.lastError,
      status: this.enabled ? (this.fallbackMode ? '⚠️ Degraded' : '✅ Active') : '❌ Disabled'
    };
  }
}

// ============================================================================
// MAIN DASHBOARD COMPONENT - YOUR ORIGINAL CODE + AI ADDITION
// ============================================================================
export default function Dashboard() {
  // Component refs for cleanup
  const mountedRef = useRef(true);
  const aiLayerRef = useRef(new AIEnhancementLayer());

  // AUTHENTICATION STATE (PRESERVED)
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  // YOUR ORIGINAL CORE STATE (COMPLETELY PRESERVED)
  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [senderName, setSenderName] = useState('Dulran Samarasinghe');
  const [abTestMode, setAbTestMode] = useState(false);
  const [templateA, setTemplateA] = useState(DEFAULT_TEMPLATE_A);
  const [templateB, setTemplateB] = useState(DEFAULT_TEMPLATE_B);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);
  const [fieldMappings, setFieldMappings] = useState({});
  const [previewRecipient, setPreviewRecipient] = useState(null);
  const [validEmails, setValidEmails] = useState(0);
  const [validWhatsApp, setValidWhatsApp] = useState(0);
  const [leadQualityFilter, setLeadQualityFilter] = useState('HOT');
  const [whatsappLinks, setWhatsappLinks] = useState([]);
  const [leadScores, setLeadScores] = useState({});
  const [lastSent, setLastSent] = useState({});
  const [clickStats, setClickStats] = useState({});
  const [emailImages, setEmailImages] = useState([]);
  const [dealStage, setDealStage] = useState({});
  const [pipelineValue, setPipelineValue] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState('');
  const [smsConsent, setSmsConsent] = useState(true);
  const [abResults, setAbResults] = useState({ a: { opens: 0, clicks: 0, sent: 0 }, b: { opens: 0, clicks: 0, sent: 0 } });

  // YOUR ORIGINAL CONTACT MANAGEMENT STATE (COMPLETELY PRESERVED)
  const [contactStatuses, setContactStatuses] = useState({});
  const [statusHistory, setStatusHistory] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedContactForStatus, setSelectedContactForStatus] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [archivedContactsCount, setArchivedContactsCount] = useState(0);

  // YOUR ORIGINAL FOLLOW-UP STATE (COMPLETELY PRESERVED)
  const [repliedLeads, setRepliedLeads] = useState({});
  const [followUpLeads, setFollowUpLeads] = useState({});
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [sentLeads, setSentLeads] = useState([]);
  const [loadingSentLeads, setLoadingSentLeads] = useState(false);
  const [followUpHistory, setFollowUpHistory] = useState({});
  const [followUpFilter, setFollowUpFilter] = useState('all');
  const [followUpStats, setFollowUpStats] = useState({
    totalSent: 0,
    totalReplied: 0,
    readyForFollowUp: 0,
    alreadyFollowedUp: 0,
    awaitingReply: 0,
    interestedLeads: 0
  });

  // YOUR ORIGINAL ADVANCED FEATURES STATE (COMPLETELY PRESERVED)
  const [dailyEmailCount, setDailyEmailCount] = useState(0);
  const [loadingDailyCount, setLoadingDailyCount] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);
  const [instagramTemplate, setInstagramTemplate] = useState(`Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat about how we can help?
No pressure at all.`);
  const [twitterTemplate, setTwitterTemplate] = useState(`Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat?`);

  // YOUR ORIGINAL FOLLOW-UP TEMPLATES (COMPLETELY PRESERVED)
  const [followUpTemplates, setFollowUpTemplates] = useState([
    {
      id: 'followup_1',
      name: 'Follow-Up 1 (Day 2)',
      channel: 'email',
      enabled: true,
      delayDays: 2,
      subject: 'Quick question for {{business_name}}',
      body: FOLLOW_UP_1.body
    },
    {
      id: 'followup_2',
      name: 'Follow-Up 2 (Day 5)',
      channel: 'email',
      enabled: true,
      delayDays: 5,
      subject: '{{business_name}}, a quick offer (no strings)',
      body: FOLLOW_UP_2.body
    },
    {
      id: 'followup_3',
      name: 'Breakup Email (Day 7)',
      channel: 'email',
      enabled: true,
      delayDays: 7,
      subject: 'Closing the loop',
      body: FOLLOW_UP_3.body
    }
  ]);

  // YOUR ORIGINAL STATUS ANALYTICS (COMPLETELY PRESERVED)
  const [statusAnalytics, setStatusAnalytics] = useState({
    byStatus: {},
    conversionRates: {},
    avgTimeInStatus: {},
    revenueByStatus: {}
  });

  // YOUR ORIGINAL ADVANCED METRICS (COMPLETELY PRESERVED)
  const [advancedMetrics, setAdvancedMetrics] = useState({
    avgDaysToFirstReply: 0,
    conversionFunnel: [],
    channelPerformance: {},
    leadVelocity: 0,
    churnRisk: [],
    recommendedFollowUpTime: 'afternoon',
    bestPerformingTemplate: null,
    estimatedMonthlyRevenue: 0
  });

  // YOUR ORIGINAL CALL & MULTI-CHANNEL STATE (COMPLETELY PRESERVED)
  const [callHistory, setCallHistory] = useState([]);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [showCallHistoryModal, setShowCallHistoryModal] = useState(false);
  const [activeCallStatus, setActiveCallStatus] = useState(null);
  const [showMultiChannelModal, setShowMultiChannelModal] = useState(false);
  const [isMultiChannelFullscreen, setIsMultiChannelFullscreen] = useState(false);
  const [followUpTemplate, setFollowUpTemplate] = useState('auto');
  const [followUpTargeting, setFollowUpTargeting] = useState('ready');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [batchSize, setBatchSize] = useState(50);
  const [followUpAnalytics, setFollowUpAnalytics] = useState({
    totalFollowUpsSent: 0,
    avgReplyRate: 0,
    bestTemplate: 'auto',
    bestTimeToSend: 'afternoon'
  });

  // AI ENHANCEMENT STATE (NEW LAYER - ADDITION ONLY)
  const [aiFeaturesEnabled, setAiFeaturesEnabled] = useState(true);
  const [researchingCompany, setResearchingCompany] = useState(null);
  const [researchResults, setResearchResults] = useState({});
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [interestedLeadsList, setInterestedLeadsList] = useState([]);
  const [sendTimeOptimization, setSendTimeOptimization] = useState(null);
  const [predictiveScores, setPredictiveScores] = useState({});
  const [sentimentAnalysis, setSentimentAnalysis] = useState({});
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [smartFollowUpSuggestions, setSmartFollowUpSuggestions] = useState({});

  // UI STATE
  const [activeTab, setActiveTab] = useState('outreach');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // ============================================================================
  // YOUR ORIGINAL GOOGLE AUTHENTICATION (COMPLETELY PRESERVED)
  // ============================================================================
  useEffect(() => {
    if (window.google?.accounts?.oauth2?.initTokenClient) {
      setIsGoogleLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setIsGoogleLoaded(true);
    document.head.appendChild(script);
    return () => document.head.removeChild(script);
  }, []);

  // ============================================================================
  // YOUR ORIGINAL FIRESTORE FUNCTIONS (COMPLETELY PRESERVED)
  // ============================================================================
  const loadContactsFromFirestore = useCallback(async (userId) => {
    if (!userId) return;
    setLoadingContacts(true);
    try {
      // Query contacts collection with ordering
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const q = query(contactsRef, orderBy('lastUpdated', 'desc'));
      const snapshot = await getDocs(q);
      
      const contacts = [];
      const statuses = {};
      const history = {};
      
      snapshot.forEach(doc => {
        const data = doc.data();
        // Generate unique contact ID (prioritize email, then phone)
        const contactId = data.email?.toLowerCase().trim() || `phone_${data.phone}`;
        
        contacts.push({
          id: doc.id,
          contactId,
          business: data.business || 'Business',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || null,
          place_id: data.place_id || '',
          website: data.website || '',
          instagram: data.instagram || '',
          twitter: data.twitter || '',
          facebook: data.facebook || '',
          youtube: data.youtube || '',
          tiktok: data.tiktok || '',
          linkedin_company: data.linkedin_company || '',
          linkedin_ceo: data.linkedin_ceo || '',
          linkedin_founder: data.linkedin_founder || '',
          contact_page_found: data.contact_page_found || 'No',
          social_media_score: data.social_media_score || '0',
          email_primary: data.email_primary || data.email || '',
          phone_primary: data.phone_primary || data.phone || '',
          lead_quality_score: data.lead_quality_score || '0',
          contact_confidence: data.contact_confidence || 'Low',
          best_contact_method: data.best_contact_method || 'Email',
          decision_maker_found: data.decision_maker_found || 'No',
          tech_stack_detected: data.tech_stack_detected || '',
          company_size_indicator: data.company_size_indicator || 'unknown',
          status: data.status || 'new',
          lastContacted: data.lastContacted?.toDate?.() || data.lastContacted || null,
          createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
          lastUpdated: data.lastUpdated?.toDate?.() || data.lastUpdated || new Date(),
          statusHistory: data.statusHistory || [],
          notes: data.notes || [],
          url: data.phone ? `https://wa.me/${data.phone}?text=${encodeURIComponent(
            renderPreviewText(whatsappTemplate, { business_name: data.business, address: data.address || '' }, fieldMappings, senderName)
          )}` : null
        });
        
        statuses[contactId] = data.status || 'new';
        history[contactId] = data.statusHistory || [];
      });
      
      // Auto-cleanup: Archive irrelevant contacts >30 days old
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const contactsToArchive = contacts.filter(contact => 
        ['not_interested', 'do_not_contact', 'unresponsive'].includes(contact.status) &&
        new Date(contact.lastUpdated) < thirtyDaysAgo &&
        contact.status !== 'archived'
      );
      
      let archivedCount = 0;
      if (contactsToArchive.length > 0) {
        console.log(`🗄️ Auto-archiving ${contactsToArchive.length} irrelevant contacts (>30 days)`);
        for (const contact of contactsToArchive) {
          try {
            await updateContactStatus(contact.contactId, 'archived', 'Auto-archived: >30 days inactive');
            archivedCount++;
          } catch (err) {
            console.error(`Failed to archive contact ${contact.contactId}:`, err);
          }
        }
        setArchivedContactsCount(archivedCount);
        // Reload contacts after cleanup
        return loadContactsFromFirestore(userId);
      }
      
      setWhatsappLinks(contacts);
      setContactStatuses(statuses);
      setStatusHistory(history);
      
      // Calculate status analytics
      calculateStatusAnalytics(contacts);
      
    } catch (error) {
      console.error('Failed to load contacts from Firestore:', error);
      alert('Failed to load contact database. Check console for details.');
    } finally {
      setLoadingContacts(false);
    }
  }, [fieldMappings, senderName, whatsappTemplate]);

  const saveContactsToFirestore = useCallback(async (contacts, userId) => {
    if (!userId || contacts.length === 0) return;
    
    try {
      // Get existing contacts mapping by email/phone
      const existingContacts = {};
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const snapshot = await getDocs(contactsRef);
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const key = data.email?.toLowerCase().trim() || `phone_${data.phone}`;
        existingContacts[key] = { id: doc.id, ...data };
      });
      
      // Process each contact from CSV
      for (const contact of contacts) {
        const contactKey = contact.email?.toLowerCase().trim() || `phone_${contact.phone}`;
        const now = new Date();
        
        // Prepare contact data for Firestore
        const contactData = {
          business: contact.business || '',
          address: contact.address || '',
          phone: contact.phone || '',
          email: contact.email || null,
          place_id: contact.place_id || '',
          website: contact.website || '',
          instagram: contact.instagram || '',
          twitter: contact.twitter || '',
          facebook: contact.facebook || '',
          youtube: contact.youtube || '',
          tiktok: contact.tiktok || '',
          linkedin_company: contact.linkedin_company || '',
          linkedin_ceo: contact.linkedin_ceo || '',
          linkedin_founder: contact.linkedin_founder || '',
          contact_page_found: contact.contact_page_found || 'No',
          social_media_score: contact.social_media_score || '0',
          email_primary: contact.email_primary || contact.email || '',
          phone_primary: contact.phone_primary || contact.phone || '',
          lead_quality_score: contact.lead_quality_score || '0',
          contact_confidence: contact.contact_confidence || 'Low',
          best_contact_method: contact.best_contact_method || 'Email',
          decision_maker_found: contact.decision_maker_found || 'No',
          tech_stack_detected: contact.tech_stack_detected || '',
          company_size_indicator: contact.company_size_indicator || 'unknown',
          lastUpdated: serverTimestamp(),
          source: 'csv_upload'
        };
        
        // Determine status logic
        if (existingContacts[contactKey]) {
          // Existing contact - preserve status unless it's archived
          const existing = existingContacts[contactKey];
          if (existing.status !== 'archived') {
            contactData.status = existing.status;
            contactData.statusHistory = existing.statusHistory || [];
            contactData.notes = existing.notes || [];
            contactData.lastContacted = existing.lastContacted || null;
          } else {
            // Reactivate archived contact
            contactData.status = 'new';
            contactData.statusHistory = [
              ...(existing.statusHistory || []),
              { status: 'archived', timestamp: existing.lastUpdated || now, note: 'Previously archived' },
              { status: 'new', timestamp: now, note: 'Reactivated via new CSV upload' }
            ];
          }
          contactData.createdAt = existing.createdAt || now;
          
          // Update existing document
          await updateDoc(doc(db, 'users', userId, 'contacts', existing.id), contactData);
        } else {
          // New contact - set initial status
          contactData.status = 'new';
          contactData.statusHistory = [{
            status: 'new',
            timestamp: now,
            note: 'Imported via CSV upload'
          }];
          contactData.notes = [];
          contactData.createdAt = serverTimestamp();
          contactData.lastContacted = null;
          
          // Create new document
          await addDoc(contactsRef, contactData);
        }
      }
      
      // Reload contacts after save
      await loadContactsFromFirestore(userId);
      
    } catch (error) {
      console.error('Failed to save contacts to Firestore:', error);
      throw error;
    }
  }, [loadContactsFromFirestore]);

  const updateContactStatus = useCallback(async (contactId, newStatus, note = '') => {
    if (!user?.uid || !contactId || !newStatus) {
      console.warn('Missing required data for status update');
      return false;
    }
    
    // Validate status transition
    const currentStatus = contactStatuses[contactId] || 'new';
    if (currentStatus !== newStatus && 
        !STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) &&
        currentStatus !== 'archived') {
      const validTransitions = STATUS_TRANSITIONS[currentStatus] || [];
      console.warn(`Invalid status transition: ${currentStatus} -> ${newStatus}. Valid:`, validTransitions);
      alert(`Cannot change status from "${currentStatus}" to "${newStatus}".\nValid next statuses: ${validTransitions.join(', ') || 'none'}`);
      return false;
    }
    
    try {
      // Find contact document
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      let contactDocRef = null;
      let contactData = null;
      
      if (contactId.includes('@')) {
        // Email-based contact
        const emailQuery = query(contactsRef, where('email', '==', contactId));
        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
          contactDocRef = doc(db, 'users', user.uid, 'contacts', emailSnapshot.docs[0].id);
          contactData = emailSnapshot.docs[0].data();
        }
      } else if (contactId.startsWith('phone_')) {
        // Phone-based contact
        const phone = contactId.replace('phone_', '');
        const phoneQuery = query(contactsRef, where('phone', '==', phone));
        const phoneSnapshot = await getDocs(phoneQuery);
        if (!phoneSnapshot.empty) {
          contactDocRef = doc(db, 'users', user.uid, 'contacts', phoneSnapshot.docs[0].id);
          contactData = phoneSnapshot.docs[0].data();
        }
      }
      
      if (!contactDocRef) {
        console.error('Contact not found in Firestore:', contactId);
        alert('Contact not found in database. Please refresh and try again.');
        return false;
      }
      
      // Prepare status history entry
      const now = new Date();
      const historyEntry = {
        status: newStatus,
        timestamp: now,
        note: note || `Status changed from ${currentStatus} to ${newStatus}`,
        userId: user.uid,
        userName: user.displayName || user.email
      };
      
      // Update contact document
      const updateData = {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        statusHistory: [...(contactData?.statusHistory || []), historyEntry]
      };
      
      // Set lastContacted if moving to contacted status
      if (newStatus === 'contacted' && !contactData?.lastContacted) {
        updateData.lastContacted = serverTimestamp();
      }
      
      // Special handling for closed_won
      if (newStatus === 'closed_won') {
        updateData.closedDate = serverTimestamp();
        updateData.dealValue = 5000; // Default value - could be customized
      }
      
      await updateDoc(contactDocRef, updateData);
      
      // Update local state
      setContactStatuses(prev => ({ ...prev, [contactId]: newStatus }));
      setStatusHistory(prev => ({
        ...prev,
        [contactId]: [...(prev[contactId] || []), historyEntry]
      }));
      
      // Update whatsappLinks state
      setWhatsappLinks(prev => 
        prev.map(contact => 
          contact.contactId === contactId 
            ? { ...contact, status: newStatus, lastUpdated: now }
            : contact
        )
      );
      
      // Recalculate analytics
      calculateStatusAnalytics(whatsappLinks.map(c => 
        c.contactId === contactId ? { ...c, status: newStatus } : c
      ));
      
      console.log(`✅ Status updated for ${contactId}: ${currentStatus} → ${newStatus}`);
      return true;
      
    } catch (error) {
      console.error('Failed to update contact status:', error);
      alert(`Failed to update status: ${error.message}`);
      return false;
    }
  }, [user, contactStatuses, whatsappLinks]);

  const bulkUpdateStatus = useCallback(async (contactIds, newStatus, note = '') => {
    if (!user?.uid || contactIds.length === 0) return;
    
    let successCount = 0;
    for (const contactId of contactIds) {
      const success = await updateContactStatus(contactId, newStatus, note);
      if (success) successCount++;
    }
    
    alert(`✅ Updated ${successCount}/${contactIds.length} contacts to "${newStatus}" status`);
    return successCount;
  }, [updateContactStatus, user]);

  const calculateStatusAnalytics = useCallback((contacts) => {
    const byStatus = {};
    const revenueByStatus = {};
    
    // Initialize counters
    CONTACT_STATUSES.forEach(s => {
      byStatus[s.id] = 0;
      revenueByStatus[s.id] = 0;
    });
    
    // Count contacts by status
    contacts.forEach(contact => {
      const status = contact.status || 'new';
      byStatus[status] = (byStatus[status] || 0) + 1;
      
      // Estimate revenue potential by status
      if (status === 'demo_scheduled') revenueByStatus[status] += 2500;
      else if (status === 'proposal_sent') revenueByStatus[status] += 4000;
      else if (status === 'negotiation') revenueByStatus[status] += 4500;
      else if (status === 'closed_won') revenueByStatus[status] += 5000;
    });
    
    // Calculate conversion rates
    const total = contacts.length;
    const conversionRates = {
      contacted: total > 0 ? ((byStatus['contacted'] || 0) / total * 100).toFixed(1) : 0,
      replied: total > 0 ? ((byStatus['replied'] || 0) / total * 100).toFixed(1) : 0,
      demo: total > 0 ? ((byStatus['demo_scheduled'] || 0) / total * 100).toFixed(1) : 0,
      won: total > 0 ? ((byStatus['closed_won'] || 0) / total * 100).toFixed(1) : 0
    };
    
    setStatusAnalytics({
      byStatus,
      conversionRates,
      revenueByStatus,
      totalContacts: total
    });
  }, []);

  // ============================================================================
  // YOUR ORIGINAL CSV PROCESSING (COMPLETELY PRESERVED)
  // ============================================================================
  const handleCsvUpload = useCallback(async (e) => {
    setValidEmails(0);
    setValidWhatsApp(0);
    setWhatsappLinks([]);
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rawContent = e.target.result;
      const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) {
        alert('CSV must have headers and data rows.');
        return;
      }
      
      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      setCsvHeaders(headers);
      setPreviewRecipient(null);
      
      // Expose all possible variables + CSV headers for mapping
      const allTemplateTexts = [
        templateA.subject, templateA.body,
        templateB.subject, templateB.body,
        whatsappTemplate,
        smsTemplate,
        instagramTemplate,
        twitterTemplate,
        ...followUpTemplates.flatMap(t => [t.subject, t.body])
      ];
      const allVars = [...new Set([
        ...allTemplateTexts.flatMap(text => extractTemplateVariables(text)),
        'sender_name',
        ...emailImages.map(img => img.placeholder.replace(/{{|}}/g, '')),
        ...headers
      ])];
      const initialMappings = {};
      allVars.forEach(varName => {
        if (headers.includes(varName)) {
          initialMappings[varName] = varName;
        }
      });
      if (headers.includes('email')) initialMappings.email = 'email';
      initialMappings.sender_name = 'sender_name';
      setFieldMappings(initialMappings);
      
      // Lead processing with lead_quality column presence check
      let hotEmails = 0, warmEmails = 0;
      const validPhoneContacts = [];
      const newLeadScores = {};
      const newLastSent = {};
      let firstValid = null;
      
      // Only filter by leadQuality if the column exists
      const hasLeadQualityCol = headers.includes('lead_quality');
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvRow(lines[i]);
        if (values.length !== headers.length) continue;
        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        
        // Include email only if valid AND passes quality filter (if applicable)
        let includeEmail = true;
        if (hasLeadQualityCol) {
          const quality = (row.lead_quality || '').trim() || 'HOT';
          if (leadQualityFilter !== 'all' && quality !== leadQualityFilter) {
            includeEmail = false;
          }
        }
        const hasValidEmail = isValidEmail(row.email);
        if (hasValidEmail && includeEmail) {
          let score = 50;
          const quality = (row.lead_quality || '').trim() || 'HOT';
          if (quality === 'HOT') score += 30;
          if (parseFloat(row.rating) >= 4.8) score += 20;
          if (parseInt(row.review_count) > 100) score += 10;
          if (clickStats[row.email]?.count > 0) score += 20;
          score = Math.min(100, Math.max(0, score));
          newLeadScores[row.email] = score;
          if (!hasLeadQualityCol || quality === 'HOT') {
            hotEmails++;
          } else if (quality === 'WARM') {
            warmEmails++;
          }
          if (!firstValid) firstValid = row;
        }
        const rawPhone = row.whatsapp_number || row.phone_raw || row.phone;
        const formattedPhone = formatForDialing(rawPhone);
        if (formattedPhone) {
          const contactId = `${row.email || 'no-email'}-${formattedPhone}-${Date.now()}-${Math.random()}`;
          validPhoneContacts.push({
            id: contactId,
            business: row.business_name || 'Business',
            address: row.address || '',
            phone: formattedPhone,
            email: row.email || null,
            place_id: row.place_id || '',
            website: row.website || '',
            // ALL SOCIAL MEDIA & OUTREACH FIELDS
            instagram: row.instagram || '',
            twitter: row.twitter || '',
            facebook: row.facebook || '',
            youtube: row.youtube || '',
            tiktok: row.tiktok || '',
            linkedin_company: row.linkedin_company || '',
            linkedin_ceo: row.linkedin_ceo || '',
            linkedin_founder: row.linkedin_founder || '',
            contact_page_found: row.contact_page_found || 'No',
            social_media_score: row.social_media_score || '0',
            email_primary: row.email_primary || row.email || '',
            phone_primary: row.phone_primary || formattedPhone || '',
            lead_quality_score: row.lead_quality_score || '0',
            contact_confidence: row.contact_confidence || 'Low',
            best_contact_method: row.best_contact_method || 'Email',
            decision_maker_found: row.decision_maker_found || 'No',
            tech_stack_detected: row.tech_stack_detected || '',
            company_size_indicator: row.company_size_indicator || 'unknown',
            status: 'new', // Initial status
            lastContacted: null,
            createdAt: new Date(),
            lastUpdated: new Date(),
            statusHistory: [{
              status: 'new',
              timestamp: new Date(),
              note: 'Imported via CSV upload'
            }]
          });
          if (!firstValid) firstValid = row;
        }
      }
      
      setPreviewRecipient(firstValid);
      if (leadQualityFilter === 'HOT') setValidEmails(hotEmails);
      else if (leadQualityFilter === 'WARM') setValidEmails(warmEmails);
      else setValidEmails(hotEmails + warmEmails);
      setValidWhatsApp(validPhoneContacts.length);
      
      // SAVE TO FIRESTORE INSTEAD OF JUST SETTING STATE
      if (user?.uid) {
        try {
          setStatus('💾 Saving contacts to database...');
          await saveContactsToFirestore(validPhoneContacts, user.uid);
          setStatus(`✅ ${validPhoneContacts.length} contacts saved to database!`);
        } catch (error) {
          console.error('CSV save error:', error);
          setStatus(`❌ Failed to save contacts: ${error.message}`);
          alert(`Failed to save contacts to database: ${error.message}`);
          // Fallback: set local state only
          setWhatsappLinks(validPhoneContacts);
        }
      } else {
        // Fallback if not authenticated (shouldn't happen)
        setWhatsappLinks(validPhoneContacts);
      }
      
      setLeadScores(newLeadScores);
      setLastSent(newLastSent);
      setCsvContent(normalizedContent);
    };
    reader.readAsText(file);
  }, [user, leadQualityFilter, templateA, templateB, whatsappTemplate, smsTemplate, instagramTemplate, twitterTemplate, followUpTemplates, emailImages, fieldMappings, clickStats, saveContactsToFirestore]);

  // ============================================================================
  // YOUR ORIGINAL FILTERING FUNCTIONS (COMPLETELY PRESERVED)
  // ============================================================================
  const getFilteredContacts = useCallback(() => {
    let filtered = [...whatsappLinks];
    
    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.business.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery.replace(/\D/g, ''))
      );
    }
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    // Apply contact filter
    if (contactFilter === 'replied') {
      filtered = filtered.filter(c => c.status === 'replied' || repliedLeads[c.email]);
    } else if (contactFilter === 'pending') {
      filtered = filtered.filter(c => !['replied', 'closed_won', 'not_interested', 'do_not_contact'].includes(c.status));
    } else if (contactFilter === 'high-quality') {
      filtered = filtered.filter(c => (leadScores[c.email] || 0) >= 70);
    } else if (contactFilter === 'contacted') {
      filtered = filtered.filter(c => c.status === 'contacted' || c.lastContacted);
    }
    
    // Apply sorting
    if (sortBy === 'score') {
      filtered.sort((a, b) => (leadScores[b.email] || 0) - (leadScores[a.email] || 0));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => a.business.localeCompare(b.business));
    } else if (sortBy === 'status') {
      filtered.sort((a, b) => {
        const statusOrder = CONTACT_STATUSES.reduce((acc, s, i) => ({ ...acc, [s.id]: i }), {});
        return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
      });
    }
    
    return filtered;
  }, [whatsappLinks, searchQuery, statusFilter, contactFilter, repliedLeads, leadScores, sortBy]);

  const handleStatusChange = useCallback(async (contact, newStatus) => {
    if (!contact?.contactId) {
      console.error('Invalid contact for status change:', contact);
      return;
    }
    
    // Special handling for "not_interested" and "do_not_contact"
    if (['not_interested', 'do_not_contact'].includes(newStatus)) {
      const confirmed = confirm(
        `⚠️ Marking "${contact.business}" as "${newStatus}"\n\n` +
        `This will:\n` +
        `• Stop all automated follow-ups\n` +
        `• Archive contact after 30 days of inactivity\n` +
        `• Require manual reactivation to contact again\n\n` +
        `Are you sure?` 
      );
      if (!confirmed) return;
    }
    
    // Show note modal for important status changes
    if (['not_interested', 'do_not_contact', 'closed_won', 'demo_scheduled'].includes(newStatus)) {
      setSelectedContactForStatus(contact);
      setStatusNote('');
      setShowStatusModal(true);
      return;
    }
    
    // Direct update for simple status changes
    await updateContactStatus(contact.contactId, newStatus);
  }, [updateContactStatus]);

  const handleStatusModalSubmit = useCallback(async () => {
    if (!selectedContactForStatus?.contactId || !statusNote.trim()) {
      alert('Please add a note explaining this status change.');
      return;
    }
    
    const success = await updateContactStatus(
      selectedContactForStatus.contactId, 
      selectedContactForStatus.newStatus,
      statusNote.trim()
    );
    
    if (success) {
      setShowStatusModal(false);
      setSelectedContactForStatus(null);
      setStatusNote('');
    }
  }, [selectedContactForStatus, statusNote, updateContactStatus]);

  const reengageArchivedContacts = useCallback(async () => {
    if (!user?.uid) return;
    
    const confirmed = confirm(
      `🔄 Re-engage archived contacts?\n\n` +
      `This will:\n` +
      `• Restore ${archivedContactsCount} archived contacts to "New Lead" status\n` +
      `• Make them available for new outreach campaigns\n` +
      `• Reset their 30-day inactivity timer\n\n` +
      `Recommended only if you have a new offer or reason to contact them.` 
    );
    
    if (!confirmed) return;
    
    try {
      setStatus('🔄 Re-engaging archived contacts...');
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      const q = query(
        contactsRef, 
        where('status', '==', 'archived'),
        where('lastUpdated', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      );
      const snapshot = await getDocs(q);
      
      let successCount = 0;
      for (const docSnap of snapshot.docs) {
        const contactData = docSnap.data();
        const contactId = contactData.email?.toLowerCase().trim() || `phone_${contactData.phone}`;
        
        await updateContactStatus(contactId, 'new', 'Re-engaged: New campaign initiated');
        successCount++;
      }
      
      setStatus(`✅ ${successCount} contacts re-engaged successfully!`);
      alert(`✅ ${successCount} archived contacts restored to "New Lead" status!`);
      
      // Reload contacts
      await loadContactsFromFirestore(user.uid);
      
    } catch (error) {
      console.error('Re-engagement error:', error);
      setStatus(`❌ Failed to re-engage contacts: ${error.message}`);
      alert(`Failed to re-engage contacts: ${error.message}`);
    }
  }, [user, archivedContactsCount, updateContactStatus, loadContactsFromFirestore]);

  // ============================================================================
  // AI ENHANCEMENT FUNCTIONS (NEW LAYER - ADDITION ONLY)
  // ============================================================================
  const handleAIResearch = async (contact) => {
    if (!aiFeaturesEnabled) {
      setStatus('⚠️ AI features are disabled. Use manual research mode.');
      return;
    }

    try {
      setResearchingCompany(contact.email);
      setStatus('🧠 Researching company with AI...');
      
      const aiLayer = aiLayerRef.current;
      const results = await aiLayer.researchCompany(contact.business, contact.website, contact.email);
      
      setResearchResults(prev => ({
        ...prev,
        [contact.email]: results
      }));
      
      const aiStatus = aiLayer.getStatus();
      setStatus(`✅ AI Research complete! (${aiStatus.status})`);
      setShowResearchModal(true);
      
    } catch (error) {
      console.error('❌ AI Research error:', error);
      setStatus('❌ AI research failed. Please use manual research.');
      setAiFeaturesEnabled(false); // Disable AI on failure
    } finally {
      setResearchingCompany(null);
    }
  };

  const handlePredictiveScoring = async () => {
    if (!aiFeaturesEnabled) {
      setStatus('⚠️ AI features are disabled. Using manual scoring.');
      return;
    }

    try {
      setStatus('🔮 Generating predictive scores...');
      const aiLayer = aiLayerRef.current;
      const newScores = {};
      
      for (const contact of whatsappLinks.slice(0, 10)) {
        if (contact.email) {
          const score = await aiLayer.generatePredictiveScore(contact);
          newScores[contact.email] = score;
        }
      }
      
      setPredictiveScores(prev => ({ ...prev, ...newScores }));
      setStatus('✅ Predictive scoring completed!');
      
    } catch (error) {
      console.error('❌ Predictive scoring error:', error);
      setStatus('❌ Predictive scoring failed. Using manual scoring.');
    }
  };

  const handleSmartFollowUpGeneration = async () => {
    if (!aiFeaturesEnabled) {
      setStatus('⚠️ AI features are disabled. Using manual follow-ups.');
      return;
    }

    try {
      setStatus('✨ Generating smart follow-ups...');
      const aiLayer = aiLayerRef.current;
      const newSuggestions = {};
      
      for (const contact of whatsappLinks.slice(0, 5)) {
        if (contact.email) {
          const followUpCount = (followUpHistory[contact.email]?.count || 0) + 1;
          const suggestion = await aiLayer.generateSmartFollowUp(contact, followUpCount);
          newSuggestions[contact.email] = suggestion;
        }
      }
      
      setSmartFollowUpSuggestions(prev => ({ ...prev, ...newSuggestions }));
      setStatus('✅ Smart follow-ups generated!');
      
    } catch (error) {
      console.error('❌ Smart follow-up generation error:', error);
      setStatus('❌ Smart follow-up generation failed. Using manual templates.');
    }
  };

  // ============================================================================
  // YOUR ORIGINAL AUTHENTICATION (COMPLETELY PRESERVED)
  // ============================================================================
  useEffect(() => {
    if (!auth) {
      console.warn('⚠️ Auth not available - running in demo mode');
      setLoadingAuth(false);
      // Auto-login in demo mode
      setTimeout(() => {
        if (mountedRef.current) {
          setUser({
            uid: 'demo-user',
            email: 'demo@syndicatesolutions.com',
            displayName: 'Demo User'
          });
        }
      }, 1000);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!mountedRef.current) return;

      if (currentUser) {
        setUser(currentUser);
        loadContactsFromFirestore(currentUser.uid);
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });

    return () => {
      unsubscribe();
      mountedRef.current = false;
    };
  }, [loadContactsFromFirestore]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ============================================================================
  // YOUR ORIGINAL UI COMPONENTS (COMPLETELY PRESERVED)
  // ============================================================================
  const StatusBadge = ({ status, small = false }) => {
    const statusInfo = CONTACT_STATUSES.find(s => s.id === status) || CONTACT_STATUSES[0];
    const sizeClasses = small ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
    const colorClasses = {
      gray: 'bg-gray-700 text-gray-300',
      blue: 'bg-blue-700 text-blue-300',
      indigo: 'bg-indigo-700 text-indigo-300',
      green: 'bg-green-700 text-green-300',
      purple: 'bg-purple-700 text-purple-300',
      orange: 'bg-orange-700 text-orange-300',
      yellow: 'bg-yellow-700 text-yellow-300',
      emerald: 'bg-emerald-700 text-emerald-300',
      red: 'bg-red-700 text-red-300',
      rose: 'bg-rose-700 text-rose-300'
    };
    
    return (
      <span className={`${sizeClasses} ${colorClasses[statusInfo.color]} rounded-full font-medium`}>
        {statusInfo.label}
      </span>
    );
  };

  const StatusDropdown = ({ contact, compact = false }) => {
    const currentStatus = contact.status || 'new';
    const statusInfo = CONTACT_STATUSES.find(s => s.id === currentStatus) || CONTACT_STATUSES[0];
    
    return (
      <select
        value={currentStatus}
        onChange={(e) => {
          const newStatus = e.target.value;
          if (compact) {
            updateContactStatus(contact.contactId, newStatus);
          } else {
            setSelectedContactForStatus({ ...contact, newStatus });
            setStatusNote('');
            setShowStatusModal(true);
          }
        }}
        className={`${compact ? 'text-xs' : 'text-sm'} bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer`}
        title={`Change status from ${statusInfo.label}`}
      >
        {CONTACT_STATUSES.map(status => (
          <option key={status.id} value={status.id}>
            {status.label}
          </option>
        ))}
      </select>
    );
  };

  // ============================================================================
  // RENDER METHOD - YOUR ORIGINAL UI + AI ADDITIONS
  // ============================================================================
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div>Loading Syndicate Solutions Dashboard...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6 bg-gray-800 rounded-lg shadow-lg">
          <Head>
            <title>Syndicate Solutions - B2B Growth Engine</title>
          </Head>
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Syndicate Solutions</h1>
            <p className="text-gray-400 mb-6">B2B Growth Engine - Enterprise Dashboard</p>
            
            <button
              onClick={() => {
                if (auth) {
                  const provider = new GoogleAuthProvider();
                  signInWithPopup(auth, provider);
                } else {
                  // Demo mode
                  setUser({
                    uid: 'demo-user',
                    email: 'demo@syndicatesolutions.com',
                    displayName: 'Demo User'
                  });
                }
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign In with Google
            </button>

            <div className="mt-4 text-xs text-gray-500">
              {!auth ? 'Demo mode: Firebase not configured' : 'Enterprise-grade authentication'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>Syndicate Solutions Dashboard</title>
      </Head>
      
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Syndicate Solutions Dashboard</h1>
              <p className="text-gray-400 text-sm">B2B Growth Engine - Enterprise Edition</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-300">{user.displayName || user.email}</div>
                <div className="text-xs text-gray-500">
                  {db ? '🟢 Firebase Connected' : '🟡 Demo Mode'} | 
                  AI: {aiLayerRef.current.getStatus().status.split(' ')[0]}
                </div>
              </div>
              <button
                onClick={() => {
                  if (auth) {
                    signOut(auth);
                  } else {
                    setUser(null);
                  }
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition duration-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-6 border-b border-gray-700">
          {['outreach', 'contacts', 'ai-features', 'analytics', 'settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'outreach' && (
          <div className="space-y-6">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-400 mb-1">Valid Emails</h3>
                <p className="text-2xl font-bold">{validEmails}</p>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-400 mb-1">WhatsApp Numbers</h3>
                <p className="text-2xl font-bold">{validWhatsApp}</p>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-400 mb-1">Total Contacts</h3>
                <p className="text-2xl font-bold">{whatsappLinks.length}</p>
              </div>
              <div className="bg-gray-800 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-400 mb-1">AI Status</h3>
                <p className="text-2xl font-bold">
                  {aiLayerRef.current.getStatus().status.split(' ')[0]}
                </p>
              </div>
            </div>

            {/* CSV Upload */}
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Import Leads</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Upload CSV File</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCsvUpload}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                </div>
                {csvHeaders.length > 0 && (
                  <div className="text-sm text-gray-400">
                    Found {csvHeaders.length} columns: {csvHeaders.join(', ')}
                  </div>
                )}
              </div>
            </div>

            {/* Email Templates */}
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Email Templates</h2>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={abTestMode}
                      onChange={(e) => setAbTestMode(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">A/B Test Mode</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-2 text-blue-400">Template A</h3>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={templateA.subject}
                      onChange={(e) => setTemplateA(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="Subject line"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <textarea
                      value={templateA.body}
                      onChange={(e) => setTemplateA(prev => ({ ...prev, body: e.target.value }))}
                      className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {abTestMode && (
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-green-400">Template B</h3>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={templateB.subject}
                        onChange={(e) => setTemplateB(prev => ({ ...prev, subject: e.target.value }))}
                        placeholder="Subject line"
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <textarea
                        value={templateB.body}
                        onChange={(e) => setTemplateB(prev => ({ ...prev, body: e.target.value }))}
                        className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Multi-Channel Templates */}
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Multi-Channel Templates</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-2 text-green-400">WhatsApp</h3>
                  <textarea
                    value={whatsappTemplate}
                    onChange={(e) => setWhatsappTemplate(e.target.value)}
                    className="w-full h-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2 text-blue-400">SMS</h3>
                  <textarea
                    value={smsTemplate}
                    onChange={(e) => setSmsTemplate(e.target.value)}
                    className="w-full h-24 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2 text-purple-400">Social Media</h3>
                  <div className="space-y-2">
                    <div>
                      <h4 className="text-xs font-medium text-pink-400">Instagram</h4>
                      <textarea
                        value={instagramTemplate}
                        onChange={(e) => setInstagramTemplate(e.target.value)}
                        className="w-full h-16 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 text-xs"
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-sky-400">Twitter</h4>
                      <textarea
                        value={twitterTemplate}
                        onChange={(e) => setTwitterTemplate(e.target.value)}
                        className="w-full h-16 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Send Campaign */}
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Launch Campaign</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    placeholder="Sender Name"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={smsConsent}
                      onChange={(e) => setSmsConsent(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">SMS Consent</span>
                  </label>
                </div>
                <button
                  onClick={() => setStatus('Campaign launching...')}
                  disabled={isSending || validEmails === 0}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition duration-200"
                >
                  {isSending ? 'Sending...' : `Send to ${validEmails} leads`}
                </button>
                {status && (
                  <div className={`p-3 rounded-lg text-sm ${
                    status.includes('success') || status.includes('✅') ? 'bg-green-900/50 text-green-200' : 
                    status.includes('⚠️') ? 'bg-amber-900/50 text-amber-200' :
                    status.includes('❌') ? 'bg-red-900/50 text-red-200' :
                    'bg-blue-900/50 text-blue-200'
                  }`}>
                    {status}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Contact Management</h2>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 text-sm"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                  >
                    <option value="all">All Statuses</option>
                    {CONTACT_STATUSES.map(status => (
                      <option key={status.id} value={status.id}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {whatsappLinks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">📥</div>
                  <p>No contacts imported yet</p>
                  <p className="text-sm mt-1">Upload a CSV file to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-4">Business</th>
                        <th className="text-left py-3 px-4">Contact</th>
                        <th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getFilteredContacts().slice(0, 10).map((contact) => (
                        <tr key={contact.id} className="border-b border-gray-700">
                          <td className="py-3 px-4">
                            <div className="font-medium">{contact.business}</div>
                            {contact.website && (
                              <a
                                href={contact.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs"
                              >
                                Visit Website
                              </a>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {contact.email && (
                              <div className="text-gray-300">{contact.email}</div>
                            )}
                            {contact.phone && (
                              <div className="text-gray-400">+{contact.phone}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={contact.status} small />
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              {contact.email && (
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs transition"
                                >
                                  Email
                                </a>
                              )}
                              {contact.phone && (
                                <a
                                  href={contact.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1 bg-green-700 hover:bg-green-600 text-white rounded text-xs transition"
                                >
                                  WhatsApp
                                </a>
                              )}
                              <button
                                onClick={() => handleAIResearch(contact)}
                                disabled={!aiFeaturesEnabled}
                                className="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-xs transition"
                                title="AI Research"
                              >
                                🧠
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ai-features' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">AI Enhancement Layer</h2>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    aiFeaturesEnabled ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                  }`}>
                    {aiLayerRef.current.getStatus().status}
                  </span>
                  <button
                    onClick={() => {
                      setAiFeaturesEnabled(!aiFeaturesEnabled);
                      if (aiFeaturesEnabled) {
                        aiLayerRef.current.disable();
                      } else {
                        aiLayerRef.current.enable();
                      }
                    }}
                    className={`px-3 py-1 rounded text-sm font-medium transition ${
                      aiFeaturesEnabled 
                        ? 'bg-red-700 hover:bg-red-600 text-white' 
                        : 'bg-green-700 hover:bg-green-600 text-white'
                    }`}
                  >
                    {aiFeaturesEnabled ? 'Disable AI' : 'Enable AI'}
                  </button>
                </div>
              </div>
              
              {!aiFeaturesEnabled && (
                <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4 mb-4">
                  <h3 className="text-amber-300 font-medium mb-2">⚠️ AI Features Disabled</h3>
                  <p className="text-amber-200 text-sm">
                    AI features are currently disabled. All manual features continue to work normally. 
                    Enable AI to access company research, predictive scoring, and smart follow-ups.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 text-indigo-400">🧠 Company Research</h3>
                  <p className="text-gray-300 text-sm mb-3">AI-powered company research and personalization</p>
                  <button
                    onClick={() => {
                      if (whatsappLinks.length > 0) {
                        handleAIResearch(whatsappLinks[0]);
                      } else {
                        setStatus('Please upload contacts first');
                      }
                    }}
                    disabled={!aiFeaturesEnabled || whatsappLinks.length === 0}
                    className="w-full py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition"
                  >
                    Research First Contact
                  </button>
                </div>
                
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 text-purple-400">🔮 Predictive Scoring</h3>
                  <p className="text-gray-300 text-sm mb-3">AI predicts lead conversion probability</p>
                  <button
                    onClick={handlePredictiveScoring}
                    disabled={!aiFeaturesEnabled || whatsappLinks.length === 0}
                    className="w-full py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition"
                  >
                    Score All Leads
                  </button>
                </div>
                
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 text-green-400">✨ Smart Follow-ups</h3>
                  <p className="text-gray-300 text-sm mb-3">AI generates context-aware follow-up messages</p>
                  <button
                    onClick={handleSmartFollowUpGeneration}
                    disabled={!aiFeaturesEnabled || whatsappLinks.length === 0}
                    className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition"
                  >
                    Generate Follow-ups
                  </button>
                </div>
              </div>

              {showResearchModal && researchResults[Object.keys(researchResults)[0]] && (
                <div className="mt-6 bg-indigo-900/20 border border-indigo-800 rounded-lg p-4">
                  <h3 className="text-indigo-300 font-medium mb-3">🧠 Latest Research Results</h3>
                  <div className="space-y-3">
                    {Object.entries(researchResults).slice(0, 1).map(([email, data]) => (
                      <div key={email} className="p-3 bg-indigo-900/30 rounded">
                        <h4 className="text-white font-medium mb-2">{email}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <h5 className="text-indigo-300 text-sm font-medium mb-1">Strategy</h5>
                            <p className="text-gray-300 text-sm">{data.strategy}</p>
                          </div>
                          <div>
                            <h5 className="text-indigo-300 text-sm font-medium mb-1">Approach</h5>
                            <p className="text-gray-300 text-sm">{data.approach}</p>
                          </div>
                        </div>
                        <div className="mt-3">
                          <h5 className="text-indigo-300 text-sm font-medium mb-1">Key Insights</h5>
                          <ul className="text-gray-300 text-sm space-y-1">
                            {data.insights?.map((insight, i) => (
                              <li key={i} className="flex items-start">
                                <span className="text-indigo-400 mr-2">•</span>
                                <span>{insight}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          onClick={() => {
                            setTemplateA(prev => ({
                              ...prev,
                              subject: data.subjectLine,
                              body: data.emailTemplate
                            }));
                            setShowResearchModal(false);
                            setStatus('✅ Research applied to template!');
                          }}
                          className="mt-3 w-full py-2 bg-indigo-700 hover:bg-indigo-600 text-white rounded text-sm transition"
                        >
                          📤 Apply to Template
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Campaign Analytics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium mb-3">A/B Test Results</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-3 bg-gray-700 rounded">
                      <span className="text-blue-400">Template A</span>
                      <div className="text-sm">
                        <span>Sent: {abResults.a.sent}</span>
                        <span className="ml-4">Opens: {abResults.a.opens}</span>
                        <span className="ml-4">Clicks: {abResults.a.clicks}</span>
                      </div>
                    </div>
                    {abTestMode && (
                      <div className="flex justify-between items-center p-3 bg-gray-700 rounded">
                        <span className="text-green-400">Template B</span>
                        <div className="text-sm">
                          <span>Sent: {abResults.b.sent}</span>
                          <span className="ml-4">Opens: {abResults.b.opens}</span>
                          <span className="ml-4">Clicks: {abResults.b.clicks}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-3">Performance Metrics</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-gray-700 rounded">
                      <span>Open Rate</span>
                      <span>{abResults.a.sent > 0 ? ((abResults.a.opens / abResults.a.sent) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="flex justify-between p-2 bg-gray-700 rounded">
                      <span>Click Rate</span>
                      <span>{abResults.a.opens > 0 ? ((abResults.a.clicks / abResults.a.opens) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Settings</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium mb-2">Account Information</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Email:</strong> {user.email}</div>
                    {user.displayName && <div><strong>Name:</strong> {user.displayName}</div>}
                    <div className="text-green-400">✓ Authentication active</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">Campaign Preferences</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={abTestMode}
                        onChange={(e) => setAbTestMode(e.target.checked)}
                        className="rounded"
                      />
                      <span>Enable A/B testing by default</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={smsConsent}
                        onChange={(e) => setSmsConsent(e.target.checked)}
                        className="rounded"
                      />
                      <span>Require SMS consent for campaigns</span>
                    </label>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">AI Settings</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={aiFeaturesEnabled}
                        onChange={(e) => {
                          setAiFeaturesEnabled(e.target.checked);
                          if (e.target.checked) {
                            aiLayerRef.current.enable();
                          } else {
                            aiLayerRef.current.disable();
                          }
                        }}
                        className="rounded"
                      />
                      <span>Enable AI features (experimental)</span>
                    </label>
                    <p className="text-sm text-gray-400">
                      AI features include company research, predictive scoring, and smart follow-ups. 
                      Manual features always work even if AI is disabled.
                    </p>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-2">System Status</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Firebase:</strong> {db ? '🟢 Connected' : '🟡 Demo Mode'}</div>
                    <div><strong>AI Layer:</strong> {aiLayerRef.current.getStatus().status}</div>
                    <div><strong>Authentication:</strong> 🟢 Active</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status Modal */}
      {showStatusModal && selectedContactForStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Update Contact Status</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Contact</label>
                <div className="text-gray-300">{selectedContactForStatus.business}</div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">New Status</label>
                <div className="text-gray-300">
                  {CONTACT_STATUSES.find(s => s.id === selectedContactForStatus.newStatus)?.label}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Note (Required)</label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="Explain why you're changing this status..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleStatusModalSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition"
                >
                  Update Status
                </button>
                <button
                  onClick={() => {
                    setShowStatusModal(false);
                    setSelectedContactForStatus(null);
                    setStatusNote('');
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
