// app/dashboard/page.js
'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  deleteDoc,
  onSnapshot,
  increment,
  arrayUnion,
  arrayRemove,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  browserLocalPersistence
} from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

// Import from new modules
import { CONFIG, generateId } from '../../lib/dashboard-config.js';
import { generateQualificationSMS, parseQualificationResponse, formatQualificationSummary } from '../../lib/sms-qualifier';
import {
  formatForDialing,
  formatPhoneForDisplay,
  isValidEmail,
  parseMultipleEmails,
  parseCsvRow,
  extractTemplateVariables,
  renderPreviewText,
  generateSocialHandle,
  daysBetween,
  safeParseDate,
  throttle,
  localStorageHelper,
  sessionStorageHelper,
  copyToClipboard,
  debounce,
  normalizeContactKey
} from '../../lib/dashboard-utils.js';
import { useContactTracking } from '../../hooks/useContactTracking.js';
import { useDailyQuotas } from '../../hooks/useDailyQuotas.js';
import { useLeadScoring } from '../../hooks/useLeadScoring.js';
import {
  loadSettingsFromFirebase,
  saveSettingsToFirebase,
  loadManualContactStatus,
  updateDealStage,
  loadSentLeads,
  loadRepliedAndFollowUp,
  normalizeSentLead,
  getLeadNextFollowUpAt
} from '../../lib/firebase-operations.js';
import { invalidateCache } from '../../lib/firebase-cache.js';

// ============================================================================
// FIREBASE INITIALIZATION WITH ERROR HANDLING
// ============================================================================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const initializeFirebase = () => {
  try {
    if (typeof window === 'undefined') return null;
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const auth = getAuth(app);
    auth.setPersistence(browserLocalPersistence).catch((error) => {
      console.error('Firebase auth persistence error:', error);
    });
    return {
      db: getFirestore(app),
      auth,
      app
    };
  } catch (error) {
    console.error('Firebase initialization error:', error);
    return null;
  }
};

const firebase = initializeFirebase();
const db = firebase?.db;
const auth = firebase?.auth;

// ============================================================================
// EMAIL TEMPLATES - YOUR ACTUAL PITCH
// ============================================================================
const DEFAULT_TEMPLATE_A = {
  id: 'template_a',
  name: 'Initial Outreach',
  subject: 'Quick question for {{business_name}}',
  body: `Hi {{business_name}}, 😊👋🏻
I hope you're doing well.
My name is {{sender_name}}. I run Syndicate Solutions, a Sri Lanka–based mini agency supporting
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
{{sender_name}}
Founder – Syndicate Solutions
`,
  channel: 'email',
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const DEFAULT_TEMPLATE_B = {
  id: 'template_b',
  name: 'Alternative Outreach',
  subject: '{{business_name}}, quick question',
  body: `Hi {{business_name}},
I noticed your company and wanted to reach out.
We help businesses like yours with web development, AI automation, and digital operations.
Would you be open to a quick 15-minute chat to see if we can help?
No pressure at all.
Best,
{{sender_name}}
Syndicate Solutions
`,
  channel: 'email',
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// ============================================================================
// FOLLOW-UP TEMPLATES
// ============================================================================
const DEFAULT_FOLLOW_UP_TEMPLATES = [
  {
    id: 'followup_1',
    name: 'Follow-Up 1 (Day 2)',
    channel: 'email',
    enabled: true,
    delayDays: 2,
    subject: 'Quick question for {{business_name}}',
    body: `Hi {{business_name}},
Just circling back—did my note about outsourced dev & ops support land at a bad time?
No pressure at all, but if you're ever swamped with web, automation, or backend work and need a reliable extra hand (especially for white-label or fast-turnaround needs), we're ready to help.
Even a 1-hour task is a great way to test the waters.
Either way, wishing you a productive week!
Best,
{{sender_name}}
Founder – Syndicate Solutions
WhatsApp: 0741143323
`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'followup_2',
    name: 'Follow-Up 2 (Day 5)',
    channel: 'email',
    enabled: true,
    delayDays: 5,
    subject: '{{business_name}}, a quick offer (no strings)',
    body: `Hi again,
I noticed you haven't had a chance to reply—totally understand!
To make this zero-risk: **I'll audit one of your digital workflows (e.g., lead capture, client onboarding, internal tooling) for free** and send 2–3 actionable automation ideas you can implement immediately—even if you never work with us.
Zero sales pitch. Just value.
Interested? Hit "Yes" or reply with a workflow you'd like optimized.
Cheers,
{{sender_name}}
Portfolio: https://syndicatesolutions.vercel.app/
Book a call: https://cal.com/syndicate-solutions/15min`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'followup_3',
    name: 'Breakup Email (Day 10)',
    channel: 'email',
    enabled: true,
    delayDays: 10,
    subject: 'Closing the loop',
    body: `Hi {{business_name}},
I'll stop emailing after this one! 😅
Just wanted to say: if outsourcing ever becomes a priority—whether for web dev, AI tools, or ongoing ops—we're here. Many of our clients started with a tiny $100 task and now work with us monthly.
If now's not the time, no worries! I'll circle back in a few months.
Either way, keep crushing it!
— {{sender_name}}
WhatsApp: 0741143323
`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ============================================================================
// MULTI-CHANNEL TEMPLATES
// ============================================================================
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

const DEFAULT_INSTAGRAM_TEMPLATE = `Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat about how we can help?
No pressure at all.`;

const DEFAULT_TWITTER_TEMPLATE = `Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat?`;

const DEFAULT_LINKEDIN_TEMPLATE = `Hi {{business_name}},
I came across your company and was impressed by your work.
We help businesses like yours with web development, AI automation, and digital operations.
Would you be open to connecting and exploring potential collaboration?
Best,
{{sender_name}}`;

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function Dashboard() {
  // ============================================================================
  // AUTH & LOADING STATES
  // ============================================================================
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [authError, setAuthError] = useState(null);
  const router = useRouter();

  // ============================================================================
  // CSV & LEAD DATA STATES
  // ============================================================================
  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [availableCsvVariables, setAvailableCsvVariables] = useState([]);
  const [whatsappLinks, setWhatsappLinks] = useState([]);
  const [validEmails, setValidEmails] = useState(0);
  const [validWhatsApp, setValidWhatsApp] = useState(0);
  const [leadQualityFilter, setLeadQualityFilter] = useState('HOT');
  const [previewRecipient, setPreviewRecipient] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({});
  const [csvFileName, setCsvFileName] = useState('');
  const [csvUploadDate, setCsvUploadDate] = useState(null);
  const [isEnrichingCsv, setIsEnrichingCsv] = useState(false);
  const [enrichMode, setEnrichMode] = useState('download');
  const [enrichStatusMessage, setEnrichStatusMessage] = useState('');

  // ============================================================================
  // SENDER & TEMPLATE STATES
  // ============================================================================
  const [senderName, setSenderName] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [abTestMode, setAbTestMode] = useState(false);
  const [templateA, setTemplateA] = useState(DEFAULT_TEMPLATE_A);
  const [templateB, setTemplateB] = useState(DEFAULT_TEMPLATE_B);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);
  const [instagramTemplate, setInstagramTemplate] = useState(DEFAULT_INSTAGRAM_TEMPLATE);
  const [twitterTemplate, setTwitterTemplate] = useState(DEFAULT_TWITTER_TEMPLATE);
  const [linkedinTemplate, setLinkedinTemplate] = useState(DEFAULT_LINKEDIN_TEMPLATE);
  const [emailImages, setEmailImages] = useState([]);
  const [emailAttachments, setEmailAttachments] = useState([]);
  const [smsConsent, setSmsConsent] = useState(true);
  const [activeTemplateTab, setActiveTemplateTab] = useState('email');

  // ============================================================================
  // TEMPLATE VARIABLES COLLECTION
  // ============================================================================
  const uiVars = [...new Set([
    ...extractTemplateVariables(templateA.subject),
    ...extractTemplateVariables(templateA.body),
    ...extractTemplateVariables(templateB.subject),
    ...extractTemplateVariables(templateB.body),
    ...extractTemplateVariables(whatsappTemplate),
    ...extractTemplateVariables(smsTemplate),
    ...extractTemplateVariables(instagramTemplate),
    ...extractTemplateVariables(twitterTemplate),
    ...extractTemplateVariables(linkedinTemplate)
  ])];

  const allTemplateVars = [...new Set([
    ...uiVars,
    ...csvHeaders,
    ...availableCsvVariables,
    'sender_name'
  ])];

  // ============================================================================
  // CONTACT TRACKING STATES (Using custom hook)
  // ============================================================================
  const {
    contactHistory,
    loading: loadingContactHistory,
    error: contactHistoryError,
    updateContact,
    canContact,
    getContactSummary,
    setContactHistory
  } = useContactTracking(user?.uid);

  // Legacy tracking states (for backward compatibility)
  const [lastSent, setLastSent] = useState({});
  const [lastWhatsAppSent, setLastWhatsAppSent] = useState({});
  const [lastSMSSent, setLastSMSSent] = useState({});
  const [lastCallMade, setLastCallMade] = useState({});
  const [contactedChannels, setContactedChannels] = useState({});
  const [manualContactStatus, setManualContactStatus] = useState({});

  // ============================================================================
  // QUOTA MANAGEMENT (Using custom hook)
  // ============================================================================
  const {
    quotas,
    loading: loadingQuotas,
    canUse,
    incrementQuota,
    setQuotas
  } = useDailyQuotas(user?.uid);

  const [dailyEmailCount, setDailyEmailCount] = useState(0);
  const [dailyWhatsAppCount, setDailyWhatsAppCount] = useState(0);
  const [dailySMSCount, setDailySMSCount] = useState(0);
  const [dailyCallCount, setDailyCallCount] = useState(0);
  const [loadingDailyCount, setLoadingDailyCount] = useState(false);

  // ============================================================================
  // LEAD SCORING (Using custom hook)
  // ============================================================================
  const {
    scores: leadScores,
    calculateScore,
    updateScore,
    setScores: setLeadScores
  } = useLeadScoring();

  // ============================================================================
  // ANALYTICS & METRICS STATES
  // ============================================================================
  const [clickStats, setClickStats] = useState({});
  const [dealStage, setDealStage] = useState({});
  const [pipelineValue, setPipelineValue] = useState(0);
  const [abResults, setAbResults] = useState({
    a: { opens: 0, clicks: 0, sent: 0, replied: 0 },
    b: { opens: 0, clicks: 0, sent: 0, replied: 0 }
  });
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
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(false);
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);

  // ============================================================================
  // SEND & STATUS STATES
  // ============================================================================
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

  // ============================================================================
  // FOLLOW-UP STATES
  // ============================================================================
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
  const [followUpTemplates, setFollowUpTemplates] = useState(DEFAULT_FOLLOW_UP_TEMPLATES);
  const [followUpTemplate, setFollowUpTemplate] = useState('auto');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');

  const safeParseDate = useCallback((value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  const normalizeLeadEmail = useCallback((lead) => {
    if (!lead) return '';
    const rawEmail =
      lead.email ||
      lead.to ||
      lead.contactEmail ||
      lead.recipientEmail ||
      lead.recipient?.email ||
      lead.toEmail ||
      '';
    return String(rawEmail).trim().toLowerCase();
  }, []);

  const normalizeSentLead = useCallback((lead) => {
    const email = normalizeLeadEmail(lead);
    const sentAt = safeParseDate(lead.sentAt);
    const followUpAt = safeParseDate(lead.followUpAt);
    const lastFollowUpAt = safeParseDate(lead.lastFollowUpAt) || safeParseDate(lead.lastFollowUpSentAt);

    return {
      ...lead,
      email,
      sentAt: sentAt ? sentAt.toISOString() : null,
      followUpAt: followUpAt ? followUpAt.toISOString() : null,
      lastFollowUpAt: lastFollowUpAt ? lastFollowUpAt.toISOString() : null,
      followUpCount: Number(lead.followUpCount ?? lead.followUpSentCount ?? 0)
    };
  }, [normalizeLeadEmail, safeParseDate]);


  const [autoReplyProcessorEnabled, setAutoReplyProcessorEnabled] = useState(true);
  const [autoFollowupSchedulerEnabled, setAutoFollowupSchedulerEnabled] = useState(true);
  const [aiProcessorStatus, setAiProcessorStatus] = useState('Idle');
  const [followupSchedulerStatus, setFollowupSchedulerStatus] = useState('Idle');
  const [showAllPendingLeads, setShowAllPendingLeads] = useState(false);
  const [showAllReadyLeads, setShowAllReadyLeads] = useState(false);
  const [showAllRepliedLeads, setShowAllRepliedLeads] = useState(false);
  const [conversationThread, setConversationThread] = useState(null);
  const [showConversationModal, setShowConversationModal] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // ============================================================================
  // AI & ADVANCED FEATURES STATES
  // ============================================================================
  const [researchingCompany, setResearchingCompany] = useState(null);
  const [researchResults, setResearchResults] = useState({});
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [interestedLeadsList, setInterestedLeadsList] = useState([]);
  const [sendTimeOptimization, setSendTimeOptimization] = useState(null);
  const [predictiveScores, setPredictiveScores] = useState({});
  const [sentimentAnalysis, setSentimentAnalysis] = useState({});
  const [smartFollowUpSuggestions, setSmartFollowUpSuggestions] = useState({});
  const [followUpTargeting, setFollowUpTargeting] = useState('ready');
  const [batchSize, setBatchSize] = useState(50);
  const [followUpAnalytics, setFollowUpAnalytics] = useState({
    totalFollowUpsSent: 0,
    avgReplyRate: 0,
    bestTemplate: 'auto',
    bestTimeToSend: 'afternoon'
  });

  // ============================================================================
  // COMPANY TRACKING STATES
  // ============================================================================
  const [contactedCompanies, setContactedCompanies] = useState([]);
  const [loadingContactedCompanies, setLoadingContactedCompanies] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [companyStats, setCompanyStats] = useState({
    totalCompanies: 0,
    totalContacts: 0,
    avgContactsPerCompany: 0,
    companiesReplied: 0,
    replyRate: 0
  });

  // ============================================================================
  // CALL TRACKING STATES
  // ============================================================================
  const [callHistory, setCallHistory] = useState([]);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [showCallHistoryModal, setShowCallHistoryModal] = useState(false);
  const [activeCallStatus, setActiveCallStatus] = useState(null);

  // ============================================================================
  // BUSINESS INTELLIGENCE & ANALYTICS STATES
  // ============================================================================
  const [analyticsTab, setAnalyticsTab] = useState('overview');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const [pipelineData, setPipelineData] = useState(null);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  const [assignmentData, setAssignmentData] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(false);

  const [predictiveData, setPredictiveData] = useState(null);
  const [loadingPredictive, setLoadingPredictive] = useState(false);

  // ============================================================================
  // MULTI-CHANNEL MODAL STATES
  // ============================================================================
  const [showMultiChannelModal, setShowMultiChannelModal] = useState(false);
  const [isMultiChannelFullscreen, setIsMultiChannelFullscreen] = useState(false);
  const [multiChannelView, setMultiChannelView] = useState('grid');
  const [multiChannelPanel, setMultiChannelPanel] = useState('not-contacted');
  const [multiChannelFilter, setMultiChannelFilter] = useState('all');

  // ============================================================================
  // SEARCH & FILTER STATES
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState('desc');

  // Debounce search query to prevent filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, CONFIG.DEBOUNCE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [searchQuery]);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

  // ============================================================================
  // NOTIFICATION STATES
  // ============================================================================
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // ============================================================================
  // SETTINGS & PREFERENCES STATES
  // ============================================================================
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userPreferences, setUserPreferences] = useState({
    theme: 'dark',
    notificationsEnabled: true,
    autoSaveEnabled: true,
    confirmBeforeSend: true,
    defaultChannel: 'email',
    timezone: 'Asia/Colombo'
  });

  // ============================================================================
  // BACKUP & EXPORT STATES
  // ============================================================================
  const [lastBackup, setLastBackup] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // ============================================================================
  // REF FOR AUTO-SAVE
  // ============================================================================
  const autoSaveTimeoutRef = useRef(null);
  const enrichCsvInputRef = useRef(null);
  const enrichModeRef = useRef('download');

  // ============================================================================
  // NOTIFICATION HELPER
  // ============================================================================
  const addNotification = useCallback((message, type = 'info', duration = CONFIG.NOTIFICATION_DURATION_MS) => {
    const id = generateId();
    const notification = {
      id,
      message,
      type,
      createdAt: new Date().toISOString(),
      read: false
    };

    setNotifications(prev => [notification, ...prev].slice(0, CONFIG.MAX_NOTIFICATIONS));

    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const markNotificationRead = useCallback((id) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // ============================================================================
  // HELPER: Check if contact was reached on ANY channel
  // ============================================================================
  const isContactedOnAnyChannel = useCallback((contact) => {
    if (!contact) return false;
    const key = normalizeContactKey(contact);
    if (!key) return false;

    // Manual status override: true = contacted, false = explicitly not contacted
    if (manualContactStatus[key]?.contacted === true) return true;
    if (manualContactStatus[key]?.contacted === false) return false;

    // Check contact history from hook
    const summary = getContactSummary(key);
    if (summary.contacted) return true;

    // Check legacy tracking (backward compatibility)
    return !!(
      lastSent[key] ||
      lastWhatsAppSent[key] ||
      lastSMSSent[key] ||
      lastCallMade[key] ||
      (contactedChannels[key] && contactedChannels[key].length > 0)
    );
  }, [lastSent, lastWhatsAppSent, lastSMSSent, lastCallMade, contactedChannels, manualContactStatus, getContactSummary]);

  // ============================================================================
  // HELPER: Get all contact attempts for a contact
  // ============================================================================
  const getContactHistory = useCallback((contact) => {
    if (!contact) return {
      email: null,
      whatsapp: null,
      sms: null,
      call: null,
      channels: [],
      totalContacts: 0,
      lastContacted: null
    };

    const key = normalizeContactKey(contact);
    const summary = getContactSummary(key);
    const manual = manualContactStatus[key];

    return {
      email: lastSent[key] ? new Date(lastSent[key]) : null,
      whatsapp: lastWhatsAppSent[key] ? new Date(lastWhatsAppSent[key]) : null,
      sms: lastSMSSent[key] ? new Date(lastSMSSent[key]) : null,
      call: lastCallMade[key] ? new Date(lastCallMade[key]) : null,
      channels: contactedChannels[key] || summary.channels || [],
      totalContacts: summary.totalContacts || 0,
      lastContacted: summary.lastContacted || manual?.lastContacted || null,
      manuallyMarked: manual?.contacted || false
    };
  }, [lastSent, lastWhatsAppSent, lastSMSSent, lastCallMade, contactedChannels, getContactSummary, manualContactStatus]);

  // ============================================================================
  // HELPER: Check if safe to contact on specific channel
  // ============================================================================
  const isSafeToContactOnChannel = useCallback((contact, channel, minDaysBetween = CONFIG.MIN_DAYS_BETWEEN_CONTACT) => {
    if (!contact) return { safe: true, reason: 'No contact' };

    const key = contact.email || contact.phone;
    if (!key) return { safe: true, reason: 'No contact key' };

    // Check manual override
    if (manualContactStatus[key]?.blocked) {
      return { safe: false, reason: 'Manually blocked' };
    }

    // Use contact tracking hook
    const canContactResult = canContact(key, channel, minDaysBetween);

    return {
      safe: canContactResult.canContact,
      reason: canContactResult.reason,
      daysSince: canContactResult.daysSince,
      lastContact: canContactResult.lastContact
    };
  }, [canContact, manualContactStatus]);

  // ============================================================================
  // HELPER: Check if phone is a 077 priority number (formatted as 9477...)
  // ============================================================================
  const isPriorityPhone = useCallback((phone) => {
    if (!phone) return false;
    const cleaned = phone.toString().replace(/\D/g, '');
    return cleaned.startsWith('9477') || cleaned.startsWith('9476') || cleaned.startsWith('9475');
  }, []);

  // ============================================================================
  // HELPER: Get recommended channel based on engagement
  // ============================================================================
  const getRecommendedChannel = useCallback((contact) => {
    if (!contact) return 'email';

    const history = getContactHistory(contact);
    const key = contact.email || contact.phone;
    const canContactEmail = isSafeToContactOnChannel(contact, 'email');
    const canContactWhatsApp = isSafeToContactOnChannel(contact, 'whatsapp');
    const canContactSMS = isSafeToContactOnChannel(contact, 'sms');
    const canContactCall = isSafeToContactOnChannel(contact, 'call');

    const scores = {
      email: contact.email && canContactEmail.safe ? (leadScores[key] || 50) : 0,
      whatsapp: contact.phone && canContactWhatsApp.safe ? 60 : 0,
      sms: contact.phone && canContactSMS.safe ? 50 : 0,
      call: contact.phone && canContactCall.safe ? 70 : 0
    };

    // Boost channels that haven't been used yet
    if (!history.email) scores.email += 20;
    if (!history.whatsapp) scores.whatsapp += 20;
    if (!history.sms) scores.sms += 20;
    if (!history.call) scores.call += 20;

    // Reduce score for recently used channels
    Object.keys(scores).forEach(channel => {
      if (history[channel]) {
        const daysSince = (new Date() - history[channel]) / (1000 * 60 * 60 * 24);
        if (daysSince < 3) scores[channel] -= 30;
      }
    });

    const bestChannel = Object.entries(scores)
      .filter(([channel]) => channel === 'email' ? contact.email : contact.phone)
      .sort((a, b) => b[1] - a[1])[0];

    return bestChannel ? bestChannel[0] : 'email';
  }, [leadScores, getContactHistory, isSafeToContactOnChannel]);

  // ============================================================================
  // HELPER: Mark contact as manually contacted/not contacted
  // ============================================================================
  const markContactManually = useCallback(async (contact, contacted, reason = '') => {
    if (!contact) {
      addNotification('❌ Invalid contact provided', 'error');
      return false;
    }

    const key = normalizeContactKey(contact);
    if (!key) {
      addNotification('❌ Contact must have email or phone', 'error');
      return false;
    }

    // Validate Firebase initialization
    if (!user?.uid) {
      addNotification('❌ User not authenticated. Please log in again.', 'error');
      return false;
    }

    if (!db) {
      console.error('Firebase database not initialized');
      addNotification('❌ Database connection error. Please refresh and try again.', 'error');
      return false;
    }

    try {
      const now = new Date().toISOString();
      const status = {
        contacted,
        lastContacted: contacted ? now : null,
        reason,
        updatedAt: now,
        manual: true
      };

      setManualContactStatus(prev => ({
        ...prev,
        [key]: status
      }));

      // Save to Firebase
      try {
        const docRef = doc(db, 'manual_contact_status', `${user.uid}_${key}`);
        await setDoc(docRef, {
          userId: user.uid,
          contactKey: key,
          ...status
        }, { merge: true });
      } catch (firebaseError) {
        console.error('Firebase setDoc error in markContactManually:', firebaseError);
        throw new Error(`Firebase save failed: ${firebaseError.message}`);
      }

      // Also update contact history if marked as contacted
      if (contacted) {
        try {
          await updateContact(key, 'manual', { manuallyMarked: true });
        } catch (updateError) {
          console.warn('Failed to update contact history:', updateError);
          // Don't fail completely if history update fails - status was already saved
        }
      }

      addNotification(
        contacted ? `✅ Marked ${contact.business || key} as contacted` : `🔄 Marked ${contact.business || key} as not contacted`,
        'success'
      );

      return true;
    } catch (error) {
      console.error('Mark contact manually error:', error);
      console.error('Error details:', {
        errorMessage: error?.message,
        errorCode: error?.code,
        contact: key,
        user: user?.uid
      });
      addNotification(`❌ Failed to update contact status: ${error?.message || 'Unknown error'}`, 'error');
      return false;
    }
  }, [user?.uid, db, updateContact, addNotification]);

  // ============================================================================
  // ✅ GET SAFE FOLLOW-UP CANDIDATES (DEFINED BEFORE JSX)
  // ============================================================================
  const getSafeFollowUpCandidates = useCallback(() => {
    if (!sentLeads || sentLeads.length === 0) {
      return [];
    }

    const now = currentTime;

    const candidates = sentLeads
      .map(normalizeSentLead)
      .filter(lead => {
        if (!lead || !lead.email) return false;
        if (lead.replied) return false;

        const followUpAt = getLeadNextFollowUpAt(lead);
        if (!followUpAt) return false;
        if (followUpAt > now) return false;

        const followUpCount = lead.followUpCount ?? lead.followUpSentCount ?? 0;
        if (followUpCount >= 3) return false;

        return true;
      })
      .map(lead => {
        const followUpCount = lead.followUpCount ?? lead.followUpSentCount ?? 0;
        const sentAtDate = safeParseDate(lead.sentAt);
        const daysSinceSent = sentAtDate ?
          (now - sentAtDate) / (1000 * 60 * 60 * 24) : 999;
        return {
          ...lead,
          followUpAt: getLeadNextFollowUpAt(lead)?.toISOString() || lead.followUpAt,
          followUpCount,
          daysSinceSent,
          urgencyScore: 100 - (daysSinceSent * 2),
          safetyScore: Math.max(0, (3 - followUpCount) * 33.33)
        };
      })
      .sort((a, b) => b.urgencyScore - a.urgencyScore);

    return candidates;
  }, [sentLeads, followUpHistory, normalizeSentLead, getLeadNextFollowUpAt, currentTime]);

  // Memoize the result to prevent recalculation on every render
  const safeFollowUpCandidates = useMemo(() => getSafeFollowUpCandidates(), [getSafeFollowUpCandidates, currentTime]);

  // Get pending leads (un-replied but not yet ready for follow-up)
  const getPendingLeads = useCallback(() => {
    if (!sentLeads || sentLeads.length === 0) {
      return [];
    }

    const now = currentTime;
    const pending = sentLeads
      .map(normalizeSentLead)
      .filter(lead => {
        if (!lead || !lead.email) return false;
        if (lead.replied) return false;

        const followUpAt = getLeadNextFollowUpAt(lead);
        if (!followUpAt) return false;

        // Include if follow-up is in the future (not ready yet)
        return followUpAt > now;
      })
      .map(lead => {
        const followUpAt = getLeadNextFollowUpAt(lead);
        const sentAtDate = safeParseDate(lead.sentAt);
        const daysSinceSent = sentAtDate ?
          (now - sentAtDate) / (1000 * 60 * 60 * 24) : 999;
        const timeUntilFollowUp = followUpAt ? (followUpAt - now) : 0;
        const hoursUntilFollowUp = Math.floor(timeUntilFollowUp / (1000 * 60 * 60));
        const minutesUntilFollowUp = Math.floor((timeUntilFollowUp % (1000 * 60 * 60)) / (1000 * 60));
        const secondsUntilFollowUp = Math.floor((timeUntilFollowUp % (1000 * 60)) / 1000);
        return {
          ...lead,
          followUpAt: followUpAt?.toISOString() || lead.followUpAt,
          daysSinceSent,
          hoursUntilFollowUp,
          minutesUntilFollowUp,
          secondsUntilFollowUp,
          timeUntilFollowUp
        };
      })
      .sort((a, b) => a.timeUntilFollowUp - b.timeUntilFollowUp);

    return pending;
  }, [sentLeads, normalizeSentLead, getLeadNextFollowUpAt, safeParseDate, currentTime]);

  const pendingLeads = useMemo(() => getPendingLeads(), [getPendingLeads, currentTime]);

  // Get replied leads with details
  const getRepliedLeads = useCallback(() => {
    if (!sentLeads || sentLeads.length === 0) {
      return [];
    }

    const now = new Date();
    const replied = sentLeads
      .map(normalizeSentLead)
      .filter(lead => {
        if (!lead || !lead.email) return false;
        return lead.replied === true;
      })
      .map(lead => {
        const sentAtDate = safeParseDate(lead.sentAt);
        const daysSinceSent = sentAtDate ?
          (now - sentAtDate) / (1000 * 60 * 60 * 24) : 999;
        const repliedAtDate = safeParseDate(lead.repliedAt);
        const daysSinceReply = repliedAtDate ?
          (now - repliedAtDate) / (1000 * 60 * 60 * 24) : 0;
        return {
          ...lead,
          daysSinceSent,
          daysSinceReply,
          repliedAt: lead.repliedAt || lead.sentAt,
          isHotLead: daysSinceReply <= 7 // Hot if replied within 7 days
        };
      })
      .sort((a, b) => {
        // Sort by most recent reply first
        const dateA = new Date(a.repliedAt || a.sentAt);
        const dateB = new Date(b.repliedAt || b.sentAt);
        return dateB - dateA;
      });

    return replied;
  }, [sentLeads, normalizeSentLead, safeParseDate]);

  const repliedLeadsList = useMemo(() => getRepliedLeads(), [getRepliedLeads]);

  // ============================================================================
  // ✅ HANDLE SEND BULK SMS (DEFINED BEFORE JSX - FIXES REFERENCE ERROR)
  // ============================================================================
  const handleSendBulkSMS = useCallback(async () => {
    if (!user?.uid || whatsappLinks.length === 0) {
      addNotification('No contacts available', 'error');
      return;
    }

    const quotaCheck = canUse('sms', whatsappLinks.length);
    if (!quotaCheck.available) {
      addNotification(`⚠️ ${quotaCheck.reason}`, 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Send SMS to ${whatsappLinks.length} contacts?\n\nThis will use ${whatsappLinks.length} of your daily SMS quota.`
    );

    if (!confirmed) return;

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    setStatus('📤 Sending SMS batch...');
    setStatusType('info');
    setIsSending(true);
    setSendProgress({ current: 0, total: whatsappLinks.length });

    for (let i = 0; i < whatsappLinks.length; i++) {
      const contact = whatsappLinks[i];
      const phone = formatForDialing(contact.phone);

      if (!phone) {
        skipCount++;
        continue;
      }

      const contactKey = contact.email || contact.phone;

      // Check if already contacted recently
      const safetyCheck = isSafeToContactOnChannel(contact, 'sms');
      if (!safetyCheck.safe) {
        skipCount++;
        continue;
      }

      try {
        const message = renderPreviewText(
          smsTemplate,
          {
            business_name: contact.business,
            address: contact.address || '',
            phone_raw: contact.phone
          },
          fieldMappings,
          senderName
        );

        const response = await fetch('/api/send-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone,
            message,
            businessName: contact.business,
            userId: user.uid
          })
        });

        if (response.ok) {
          successCount++;

          const now = new Date().toISOString();
          setLastSMSSent(prev => ({ ...prev, [contactKey]: now }));
          setContactedChannels(prev => ({
            ...prev,
            [contactKey]: [...(prev[contactKey] || []), 'sms']
          }));

          await updateContact(contactKey, 'sms', {
            smsCount: increment(1),
            lastSMSSent: now
          });

          if (dealStage[contactKey] === 'new' || !dealStage[contactKey]) {
            updateDealStage(contactKey, 'contacted');
          }
        } else {
          failCount++;
        }

        setSendProgress({ current: i + 1, total: whatsappLinks.length });
      } catch (error) {
        console.error(`SMS error for ${contact.business}:`, error);
        failCount++;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
    }

    setIsSending(false);
    setStatus(`✅ SMS batch complete: ${successCount}/${whatsappLinks.length} sent.`);
    setStatusType('success');

    addNotification(
      `SMS batch complete!\nSent: ${successCount}\nFailed: ${failCount}\nSkipped: ${skipCount}`,
      successCount > 0 ? 'success' : 'error'
    );
  }, [user?.uid, whatsappLinks, canUse, smsTemplate, fieldMappings, senderName, isSafeToContactOnChannel, updateContact, dealStage, addNotification]);

  // ============================================================================
  // FILTERED AND SORTED CONTACTS - CONTACTED AT BOTTOM, 077 PRIORITY
  // ============================================================================
  const getFilteredAndSortedContacts = useCallback(() => {
    let filtered = [...whatsappLinks];

    // Apply search
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        (c.business && c.business.toLowerCase().includes(query)) ||
        (c.email && c.email.toLowerCase().includes(query)) ||
        (c.phone && c.phone.includes(query.replace(/\D/g, '')))
      );
    }

    // Apply status filter
    if (contactFilter === 'replied') {
      filtered = filtered.filter(c => repliedLeads[c.email]);
    } else if (contactFilter === 'pending') {
      filtered = filtered.filter(c => !repliedLeads[c.email]);
    } else if (contactFilter === 'high-quality') {
      filtered = filtered.filter(c => (leadScores[c.email] || 0) >= 70);
    } else if (contactFilter === 'contacted') {
      filtered = filtered.filter(c => isContactedOnAnyChannel(c));
    } else if (contactFilter === 'not-contacted') {
      filtered = filtered.filter(c => !isContactedOnAnyChannel(c));
    } else if (contactFilter === 'hot-leads') {
      filtered = filtered.filter(c => (leadScores[c.email] || 0) >= CONFIG.LEAD_SCORE_HOT);
    } else if (contactFilter === 'warm-leads') {
      filtered = filtered.filter(c => {
        const score = leadScores[c.email] || 0;
        return score >= CONFIG.LEAD_SCORE_WARM && score < CONFIG.LEAD_SCORE_HOT;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      const aKey = a.email || a.phone;
      const bKey = b.email || b.phone;

      const aIsContacted = isContactedOnAnyChannel(a);
      const bIsContacted = isContactedOnAnyChannel(b);
      const aIsPriority = isPriorityPhone(a.phone);
      const bIsPriority = isPriorityPhone(b.phone);
      const aScore = leadScores[aKey] || 0;
      const bScore = leadScores[bKey] || 0;

      // Priority 1: Non-contacted first, contacted last
      if (!aIsContacted && bIsContacted) return -1;
      if (aIsContacted && !bIsContacted) return 1;

      // Priority 2: 077/076/075 numbers
      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;

      // Priority 3: Selected sort
      if (sortBy === 'score') {
        return sortOrder === 'desc' ? bScore - aScore : aScore - bScore;
      } else if (sortBy === 'recent') {
        const aDate = new Date(lastSent[aKey] || lastWhatsAppSent[aKey] || 0);
        const bDate = new Date(lastSent[bKey] || lastWhatsAppSent[bKey] || 0);
        return sortOrder === 'desc' ? bDate - aDate : aDate - bDate;
      } else if (sortBy === 'name') {
        const aName = (a.business || '').toLowerCase();
        const bName = (b.business || '').toLowerCase();
        return sortOrder === 'desc'
          ? bName.localeCompare(aName)
          : aName.localeCompare(bName);
      } else if (sortBy === 'added') {
        return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
      }

      return 0;
    });

    return filtered;
  }, [
    whatsappLinks,
    debouncedSearchQuery,
    contactFilter,
    sortBy,
    sortOrder,
    leadScores,
    lastSent,
    lastWhatsAppSent,
    repliedLeads,
    isContactedOnAnyChannel,
    isPriorityPhone
  ]);

  // ============================================================================
  // PAGINATED CONTACTS
  // ============================================================================
  const paginatedContacts = useMemo(() => {
    const filtered = getFilteredAndSortedContacts();
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      contacts: filtered.slice(startIndex, endIndex),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / itemsPerPage),
      currentPage,
      itemsPerPage
    };
  }, [getFilteredAndSortedContacts, currentPage, itemsPerPage]);

  // ============================================================================
  // PREPARE SORTED CONTACTS FOR MAIN OUTREACH LIST
  // ============================================================================
  const sortedWhatsappLinks = useMemo(() => {
    if (!whatsappLinks || whatsappLinks.length === 0) return [];

    return [...whatsappLinks].sort((a, b) => {
      const aKey = a.email || a.phone;
      const bKey = b.email || b.phone;

      const aIsContacted = isContactedOnAnyChannel(a);
      const bIsContacted = isContactedOnAnyChannel(b);
      const aIsPriority = isPriorityPhone(a.phone);
      const bIsPriority = isPriorityPhone(b.phone);
      const aScore = leadScores[aKey] || 0;
      const bScore = leadScores[bKey] || 0;

      // 1. Non-contacted first, contacted last
      if (!aIsContacted && bIsContacted) return -1;
      if (aIsContacted && !bIsContacted) return 1;

      // 2. Then 077/076/075 priority
      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;

      // 3. Fallback to score ranking
      return bScore - aScore;
    });
  }, [whatsappLinks, leadScores, isContactedOnAnyChannel, isPriorityPhone]);

  // ============================================================================
  // CALCULATE CONVERSION FUNNEL
  // ============================================================================
  const calculateConversionFunnel = useCallback(() => {
    const total = whatsappLinks.length;
    const replied = Object.values(repliedLeads).filter(Boolean).length;
    const contacted = whatsappLinks.filter(c => isContactedOnAnyChannel(c)).length;

    const stages = {
      total,
      contacted,
      replied,
      demo: Math.round(replied * 0.40),
      closed: Math.round(replied * 0.15)
    };

    return {
      stages,
      conversionRate: {
        contactRate: total > 0 ? Math.round((contacted / total) * 100) : 0,
        replyRate: contacted > 0 ? Math.round((replied / contacted) * 100) : 0,
        demoRate: replied > 0 ? Math.round((stages.demo / replied) * 100) : 0,
        closeRate: stages.demo > 0 ? Math.round((stages.closed / stages.demo) * 100) : 0
      }
    };
  }, [whatsappLinks, repliedLeads, isContactedOnAnyChannel]);

  // ============================================================================
  // CALCULATE REVENUE FORECASTS
  // ============================================================================
  const calculateRevenueForecasts = useCallback(() => {
    const avgDealValue = CONFIG.DEFAULT_AVG_DEAL_VALUE;
    const replies = Object.values(repliedLeads).filter(Boolean).length;
    const demoOpportunities = Math.ceil(replies * CONFIG.DEFAULT_DEMO_RATE);
    const expectedClosures = Math.ceil(demoOpportunities * CONFIG.DEFAULT_CLOSE_RATE);

    return {
      currentPipeline: replies * avgDealValue,
      demoOpportunities: demoOpportunities * avgDealValue,
      expectedMonthlyRevenue: expectedClosures * avgDealValue,
      expectedQuarterlyRevenue: expectedClosures * avgDealValue * 3,
      successMetrics: {
        replies,
        demoOpportunities,
        expectedClosures,
        expectedAnnualRunRate: expectedClosures * avgDealValue * 12
      }
    };
  }, [repliedLeads]);

  // ============================================================================
  // SEGMENT LEADS
  // ============================================================================
  const segmentLeads = useCallback(() => {
    const segments = {
      veryHot: [],
      hot: [],
      warm: [],
      cold: [],
      inactive: []
    };

    whatsappLinks.forEach(contact => {
      const key = contact.email || contact.phone;
      const score = leadScores[key] || 0;
      const replied = repliedLeads[contact.email];
      const contacted = isContactedOnAnyChannel(contact);
      const daysSinceContact = contacted ?
        daysBetween(getContactHistory(contact).lastContacted, new Date()) : 999;

      if (replied) {
        segments.veryHot.push(contact);
      } else if (score >= CONFIG.LEAD_SCORE_HOT) {
        segments.hot.push(contact);
      } else if (score >= CONFIG.LEAD_SCORE_WARM && daysSinceContact <= 3) {
        segments.warm.push(contact);
      } else if (score >= 40 && daysSinceContact <= 7) {
        segments.cold.push(contact);
      } else {
        segments.inactive.push(contact);
      }
    });

    return segments;
  }, [whatsappLinks, leadScores, repliedLeads, isContactedOnAnyChannel, getContactHistory]);

  // ============================================================================
  // GET NEW LEADS (NOT YET EMAILED)
  // ============================================================================
  const getNewLeads = useCallback(() => {
    if (!whatsappLinks || whatsappLinks.length === 0) return [];

    const sentEmailsSet = new Set();
    sentLeads.forEach(lead => {
      if (lead.email) {
        sentEmailsSet.add(lead.email.toLowerCase().trim());
      }
    });

    // Filter new leads
    const newLeads = whatsappLinks
      .filter(contact => {
        if (!contact.email) return false;
        const email = contact.email.toLowerCase().trim();
        return !sentEmailsSet.has(email);
      })
      .map(contact => ({
        ...contact,
        email: contact.email.toLowerCase().trim()
      }));

    // Group by rowGroupId to send multiple emails from same row with delays
    const groupedLeads = [];
    const processedGroups = new Set();

    newLeads.forEach(lead => {
      if (lead.rowGroupId && !processedGroups.has(lead.rowGroupId)) {
        // Get all leads from this group
        const groupLeads = newLeads.filter(l => l.rowGroupId === lead.rowGroupId);
        if (groupLeads.length > 1) {
          // Multiple emails from same row - add all as individual emails with delay metadata
          groupLeads.forEach((groupLead, index) => {
            groupedLeads.push({
              ...groupLead,
              isFromMultiEmailRow: true,
              emailIndex: index,
              totalEmailsInRow: groupLeads.length,
              delayBeforeSend: index * 5000 // 5 second delay between each email from same row
            });
          });
          processedGroups.add(lead.rowGroupId);
        } else {
          // Single email - add as normal
          groupedLeads.push(lead);
          processedGroups.add(lead.rowGroupId);
        }
      } else if (!lead.rowGroupId) {
        // No row group - add as normal (backward compatibility)
        groupedLeads.push(lead);
      }
    });

    return groupedLeads.sort((a, b) => {
      const scoreA = leadScores[a.email] || 50;
      const scoreB = leadScores[b.email] || 50;
      return scoreB - scoreA;
    });
  }, [whatsappLinks, sentLeads, leadScores]);

  const getNewLeadsDisabledReason = useCallback(() => {
    if (!csvContent) return 'Upload a CSV to start outreach.';
    if (dailyEmailCount >= CONFIG.MAX_DAILY_EMAILS) {
      return `Daily email limit reached (${dailyEmailCount}/${CONFIG.MAX_DAILY_EMAILS}).`;
    }
    const newLeads = getNewLeads();
    if (newLeads.length === 0) {
      return 'No new leads to email. All contacts were already emailed or are excluded by filters.';
    }
    if (isSending) return 'Email send in progress. Wait for completion.';
    return '';
  }, [csvContent, dailyEmailCount, getNewLeads, isSending]);

  const getSafeFollowUpDisabledReason = useCallback(() => {
    if (isSending) return 'Send in progress. Please wait.';
    if (!safeFollowUpCandidates || safeFollowUpCandidates.length === 0) {
      return 'No safe follow-up candidates available (replied or maximum follow-ups reached).';
    }
    return '';
  }, [safeFollowUpCandidates, isSending]);

  const getSendEmailsDisabledReason = useCallback(() => {
    if (!csvContent) return 'Upload a CSV before sending emails.';
    if (validEmails === 0) return 'No valid email recipients. Already sent or invalid email list.';
    if (dailyEmailCount >= CONFIG.MAX_DAILY_EMAILS) return `Daily email limit reached (${dailyEmailCount}/${CONFIG.MAX_DAILY_EMAILS}).`;
    if (isSending) return 'Email sending in progress.';
    return '';
  }, [csvContent, validEmails, dailyEmailCount, isSending]);

  const newLeads = useMemo(() => getNewLeads(), [getNewLeads]);
  const newLeadsDisabledReason = useMemo(() => getNewLeadsDisabledReason(), [getNewLeadsDisabledReason]);
  const sendEmailsDisabledReason = useMemo(() => getSendEmailsDisabledReason(), [getSendEmailsDisabledReason]);
  const safeFollowUpDisabledReason = useMemo(() => getSafeFollowUpDisabledReason(), [getSafeFollowUpDisabledReason]);

  // ============================================================================
  // GOOGLE OAUTH SCRIPT LOADER
  // ============================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.google?.accounts?.oauth2?.initTokenClient) {
      setIsGoogleLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setIsGoogleLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Google OAuth script');
      addNotification('Failed to load Google OAuth. Please refresh.', 'error');
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [addNotification]);

  // ============================================================================
  // AUTH STATE LISTENER
  // ============================================================================
  useEffect(() => {
    if (!auth) {
      setLoadingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
        setSenderEmail(user.email || '');
        if (!senderName.trim()) {
          setSenderName(user.displayName || '');
        }
        loadSettings(user.uid);
        loadClickStats();
        loadDeals();
        loadAbResults();
        loadRepliedAndFollowUp();
        loadSentLeads();
        loadDailyEmailCount();
        loadSendTimeOptimization();
        loadManualContactStatus(user.uid);
        addNotification(`Welcome back, ${user.displayName || user.email}!`, 'success', 3000);
      } else {
        setUser(null);
        setSenderEmail('');
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, [auth, addNotification]);

  // ============================================================================
  // REAL-TIME COUNTDOWN TIMER FOR FOLLOW-UP UNLOCK TIMES
  // ============================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // CACHE STATS MONITORING (Log every 5 minutes)
  // ============================================================================
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/cache-stats');
          if (res.ok) {
            const data = await res.json();
            console.log('[Cache Stats]', data.stats);
          }
        } catch (error) {
          console.warn('Failed to fetch cache stats:', error);
        }
      }, 5 * 60 * 1000); // Every 5 minutes

      return () => clearInterval(interval);
    }
  }, []);

  // ============================================================================
  // LOAD MANUAL CONTACT STATUS FROM FIREBASE
  // ============================================================================
  const loadManualContactStatus = async (userId) => {
    if (!userId || !db) return;

    try {
      const q = query(
        collection(db, 'manual_contact_status'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);

      const status = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        const key = normalizeContactKey(data.contactKey || data.email || data.phone || data.phone_primary || data.phone_number);
        if (key) {
          status[key] = data;
        }
      });

      setManualContactStatus(status);
    } catch (error) {
      console.error('Load manual contact status error:', error);
    }
  };

  // ============================================================================
  // AUTO-SAVE SETTINGS WITH LOCALSTORAGE CACHING
  // ============================================================================
  const saveSettings = useCallback(async () => {
    if (!user?.uid || !db || !userPreferences.autoSaveEnabled) return;

    try {
      const docRef = doc(db, 'users', user.uid, 'settings', 'templates');
      await setDoc(docRef, {
        senderName,
        senderEmail,
        templateA,
        templateB,
        whatsappTemplate,
        smsTemplate,
        instagramTemplate,
        twitterTemplate,
        linkedinTemplate,
        followUpTemplates,
        fieldMappings,
        abTestMode,
        smsConsent,
        userPreferences,
        lastSaved: new Date().toISOString()
      }, { merge: true });

      // Also save to localStorage for persistence
      const settingsToCache = {
        senderName,
        senderEmail,
        templateA,
        templateB,
        whatsappTemplate,
        smsTemplate,
        instagramTemplate,
        twitterTemplate,
        linkedinTemplate,
        followUpTemplates,
        fieldMappings,
        abTestMode,
        smsConsent,
        userPreferences,
        cachedAt: new Date().toISOString()
      };
      localStorage.setItem(`autoleads_settings_${user.uid}`, JSON.stringify(settingsToCache));

      addNotification('Settings auto-saved', 'success', 2000);
    } catch (error) {
      console.warn('Failed to save settings:', error);
      addNotification('Failed to auto-save settings', 'warning');
    }
  }, [
    user?.uid,
    senderName,
    senderEmail,
    templateA,
    templateB,
    whatsappTemplate,
    smsTemplate,
    instagramTemplate,
    twitterTemplate,
    linkedinTemplate,
    followUpTemplates,
    fieldMappings,
    abTestMode,
    smsConsent,
    userPreferences,
    addNotification
  ]);

  // Debounced auto-save
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveSettings();
    }, CONFIG.AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [saveSettings]);

  // Recalculate validEmails when leadQualityFilter changes
  useEffect(() => {
    if (!csvContent) return;

    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return;

    const headers = parseCsvRow(lines[0]).map(h => h.trim());
    let hotEmails = 0;
    let warmEmails = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvRow(lines[i]);

      if (values.length !== headers.length) continue;

      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.toString().trim() || '';
      });

      const emailCol = fieldMappings.email || 'email';
      const email = row[emailCol] || '';

      if (isValidEmail(email)) {
        const qualityCol = fieldMappings.lead_quality || 'lead_quality';
        const quality = (row[qualityCol] || '').trim().toUpperCase() || 'HOT';

        if (quality === 'HOT') {
          hotEmails++;
        } else if (quality === 'WARM') {
          warmEmails++;
        }
      }
    }

    if (leadQualityFilter === 'HOT') {
      setValidEmails(hotEmails);
    } else if (leadQualityFilter === 'WARM') {
      setValidEmails(warmEmails);
    } else {
      setValidEmails(hotEmails + warmEmails);
    }
  }, [leadQualityFilter, csvContent, fieldMappings]);

  // ============================================================================
  // LOAD SETTINGS FROM FIREBASE WITH LOCALSTORAGE CACHING
  // ============================================================================
  const loadSettings = async (userId) => {
    if (!userId) return;

    // Try to load from localStorage cache first
    const cachedSettings = localStorage.getItem(`autoleads_settings_${userId}`);
    if (cachedSettings) {
      try {
        const cached = JSON.parse(cachedSettings);
        setSenderName(cached.senderName || '');
        setSenderEmail(cached.senderEmail || '');
        setTemplateA(cached.templateA || DEFAULT_TEMPLATE_A);
        setTemplateB(cached.templateB || DEFAULT_TEMPLATE_B);
        setWhatsappTemplate(cached.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE);
        setSmsTemplate(cached.smsTemplate || DEFAULT_SMS_TEMPLATE);
        setInstagramTemplate(cached.instagramTemplate || DEFAULT_INSTAGRAM_TEMPLATE);
        setTwitterTemplate(cached.twitterTemplate || DEFAULT_TWITTER_TEMPLATE);
        setLinkedinTemplate(cached.linkedinTemplate || DEFAULT_LINKEDIN_TEMPLATE);
        setFollowUpTemplates(cached.followUpTemplates || DEFAULT_FOLLOW_UP_TEMPLATES);
        setFieldMappings(cached.fieldMappings || {});
        setAbTestMode(cached.abTestMode || false);
        setSmsConsent(cached.smsConsent !== undefined ? cached.smsConsent : true);
        setUserPreferences(cached.userPreferences || userPreferences);
        console.log('✅ Settings loaded from localStorage cache');
      } catch (e) {
        console.warn('Failed to parse cached settings:', e);
      }
    }

    // Then load from Firebase and update cache
    if (!db) return;

    try {
      const docRef = doc(db, 'users', userId, 'settings', 'templates');
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        setSenderName(data.senderName || '');
        setSenderEmail(data.senderEmail || '');
        setTemplateA(data.templateA || DEFAULT_TEMPLATE_A);
        setTemplateB(data.templateB || DEFAULT_TEMPLATE_B);
        setWhatsappTemplate(data.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE);
        setSmsTemplate(data.smsTemplate || DEFAULT_SMS_TEMPLATE);
        setInstagramTemplate(data.instagramTemplate || DEFAULT_INSTAGRAM_TEMPLATE);
        setTwitterTemplate(data.twitterTemplate || DEFAULT_TWITTER_TEMPLATE);
        setLinkedinTemplate(data.linkedinTemplate || DEFAULT_LINKEDIN_TEMPLATE);
        setFollowUpTemplates(data.followUpTemplates || DEFAULT_FOLLOW_UP_TEMPLATES);
        setFieldMappings(data.fieldMappings || {});
        setAbTestMode(data.abTestMode || false);
        setSmsConsent(data.smsConsent !== undefined ? data.smsConsent : true);
        setUserPreferences(data.userPreferences || userPreferences);

        // Cache to localStorage
        const settingsToCache = {
          senderName: data.senderName || '',
          senderEmail: data.senderEmail || '',
          templateA: data.templateA || DEFAULT_TEMPLATE_A,
          templateB: data.templateB || DEFAULT_TEMPLATE_B,
          whatsappTemplate: data.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
          smsTemplate: data.smsTemplate || DEFAULT_SMS_TEMPLATE,
          instagramTemplate: data.instagramTemplate || DEFAULT_INSTAGRAM_TEMPLATE,
          twitterTemplate: data.twitterTemplate || DEFAULT_TWITTER_TEMPLATE,
          linkedinTemplate: data.linkedinTemplate || DEFAULT_LINKEDIN_TEMPLATE,
          followUpTemplates: data.followUpTemplates || DEFAULT_FOLLOW_UP_TEMPLATES,
          fieldMappings: data.fieldMappings || {},
          abTestMode: data.abTestMode || false,
          smsConsent: data.smsConsent !== undefined ? data.smsConsent : true,
          userPreferences: data.userPreferences || userPreferences,
          cachedAt: new Date().toISOString()
        };
        localStorage.setItem(`autoleads_settings_${userId}`, JSON.stringify(settingsToCache));

        addNotification('Settings loaded successfully', 'success', 2000);
      }
    } catch (error) {
      console.warn('Failed to load settings from Firebase:', error);
      if (!cachedSettings) {
        addNotification('Using default settings', 'info', 2000);
      }
    }
  };

  // ============================================================================
  // LOAD CLICK STATS FROM FIREBASE
  // ============================================================================
  const loadClickStats = useCallback(async () => {
    if (!user?.uid || !db) return;

    try {
      const q = query(collection(db, 'clicks'), where('userId', '==', user.uid), limit(100));
      const snapshot = await getDocs(q);

      const stats = {};
      snapshot.forEach(doc => {
        stats[doc.id] = doc.data();
      });

      setClickStats(stats);
    } catch (e) {
      console.warn('Click stats load failed:', e);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD A/B TEST RESULTS FROM FIREBASE
  // ============================================================================
  const loadAbResults = useCallback(async () => {
    if (!user?.uid || !db) return;

    try {
      const q = query(collection(db, 'ab_results'), where('userId', '==', user.uid), limit(50));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        setAbResults(snapshot.docs[0].data());
      }
    } catch (e) {
      console.warn('AB results load failed:', e);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD DEALS FROM FIREBASE
  // ============================================================================
  const loadDeals = useCallback(async () => {
    if (!user?.uid || !db) return;

    try {
      const q = query(collection(db, 'deals'), where('userId', '==', user.uid), limit(100));
      const snapshot = await getDocs(q);

      const stages = {};
      let totalValue = 0;

      snapshot.forEach(doc => {
        const data = doc.data();
        stages[data.email] = data.stage || 'new';
        if (data.stage !== 'won') {
          totalValue += CONFIG.DEFAULT_AVG_DEAL_VALUE;
        }
      });

      setDealStage(stages);
      setPipelineValue(totalValue);
    } catch (e) {
      console.warn('Deals load failed:', e);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD REPLIED LEADS AND FOLLOW-UP FROM FIREBASE
  // ============================================================================
  const loadRepliedAndFollowUp = useCallback(async () => {
    if (!user?.uid || !db) return;

    try {
      const q = query(collection(db, 'sent_emails'), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);

      const repliedMap = {};
      const followUpMap = {};
      const history = {};
      const now = new Date();

      const normalizedLeads = snapshot.docs
        .map(doc => normalizeSentLead(doc.data()))
        .filter(lead => lead.email);

      normalizedLeads.forEach((data) => {
        if (data.replied) {
          repliedMap[data.email] = true;
        }

        const followUpAt = getLeadNextFollowUpAt(data);
        if (followUpAt && followUpAt <= now) {
          followUpMap[data.email] = true;
        }

        history[data.email] = {
          count: Number(data.followUpCount ?? 0),
          lastFollowUpAt: data.lastFollowUpAt ?? null,
          dates: data.followUpDates || []
        };
      });

      setRepliedLeads(repliedMap);
      setFollowUpLeads(followUpMap);
      setFollowUpHistory(history);

      // Calculate follow-up stats
      const replied = normalizedLeads.filter(l => l.replied).length;
      const followedUp = normalizedLeads.filter(l => Number(l.followUpCount) > 0).length;
      const readyForFU = normalizedLeads.filter(l => {
        const followUpAt = getLeadNextFollowUpAt(l);
        return !l.replied && followUpAt && followUpAt <= now;
      }).length;
      const awaiting = normalizedLeads.filter(l => {
        const followUpAt = getLeadNextFollowUpAt(l);
        return !l.replied && (!followUpAt || followUpAt > now);
      }).length;
      const interested = normalizedLeads.filter(l => l.seemsInterested && !l.replied).length;

      setFollowUpStats({
        totalSent: normalizedLeads.length,
        totalReplied: replied,
        readyForFollowUp: readyForFU,
        alreadyFollowedUp: followedUp,
        awaitingReply: awaiting,
        interestedLeads: interested
      });
    } catch (e) {
      console.warn('Replied/Follow-up load failed:', e);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD DAILY EMAIL COUNT FROM API WITH ERROR HANDLING
  // ============================================================================

  // ============================================================================
  // REPLY CHECKING - MANUAL ONLY TO AVOID INITIALIZATION ISSUES
  // ============================================================================
  const checkForReplies = async () => {
    if (!user?.uid) return;

    try {
      const accessToken = await requestGmailToken();
      if (!accessToken) return;

      const res = await fetch('/api/check-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          accessToken,
          senderEmail
        })
      });

      if (res.ok) {
        const responseData = await res.json();
        if (responseData.replyCount > 0) {
          addNotification(`📬 Detected ${responseData.replyCount} new reply/replies!`, 'success', 5000);
          await loadRepliedAndFollowUp();
        }
      }
    } catch (error) {
      console.error('Error checking for replies:', error);
      addNotification('Failed to check for replies', 'error');
    }
  };

  // ============================================================================
  // LOAD DAILY EMAIL COUNT FROM API WITH ERROR HANDLING
  // ============================================================================
  const loadDailyEmailCount = useCallback(async () => {
    if (!user?.uid) return;

    setLoadingDailyCount(true);

    try {
      const res = await fetch('/api/get-daily-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });

      // Handle 404 gracefully
      if (res.status === 404) {
        console.warn('Daily count API not found, using local state');
        setDailyEmailCount(0);
        setDailyWhatsAppCount(0);
        setDailySMSCount(0);
        setDailyCallCount(0);
        setLoadingDailyCount(false);
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setDailyEmailCount(data.count || 0);
        setDailyWhatsAppCount(data.whatsappCount || 0);
        setDailySMSCount(data.smsCount || 0);
        setDailyCallCount(data.callCount || 0);
      }
    } catch (err) {
      console.error('Load daily count error:', err);
      // Fallback to 0
      setDailyEmailCount(0);
      setDailyWhatsAppCount(0);
      setDailySMSCount(0);
      setDailyCallCount(0);
    } finally {
      setLoadingDailyCount(false);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD SEND TIME OPTIMIZATION FROM API
  // ============================================================================
  const loadSendTimeOptimization = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const res = await fetch('/api/ai-send-time-optimizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });

      const data = await res.json();

      if (res.ok) {
        setSendTimeOptimization(data);
      }
    } catch (err) {
      console.error('Send time optimization error:', err);
    }
  }, [user?.uid]);

  // ============================================================================
  // LOAD SENT LEADS FROM API WITH ERROR HANDLING
  // ============================================================================
  const loadSentLeads = useCallback(async () => {
    if (!user?.uid) return;

    setLoadingSentLeads(true);

    try {
      const res = await fetch('/api/list-sent-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });

      // Handle 404 gracefully
      if (res.status === 404) {
        setSentLeads([]);
        setFollowUpStats({
          totalSent: 0,
          totalReplied: 0,
          readyForFollowUp: 0,
          alreadyFollowedUp: 0,
          awaitingReply: 0,
          interestedLeads: 0
        });
        setLoadingSentLeads(false);
        return;
      }

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }

      const data = await res.json();

      if (res.ok) {
        const normalizedLeads = (data.leads || [])
          .map(normalizeSentLead)
          .filter(lead => lead.email);

        setSentLeads(normalizedLeads);

        const history = {};
        let replied = 0;
        let followedUp = 0;
        let readyForFU = 0;
        let awaiting = 0;
        const now = new Date();

        normalizedLeads.forEach(lead => {
          if (lead.replied) {
            replied++;
          }

          const followUpCount = Number(lead.followUpCount ?? 0);
          if (followUpCount > 0) {
            followedUp++;
          }

          history[lead.email] = {
            count: followUpCount,
            lastFollowUpAt: lead.lastFollowUpAt ?? null,
            dates: lead.followUpDates || []
          };

          const followUpAt = getLeadNextFollowUpAt(lead);
          if (lead.replied) {
            // Already replied, no follow-up needed
          } else if (followUpAt && followUpAt <= now) {
            readyForFU++;
          } else if (!lead.replied) {
            awaiting++;
          }
        });

        const interested = normalizedLeads.filter(lead =>
          lead.seemsInterested && !lead.replied
        );

        setInterestedLeadsList(interested);
        setFollowUpHistory(history);
        setFollowUpStats({
          totalSent: normalizedLeads.length,
          totalReplied: replied,
          readyForFollowUp: readyForFU,
          alreadyFollowedUp: followedUp,
          awaitingReply: awaiting,
          interestedLeads: interested.length
        });
      } else {
        addNotification('Failed to load sent leads', 'error');
      }
    } catch (err) {
      console.error('Load sent leads error:', err);
      setSentLeads([]);
      addNotification('Error loading sent leads', 'error');
    } finally {
      setLoadingSentLeads(false);
    }
  }, [user?.uid, addNotification, normalizeSentLead, getLeadNextFollowUpAt]);

  // ============================================================================
  // LOAD CONTACTED COMPANIES FROM API
  // ============================================================================
  const loadContactedCompanies = async () => {
    if (!user?.uid) return;

    setLoadingContactedCompanies(true);

    try {
      const res = await fetch(`/api/track-company?userId=${user.uid}`);

      if (res.status === 404) {
        console.warn('Company tracking API not found, using empty state');
        setContactedCompanies([]);
        setCompanyStats({
          totalCompanies: 0,
          totalContacts: 0,
          avgContactsPerCompany: 0,
          companiesReplied: 0,
          replyRate: 0
        });
        setLoadingContactedCompanies(false);
        return;
      }

      const data = await res.json();

      if (res.ok) {
        setContactedCompanies(data.companies || []);

        // Calculate stats
        const companies = data.companies || [];
        const totalCompanies = companies.length;
        const totalContacts = companies.reduce((sum, company) => sum + (company.totalContacts || 0), 0);
        const avgContactsPerCompany = totalCompanies > 0 ? (totalContacts / totalCompanies).toFixed(1) : 0;
        const companiesReplied = companies.filter(company => company.hasReplied).length;
        const replyRate = totalCompanies > 0 ? ((companiesReplied / totalCompanies) * 100).toFixed(1) : 0;

        setCompanyStats({
          totalCompanies,
          totalContacts,
          avgContactsPerCompany,
          companiesReplied,
          replyRate
        });
      } else {
        addNotification('Failed to load contacted companies', 'error');
      }
    } catch (err) {
      console.error('Load contacted companies error:', err);
      setContactedCompanies([]);
      addNotification('Error loading contacted companies', 'error');
    } finally {
      setLoadingContactedCompanies(false);
    }
  };

  // ============================================================================
  // REQUEST GMAIL OAUTH TOKEN
  // ============================================================================
  const requestGmailToken = () => {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject('Browser only');
        return;
      }

      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

      if (!clientId) {
        reject('Google Client ID missing');
        return;
      }

      if (!window.google?.accounts?.oauth2) {
        reject('Google OAuth not loaded');
        return;
      }

      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
        callback: (res) => {
          if (res.access_token) {
            resolve(res.access_token);
          } else {
            reject('No access token received');
          }
        },
        error_callback: (err) => {
          reject(err.message || 'OAuth error');
        },
        ...(senderEmail ? { login_hint: senderEmail } : {})
      });

      client.requestAccessToken();
    });
  };

  // ============================================================================
  // DEBUG EMAIL SYSTEM
  // ============================================================================
  const handleDebugSystem = async () => {
    try {
      addNotification('🔍 Running system diagnostics...', 'info');

      const response = await fetch('/api/email-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const data = await response.json();

      if (data.success) {
        const { debugInfo } = data;

        let message = '🔍 System Debug Results:\n\n';

        // Environment status
        message += `Environment Variables:\n`;
        Object.entries(debugInfo.environment.requiredVars).forEach(([key, status]) => {
          message += `  ${key}: ${status}\n`;
        });

        // Dependencies
        message += `\nDependencies:\n`;
        Object.entries(debugInfo.dependencies).forEach(([key, status]) => {
          message += `  ${key}: ${status}\n`;
        });

        // Issues and fixes
        if (debugInfo.issues.length > 0) {
          message += `\n❌ Issues Found:\n`;
          debugInfo.issues.forEach(issue => {
            message += `  • ${issue}\n`;
          });

          message += `\n💡 Recommended Fixes:\n`;
          debugInfo.fixes.forEach(fix => {
            message += `  • ${fix}\n`;
          });
        } else {
          message += '\n✅ No issues found!';
        }

        addNotification(message, debugInfo.issues.length > 0 ? 'warning' : 'success', 10000);
      } else {
        addNotification(`❌ Debug failed: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('Debug error:', error);
      addNotification(`❌ Debug error: ${error.message}`, 'error');
    }
  };

  // ============================================================================
  // UPDATE DEAL STAGE IN FIREBASE
  // ============================================================================
  const updateDealStage = async (email, stage) => {
    if (!user?.uid || !email || !db) return;

    try {
      const dealRef = doc(db, 'deals', email);
      await setDoc(dealRef, {
        userId: user.uid,
        email,
        stage,
        lastUpdate: new Date().toISOString(),
        value: CONFIG.DEFAULT_AVG_DEAL_VALUE
      }, { merge: true });

      setDealStage(prev => ({ ...prev, [email]: stage }));

      if (stage === 'won') {
        setPipelineValue(prev => prev - CONFIG.DEFAULT_AVG_DEAL_VALUE);
        addNotification(`🎉 Deal won: ${email}`, 'success');
      } else if (dealStage[email] === 'won') {
        setPipelineValue(prev => prev + CONFIG.DEFAULT_AVG_DEAL_VALUE);
      }
    } catch (e) {
      console.error('Update deal error:', e);
      addNotification('Failed to update deal stage', 'error');
    }
  };

  // ============================================================================
  // DEBUG FOLLOW-UP FUNCTION
  // ============================================================================
  const testFollowUpSend = useCallback(async () => {
    console.log('🧪 Starting follow-up test...');

    // Test 1: Check basic setup
    console.log('👤 User:', user);
    console.log('📧 Sender Name:', senderName);
    console.log('🔑 Google Client ID:', process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? '✅' : '❌ Missing');

    // Test 2: Check quotas
    console.log('💳 Current quotas:', quotas);
    console.log('📧 Email quota:', quotas.emails);

    // Test 3: Check safe candidates
    console.log('📊 Safe candidates:', safeFollowUpCandidates.length);

    if (safeFollowUpCandidates.length === 0) {
      console.log('❌ No safe candidates found');
      addNotification('No safe candidates available for testing', 'warning');
      return;
    }

    const testCandidate = safeFollowUpCandidates[0];
    console.log('🎯 Test candidate:', testCandidate.email);

    try {
      // Test 4: Request Gmail token
      console.log('🔐 Testing Gmail token request...');
      const accessToken = await requestGmailToken();
      console.log('✅ Gmail token obtained:', accessToken ? 'Success' : 'Failed');

      if (!accessToken) {
        addNotification('❌ Failed to get Gmail token', 'error');
        return;
      }

      // Test 5: Test API call
      console.log('📡 Testing API call to /api/send-followup...');
      const res = await fetch('/api/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCandidate.email,
          accessToken,
          userId: user.uid,
          senderName
        })
      });

      console.log('📬 API Response status:', res.status);
      const data = await res.json();
      console.log('📬 API Response data:', data);

      if (res.ok) {
        addNotification(`✅ Test follow-up sent to ${testCandidate.email}`, 'success');
        // Refresh data after successful test
        await loadSentLeads();
        await loadContactedCompanies();
        await loadRepliedAndFollowUp();
      } else {
        addNotification(`❌ Test failed: ${data.error || 'Unknown error'}`, 'error');
      }

    } catch (error) {
      console.error('💥 Test failed:', error);
      addNotification(`❌ Test error: ${error.message}`, 'error');
    }
  }, [user, senderName, quotas, safeFollowUpCandidates, requestGmailToken, addNotification, loadSentLeads, loadRepliedAndFollowUp]);

  // ============================================================================
  // BYPASS QUOTA TEST (For debugging only)
  // ============================================================================
  const testFollowUpBypassQuota = useCallback(async () => {
    console.log('🚀 Starting bypass quota test...');

    if (safeFollowUpCandidates.length === 0) {
      addNotification('No safe candidates available', 'warning');
      return;
    }

    const testCandidate = safeFollowUpCandidates[0];

    try {
      // Skip quota check
      console.log('⚡ Bypassing quota check...');
      const accessToken = await requestGmailToken();

      const res = await fetch('/api/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCandidate.email,
          accessToken,
          userId: user.uid,
          senderName
        })
      });

      const data = await res.json();

      if (res.ok) {
        addNotification(`✅ Bypass test successful: ${testCandidate.email}`, 'success');
      } else {
        addNotification(`❌ Bypass test failed: ${data.error}`, 'error');
      }

    } catch (error) {
      addNotification(`❌ Bypass test error: ${error.message}`, 'error');
    }
  }, [getSafeFollowUpCandidates, requestGmailToken, user, senderName, addNotification]);

  // ============================================================================
  // SEND FOLLOW-UP WITH GMAIL TOKEN
  // ============================================================================
  const sendFollowUpWithToken = useCallback(async (email, accessToken) => {
    if (!user?.uid || !email || !accessToken) {
      addNotification('Missing required data to send follow-up.', 'error');
      return;
    }

    if (repliedLeads[email]) {
      addNotification(`❌ Cannot send follow-up: ${email} has already replied.`, 'error');
      return;
    }

    const history = followUpHistory[email];
    const followUpCount = history?.count || 0;

    if (followUpCount >= 3) {
      addNotification(`❌ Max follow-ups reached for ${email}`, 'error');
      return;
    }

    try {
      // Use the dedicated follow-up API for proper tracking
      const res = await fetch('/api/send-followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          accessToken,
          userId: user.uid,
          senderName
        })
      });

      const data = await res.json();

      if (res.ok) {
        const isFinalFollowUp = data.followUpCount >= 3;
        addNotification(
          `✅ Follow-up #${data.followUpCount} sent to ${email}` +
          (isFinalFollowUp ? '\n⚠️ Loop closed' : ''),
          'success'
        );

        // Invalidate cache to ensure fresh data
        invalidateCache('sent_emails');
        invalidateCache('replied_followup');

        await loadSentLeads();
        await loadRepliedAndFollowUp();
        await loadDeals();
      } else {
        addNotification(`❌ Follow-up failed: ${data.error}`, 'error');
      }
    } catch (err) {
      console.error('Follow-up send error:', err);
      addNotification(`❌ Error: ${err.message}`, 'error');
    }
  }, [user, repliedLeads, sentLeads, addNotification, loadSentLeads, loadRepliedAndFollowUp, loadDeals]);

  // ============================================================================
  // AI AUTO-REPLY PROCESSOR
  // ============================================================================
  const runAutoReplyProcessor = useCallback(async () => {
    if (!autoReplyProcessorEnabled) {
      setAiProcessorStatus('Disabled');
      addNotification('AI auto-reply processor is disabled', 'warning');
      return;
    }

    if (!user?.uid) {
      addNotification('User not authenticated', 'error');
      return;
    }

    setAiProcessorStatus('Running...');

    try {
      const res = await fetch('/api/auto-reply-processor', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Auto-reply processor failed');
      }

      setAiProcessorStatus(`Done · processed ${data.processed || 0} replies`);
      addNotification('✅ AI auto-reply processor completed', 'success', 4000);

      await loadSentLeads();
      await loadRepliedAndFollowUp();
    } catch (error) {
      setAiProcessorStatus(`Error · ${error.message}`);
      addNotification(`❌ Auto-reply processor error: ${error.message}`, 'error', 6000);
    }
  }, [user, addNotification, loadSentLeads, loadRepliedAndFollowUp]);

  // ============================================================================
  // AI FOLLOWUP SCHEDULER
  // ============================================================================
  const runFollowupScheduler = useCallback(async () => {
    if (!autoFollowupSchedulerEnabled) {
      setFollowupSchedulerStatus('Disabled');
      addNotification('Smart follow-up scheduler is disabled', 'warning');
      return;
    }

    if (!user?.uid) {
      addNotification('User not authenticated', 'error');
      return;
    }

    setFollowupSchedulerStatus('Running...');

    try {
      const res = await fetch('/api/followup-scheduler', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || 'Follow-up scheduler failed');
      }

      setFollowupSchedulerStatus(`Done · processed ${data.processed || 0} followups`);
      addNotification('✅ Smart follow-up scheduler completed', 'success', 4000);

      await loadSentLeads();
      await loadRepliedAndFollowUp();
    } catch (error) {
      setFollowupSchedulerStatus(`Error · ${error.message}`);
      addNotification(`❌ Follow-up scheduler error: ${error.message}`, 'error', 6000);
    }
  }, [user, addNotification, loadSentLeads, loadRepliedAndFollowUp]);

  // ============================================================================
  // MASS EMAIL FOLLOW-UP TO ALL SAFE LEADS
  // ============================================================================
  const handleMassEmailFollowUps = useCallback(async () => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    if (safeFollowUpCandidates.length === 0) {
      addNotification('No safe leads available for follow-up', 'warning');
      return;
    }

    // Check email quota
    const quotaCheck = canUse('email', safeFollowUpCandidates.length);

    if (!quotaCheck.available) {
      addNotification(`⚠️ ${quotaCheck.reason}`, 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Send follow-up emails to ${safeFollowUpCandidates.length} leads?\n\n` +
      `This will use ${safeFollowUpCandidates.length} of your daily email quota.\n\n` +
      `Continue?`
    );

    if (!confirmed) {
      return;
    }

    setIsSending(true);
    setStatus('Sending follow-ups...');
    setSendProgress({ current: 0, total: safeFollowUpCandidates.length });

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;
    const results = [];

    try {
      // Get Gmail token once for all sends
      const accessToken = await requestGmailToken();

      setStatus(`Sending follow-ups to ${safeFollowUpCandidates.length} leads...`);

      // Process leads in batches
      const batchSize = Math.min(10, safeFollowUpCandidates.length);

      for (let i = 0; i < safeFollowUpCandidates.length; i += batchSize) {
        const batch = safeFollowUpCandidates.slice(i, i + batchSize);

        for (const contact of batch) {
          try {
            // Double-check safety before sending
            if (repliedLeads[contact.email]) {
              skipCount++;
              results.push({ email: contact.email, status: 'skipped', reason: 'Already replied' });
              continue;
            }

            const followUpCount = contact.followUpCount || 0;
            if (followUpCount >= 3) {
              skipCount++;
              results.push({ email: contact.email, status: 'skipped', reason: 'Max follow-ups reached' });
              continue;
            }

            // Get Gmail token
            const accessToken = await requestGmailToken();
            if (!accessToken) {
              skipCount++;
              results.push({ email: contact.email, status: 'skipped', reason: 'No access token' });
              continue;
            }

            // Send follow-up using the dedicated follow-up API
            const res = await fetch('/api/send-followup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: contact.email,
                accessToken,
                userId: user.uid,
                senderName
              })
            });

            const data = await res.json();

            if (res.ok) {
              // Check if email was skipped due to duplicate
              if (data.skipped && data.skipped > 0) {
                skipCount++;
                results.push({ email: contact.email, status: 'skipped', reason: 'Already sent' });
                continue;
              }

              successCount++;
              results.push({
                email: contact.email,
                status: 'success',
                followUpCount: data.followUpCount,
                loopClosed: data.followUpCount >= 3
              });

              // Update quota
              incrementQuota('email', 1);

            } else {
              failCount++;
              results.push({ email: contact.email, status: 'failed', reason: data.error || 'API error' });
            }

          } catch (error) {
            failCount++;
            results.push({ email: contact.email, status: 'failed', reason: error.message });
          }

          // Update progress
          const currentProgress = i + batch.indexOf(contact) + 1;
          setSendProgress({ current: currentProgress, total: safeFollowUpCandidates.length });

          // Small delay between sends to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY_MS));
        }

        // Brief pause between batches
        if (i + batchSize < safeFollowUpCandidates.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Refresh data after all sends complete
      // Invalidate cache to ensure fresh data
      invalidateCache('sent_emails');
      invalidateCache('replied_followup');

      await loadSentLeads();
      await loadRepliedAndFollowUp();
      await loadDeals();

      // Show comprehensive results
      const message = `Mass Follow-Up Complete!\n\n` +
        `✅ Success: ${successCount}\n` +
        `❌ Failed: ${failCount}\n` +
        `⏭️ Skipped: ${skipCount}\n` +
        `📈 Total: ${safeFollowUpCandidates.length}\n\n` +
        `Email quota used: ${successCount}/${quotaCheck.limit}`;

      if (failCount > 0) {
        const failedEmails = results.filter(r => r.status === 'failed').slice(0, 3);
        const failedList = failedEmails.map(f => `• ${f.email}: ${f.reason}`).join('\n');
        addNotification(message + `\n\n❌ Failed sends:\n${failedList}${failCount > 3 ? `\n... and ${failCount - 3} more` : ''}`,
          failCount > 0 ? 'warning' : 'success');
      } else {
        addNotification(message, 'success');
      }

    } catch (error) {
      addNotification(`Mass follow-up failed: ${error.message}`, 'error');
    } finally {
      setIsSending(false);
      setSendProgress(null);
      setStatus('');
    }
  }, [
    user,
    addNotification,
    safeFollowUpCandidates,
    canUse,
    requestGmailToken,
    loadSentLeads,
    loadRepliedAndFollowUp,
    loadDeals,
    repliedLeads
  ]);

  // ============================================================================
  // WHATSAPP SEND WITH TRACKING & DUPLICATE PREVENTION
  // ============================================================================
  const handleSendWhatsApp = async (contact) => {
    if (!contact?.phone) {
      addNotification('No phone number for this contact', 'error');
      return;
    }

    const contactKey = contact.email || contact.phone;
    const business = contact.business || 'Contact';

    // Check quota
    const quotaCheck = canUse('whatsapp');
    if (!quotaCheck.available) {
      addNotification(`⚠️ ${quotaCheck.reason}`, 'warning');
      return;
    }

    // Check if safe to contact
    const safetyCheck = isSafeToContactOnChannel(contact, 'whatsapp');
    if (!safetyCheck.safe) {
      const confirmed = window.confirm(
        `⚠️ ${safetyCheck.reason}\n\nSend WhatsApp anyway?`
      );
      if (!confirmed) return;
    }

    try {
      const message = renderPreviewText(
        whatsappTemplate,
        {
          business_name: contact.business,
          address: contact.address || '',
          phone_raw: contact.phone
        },
        fieldMappings,
        senderName
      );

      const formattedPhone = formatForDialing(contact.phone);
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;

      window.open(whatsappUrl, '_blank');

      // Track WhatsApp
      const now = new Date().toISOString();
      setLastWhatsAppSent(prev => ({ ...prev, [contactKey]: now }));
      setContactedChannels(prev => ({
        ...prev,
        [contactKey]: [...(prev[contactKey] || []), 'whatsapp']
      }));

      // Update contact history
      await updateContact(contactKey, 'whatsapp', {
        whatsappCount: increment(1),
        lastWhatsAppSent: now
      });

      // Update quota
      incrementQuota('whatsapp', 1);
      setDailyWhatsAppCount(prev => prev + 1);

      // Update deal stage
      if (dealStage[contactKey] === 'new' || !dealStage[contactKey]) {
        updateDealStage(contactKey, 'contacted');
      }

      addNotification(`✅ WhatsApp opened for ${business}!`, 'success');
    } catch (error) {
      console.error('WhatsApp send error:', error);
      addNotification(`❌ Failed to open WhatsApp: ${error.message}`, 'error');
    }
  };

  // ============================================================================
  // SMS SALES QUALIFICATION
  // ============================================================================
  const handleSMSQualification = async (leads) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    if (!leads || leads.length === 0) {
      addNotification('No leads selected for qualification', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Send qualification SMS to ${leads.length} leads?\n\n` +
      `This will ask for their budget, timeframe, and preferred contact method.\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    setStatus('Sending qualification SMS...');
    setIsSending(true);

    try {
      const response = await fetch('/api/send-sms-qualification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads,
          userId: user.uid
        })
      });

      const data = await response.json();

      if (data.success) {
        addNotification(
          `Qualification SMS sent: ${data.successCount} success, ${data.failCount} failed`,
          data.failCount > 0 ? 'warning' : 'success'
        );
      } else {
        addNotification(`Failed to send qualification SMS: ${data.error}`, 'error');
      }
    } catch (error) {
      addNotification(`SMS qualification error: ${error.message}`, 'error');
    } finally {
      setIsSending(false);
      setStatus('');
    }
  };

  const handleSMSReply = async (phone, response) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    try {
      const res = await fetch('/api/handle-sms-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          response,
          userId: user.uid
        })
      });

      const data = await res.json();

      if (data.success) {
        if (data.qualified) {
          addNotification(`✅ Lead qualified! ${data.summary}`, 'success');
        } else {
          addNotification(`❌ Lead archived: ${data.summary}`, 'warning');
        }
        
        await loadSentLeads();
      } else {
        addNotification(`Failed to handle SMS reply: ${data.error}`, 'error');
      }
    } catch (error) {
      addNotification(`SMS reply error: ${error.message}`, 'error');
    }
  };

  // ============================================================================
  // SMART AI RESEARCH + OUTREACH
  // ============================================================================
  const handleSmartResearchOutreach = useCallback(async (contact) => {
    if (!contact?.business) {
      addNotification('Contact business name is required', 'error');
      return;
    }
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }
    if (!contact?.email) {
      addNotification('Target email is required to send outreach', 'error');
      return;
    }

    setStatusType('info');
    setStatus(`🤖 Running smart outreach on ${contact.business}...`);

    try {
      const response = await fetch('/api/ai-smart-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: contact.business,
          companyWebsite: contact.website || '',
          contactEmail: contact.email,
          contactName: contact.business,
          userId: user.uid,
          senderName,
          senderEmail,
          accessToken: (user?.accessToken || ''),
          refreshToken: (user?.refreshToken || ''),
          sendNow: true
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        const msg = data.error || 'Unknown error';
        addNotification(`❌ Smart outreach failed: ${msg}`, 'error');
        setStatusType('error');
        setStatus(`Error: ${msg}`);
        return;
      }

      addNotification('✅ Smart outreach launched and email sent', 'success', 5000);
      setStatusType('success');
      setStatus(`Outreach sent to ${contact.email}`);

      await loadSentLeads();
      await loadRepliedAndFollowUp();
    } catch (err) {
      console.error('Smart outreach error:', err);
      addNotification(`❌ Smart outreach failed: ${err.message}`, 'error');
      setStatusType('error');
      setStatus('Smart outreach failed');
    }
  }, [user, senderName, senderEmail, addNotification, loadSentLeads, loadRepliedAndFollowUp]);

  // ============================================================================
  // SMS SEND WITH TRACKING & DUPLICATE PREVENTION
  // ============================================================================
  const handleSendSMS = async (contact) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    const contactKey = contact.email || contact.phone;
    const business = contact.business || 'Contact';

    // Check quota
    const quotaCheck = canUse('sms');
    if (!quotaCheck.available) {
      addNotification(`⚠️ ${quotaCheck.reason}`, 'warning');
      return;
    }

    // Check if safe to contact
    const safetyCheck = isSafeToContactOnChannel(contact, 'sms');
    if (!safetyCheck.safe) {
      const confirmed = window.confirm(
        `⚠️ ${safetyCheck.reason}\n\nSend SMS anyway?`
      );
      if (!confirmed) return;
    }

    const confirmed = window.confirm(
      `Send SMS to ${business} at ${formatPhoneForDisplay(contact.phone)}?`
    );

    if (!confirmed) return;

    try {
      const message = renderPreviewText(
        smsTemplate,
        {
          business_name: contact.business,
          address: contact.address || '',
          phone_raw: contact.phone
        },
        fieldMappings,
        senderName
      );

      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.phone,
          message,
          businessName: contact.business,
          userId: user.uid
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Track SMS
        const now = new Date().toISOString();
        setLastSMSSent(prev => ({ ...prev, [contactKey]: now }));
        setContactedChannels(prev => ({
          ...prev,
          [contactKey]: [...(prev[contactKey] || []), 'sms']
        }));

        // Update contact history
        await updateContact(contactKey, 'sms', {
          smsCount: increment(1),
          lastSMSSent: now
        });

        // Update quota
        incrementQuota('sms', 1);
        setDailySMSCount(prev => prev + 1);

        // Update deal stage
        if (dealStage[contactKey] === 'new' || !dealStage[contactKey]) {
          updateDealStage(contactKey, 'contacted');
        }

        addNotification(`✅ SMS sent to ${business}!`, 'success');
      } else {
        addNotification(`❌ SMS failed: ${data.error}`, 'error');
      }
    } catch (error) {
      console.error('SMS send error:', error);
      addNotification(`❌ Failed to send SMS: ${error.message}`, 'error');
    }
  };

  // ============================================================================
  // OPEN NATIVE SMS APP
  // ============================================================================
  const handleOpenNativeSMS = (contact) => {
    if (!contact?.phone) {
      addNotification('No phone number', 'error');
      return;
    }

    const messageBody = renderPreviewText(
      smsTemplate,
      {
        business_name: contact.business,
        address: contact.address || '',
        phone_raw: contact.phone
      },
      fieldMappings,
      senderName
    );

    let formattedPhone = contact.phone.toString().replace(/\D/g, '');

    if (formattedPhone.startsWith('0') && formattedPhone.length >= 9) {
      formattedPhone = '94' + formattedPhone.slice(1);
    }

    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }

    const smsUrl = `sms:${formattedPhone}?body=${encodeURIComponent(messageBody)}`;
    window.location.href = smsUrl;
  };

  // ============================================================================
  // HANDLE DIRECT CALL
  // ============================================================================
  const handleCall = (phone) => {
    if (!phone) {
      addNotification('No phone number', 'error');
      return;
    }

    const dialNumber = formatForDialing(phone) || phone.toString().replace(/\D/g, '');

    if (typeof window !== 'undefined') {
      const isMobile = /iPhone|Android/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = `tel:${dialNumber}`;
      } else {
        // Desktop - open WhatsApp as fallback
        window.open(`https://wa.me/${dialNumber}`, '_blank');
        addNotification('Desktop detected - opened WhatsApp instead', 'info');
      }
    }
  };

  // ============================================================================
  // HANDLE VIEW CONVERSATION
  // ============================================================================
  const handleViewConversation = async (lead) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    setLoadingConversation(true);
    setShowConversationModal(true);

    try {
      const response = await fetch('/api/get-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          email: lead.email,
          messageId: lead.messageId,
          threadId: lead.threadId
        })
      });

      const data = await response.json();

      if (response.ok) {
        setConversationThread({
          ...data,
          leadEmail: lead.email,
          leadBusiness: lead.businessName
        });
      } else {
        addNotification(data.error || 'Failed to load conversation', 'error');
        setShowConversationModal(false);
      }
    } catch (error) {
      console.error('View conversation error:', error);
      addNotification('Failed to load conversation', 'error');
      setShowConversationModal(false);
    } finally {
      setLoadingConversation(false);
    }
  };

  // ============================================================================
  // POLL CALL STATUS FROM FIREBASE
  // ============================================================================
  const pollCallStatus = (callId, businessName) => {
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;

      try {
        if (!db) {
          clearInterval(interval);
          return;
        }

        const callDoc = await getDoc(doc(db, 'calls', callId));

        if (callDoc.exists()) {
          const callData = callDoc.data();
          const status = callData.status;

          setActiveCallStatus(prev => ({
            ...prev,
            status: status,
            duration: callData.duration || 0,
            answeredBy: callData.answeredBy || 'unknown',
            updatedAt: callData.updatedAt
          }));

          if (status === 'ringing') {
            setStatus(`📞 Ringing ${businessName}...`);
            setStatusType('info');
          } else if (status === 'in-progress' || status === 'answered') {
            setStatus(`✅ Call connected to ${businessName}!\nDuration: ${callData.duration || 0}s`);
            setStatusType('success');
          } else if (status === 'completed') {
            setStatus(`✅ Call Completed!\nBusiness: ${businessName}\nDuration: ${callData.duration || 0}s`);
            setStatusType('success');
            clearInterval(interval);
          } else if (['failed', 'busy', 'no-answer'].includes(status)) {
            setStatus(`❌ Call ${status}\nBusiness: ${businessName}`);
            setStatusType('error');
            clearInterval(interval);
          }
        }

        if (attempts >= CONFIG.MAX_POLL_ATTEMPTS) {
          clearInterval(interval);
          setStatus(`⏱️ Status polling stopped. Check call history.`);
          setStatusType('warning');
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, CONFIG.POLL_INTERVAL_MS);
  };

  // ============================================================================
  // HANDLE TWILIO CALL WITH TRACKING
  // ============================================================================
  const handleTwilioCall = async (contact, callType = 'direct') => {
    if (!contact || !contact.phone || !contact.business) {
      addNotification('❌ Contact data is incomplete', 'error');
      return;
    }

    if (!user?.uid) {
      addNotification('❌ You must be signed in to make calls', 'error');
      return;
    }

    const contactKey = contact.email || contact.phone;

    // Check quota
    const quotaCheck = canUse('calls');
    if (!quotaCheck.available) {
      addNotification(`⚠️ ${quotaCheck.reason}`, 'warning');
      return;
    }

    // Check if safe to contact
    if (!isSafeToContactOnChannel(contact, 'call', 1).safe) {
      const confirmed = window.confirm('⚠️ This contact was recently called. Continue anyway?');
      if (!confirmed) return;
    }

    const callTypeLabels = {
      direct: 'Automated Message',
      bridge: 'Bridge Call',
      interactive: 'Interactive Menu'
    };

    const confirmed = window.confirm(
      `📞 Call ${contact.business} at ${formatPhoneForDisplay(contact.phone)}?\nType: ${callTypeLabels[callType]}`
    );

    if (!confirmed) return;

    try {
      setStatus(`📞 Initiating ${callType} call to ${contact.business}...`);
      setStatusType('info');
      setIsSending(true);

      setActiveCallStatus({
        business: contact.business,
        phone: contact.phone,
        status: 'initiating',
        timestamp: new Date().toISOString()
      });

      const response = await fetch('/api/make-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toPhone: contact.phone,
          businessName: contact.business,
          userId: user.uid,
          callType
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        throw new Error('Server returned an invalid response');
      }

      if (response.ok) {
        setStatus(`✅ Call initiated to ${contact.business}!`);
        setStatusType('success');

        setActiveCallStatus({
          business: contact.business,
          phone: contact.phone,
          status: data.status,
          callId: data.callId,
          callSid: data.callSid,
          timestamp: new Date().toISOString()
        });

        // Track call
        const now = new Date().toISOString();
        setLastCallMade(prev => ({ ...prev, [contactKey]: now }));
        setContactedChannels(prev => ({
          ...prev,
          [contactKey]: [...(prev[contactKey] || []), 'call']
        }));

        await updateContact(contactKey, 'call', {
          callCount: increment(1),
          lastCallMade: now
        });

        // Update quota
        incrementQuota('calls', 1);
        setDailyCallCount(prev => prev + 1);

        // Update deal stage
        if (contact.email && (dealStage[contactKey] === 'new' || !dealStage[contactKey])) {
          updateDealStage(contactKey, 'contacted');
        }

        addNotification(`✅ Call initiated to ${contact.business}`, 'success');
        pollCallStatus(data.callId, contact.business);
      } else {
        const errorMsg = data.error || 'Unknown error';
        setStatus(`❌ Call Failed: ${errorMsg}`);
        setStatusType('error');
        addNotification(`❌ Call failed: ${errorMsg}`, 'error');
      }
    } catch (error) {
      console.error('Twilio call error:', error);
      setStatus(`❌ ${error.message}`);
      setStatusType('error');
      addNotification(`❌ Call error: ${error.message}`, 'error');
    } finally {
      setIsSending(false);
    }
  };

  // ============================================================================
  // HANDLE SMART CALL (AI-POWERED)
  // ============================================================================
  const handleSmartCall = (contact) => {
    if (!contact) return;

    const key = contact.email || contact.phone;
    const score = leadScores[key] || 0;
    const history = followUpHistory[key];
    const followUpCount = history?.count || 0;

    if (repliedLeads[contact.email] || score >= 80) {
      handleTwilioCall(contact, 'bridge');
    } else if (followUpCount >= 2) {
      handleTwilioCall(contact, 'voicemail');
    } else {
      handleTwilioCall(contact, 'interactive');
    }
  };

  // ============================================================================
  // LOAD CALL HISTORY FROM FIREBASE
  // ============================================================================
  const loadCallHistory = async () => {
    if (!user?.uid || !db) return;

    setLoadingCallHistory(true);

    try {
      const q = query(collection(db, 'calls'), where('userId', '==', user.uid), limit(100));
      const snapshot = await getDocs(q);

      const calls = [];
      snapshot.forEach(doc => {
        calls.push({ id: doc.id, ...doc.data() });
      });

      calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setCallHistory(calls);
    } catch (error) {
      console.error('Failed to load call history:', error);
      addNotification('Failed to load call history', 'error');
    } finally {
      setLoadingCallHistory(false);
    }
  };

  // ============================================================================
  // HANDLE SOCIAL MEDIA OUTREACH
  // ============================================================================
  const handleOpenLinkedIn = (contact, type = 'company') => {
    if (!contact?.business) {
      addNotification('No business name', 'error');
      return;
    }

    let url;

    if (type === 'company' && contact.linkedin_company) {
      url = contact.linkedin_company;
    } else if (type === 'ceo' && contact.linkedin_ceo) {
      url = contact.linkedin_ceo;
    } else if (type === 'founder' && contact.linkedin_founder) {
      url = contact.linkedin_founder;
    } else {
      const query = encodeURIComponent(contact.business);
      url = `https://www.linkedin.com/search/results/companies/?keywords=${query}`;
    }

    window.open(url, '_blank');
  };

  const handleOpenInstagram = (contact) => {
    if (!contact?.business) {
      addNotification('No business name', 'error');
      return;
    }

    const igHandle = generateSocialHandle(contact.business, 'instagram');

    if (igHandle) {
      window.open(`https://www.instagram.com/${igHandle}/`, '_blank');
    } else {
      window.open('https://www.instagram.com/', '_blank');
    }
  };

  const handleOpenTwitter = (contact) => {
    if (!contact?.business) {
      addNotification('No business name', 'error');
      return;
    }

    const twitterHandle = generateSocialHandle(contact.business, 'twitter');

    if (twitterHandle) {
      const tweetText = encodeURIComponent(
        `@${twitterHandle} ${renderPreviewText(
          twitterTemplate,
          { business_name: contact.business, address: contact.address || '' },
          fieldMappings,
          senderName
        )}`
      );
      window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
    } else {
      const query = encodeURIComponent(contact.business);
      window.open(`https://twitter.com/search?q=${query}&src=typed_query`, '_blank');
    }
  };

  const processCsvContent = (rawContent, sourceFileName = '') => {
    setValidEmails(0);
    setValidWhatsApp(0);
    setWhatsappLinks([]);
    setLeadScores({});
    setCsvFileName(sourceFileName);
    setCsvUploadDate(new Date().toISOString());
    try {
      const normalizedContent = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');

      if (lines.length < 2) {
        addNotification('CSV must have headers and data rows', 'error');
        return;
      }

      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      setCsvHeaders(headers);
      setAvailableCsvVariables(headers);
      setPreviewRecipient(null);

      // Extract all template variables
      const allTemplateTexts = [
        templateA.subject, templateA.body,
        templateB.subject, templateB.body,
        whatsappTemplate,
        smsTemplate,
        instagramTemplate,
        twitterTemplate,
        linkedinTemplate,
        ...followUpTemplates.flatMap(t => [t.subject || '', t.body || ''])
      ];

      const allVars = [...new Set([
        ...allTemplateTexts.flatMap(text => extractTemplateVariables(text)),
        'sender_name',
        ...emailImages.map(img => img.placeholder.replace(/{{|}}/g, '')),
        ...headers
      ])];

      // Auto-map fields
      const initialMappings = {};
      allVars.forEach(varName => {
        if (headers.includes(varName)) {
          initialMappings[varName] = varName;
        }
      });

      // Common mappings
      const commonMappings = {
        email: ['email', 'email_address', 'email_primary'],
        phone: ['phone', 'phone_number', 'whatsapp_number', 'phone_raw'],
        business_name: ['business_name', 'business', 'company', 'company_name'],
        website: ['website', 'url', 'site'],
        address: ['address', 'location']
      };

      Object.entries(commonMappings).forEach(([varName, possibleCols]) => {
        if (!initialMappings[varName]) {
          const found = possibleCols.find(col => headers.includes(col));
          if (found) {
            initialMappings[varName] = found;
          }
        }
      });

      initialMappings.sender_name = 'sender_name';
      initialMappings.email = 'email';
      initialMappings.lead_quality = 'lead_quality';
      setFieldMappings(initialMappings);

      // Process rows
      let hotEmails = 0;
      let warmEmails = 0;
      const validPhoneContacts = [];
      const contactMap = new Map(); // For deduplication
      const newLeadScores = {};
      const hasLeadQualityCol = headers.includes('lead_quality');

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvRow(lines[i]);

        if (values.length !== headers.length) {
          continue;
        }

        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        // Filter by lead quality
        let includeEmail = true;
        if (hasLeadQualityCol) {
          const quality = (row.lead_quality || '').trim().toUpperCase() || 'HOT';
          if (leadQualityFilter !== 'all' && quality !== leadQualityFilter) {
            includeEmail = false;
          }
        }

        // Validate email - handle multiple emails
        const emailCol = initialMappings.email || 'email';
        const emailString = row[emailCol] || '';
        const emails = parseMultipleEmails(emailString);
        const hasValidEmail = emails.length > 0;

        if (hasValidEmail && includeEmail) {
          const score = calculateScore(row);
          emails.forEach(email => {
            newLeadScores[email] = score;
          });

          const quality = (row.lead_quality || '').trim().toUpperCase() || 'HOT';
          if (quality === 'HOT') {
            hotEmails += emails.length;
          } else if (quality === 'WARM') {
            warmEmails += emails.length;
          }
        }

        // Validate phone
        const phoneCol = initialMappings.phone || 'phone';
        const rawPhone = row[phoneCol] || row.whatsapp_number || row.phone_raw;
        const formattedPhone = formatForDialing(rawPhone);

        if (formattedPhone) {
          const businessCol = initialMappings.business_name || 'business_name';
          const rowGroupId = generateId(); // Group emails from same row

          // Create separate contacts for each email
          if (hasValidEmail) {
            emails.forEach((email, index) => {
              const contactId = generateId();

              // Skip if we already have this email
              if (contactMap.has(email)) {
                return;
              }

              const contact = {
                id: contactId,
                rowGroupId, // Track which row this came from
                business: row[businessCol] || 'Business',
                address: row.address || '',
                phone: formattedPhone,
                email: email,
                allEmails: emails, // Store all emails from this row
                emailIndex: index, // Position in the email list
                place_id: row.place_id || '',
                website: row.website || '',
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
                email_primary: row.email_primary || email,
                phone_primary: row.phone_primary || formattedPhone || '',
                lead_quality_score: row.lead_quality_score || '0',
                contact_confidence: row.contact_confidence || 'Low',
                best_contact_method: row.best_contact_method || 'Email',
                decision_maker_found: row.decision_maker_found || 'No',
                tech_stack_detected: row.tech_stack_detected || '',
                company_size_indicator: row.company_size_indicator || 'unknown',
                lead_quality: (row.lead_quality || '').trim().toUpperCase() || 'HOT',
                rating: row.rating || '0',
                review_count: row.review_count || '0',
                createdAt: new Date().toISOString()
              };

              validPhoneContacts.push(contact);
              contactMap.set(email, contact);
            });
          } else {
            // No valid emails, create contact with phone only
            const contactId = generateId();

            // Skip if we already have this phone
            if (contactMap.has(formattedPhone)) {
              continue;
            }

            const contact = {
              id: contactId,
              rowGroupId,
              business: row[businessCol] || 'Business',
              address: row.address || '',
              phone: formattedPhone,
              email: null,
              allEmails: [],
              place_id: row.place_id || '',
              website: row.website || '',
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
              email_primary: row.email_primary || '',
              phone_primary: row.phone_primary || formattedPhone || '',
              lead_quality_score: row.lead_quality_score || '0',
              contact_confidence: row.contact_confidence || 'Low',
              best_contact_method: row.best_contact_method || 'Email',
              decision_maker_found: row.decision_maker_found || 'No',
              tech_stack_detected: row.tech_stack_detected || '',
              company_size_indicator: row.company_size_indicator || 'unknown',
              lead_quality: (row.lead_quality || '').trim().toUpperCase() || 'HOT',
              rating: row.rating || '0',
              review_count: row.review_count || '0',
              createdAt: new Date().toISOString()
            };

            validPhoneContacts.push(contact);
            contactMap.set(formattedPhone, contact);
          }
        }
      }

      // Set first valid as preview
      if (validPhoneContacts.length > 0) {
        setPreviewRecipient(validPhoneContacts[0]);
      }

      // Update counts
      if (leadQualityFilter === 'HOT') {
        setValidEmails(hotEmails);
      } else if (leadQualityFilter === 'WARM') {
        setValidEmails(warmEmails);
      } else {
        setValidEmails(hotEmails + warmEmails);
      }

      setValidWhatsApp(validPhoneContacts.length);
      setWhatsappLinks(validPhoneContacts);
      setLeadScores(newLeadScores);
      setCsvContent(normalizedContent);

      addNotification(
        `✅ CSV loaded successfully!\n${validPhoneContacts.length} contacts\n${hotEmails + warmEmails} valid emails`,
        'success'
      );
    } catch (error) {
      console.error('CSV upload error:', error);
      addNotification(`❌ CSV upload failed: ${error.message}`, 'error');
    }
  };

  const getDownloadFilenameFromResponse = (res) => {
    const disposition = res.headers.get('content-disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const basicMatch = disposition.match(/filename="?([^"]+)"?/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    if (basicMatch?.[1]) return basicMatch[1];
    return `enriched-${new Date().toISOString().split('T')[0]}.csv`;
  };

  const triggerCsvDownload = (csvText, filename) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runCsvEnrichment = async (file, mode) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      addNotification('Please choose a CSV file', 'error');
      setEnrichStatusMessage('Please choose a valid CSV file.');
      return;
    }

    try {
      setIsEnrichingCsv(true);
      setEnrichStatusMessage('Uploading CSV for enrichment...');
      const rawCsv = await file.text();

      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: rawCsv
      });

      const enrichedCsv = await res.text();
      if (!res.ok) {
        throw new Error(enrichedCsv || `Enrichment request failed (${res.status})`);
      }
      if (!enrichedCsv?.trim()) {
        throw new Error('Enrichment API returned an empty response');
      }

      const responseFileName = getDownloadFilenameFromResponse(res);
      triggerCsvDownload(enrichedCsv, responseFileName);
      addNotification('✅ Enriched CSV downloaded', 'success');
      setEnrichStatusMessage(`Enrichment completed: ${responseFileName}`);

      if (mode === 'autoload') {
        processCsvContent(enrichedCsv, responseFileName);
        addNotification('✅ Enriched CSV auto-loaded into app', 'success');
        setEnrichStatusMessage(`Enriched file loaded into app: ${responseFileName}`);
      }
    } catch (error) {
      console.error('CSV enrichment failed:', error);
      addNotification(`❌ Enrichment failed: ${error.message}`, 'error');
      setEnrichStatusMessage(`Enrichment failed: ${error.message}`);
    } finally {
      setIsEnrichingCsv(false);
      setEnrichMode('download');
      enrichModeRef.current = 'download';
    }
  };

  const startEnrichFlow = (mode) => {
    enrichModeRef.current = mode;
    setEnrichMode(mode);
    enrichCsvInputRef.current?.click();
  };

  const handleEnrichCsvSelect = async (e) => {
    const file = e.target.files?.[0];
    await runCsvEnrichment(file, enrichModeRef.current);
    e.target.value = '';
  };

  // ============================================================================
  // HANDLE CSV UPLOAD
  // ============================================================================
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      addNotification('No file selected', 'error');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      addNotification('Please upload a CSV file', 'error');
      return;
    }

    const reader = new FileReader();

    reader.onload = (event) => {
      processCsvContent(event.target.result, file.name);
    };

    reader.onerror = () => {
      addNotification('Failed to read file', 'error');
    };

    reader.readAsText(file);
  };

  // ============================================================================
  // HANDLE IMAGE UPLOAD
  // ============================================================================
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files).slice(0, CONFIG.MAX_IMAGES_PER_EMAIL);

    if (files.length === 0) {
      addNotification('No files selected', 'info');
      return;
    }

    // Validate file sizes
    const validFiles = files.filter(file => file.size <= CONFIG.MAX_IMAGE_SIZE_MB * 1024 * 1024);

    if (validFiles.length < files.length) {
      addNotification(`${files.length - validFiles.length} file(s) exceeded ${CONFIG.MAX_IMAGE_SIZE_MB}MB limit`, 'warning');
    }

    const newImages = validFiles.map((file, index) => {
      const preview = URL.createObjectURL(file);
      const cid = `img${index + 1}@massmailer`;
      return {
        file,
        preview,
        cid,
        placeholder: `{{image${index + 1}}}`,
        size: file.size,
        type: file.type
      };
    });

    setEmailImages(newImages);
    addNotification(`✅ ${newImages.length} image(s) uploaded`, 'success');
  };

  const handleAttachmentUpload = (e) => {
    const files = Array.from(e.target.files || []).slice(0, CONFIG.MAX_ATTACHMENTS_PER_EMAIL);
    if (files.length === 0) {
      addNotification('No files selected', 'info');
      return;
    }

    const validFiles = files.filter(file => file.size <= CONFIG.MAX_ATTACHMENT_SIZE_MB * 1024 * 1024);
    if (validFiles.length < files.length) {
      addNotification(`${files.length - validFiles.length} file(s) exceeded ${CONFIG.MAX_ATTACHMENT_SIZE_MB}MB limit`, 'warning');
    }

    const newAttachments = validFiles.map((file) => ({
      file,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size
    }));

    setEmailAttachments(newAttachments);
    addNotification(`✅ ${newAttachments.length} attachment(s) ready`, 'success');
  };

  const handleRemoveAttachment = (index) => {
    setEmailAttachments((prev) => prev.filter((_, idx) => idx !== index));
  };

  // ============================================================================
  // SEND TO NEW LEADS (SMART DUPLICATE PREVENTION)
  // ============================================================================
  const handleSendToNewLeads = async () => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    const newLeads = getNewLeads();

    if (newLeads.length === 0) {
      addNotification('✅ No new leads to email. All contacts have been reached.', 'success');
      return;
    }

    const remainingQuota = CONFIG.MAX_DAILY_EMAILS - dailyEmailCount;

    if (remainingQuota <= 0) {
      addNotification(
        `⚠️ Daily email limit reached (${CONFIG.MAX_DAILY_EMAILS} emails/day). ${dailyEmailCount} emails sent today.`,
        'warning'
      );
      return;
    }

    const leadsToSend = newLeads.slice(0, Math.min(remainingQuota, newLeads.length));
    const potentialValue = Math.round((leadsToSend.length * 0.15 * CONFIG.DEFAULT_AVG_DEAL_VALUE) / 1000);

    const confirmMsg = `🚀 Smart New Lead Outreach\n\n` +
      `📊 ${leadsToSend.length} new leads ready (${newLeads.length} total available)\n` +
      `📈 Prioritized by lead quality\n` +
      `💰 Estimated potential value: $${potentialValue}k\n` +
      `📧 Daily quota: ${dailyEmailCount}/${CONFIG.MAX_DAILY_EMAILS} (${remainingQuota} remaining)\n\n` +
      `Send to ${leadsToSend.length} leads now?`;

    if (!window.confirm(confirmMsg)) return;

    if (!templateA.subject?.trim()) {
      addNotification('Email subject is required', 'error');
      return;
    }

    setIsSending(true);
    setStatus('Getting Gmail access...');
    setStatusType('info');
    setSendProgress({ current: 0, total: leadsToSend.length });

    try {
      const accessToken = await requestGmailToken();
      setStatus(`Sending to ${leadsToSend.length} new leads...`);

      const imagesWithBase64 = await Promise.all(
        emailImages.map(async (img, index) => {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(img.file);
          });

          return {
            cid: img.cid,
            mimeType: img.file.type,
            base64,
            placeholder: img.placeholder
          };
        })
      );

      const attachmentsWithBase64 = await Promise.all(
        emailAttachments.map(async (att) => {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(att.file);
          });
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            base64
          };
        })
      );

      const res = await fetch('/api/send-new-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: leadsToSend,
          senderName,
          senderEmail,
          fieldMappings,
          accessToken,
          template: templateA,
          userId: user.uid,
          emailImages: imagesWithBase64,
          emailAttachments: attachmentsWithBase64
        })
      });

      const data = await res.json();

      if (res.ok) {
        const sentCount = data.sent || 0;
        setStatus(`✅ ${sentCount}/${leadsToSend.length} emails sent to new leads!`);
        setStatusType('success');

        setDailyEmailCount(data.dailyCount || dailyEmailCount + sentCount);

        addNotification(
          `✅ Successfully sent ${sentCount} emails!\n` +
          `📊 Stats:\n` +
          `• Sent: ${sentCount}\n` +
          `• Failed: ${data.failed || 0}\n` +
          `• Skipped: ${data.skipped || 0}\n` +
          `• Daily count: ${data.dailyCount}/${CONFIG.MAX_DAILY_EMAILS}`,
          'success'
        );

        await loadSentLeads();
        await loadDailyEmailCount();
      } else {
        if (res.status === 429) {
          addNotification(`⚠️ Daily limit reached! ${data.error}`, 'warning');
          setDailyEmailCount(data.dailyCount || CONFIG.MAX_DAILY_EMAILS);
        } else {
          addNotification(`❌ Error: ${data.error || 'Failed to send emails'}`, 'error');
        }
        setStatus(`❌ ${data.error || 'Failed'}`);
        setStatusType('error');
      }
    } catch (err) {
      console.error('Send new leads error:', err);
      addNotification(`❌ Error: ${err.message || 'Failed to send emails'}`, 'error');
      setStatus(`❌ ${err.message || 'Error'}`);
      setStatusType('error');
    } finally {
      setIsSending(false);
      setSendProgress({ current: 0, total: 0 });
    }
  };

  // ============================================================================
  // SEND EMAILS (MAIN FUNCTION)
  // ============================================================================
  const handleSendEmails = async (templateToSend = null) => {
    const lines = csvContent?.split('\n').filter(line => line.trim() !== '') || [];

    if (lines.length < 2) {
      addNotification('Please upload a valid CSV file first', 'error');
      return;
    }

    if (validEmails === 0) {
      addNotification('No valid recipients available', 'error');
      return;
    }

    // Check quota
    const remainingQuota = CONFIG.MAX_DAILY_EMAILS - dailyEmailCount;
    if (remainingQuota <= 0) {
      addNotification(
        `⚠️ Daily email limit reached (${CONFIG.MAX_DAILY_EMAILS} emails/day). Try again tomorrow.`,
        'warning'
      );
      return;
    }

    if (abTestMode && !templateToSend) {
      addNotification('Please select Template A or B', 'error');
      return;
    }

    if (abTestMode) {
      if (templateToSend === 'A' && !templateA.subject?.trim()) {
        addNotification('Template A subject is required', 'error');
        return;
      }
      if (templateToSend === 'B' && !templateB.subject?.trim()) {
        addNotification('Template B subject is required', 'error');
        return;
      }
    } else {
      if (!templateA.subject?.trim()) {
        addNotification('Email subject is required', 'error');
        return;
      }
    }

    // Confirm before sending
    if (userPreferences.confirmBeforeSend) {
      const confirmed = window.confirm(
        `Send emails to ${validEmails} leads?\n\nDaily quota: ${dailyEmailCount}/${CONFIG.MAX_DAILY_EMAILS}\nRemaining: ${remainingQuota}`
      );

      if (!confirmed) return;
    }

    setIsSending(true);
    setStatus('Getting Gmail access...');
    setStatusType('info');
    setSendProgress({ current: 0, total: validEmails });

    try {
      const accessToken = await requestGmailToken();

      setStatus(`Sending to ${validEmails} leads...`);

      // Process images
      const imagesWithBase64 = await Promise.all(
        emailImages.map(async (img, index) => {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(img.file);
          });

          return {
            cid: img.cid,
            mimeType: img.file.type,
            base64,
            placeholder: img.placeholder
          };
        })
      );

      const attachmentsWithBase64 = await Promise.all(
        emailAttachments.map(async (att) => {
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(att.file);
          });
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            base64
          };
        })
      );

      const headers = parseCsvRow(lines[0]).map(h => h.trim());
      let validRecipients = [];

      const emailColumnName = Object.entries(fieldMappings).find(([key, val]) => key === 'email')?.[1] || 'email';
      const qualityColumnName = Object.entries(fieldMappings).find(([key, val]) => key === 'lead_quality')?.[1] || 'lead_quality';

      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvRow(lines[i]);

        if (values.length !== headers.length) {
          continue;
        }

        const row = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx]?.toString().trim() || '';
        });

        const emailValue = row[emailColumnName] || '';
        const emails = parseMultipleEmails(emailValue);

        if (emails.length === 0) {
          continue;
        }

        // Create separate recipient entries for each email
        emails.forEach((email, index) => {
          const normalizedEmail = email.trim().toLowerCase();
          const normalizedRow = { ...row, email: normalizedEmail };
          // Add metadata for delay handling
          if (emails.length > 1) {
            normalizedRow.isFromMultiEmailRow = true;
            normalizedRow.emailIndex = index;
            normalizedRow.totalEmailsInRow = emails.length;
            normalizedRow.rowGroupId = generateId();
          }
          validRecipients.push(normalizedRow);
        });

        const hasQualityColumn = headers.includes(qualityColumnName);
        const quality = hasQualityColumn ? (row[qualityColumnName] || '').trim().toUpperCase() || 'HOT' : 'HOT';

        if (leadQualityFilter !== 'all' && quality !== leadQualityFilter) {
          continue;
        }
      }

      // Sort recipients to group emails from same row together
      validRecipients.sort((a, b) => {
        // If both are from multi-email rows, sort by rowGroupId then by emailIndex
        if (a.rowGroupId && b.rowGroupId) {
          if (a.rowGroupId !== b.rowGroupId) {
            return a.rowGroupId.localeCompare(b.rowGroupId);
          }
          return (a.emailIndex || 0) - (b.emailIndex || 0);
        }
        // Multi-email rows come first
        if (a.rowGroupId) return -1;
        if (b.rowGroupId) return 1;
        return 0;
      });

      // Check for multi-email rows and notify user
      const multiEmailRowCount = validRecipients.filter(r => r.isFromMultiEmailRow).length;
      if (multiEmailRowCount > 0) {
        const uniqueRows = new Set(validRecipients.filter(r => r.rowGroupId).map(r => r.rowGroupId)).size;
        addNotification(
          `📧 Found ${uniqueRows} row(s) with multiple emails. These will be sent individually with built-in delays to avoid spam detection.`,
          'info',
          5000
        );
      }

      let recipientsToSend = [];

      if (abTestMode && templateToSend) {
        const half = Math.ceil(validRecipients.length / 2);
        if (templateToSend === 'A') {
          recipientsToSend = validRecipients.slice(0, half);
        } else {
          recipientsToSend = validRecipients.slice(half);
        }
      } else {
        recipientsToSend = validRecipients;
      }

      // Limit by quota
      if (recipientsToSend.length > remainingQuota) {
        recipientsToSend = recipientsToSend.slice(0, remainingQuota);
        addNotification(`Limited to ${remainingQuota} emails due to daily quota`, 'warning');
      }

      if (recipientsToSend.length === 0) {
        setStatus('❌ No valid leads for selected criteria');
        setStatusType('error');
        setIsSending(false);
        addNotification('No valid recipients found', 'error');
        return;
      }

      // Reconstruct CSV
      const csvLines = [headers.join(',')];
      for (const row of recipientsToSend) {
        const csvFields = headers.map(h => {
          const val = (row[h] || '').toString().trim();
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        });
        csvLines.push(csvFields.join(','));
      }
      const reconstructedCsv = csvLines.join('\n');

      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvContent: reconstructedCsv,
          senderName,
          senderEmail,
          fieldMappings,
          accessToken,
          refreshToken: user?.refreshToken || '',
          abTestMode,
          templateA,
          templateB,
          templateToSend,
          leadQualityFilter,
          emailImages: imagesWithBase64,
          emailAttachments: attachmentsWithBase64,
          userId: user.uid,
          csvSource: csvFileName || 'uploaded_csv'
        })
      });

      const data = await res.json();

      if (res.ok) {
        const sentCount = data.sent || 0;
        setStatus(`✅ ${sentCount}/${recipientsToSend.length} emails sent!`);
        setStatusType('success');

        // Update A/B test results
        if (abTestMode) {
          const newResults = { ...abResults };
          if (templateToSend === 'A') {
            newResults.a.sent = (newResults.a.sent || 0) + sentCount;
          } else {
            newResults.b.sent = (newResults.b.sent || 0) + sentCount;
          }
          setAbResults(newResults);

          if (db) {
            await setDoc(doc(db, 'ab_results', user.uid), newResults);
          }
        }

        // Update daily count
        setDailyEmailCount(prev => prev + sentCount);
        incrementQuota('emails', sentCount);

        addNotification(
          `✅ Successfully sent ${sentCount} emails!\nFailed: ${data.failed || 0}\nSkipped: ${data.skipped || 0}`,
          'success'
        );

        await loadSentLeads();
        await loadDailyEmailCount();
      } else {
        setStatus(`❌ ${data.error}`);
        setStatusType('error');

        if (res.status === 429) {
          addNotification(`⚠️ Daily limit reached! ${data.error}`, 'warning');
          setDailyEmailCount(data.dailyCount || CONFIG.MAX_DAILY_EMAILS);
        } else if (res.status === 403 && data.code === 'GMAIL_PERMISSIONS_ERROR') {
          addNotification(`❌ Gmail permissions issue: ${data.details}`, 'error');
          if (data.troubleshooting) {
            setTimeout(() => {
              alert(`🔧 Gmail Permission Fix:\n\n${data.troubleshooting.steps.join('\n')}`);
            }, 1000);
          }
        } else if (res.status === 403 && data.code === 'GMAIL_ACCOUNT_MISMATCH') {
          addNotification(`❌ Account mismatch: ${data.details}`, 'error');
        } else if (res.status === 401 && data.code === 'GMAIL_AUTH_ERROR') {
          addNotification(`❌ Gmail authentication expired. Please re-authenticate.`, 'error');
        } else {
          addNotification(`❌ Error: ${data.error || 'Failed to send emails'}`, 'error');
        }
      }
    } catch (err) {
      console.error('Send error:', err);
      setStatus(`❌ ${err.message || 'Failed to send'}`);
      setStatusType('error');
      addNotification(`❌ ${err.message || 'Failed to send emails'}`, 'error');
    } finally {
      setIsSending(false);
      setSendProgress({ current: 0, total: 0 });
    }
  };

  // ============================================================================
  // AI RESEARCH COMPANY
  // ============================================================================
  const researchCompany = async (companyName, companyWebsite, email) => {
    if (!user?.uid) {
      addNotification('Please sign in to use AI research', 'error');
      return;
    }

    setResearchingCompany(email);

    try {
      const defaultTemplate = `${templateA.subject}\n${templateA.body}`;

      const res = await fetch('/api/research-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          companyWebsite: companyWebsite || '',
          defaultEmailTemplate: defaultTemplate,
          userId: user.uid
        })
      });

      const data = await res.json();

      if (res.ok) {
        setResearchResults(prev => ({
          ...prev,
          [email]: data
        }));
        setShowResearchModal(true);
        addNotification('✅ AI research completed', 'success');
      } else {
        addNotification(`Research failed: ${data.error || 'Unknown error'}`, 'error');
      }
    } catch (err) {
      console.error('Research error:', err);
      addNotification(`Error: ${err.message || 'Failed to research company'}`, 'error');
    } finally {
      setResearchingCompany(null);
    }
  };

  // ============================================================================
  // EXPORT DATA
  // ============================================================================
  const exportData = async (type) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    try {
      let data = [];
      let filename = '';

      if (type === 'contacts') {
        data = whatsappLinks;
        filename = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'sent-leads') {
        data = sentLeads;
        filename = `sent-leads-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'call-history') {
        await loadCallHistory();
        data = callHistory;
        filename = `call-history-${new Date().toISOString().split('T')[0]}.csv`;
      }

      if (data.length === 0) {
        addNotification('No data to export', 'warning');
        return;
      }

      // Convert to CSV
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = (row[h] || '').toString();
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',')
        )
      ].join('\n');

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);

      addNotification(`✅ Exported ${data.length} records`, 'success');
    } catch (error) {
      console.error('Export error:', error);
      addNotification('Failed to export data', 'error');
    }
  };

  // ============================================================================
  // BACKUP DATA
  // ============================================================================
  const backupData = async () => {
    if (!user?.uid || isBackingUp) return;

    setIsBackingUp(true);

    try {
      const backup = {
        userId: user.uid,
        timestamp: new Date().toISOString(),
        contacts: whatsappLinks,
        sentLeads,
        followUpHistory,
        dealStage,
        templates: {
          templateA,
          templateB,
          whatsappTemplate,
          smsTemplate,
          instagramTemplate,
          twitterTemplate,
          linkedinTemplate,
          followUpTemplates
        },
        settings: {
          senderName,
          senderEmail,
          fieldMappings,
          abTestMode,
          smsConsent,
          userPreferences
        }
      };

      // Save to Firebase
      if (db) {
        const backupRef = doc(db, 'backups', `${user.uid}_${Date.now()}`);
        await setDoc(backupRef, backup);
      }

      // Save to localStorage
      localStorageHelper.set(`backup_${user.uid}`, backup);

      setLastBackup(new Date().toISOString());
      addNotification('✅ Backup completed successfully', 'success');
    } catch (error) {
      console.error('Backup error:', error);
      addNotification('Failed to create backup', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  // ============================================================================
  // HANDLE FIELD MAPPING CHANGE
  // ============================================================================
  const handleMappingChange = (varName, csvColumn) => {
    setFieldMappings(prev => ({ ...prev, [varName]: csvColumn }));
  };

  // ============================================================================
  // A/B TEST SUMMARY
  // ============================================================================
  const abSummary = abTestMode ? (
    <div className="bg-blue-900/30 p-4 rounded-xl mt-4 border border-blue-700/50">
      <h3 className="text-sm font-bold text-blue-300 mb-3">📊 A/B Test Results</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-800/30 p-3 rounded-lg">
          <div className="text-xs text-blue-300">Template A</div>
          <div className="text-xl font-bold text-white">{abResults.a.sent || 0} sent</div>
          <div className="text-xs text-blue-400">{abResults.a.replied || 0} replied</div>
        </div>
        <div className="bg-purple-800/30 p-3 rounded-lg">
          <div className="text-xs text-purple-300">Template B</div>
          <div className="text-xl font-bold text-white">{abResults.b.sent || 0} sent</div>
          <div className="text-xs text-purple-400">{abResults.b.replied || 0} replied</div>
        </div>
      </div>
      <div className="text-xs text-blue-400 mt-3">
        Check back in 48h for open/click rates
      </div>
    </div>
  ) : null;

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  // BUSINESS INTELLIGENCE HANDLERS
  // ============================================================================
  const loadAnalytics = useCallback(async (action = 'comprehensive', timeframe = '30d') => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    try {
      setLoadingAnalytics(true);
      const res = await fetch('/api/analytics-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          action,
          timeframe,
          data: { avg_deal_value: 5000 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data.analytics);
        addNotification('✅ Analytics loaded', 'success', 2000);
      }
    } catch (error) {
      console.error('Load analytics error:', error);
      addNotification(`❌ Failed to load analytics: ${error.message}`, 'error');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [user, addNotification]);

  const loadPipeline = useCallback(async (action = 'comprehensive') => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    try {
      setLoadingPipeline(true);
      const res = await fetch('/api/deal-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          action,
          data: { targetDays: 90 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPipelineData(data.pipeline);
        addNotification('✅ Pipeline loaded', 'success', 2000);
      }
    } catch (error) {
      console.error('Load pipeline error:', error);
      addNotification(`❌ Failed to load pipeline: ${error.message}`, 'error');
    } finally {
      setLoadingPipeline(false);
    }
  }, [user, addNotification]);

  const loadPredictiveAnalysis = useCallback(async (action = 'comprehensive', leadId = null) => {
    if (!user?.uid) {
      addNotification('Please sign in first', 'error');
      return;
    }

    try {
      setLoadingPredictive(true);
      const res = await fetch('/api/predictive-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          leadId,
          action
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPredictiveData(data.predictions);
        addNotification('✅ Predictions generated', 'success', 2000);
      }
    } catch (error) {
      console.error('Load predictive error:', error);
      addNotification(`❌ Failed to generate predictions: ${error.message}`, 'error');
    } finally {
      setLoadingPredictive(false);
    }
  }, [user, addNotification]);

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loadingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-lg text-white font-medium">Loading your strategic outreach dashboard...</div>
          <div className="text-sm text-gray-400 mt-2">Please wait</div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // NOT AUTHENTICATED STATE
  // ============================================================================
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-700 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">B2B Growth Engine</h1>
            <p className="text-gray-400">Strategic Outreach Automation</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => {
                setAuthError(null);
                signInWithPopup(auth, new GoogleAuthProvider()).catch(err => {
                  setAuthError(err.message);
                  addNotification(`Sign in failed: ${err.message}`, 'error');
                });
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-xl transition font-medium flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            {authError && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 p-3 rounded-lg text-sm">
                {authError}
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="text-xs text-gray-500 text-center">
              Secure authentication powered by Firebase
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN DASHBOARD UI
  // ============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-200">
      <Head>
        <title>B2B Growth Engine | Strategic Outreach</title>
        <meta name="description" content="Marketing automation dashboard for B2B outreach" />
      </Head>

      {/* NOTIFICATIONS */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {notifications.slice(0, 5).map(notification => (
          <div
            key={notification.id}
            className={`p-4 rounded-lg shadow-lg border backdrop-blur-sm animate-fade-in ${notification.type === 'success' ? 'bg-green-900/80 border-green-700 text-green-200' :
                notification.type === 'error' ? 'bg-red-900/80 border-red-700 text-red-200' :
                  notification.type === 'warning' ? 'bg-yellow-900/80 border-yellow-700 text-yellow-200' :
                    'bg-blue-900/80 border-blue-700 text-blue-200'
              }`}
          >
            <div className="flex justify-between items-start">
              <div className="text-sm whitespace-pre-line">{notification.message}</div>
              <button
                onClick={() => markNotificationRead(notification.id)}
                className="ml-2 text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* HEADER */}
      <header className="bg-gray-800/80 backdrop-blur-sm shadow-lg border-b border-gray-700 sticky top-0 z-40">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white">B2B Growth Engine</h1>
                <p className="text-xs text-gray-400 hidden sm:block">Strategic Outreach Automation</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => {
                  loadCallHistory();
                  setShowCallHistoryModal(true);
                }}
                className="text-xs sm:text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2"
              >
                <span>📞</span>
                <span className="hidden sm:inline">Call History</span>
              </button>

              <button
                onClick={() => {
                  loadSentLeads();
                  setShowFollowUpModal(true);
                }}
                className="text-xs sm:text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2"
              >
                <span>📬</span>
                <span className="hidden sm:inline">Reply Center</span>
              </button>

              <button
                onClick={() => setShowAdvancedAnalytics(!showAdvancedAnalytics)}
                className="text-xs sm:text-sm bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white px-3 py-2 rounded-lg transition font-medium flex items-center gap-2"
              >
                <span>🤖</span>
                <span className="hidden sm:inline">AI Analytics</span>
              </button>

              <button
                onClick={() => router.push('/format')}
                className="text-xs sm:text-sm bg-green-700 hover:bg-green-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2"
              >
                <span>🔥</span>
                <span className="hidden sm:inline">Scrape</span>
              </button>

              <button
                onClick={() => checkForReplies()}
                className="text-xs sm:text-sm bg-blue-700 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition flex items-center gap-2"
                title="Check for new email replies"
              >
                <span>📬</span>
                <span className="hidden sm:inline">Check Replies</span>
              </button>

              <button
                onClick={() => setShowSettingsModal(true)}
                className="text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition"
              >
                ⚙️
              </button>

              <button
                onClick={() => signOut(auth)}
                className="text-xs sm:text-sm text-gray-300 hover:text-white px-3 py-2 rounded-lg transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* STATUS BAR */}
        {status && (
          <div className={`mb-4 p-4 rounded-xl border backdrop-blur-sm ${statusType === 'success' ? 'bg-green-900/30 border-green-700 text-green-200' :
              statusType === 'error' ? 'bg-red-900/30 border-red-700 text-red-200' :
                statusType === 'warning' ? 'bg-yellow-900/30 border-yellow-700 text-yellow-200' :
                  'bg-blue-900/30 border-blue-700 text-blue-200'
            }`}>
            <div className="whitespace-pre-line text-sm sm:text-base">{status}</div>
            {sendProgress.total > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span>Progress</span>
                  <span>{sendProgress.current}/{sendProgress.total}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DASHBOARD STATS */}
        {whatsappLinks.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/50 p-4 rounded-xl shadow border border-blue-700/50 hover:border-blue-600 transition">
                <div className="text-xs text-blue-300 font-semibold">📊 Total</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{whatsappLinks.length}</div>
                <div className="text-xs text-blue-200 mt-1">contacts loaded</div>
              </div>

              <div className="bg-gradient-to-br from-green-900/50 to-green-800/50 p-4 rounded-xl shadow border border-green-700/50 hover:border-green-600 transition">
                <div className="text-xs text-green-300 font-semibold">✅ Replied</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  {Object.values(repliedLeads).filter(Boolean).length}
                </div>
                <div className="text-xs text-green-200 mt-1">
                  {Math.round((Object.values(repliedLeads).filter(Boolean).length / Math.max(whatsappLinks.length, 1)) * 100)}% reply rate
                </div>
              </div>

              {followUpStats.interestedLeads > 0 && (
                <div
                  className="bg-gradient-to-br from-pink-900/50 to-pink-800/50 p-4 rounded-xl shadow border border-pink-700/50 hover:border-pink-600 transition cursor-pointer"
                  onClick={() => {
                    document.getElementById('interested-leads-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <div className="text-xs text-pink-300 font-semibold">🔥 Interested</div>
                  <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{followUpStats.interestedLeads}</div>
                  <div className="text-xs text-pink-200 mt-1">opens/clicks (no reply)</div>
                </div>
              )}

              <div className="bg-gradient-to-br from-indigo-900/50 to-purple-800/50 p-4 rounded-xl shadow border border-indigo-700/50 hover:border-indigo-600 transition">
                <div className="text-xs text-indigo-300 font-semibold">📬 Followed Up</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">{followUpStats.alreadyFollowedUp}</div>
                <div className="text-xs text-indigo-200 mt-1">emails sent for followups</div>
              </div>

              <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/50 p-4 rounded-xl shadow border border-yellow-700/50 hover:border-yellow-600 transition">
                <div className="text-xs text-yellow-300 font-semibold">⭐ Quality</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  {Object.values(leadScores).length > 0
                    ? Math.round(Object.values(leadScores).reduce((a, b) => a + b, 0) / Object.values(leadScores).length)
                    : 0}
                  <span className="text-sm text-yellow-300">/100</span>
                </div>
                <div className="text-xs text-yellow-200 mt-1">avg lead score</div>
              </div>

              <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/50 p-4 rounded-xl shadow border border-purple-700/50 hover:border-purple-600 transition">
                <div className="text-xs text-purple-300 font-semibold">💰 Pipeline</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  ${(Object.values(repliedLeads).filter(Boolean).length * 5).toFixed(0)}k
                </div>
                <div className="text-xs text-purple-200 mt-1">potential revenue</div>
              </div>

              <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/50 p-4 rounded-xl shadow border border-orange-700/50 hover:border-orange-600 transition">
                <div className="text-xs text-orange-300 font-semibold">📈 Monthly</div>
                <div className="text-2xl sm:text-3xl font-bold text-white mt-1">
                  ${Math.round((calculateRevenueForecasts().expectedMonthlyRevenue) / 1000)}k
                </div>
                <div className="text-xs text-orange-200 mt-1">forecast (30d)</div>
              </div>
            </div>

            {showAdvancedAnalytics && (
              <div className="mt-4 bg-gradient-to-br from-purple-900/20 via-indigo-900/20 to-blue-900/20 p-4 sm:p-6 rounded-xl border-2 border-purple-500/30">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400">
                    🤖 AI-Powered Analytics
                  </h2>
                  <button
                    onClick={() => setShowAdvancedAnalytics(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {sendTimeOptimization && (
                  <div className="bg-gray-800/50 p-4 rounded-lg border border-purple-700 mb-4">
                    <h3 className="text-sm font-bold text-purple-300 mb-2">⏰ Optimal Send Time</h3>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Next Best Time:</span>
                        <span className="font-bold text-purple-400">{sendTimeOptimization.nextOptimalTimeFormatted}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Potential Improvement:</span>
                        <span className="font-bold text-green-400">+{sendTimeOptimization.potentialImprovement}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* MAIN GRID LAYOUT */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* LEFT COLUMN - UPLOAD & SETTINGS */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            {/* CSV Upload */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-4 text-white">1. Upload Leads CSV</h2>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="w-full p-3 bg-gray-700 text-white border border-gray-600 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              <input
                ref={enrichCsvInputRef}
                type="file"
                accept=".csv"
                onChange={handleEnrichCsvSelect}
                className="hidden"
              />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => startEnrichFlow('download')}
                  disabled={isEnrichingCsv}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isEnrichingCsv && enrichMode === 'download' ? 'Processing...' : 'Enrich CSV (Download only)'}
                </button>
                <button
                  type="button"
                  onClick={() => startEnrichFlow('autoload')}
                  disabled={isEnrichingCsv}
                  className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  {isEnrichingCsv && enrichMode === 'autoload' ? 'Processing...' : 'Enrich CSV (Download + auto-load)'}
                </button>
              </div>
              {enrichStatusMessage && (
                <p className="mt-2 text-xs text-indigo-300">{enrichStatusMessage}</p>
              )}
              {csvFileName && (
                <div className="mt-2 text-xs text-gray-400">
                  📁 {csvFileName} • {csvUploadDate ? new Date(csvUploadDate).toLocaleDateString() : ''}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">Auto-scores leads and binds fields</p>

              <div className="mt-4">
                <label className="block text-sm font-medium mb-2 text-gray-200">
                  Target Lead Quality
                </label>
                <select
                  value={leadQualityFilter}
                  onChange={(e) => setLeadQualityFilter(e.target.value)}
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-sm"
                >
                  <option value="HOT">🔥 HOT Leads Only</option>
                  <option value="WARM">📈 WARM Leads Only</option>
                  <option value="all">💥 All Leads</option>
                </select>
                <p className="text-xs text-green-400 mt-2">
                  {validEmails} {leadQualityFilter} leads ready
                </p>
              </div>

              <div className="mt-4">
                <label className="flex items-center text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mr-2 w-4 h-4"
                  />
                  SMS Consent (for compliant outreach)
                </label>
              </div>
            </div>

            {/* Search & Filter */}
            {whatsappLinks.length > 0 && (
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
                <h2 className="text-lg font-bold mb-3 text-white">🔍 Smart Contact Search</h2>
                <input
                  type="text"
                  placeholder="Search by name, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg mb-3 text-sm"
                />

                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <select
                    value={contactFilter}
                    onChange={(e) => setContactFilter(e.target.value)}
                    className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-xs"
                  >
                    <option value="all">All Status</option>
                    <option value="replied">✅ Replied</option>
                    <option value="pending">⏳ Pending</option>
                    <option value="high-quality">⭐ High Quality</option>
                    <option value="contacted">📞 Contacted</option>
                    <option value="not-contacted">🆕 Not Contacted</option>
                    <option value="hot-leads">🔥 Hot Leads</option>
                    <option value="warm-leads">🟡 Warm Leads</option>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="flex-1 p-2 bg-gray-700 text-white border border-gray-600 rounded-lg text-xs"
                  >
                    <option value="score">Score</option>
                    <option value="recent">Recent</option>
                    <option value="name">A-Z</option>
                    <option value="added">Added</option>
                  </select>

                  <button
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                    className="px-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs"
                  >
                    {sortOrder === 'desc' ? '↓' : '↑'}
                  </button>
                </div>

                <div className="text-xs text-gray-400">
                  Showing {paginatedContacts.contacts.length} of {paginatedContacts.total} contacts
                </div>
              </div>
            )}

            {/* Field Mappings */}
            {csvHeaders.length > 0 && (
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700 max-h-96 overflow-y-auto">
                <h2 className="text-lg sm:text-xl font-bold mb-4 text-white sticky top-0 bg-gray-800 pb-2">
                  2. Field Mappings
                </h2>
                {allTemplateVars.map(varName => (
                  <div key={varName} className="flex items-center mb-2">
                    <span className="bg-gray-700 px-2 py-1 rounded text-xs font-mono mr-2 text-gray-200 min-w-max">
                      {`{{${varName}}}`}
                    </span>
                    <select
                      value={fieldMappings[varName] || ''}
                      onChange={(e) => handleMappingChange(varName, e.target.value)}
                      className="text-xs bg-gray-700 text-gray-200 border border-gray-600 rounded px-2 py-1 flex-1 min-w-0"
                    >
                      <option value="">-- Map to Column --</option>
                      {csvHeaders.map(col => (
                        <option key={col} value={col} className="bg-gray-800 text-gray-200">{col}</option>
                      ))}
                      {varName === 'sender_name' && (
                        <option value="sender_name" className="bg-gray-800 text-gray-200">Use sender name</option>
                      )}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MIDDLE COLUMN - TEMPLATES & SEND */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            {/* Sender Info */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">3. Your Info</h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg"
                  placeholder="Your Name (optional, defaults to Team)"
                />
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg"
                  placeholder="Your Email"
                  readOnly
                />
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-200">Attachments</label>
                  <input
                    type="file"
                    multiple
                    onChange={handleAttachmentUpload}
                    className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />
                  <p className="text-xs text-gray-400">
                    Add up to {CONFIG.MAX_ATTACHMENTS_PER_EMAIL} files, each up to {CONFIG.MAX_ATTACHMENT_SIZE_MB}MB.
                  </p>
                  {emailAttachments.length > 0 && (
                    <div className="space-y-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200">
                      {emailAttachments.map((attachment, index) => (
                        <div key={attachment.filename + index} className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-semibold">{attachment.filename}</div>
                            <div className="text-xs text-gray-400">{Math.round(attachment.size / 1024)} KB</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(index)}
                            className="text-xs text-red-400 hover:text-red-200"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Email Template */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white">4. Email Template</h2>
                <label className="flex items-center text-sm text-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={abTestMode}
                    onChange={(e) => setAbTestMode(e.target.checked)}
                    className="mr-2 w-4 h-4"
                  />
                  A/B Testing
                </label>
              </div>

              {abTestMode ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="border border-gray-700 rounded-lg p-3 bg-gray-750">
                    <h3 className="font-bold text-green-400 mb-2">Template A</h3>
                    <input
                      type="text"
                      value={templateA.subject}
                      onChange={(e) => setTemplateA({ ...templateA, subject: e.target.value })}
                      className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg mb-2 text-sm"
                      placeholder="Subject A"
                    />
                    <textarea
                      value={templateA.body}
                      onChange={(e) => setTemplateA({ ...templateA, body: e.target.value })}
                      rows="4"
                      className="w-full p-2 font-mono text-sm bg-gray-700 text-white border border-gray-600 rounded-lg"
                      placeholder="Body A..."
                    />
                  </div>
                  <div className="border border-gray-700 rounded-lg p-3 bg-gray-750">
                    <h3 className="font-bold text-blue-400 mb-2">Template B</h3>
                    <input
                      type="text"
                      value={templateB.subject}
                      onChange={(e) => setTemplateB({ ...templateB, subject: e.target.value })}
                      className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg mb-2 text-sm"
                      placeholder="Subject B"
                    />
                    <textarea
                      value={templateB.body}
                      onChange={(e) => setTemplateB({ ...templateB, body: e.target.value })}
                      rows="4"
                      className="w-full p-2 font-mono text-sm bg-gray-700 text-white border border-gray-600 rounded-lg"
                      placeholder="Body B..."
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={templateA.subject}
                    onChange={(e) => setTemplateA({ ...templateA, subject: e.target.value })}
                    className="w-full p-2 bg-gray-700 text-white border border-gray-600 rounded-lg mb-3"
                    placeholder="Subject"
                  />
                  <textarea
                    value={templateA.body}
                    onChange={(e) => setTemplateA({ ...templateA, body: e.target.value })}
                    rows="6"
                    className="w-full p-2 font-mono bg-gray-700 text-white border border-gray-600 rounded-lg"
                    placeholder="Hello {{business_name}}, ..."
                  />
                </div>
              )}

              {abTestMode ? (
                <div className="space-y-2 mt-4">
                  <button
                    onClick={() => handleSendEmails('A')}
                    disabled={Boolean(sendEmailsDisabledReason)}
                    className={`w-full py-3 rounded-lg font-bold transition ${Boolean(sendEmailsDisabledReason)
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-green-700 hover:bg-green-600 text-white'
                      }`}
                    title={sendEmailsDisabledReason || `Send template A to ${Math.ceil(validEmails / 2)} leads`}
                  >
                    📧 Send Template A (First {Math.ceil(validEmails / 2)} leads)
                  </button>
                  <button
                    onClick={() => handleSendEmails('B')}
                    disabled={Boolean(sendEmailsDisabledReason)}
                    className={`w-full py-3 rounded-lg font-bold transition ${Boolean(sendEmailsDisabledReason)
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-blue-700 hover:bg-blue-600 text-white'
                      }`}
                    title={sendEmailsDisabledReason || `Send template B to ${Math.floor(validEmails / 2)} leads`}
                  >
                    📧 Send Template B (Last {Math.floor(validEmails / 2)} leads)
                  </button>
                  {sendEmailsDisabledReason && (
                    <div className="mt-2 text-xs text-yellow-300">⚠️ {sendEmailsDisabledReason}</div>
                  )}
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleSendEmails()}
                    disabled={Boolean(sendEmailsDisabledReason)}
                    className={`w-full py-3 rounded-lg font-bold mt-4 transition ${Boolean(sendEmailsDisabledReason)
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-green-700 hover:bg-green-600 text-white'
                      }`}
                    title={sendEmailsDisabledReason || `Send emails to ${validEmails} leads`}
                  >
                    📧 Send Emails ({validEmails})
                  </button>
                  {sendEmailsDisabledReason && (
                    <div className="mt-2 text-xs text-yellow-300">⚠️ {sendEmailsDisabledReason}</div>
                  )}


                  {/* Debug Button */}
                  <button
                    onClick={handleDebugSystem}
                    className="w-full py-2 rounded-lg font-bold mt-2 transition bg-gray-700 hover:bg-gray-600 text-yellow-400 text-sm"
                  >
                    🔍 Debug Email System
                  </button>

                  {/* Status Indicators */}
                  <div className="mt-3 p-3 bg-gray-800 rounded-lg text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-400">CSV Loaded:</span>
                        <span className={`ml-2 ${csvContent ? 'text-green-400' : 'text-red-400'}`}>
                          {csvContent ? '✅' : '❌'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Valid Emails:</span>
                        <span className={`ml-2 ${validEmails > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {validEmails}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Sender Name:</span>
                        <span className={`ml-2 ${senderName.trim() ? 'text-green-400' : 'text-red-400'}`}>
                          {senderName.trim() ? '✅' : '❌'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Template Subject:</span>
                        <span className={`ml-2 ${templateA.subject.trim() ? 'text-green-400' : 'text-red-400'}`}>
                          {templateA.subject.trim() ? '✅' : '❌'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSendToNewLeads}
                    disabled={Boolean(newLeadsDisabledReason)}
                    className={`w-full py-3 rounded-lg font-bold mt-3 transition ${Boolean(newLeadsDisabledReason)
                        ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                        : 'bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white shadow-lg'
                      }`}
                    title={newLeadsDisabledReason || `Send to ${newLeads.length} new leads`}
                  >
                    🚀 Smart New Lead Outreach ({newLeads.length} new leads)
                    <div className="text-xs font-normal mt-1 opacity-90">
                      {newLeadsDisabledReason
                        ? `⚠️ ${newLeadsDisabledReason}`
                        : `${dailyEmailCount}/${CONFIG.MAX_DAILY_EMAILS} sent today • Prevents duplicates`}
                    </div>
                  </button>
                  {newLeadsDisabledReason && (
                    <div className="mt-2 text-xs text-yellow-300 font-semibold">
                      ⚠️ {newLeadsDisabledReason}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* WhatsApp Template */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">5. WhatsApp Template</h2>
              <textarea
                value={whatsappTemplate}
                onChange={(e) => setWhatsappTemplate(e.target.value)}
                rows="3"
                className="w-full p-2 font-mono bg-gray-700 text-white border border-gray-600 rounded-lg"
                placeholder="Hi {{business_name}}! ..."
              />
            </div>

            {/* SMS Template */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">6. SMS Template</h2>
              <textarea
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                rows="3"
                className="w-full p-2 font-mono bg-gray-700 text-white border border-gray-600 rounded-lg"
                placeholder="Hi {{business_name}}! ..."
              />
            </div>

            {/* Follow-Up Sequences */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">7. Follow-Up Sequences</h2>
              {followUpTemplates.map((template, index) => (
                <div key={template.id} className="border border-gray-700 rounded-lg p-3 mb-3 bg-gray-750">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-purple-400">{template.name}</h3>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={template.enabled}
                        onChange={(e) => {
                          const updated = [...followUpTemplates];
                          updated[index].enabled = e.target.checked;
                          setFollowUpTemplates(updated);
                        }}
                        className="mr-1"
                      />
                      <span className="text-xs text-gray-300">Enable</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs block text-gray-300">Channel</label>
                      <select
                        value={template.channel}
                        onChange={(e) => {
                          const updated = [...followUpTemplates];
                          updated[index].channel = e.target.value;
                          setFollowUpTemplates(updated);
                        }}
                        className="w-full text-xs bg-gray-700 text-white border border-gray-600 rounded p-1"
                      >
                        <option value="email">Email</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs block text-gray-300">Delay (days)</label>
                      <input
                        type="number"
                        min="1"
                        value={template.delayDays}
                        onChange={(e) => {
                          const updated = [...followUpTemplates];
                          updated[index].delayDays = parseInt(e.target.value) || 1;
                          setFollowUpTemplates(updated);
                        }}
                        className="w-full text-xs bg-gray-700 text-white border border-gray-600 rounded p-1"
                      />
                    </div>
                  </div>
                  {template.channel === 'email' && (
                    <>
                      <input
                        type="text"
                        value={template.subject || ''}
                        onChange={(e) => {
                          const updated = [...followUpTemplates];
                          updated[index].subject = e.target.value;
                          setFollowUpTemplates(updated);
                        }}
                        className="w-full mt-2 p-1 bg-gray-700 text-white border border-gray-600 rounded text-sm"
                        placeholder="Subject"
                      />
                      <textarea
                        value={template.body || ''}
                        onChange={(e) => {
                          const updated = [...followUpTemplates];
                          updated[index].body = e.target.value;
                          setFollowUpTemplates(updated);
                        }}
                        rows="3"
                        className="w-full mt-1 p-1 font-mono text-sm bg-gray-700 text-white border border-gray-600 rounded"
                        placeholder="Body..."
                      />
                    </>
                  )}
                  {(template.channel === 'whatsapp' || template.channel === 'sms') && (
                    <textarea
                      value={template.body || ''}
                      onChange={(e) => {
                        const updated = [...followUpTemplates];
                        updated[index].body = e.target.value;
                        setFollowUpTemplates(updated);
                      }}
                      rows="3"
                      className="w-full mt-1 p-1 font-mono text-sm bg-gray-700 text-white border border-gray-600 rounded"
                      placeholder="Message..."
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Instagram Template */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">8. Instagram Template</h2>
              <textarea
                value={instagramTemplate}
                onChange={(e) => setInstagramTemplate(e.target.value)}
                rows="3"
                className="w-full p-2 font-mono bg-gray-700 text-white border border-gray-600 rounded-lg"
                placeholder="Hi {{business_name}}! ..."
              />
            </div>

            {/* Twitter Template */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">9. Twitter Template</h2>
              <textarea
                value={twitterTemplate}
                onChange={(e) => setTwitterTemplate(e.target.value)}
                rows="3"
                className="w-full p-2 font-mono bg-gray-700 text-white border border-gray-600 rounded-lg"
                placeholder="Hi {{business_name}}! ..."
              />
            </div>
          </div>

          {/* RIGHT COLUMN - ANALYTICS & MULTI-CHANNEL */}
          <div className="lg:col-span-1 space-y-4 sm:space-y-6">
            {whatsappLinks.length > 0 && (
              <div className="space-y-4">
                {/* Campaign Performance */}
                <div className="bg-gradient-to-br from-purple-900 to-purple-800 p-4 sm:p-6 rounded-xl shadow border border-purple-700">
                  <h2 className="text-lg sm:text-xl font-bold mb-4 text-white">📊 Campaign Performance</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-purple-800/50 p-3 rounded">
                      <div className="text-xs text-purple-300">Total Outreach</div>
                      <div className="text-xl sm:text-2xl font-bold text-white">{whatsappLinks.length}</div>
                      <div className="text-xs text-purple-200 mt-1">Unique contacts</div>
                    </div>
                    <div className="bg-purple-800/50 p-3 rounded">
                      <div className="text-xs text-purple-300">Engagement Rate</div>
                      <div className="text-xl sm:text-2xl font-bold text-green-400">
                        {Math.round((Object.values(repliedLeads).filter(Boolean).length / Math.max(whatsappLinks.length, 1)) * 100)}%
                      </div>
                      <div className="text-xs text-green-200 mt-1">
                        {Object.values(repliedLeads).filter(Boolean).length} replied
                      </div>
                    </div>
                    <div className="bg-purple-800/50 p-3 rounded">
                      <div className="text-xs text-purple-300">Quality Score</div>
                      <div className="text-xl sm:text-2xl font-bold text-yellow-400">
                        {Object.values(leadScores).length > 0
                          ? Math.round(Object.values(leadScores).reduce((a, b) => a + b, 0) / Object.values(leadScores).length)
                          : 0}
                        <span className="text-sm text-yellow-300">/100</span>
                      </div>
                      <div className="text-xs text-yellow-200 mt-1">Average lead score</div>
                    </div>
                    <div className="bg-purple-800/50 p-3 rounded">
                      <div className="text-xs text-purple-300">Hot Leads</div>
                      <div className="text-xl sm:text-2xl font-bold text-orange-400">{validEmails}</div>
                      <div className="text-xs text-orange-200 mt-1">
                        {Math.round((validEmails / Math.max(whatsappLinks.length, 1)) * 100)}% of pool
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Tracking */}
                <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-4 rounded-xl border border-indigo-700/50">
                  <h3 className="text-sm font-bold text-indigo-300 mb-3">🏢 Company Tracking</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-indigo-400">Companies Contacted</div>
                      <div className="text-lg font-bold text-indigo-300">
                        {loadingContactedCompanies ? '...' : companyStats.totalCompanies}
                      </div>
                      <div className="text-xs text-indigo-400 mt-1">Unique organizations</div>
                    </div>
                    <div>
                      <div className="text-xs text-indigo-400">Total Contacts</div>
                      <div className="text-lg font-bold text-indigo-300">
                        {loadingContactedCompanies ? '...' : companyStats.totalContacts}
                      </div>
                      <div className="text-xs text-indigo-400 mt-1">Avg {companyStats.avgContactsPerCompany} per company</div>
                    </div>
                    <div>
                      <div className="text-xs text-indigo-400">Reply Rate</div>
                      <div className="text-lg font-bold text-green-400">
                        {loadingContactedCompanies ? '...' : `${companyStats.replyRate}%`}
                      </div>
                      <div className="text-xs text-green-400 mt-1">{companyStats.companiesReplied} replied</div>
                    </div>
                    <div>
                      <div className="text-xs text-indigo-400">CSV Sources</div>
                      <div className="text-lg font-bold text-purple-400">
                        {loadingContactedCompanies ? '...' : contactedCompanies.reduce((sum, company) => sum + (company.csvCount || 0), 0)}
                      </div>
                      <div className="text-xs text-purple-400 mt-1">Files processed</div>
                    </div>
                  </div>
                </div>

                {/* Revenue Potential */}
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 p-4 rounded-xl border border-green-700/50">
                  <h3 className="text-sm font-bold text-green-300 mb-3">💰 Revenue Potential</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-green-400">Pipeline Value</div>
                      <div className="text-lg font-bold text-green-300">
                        ${Math.round((Object.values(repliedLeads).filter(Boolean).length * 5000) / 1000)}k
                      </div>
                      <div className="text-xs text-green-400 mt-1">@$5K avg deal</div>
                    </div>
                    <div>
                      <div className="text-xs text-green-400">Next 30 Days</div>
                      <div className="text-lg font-bold text-green-300">
                        ${Math.round((followUpStats?.readyForFollowUp || 0) * 5000 / 1000)}k
                      </div>
                      <div className="text-xs text-green-400 mt-1">Expected from FUs</div>
                    </div>
                  </div>
                </div>

                {/* Outreach Funnel */}
                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 p-4 rounded-xl border border-blue-700/50">
                  <h3 className="text-sm font-bold text-blue-300 mb-3">🎯 Outreach Funnel</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-blue-200">📤 Sent</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-blue-900 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: '100%' }}></div>
                        </div>
                        <span className="font-bold text-blue-300 w-12">{whatsappLinks.length}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-200">✉️ No Reply Yet</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-blue-900 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500" style={{ width: `${Math.round((Math.max(0, whatsappLinks.length - Object.values(repliedLeads).filter(Boolean).length) / whatsappLinks.length) * 100)}%` }}></div>
                        </div>
                        <span className="font-bold text-yellow-300 w-12">
                          {whatsappLinks.length - Object.values(repliedLeads).filter(Boolean).length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-green-200">✅ Replied</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-blue-900 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500" style={{ width: `${Math.round((Object.values(repliedLeads).filter(Boolean).length / Math.max(whatsappLinks.length, 1)) * 100)}%` }}></div>
                        </div>
                        <span className="font-bold text-green-300 w-12">
                          {Object.values(repliedLeads).filter(Boolean).length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Interested Leads Section */}
            {interestedLeadsList.length > 0 && (
              <div id="interested-leads-section" className="bg-gradient-to-br from-pink-900/20 to-rose-900/20 p-4 sm:p-6 rounded-xl border border-pink-700/50 mb-6">
                <h2 className="text-lg font-bold mb-4 text-pink-300 flex items-center gap-2">
                  🔥 Interested Leads ({interestedLeadsList.length})
                  <span className="text-xs text-pink-400 font-normal">(Opened/Clicked but no reply yet)</span>
                </h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {interestedLeadsList.map((lead) => {
                    const leadData = whatsappLinks.find(l => l.email === lead.email) || {};
                    return (
                      <div key={lead.email} className="bg-gray-800/50 p-4 rounded-lg border border-pink-700/30">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-bold text-white">{leadData.business || lead.email}</div>
                            <div className="text-sm text-gray-400">{lead.email}</div>
                            <div className="flex gap-4 mt-2 text-xs flex-wrap">
                              {lead.opened && (
                                <span className="text-blue-400">📧 Opened ({lead.openedCount}x)</span>
                              )}
                              {lead.clicked && (
                                <span className="text-green-400">🔗 Clicked ({lead.clickCount}x)</span>
                              )}
                              <span className="text-pink-400">Score: {lead.interestScore}</span>
                              {predictiveScores[lead.email] && (
                                <span className={`font-bold ${predictiveScores[lead.email].predictiveScore >= 70 ? 'text-red-400' :
                                    predictiveScores[lead.email].predictiveScore >= 50 ? 'text-yellow-400' :
                                      'text-blue-400'
                                  }`}>
                                  🎯 ML: {predictiveScores[lead.email].predictiveScore}/100
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => researchCompany(
                                leadData.business || lead.email,
                                leadData.website || '',
                                lead.email
                              )}
                              disabled={researchingCompany === lead.email}
                              className="text-xs bg-gradient-to-r from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-white px-3 py-1.5 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {researchingCompany === lead.email ? '⏳ Researching...' : '🤖 AI Research'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Campaign Intelligence */}
            {whatsappLinks.length > 0 && (
              <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 p-4 sm:p-6 rounded-xl border border-indigo-700/50">
                <h2 className="text-lg font-bold mb-4 text-indigo-300">🧠 Campaign Intelligence</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-gray-800/30 p-3 rounded border border-gray-700">
                    <div className="text-xs font-semibold text-indigo-300 mb-2">📊 Lead Segments</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">🔥 Hot Leads (75+)</span>
                        <span className="font-bold text-orange-400">{validEmails}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">🟡 Warm Leads (50-74)</span>
                        <span className="font-bold text-yellow-400">
                          {Object.values(leadScores).filter(s => s >= 50 && s < 75).length}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">🔵 Cold Leads (Below 50)</span>
                        <span className="font-bold text-blue-400">
                          {Object.values(leadScores).filter(s => s < 50).length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-800/30 p-3 rounded border border-gray-700">
                    <div className="text-xs font-semibold text-green-300 mb-2">🎯 Conversion Forecast</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">Est. Replies (7 days)</span>
                        <span className="font-bold text-green-400">
                          {Math.ceil(whatsappLinks.length * 0.25)} leads
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">Est. Conversions (30 days)</span>
                        <span className="font-bold text-green-400">
                          {Math.ceil(whatsappLinks.length * 0.08)} deals
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-300">Pipeline Value</span>
                        <span className="font-bold text-yellow-400">
                          ${Math.round((whatsappLinks.length * 0.08 * 5000) / 1000)}k
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-800/30 p-3 rounded border border-gray-700 sm:col-span-2">
                    <div className="text-xs font-semibold text-purple-300 mb-2">💡 Recommended Actions</div>
                    <div className="space-y-1 text-xs text-gray-300">
                      <div>✓ Focus on hot leads first (3x higher conversion rate)</div>
                      <div>✓ {followUpStats.readyForFollowUp > 0 ? `${followUpStats.readyForFollowUp} leads need follow-up today - Send using value-first template` : 'All leads are either replied or waiting - Check back in 48h'}</div>
                      <div>✓ Use question-based template for re-engagement (proven +40% improvement)</div>
                      <div>✓ Send between 9-11 AM for best open rates (+35% average)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Email Preview */}
            <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow border border-gray-700">
              <h2 className="text-lg sm:text-xl font-bold mb-3 text-white">10. Email Preview</h2>
              <div className="bg-gray-750 p-4 rounded border border-gray-600">
                <div className="text-sm text-gray-400">
                  To: {previewRecipient?.email || 'email@example.com'}
                </div>
                <div className="mt-1 font-medium text-white">
                  {renderPreviewText(
                    abTestMode ? templateA.subject : templateB.subject,
                    previewRecipient,
                    fieldMappings,
                    senderName
                  )}
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-gray-200">
                  {renderPreviewText(abTestMode ? templateA.body : templateB.body, previewRecipient, fieldMappings, senderName)}
                </div>
              </div>
            </div>

            {/* Multi-Channel Outreach - MOBILE RESPONSIVE */}
            {whatsappLinks.length > 0 && (
              <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow border border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 gap-2">
                  <h2 className="text-lg font-bold text-white">
                    11. Multi-Channel Outreach ({whatsappLinks.length})
                  </h2>
                  <button
                    onClick={() => setShowMultiChannelModal(true)}
                    className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-3 py-1.5 rounded font-medium"
                    title="Expand to full view for easier management"
                  >
                    ⬆️ Expand
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {/* ✅ UPDATED: Use sortedWhatsappLinks to show 077 numbers first, contacted at bottom */}
                  {sortedWhatsappLinks.slice(0, 10).map((link) => {
                    const contactKey = link.email || link.phone;
                    const last = lastSent[contactKey];
                    const lastWA = lastWhatsAppSent[contactKey];
                    const lastSMS = lastSMSSent[contactKey];
                    const lastCall = lastCallMade[contactKey];
                    const channels = contactedChannels[contactKey] || [];
                    const score = leadScores[link.email] || 0;
                    const isReplied = repliedLeads[link.email];
                    const isFollowUp = followUpLeads[link.email];
                    const isContacted = isContactedOnAnyChannel(link);

                    return (
                      <div
                        key={link.id}
                        className={`p-3 rounded-lg border ${isContacted
                            ? 'bg-gray-800/50 border-gray-600 opacity-70'
                            : 'bg-gray-750 border-gray-600'
                          }`}
                      >
                        <div className="flex justify-between">
                          <div>
                            <div className="font-medium text-white">{link.business}</div>
                            <div className="text-sm text-gray-400">+{link.phone}</div>
                            {link.email ? (
                              <div className="text-xs text-blue-400">Score: {score}/100</div>
                            ) : (
                              <div className="text-xs text-gray-500 italic">No email (phone-only)</div>
                            )}
                            {/* ✅ Channel tracking badges */}
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {last && (
                                <span className="text-xs bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded">
                                  📧 {new Date(last).toLocaleDateString()}
                                </span>
                              )}
                              {lastWA && (
                                <span className="text-xs bg-green-900/30 text-green-300 px-1.5 py-0.5 rounded">
                                  💬 {new Date(lastWA).toLocaleDateString()}
                                </span>
                              )}
                              {lastSMS && (
                                <span className="text-xs bg-purple-900/30 text-purple-300 px-1.5 py-0.5 rounded">
                                  📱 {new Date(lastSMS).toLocaleDateString()}
                                </span>
                              )}
                              {lastCall && (
                                <span className="text-xs bg-orange-900/30 text-orange-300 px-1.5 py-0.5 rounded">
                                  📞 {new Date(lastCall).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {isReplied && (
                              <span className="inline-block bg-green-900/30 text-green-300 text-xs px-1.5 py-0.5 rounded mt-1">
                                Replied
                              </span>
                            )}
                            {!isReplied && isFollowUp && (
                              <span className="inline-block bg-yellow-900/30 text-yellow-300 text-xs px-1.5 py-0.5 rounded mt-1">
                                Follow Up
                              </span>
                            )}
                            {isContacted && !isReplied && (
                              <span className="inline-block bg-gray-700/30 text-gray-400 text-xs px-1.5 py-0.5 rounded mt-1">
                                Contacted
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end space-y-1">
                            <div className="flex flex-wrap gap-1 justify-end">
                              <button
                                onClick={() => handleCall(link.phone)}
                                title="Direct call"
                                className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded"
                              >
                                📞
                              </button>
                              <button
                                onClick={() => handleTwilioCall(link, 'direct')}
                                className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded"
                                title="Automated message"
                              >
                                🤖
                              </button>
                              <button
                                onClick={() => handleSmartCall(link)}
                                className="text-xs bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-3 py-1.5 rounded font-medium"
                                title="Smart AI call"
                              >
                                🧠
                              </button>
                              <button
                                onClick={() => handleOpenLinkedIn(link, 'company')}
                                className="text-xs bg-blue-900 hover:bg-blue-800 text-blue-200 px-2 py-1 rounded"
                                title="LinkedIn search"
                              >
                                💼
                              </button>
                              <button
                                onClick={() => handleSendWhatsApp(link)}
                                className="text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded"
                                title="WhatsApp"
                              >
                                💬
                              </button>
                              <button
                                onClick={() => handleSmartResearchOutreach(link)}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded"
                                title="Smart AI Outreach"
                              >
                                🤖
                              </button>
                              <button
                                onClick={() => handleOpenNativeSMS(link)}
                                className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded"
                                title="SMS"
                              >
                                📱
                              </button>
                              <button
                                onClick={() => handleOpenInstagram(link)}
                                className="text-xs bg-pink-700 hover:bg-pink-600 text-white px-2 py-1 rounded"
                                title="Instagram"
                              >
                                📷
                              </button>
                              <button
                                onClick={() => handleOpenTwitter(link)}
                                className="text-xs bg-sky-700 hover:bg-sky-600 text-white px-2 py-1 rounded"
                                title="Twitter"
                              >
                                𝕏
                              </button>
                            </div>
                            {smsConsent && (
                              <button
                                onClick={() => handleSendSMS(link)}
                                className="text-xs bg-orange-700 hover:bg-orange-600 text-white px-2 py-1 rounded mt-1 w-full"
                              >
                                Twilio SMS
                              </button>
                            )}
                            {link.email ? (
                              <select
                                value={dealStage[link.email] || 'new'}
                                onChange={(e) => updateDealStage(link.email, e.target.value)}
                                className="text-xs bg-gray-700 text-white border border-gray-600 rounded px-1 py-0.5 mt-1 w-full"
                              >
                                <option value="new">New</option>
                                <option value="contacted">Contacted</option>
                                <option value="demo">Demo Scheduled</option>
                                <option value="proposal">Proposal Sent</option>
                                <option value="won">Closed Won</option>
                              </select>
                            ) : (
                              <div className="text-xs text-gray-500 mt-1 italic">No email → CRM not tracked</div>
                            )}
                            {/* ✅ Manual Contact Mark Button */}
                            <button
                              onClick={() => markContactManually(link, !isContacted, 'Manual update')}
                              className={`text-xs px-2 py-1 rounded mt-1 w-full ${isContacted
                                  ? 'bg-gray-600 hover:bg-gray-500 text-white'
                                  : 'bg-green-600 hover:bg-green-500 text-white'
                                }`}
                            >
                              {isContacted ? '↩️ Mark Not Contacted' : '✅ Mark Contacted'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <button
                    onClick={handleSendBulkSMS}
                    disabled={!smsConsent || isSending}
                    className={`w-full py-2 rounded font-bold ${!smsConsent ? 'bg-gray-600 cursor-not-allowed' : 'bg-orange-700 hover:bg-orange-600 text-white'
                      }`}
                  >
                    📲 Send SMS to All ({whatsappLinks.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* FOLLOW-UP MODAL */}
      {showFollowUpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col border-2 border-indigo-500/30">
            <div className="relative p-6 border-b border-gray-700/50 bg-gradient-to-r from-indigo-900/40 via-purple-900/40 to-pink-900/40">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/10 to-purple-600/10 backdrop-blur-xl"></div>
              <div className="relative flex justify-between items-center">
                <div>
                  <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                    📬 Reply & Follow-Up Center
                  </h2>
                  <p className="text-sm text-indigo-200 mt-2">Intelligent campaign management with AI-powered insights</p>
                </div>
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="text-gray-400 hover:text-white hover:bg-red-500/20 transition-all duration-200 text-3xl w-12 h-12 rounded-full flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-6 bg-gradient-to-br from-gray-800/50 to-gray-900/50 border-b border-gray-700/50">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-gradient-to-br from-blue-900/40 to-blue-800/40 p-5 rounded-xl border border-blue-500/30 hover:border-blue-400/50 transition-all">
                    <div className="text-4xl font-bold text-blue-400">{followUpStats.totalSent}</div>
                    <div className="text-sm text-blue-200 mt-2 font-medium">Total Sent</div>
                    <div className="absolute top-3 right-3 text-2xl opacity-20">📤</div>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-gradient-to-br from-green-900/40 to-emerald-800/40 p-5 rounded-xl border border-green-500/30 hover:border-green-400/50 transition-all">
                    <div className="text-4xl font-bold text-green-400">{repliedLeadsList.length}</div>
                    <div className="text-sm text-green-200 mt-2 font-medium">
                      Replied ({Math.round((repliedLeadsList.length / Math.max(followUpStats.totalSent, 1)) * 100)}%)
                    </div>
                    <div className="absolute top-3 right-3 text-2xl opacity-20">✅</div>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-gradient-to-br from-indigo-900/40 to-purple-800/40 p-5 rounded-xl border border-indigo-500/30 hover:border-indigo-400/50 transition-all">
                    <div className="text-4xl font-bold text-indigo-400">{followUpStats.alreadyFollowedUp}</div>
                    <div className="text-sm text-indigo-200 mt-2 font-medium">Already Followed Up</div>
                    <div className="absolute top-3 right-3 text-2xl opacity-20">📬</div>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/20 to-orange-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-gradient-to-br from-yellow-900/40 to-orange-800/40 p-5 rounded-xl border border-yellow-500/30 hover:border-yellow-400/50 transition-all">
                    <div className="text-4xl font-bold text-yellow-400">{safeFollowUpCandidates.length}</div>
                    <div className="text-sm text-yellow-200 mt-2 font-medium">Ready for Follow-Up</div>
                    <div className="absolute top-3 right-3 text-2xl opacity-20">⏰</div>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-pink-600/20 rounded-xl blur-xl group-hover:blur-2xl transition-all"></div>
                  <div className="relative bg-gradient-to-br from-purple-900/40 to-pink-800/40 p-5 rounded-xl border border-purple-500/30 hover:border-purple-400/50 transition-all">
                    <div className="text-4xl font-bold text-purple-400">
                      ${Math.round((repliedLeadsList.length * 0.25 * 5000) / 1000)}k
                    </div>
                    <div className="text-sm text-purple-200 mt-2 font-medium">Potential Revenue</div>
                    <div className="absolute top-3 right-3 text-2xl opacity-20">💰</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-900/30 to-gray-800/30">
              {/* NEW REPLIES SECTION - PRIORITY */}
              {repliedLeadsList.length > 0 && (
                <div className="mb-6">
                  <div className="text-lg font-bold text-green-300 mb-4 flex items-center gap-3">
                    <span className="text-2xl">🎉</span>
                    <span>{repliedLeadsList.length} New Replies - Take Action!</span>
                  </div>
                  <div className="space-y-3">
                    {repliedLeadsList.slice(0, showAllRepliedLeads ? repliedLeadsList.length : 5).map((lead, idx) => (
                      <div key={idx} className="group relative">
                        <div className={`absolute inset-0 bg-gradient-to-r ${lead.isHotLead ? 'from-green-500/20 to-emerald-500/20' : 'from-blue-500/10 to-purple-500/10'} rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-all`}></div>
                        <div className={`relative p-4 rounded-xl ${lead.isHotLead ? 'bg-gradient-to-br from-green-900/40 to-emerald-900/40 border-green-500/40' : 'bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-gray-700'} border hover:border-indigo-500/50 transition-all`}>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {lead.isHotLead && <span className="text-xs bg-green-500/30 text-green-300 px-2 py-1 rounded-full font-bold">🔥 HOT</span>}
                                <div className="font-bold text-white">{lead.email}</div>
                              </div>
                              <div className="text-xs text-gray-400 mb-2">{lead.businessName || 'No company'}</div>
                              <div className="flex gap-4 text-sm">
                                <span className="text-indigo-400">
                                  📅 Replied {Math.ceil(lead.daysSinceReply)} days ago
                                </span>
                                <span className="text-purple-400">
                                  📨 Sent {Math.ceil(lead.daysSinceSent)} days ago
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2 ml-4">
                              <button
                                onClick={() => handleViewConversation(lead)}
                                className="relative group/btn overflow-hidden"
                                title="View Conversation"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 group-hover/btn:from-purple-500 group-hover/btn:to-pink-500 transition-all"></div>
                                <div className="relative px-4 py-2 text-white font-bold text-sm rounded-lg">
                                  💬 Thread
                                </div>
                              </button>
                              <button
                                onClick={async () => {
                                  const confirmed = confirm(`Create deal for ${lead.email}?`);
                                  if (!confirmed) return;
                                  try {
                                    const res = await fetch('/api/create-deal', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        userId: user.uid,
                                        email: lead.email,
                                        businessName: lead.businessName,
                                        stage: 'qualified'
                                      })
                                    });
                                    if (res.ok) {
                                      addNotification(`✅ Deal created for ${lead.email}`, 'success');
                                      await loadDeals();
                                    } else {
                                      addNotification('Failed to create deal', 'error');
                                    }
                                  } catch (err) {
                                    addNotification('Error creating deal', 'error');
                                  }
                                }}
                                className="relative group/btn overflow-hidden"
                                title="Create Deal"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 group-hover/btn:from-green-500 group-hover/btn:to-emerald-500 transition-all"></div>
                                <div className="relative px-4 py-2 text-white font-bold text-sm rounded-lg">
                                  💼 Deal
                                </div>
                              </button>
                              <button
                                onClick={() => window.open(`mailto:${lead.email}`, '_blank')}
                                className="relative group/btn overflow-hidden"
                                title="Send Email"
                              >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 group-hover/btn:from-blue-500 group-hover/btn:to-indigo-500 transition-all"></div>
                                <div className="relative px-4 py-2 text-white font-bold text-sm rounded-lg">
                                  📧 Email
                                </div>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {repliedLeadsList.length > 5 && (
                      <button
                        onClick={() => setShowAllRepliedLeads(!showAllRepliedLeads)}
                        className="w-full mt-3 py-2 px-4 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg text-sm font-medium transition-all"
                      >
                        {showAllRepliedLeads ? `Show Less (5)` : `View All ${repliedLeadsList.length} Replies`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {safeFollowUpCandidates.length === 0 ? (
                <div className="text-center py-16">
                  {pendingLeads.length > 0 ? (
                    <>
                      <div className="text-6xl mb-4">⏳</div>
                      <div className="text-2xl text-gray-200 font-bold mb-2">Pending Follow-Ups</div>
                      <div className="text-gray-400 mb-4">{pendingLeads.length} leads waiting for follow-up window</div>
                      <div className="max-w-2xl mx-auto bg-gray-800/50 rounded-lg p-4 text-left">
                        <div className="text-sm text-gray-300 mb-2">Next available follow-ups:</div>
                        {pendingLeads.slice(0, showAllPendingLeads ? pendingLeads.length : 3).map((lead, idx) => {
                          const timeUntilFollowUp = new Date(lead.followUpAt) - currentTime;
                          const hoursUntil = Math.floor(timeUntilFollowUp / (1000 * 60 * 60));
                          const minutesUntil = Math.floor((timeUntilFollowUp % (1000 * 60 * 60)) / (1000 * 60));
                          const secondsUntil = Math.floor((timeUntilFollowUp % (1000 * 60)) / 1000);
                          const isReady = timeUntilFollowUp <= 0;
                          
                          return (
                          <div key={idx} className="text-sm text-gray-400 py-2 border-b border-gray-700 last:border-0 flex justify-between items-center">
                            <div>
                              <div className="font-medium text-gray-300">{lead.email}</div>
                              <div className="text-xs text-gray-500">{lead.businessName || 'No company'}</div>
                            </div>
                            <div className="text-right">
                              <div className={`font-bold ${isReady ? 'text-green-400 animate-pulse' : hoursUntil <= 1 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                {isReady ? '🔓 Ready Now!' : hoursUntil > 0 ? `${hoursUntil}h ${minutesUntil}m ${secondsUntil}s` : `${minutesUntil}m ${secondsUntil}s`}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(lead.followUpAt).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                        })}
                        {pendingLeads.length > 3 && (
                          <button
                            onClick={() => setShowAllPendingLeads(!showAllPendingLeads)}
                            className="w-full mt-3 py-2 px-4 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-lg text-sm font-medium transition-all"
                          >
                            {showAllPendingLeads ? `Show Less` : `View All ${pendingLeads.length} Pending Leads`}
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 mt-3 bg-gray-800/50 inline-block px-4 py-2 rounded-lg">
                        Follow-ups become available 1+ day after initial send
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-6xl mb-4">✅</div>
                      <div className="text-2xl text-gray-200 font-bold mb-2">All Caught Up!</div>
                      <div className="text-gray-400">All leads have been replied to or maxed out follow-ups</div>
                      <div className="text-sm text-gray-500 mt-3 bg-gray-800/50 inline-block px-4 py-2 rounded-lg">
                        Follow-ups become available 1+ day after initial send
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-lg font-bold text-indigo-300 mb-5 flex items-center gap-3">
                    <span className="text-2xl">🎯</span>
                    <span>{safeFollowUpCandidates.length} leads ready for intelligent follow-up</span>
                  </div>

                  {/* MASS EMAIL BUTTON */}
                  {safeFollowUpCandidates.length > 0 && (
                    <div className="mb-6">
                      <button
                        onClick={handleMassEmailFollowUps}
                        disabled={isSending}
                        className={`w-full relative group overflow-hidden rounded-xl transition-all duration-300 ${isSending
                            ? 'bg-gray-600 cursor-not-allowed opacity-60'
                            : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
                          }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative px-8 py-4 text-white font-bold text-lg">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-2xl">📧</span>
                            <span>{isSending ? 'Sending...' : `Mass Email All Safe Leads (${safeFollowUpCandidates.length})`}</span>
                            {!isSending && <span className="text-lg">→</span>}
                          </div>
                          {!isSending && (
                            <div className="text-sm font-normal text-indigo-100 mt-1 text-center">
                              Send follow-up emails to all safe leads at once with tracking
                            </div>
                          )}
                          {isSending && sendProgress.total > 0 && (
                            <div className="mt-3">
                              <div className="w-full bg-white/20 rounded-full h-2">
                                <div
                                  className="bg-white rounded-full h-2 transition-all duration-300"
                                  style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                                ></div>
                              </div>
                              <div className="text-xs text-indigo-100 mt-1 text-center">
                                {sendProgress.current} / {sendProgress.total} sent
                              </div>
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Status message during mass send */}
                      {isSending && status && (
                        <div className="mt-3 text-center text-sm text-indigo-300 bg-indigo-900/30 rounded-lg px-4 py-2">
                          {status}
                        </div>
                      )}

                      {/* SMS QUALIFICATION BUTTON */}
                      <button
                        onClick={() => handleSMSQualification(safeFollowUpCandidates)}
                        disabled={isSending}
                        className={`w-full relative group overflow-hidden rounded-xl transition-all duration-300 mt-4 ${isSending
                            ? 'bg-gray-600 cursor-not-allowed opacity-60'
                            : 'bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 hover:from-green-500 hover:via-emerald-500 hover:to-teal-500 shadow-lg hover:shadow-xl transform hover:scale-[1.02]'
                          }`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative px-8 py-4 text-white font-bold text-lg">
                          <div className="flex items-center justify-center gap-3">
                            <span className="text-2xl">📱</span>
                            <span>{isSending ? 'Sending...' : `SMS Qualify All Leads (${safeFollowUpCandidates.length})`}</span>
                            {!isSending && <span className="text-lg">→</span>}
                          </div>
                          {!isSending && (
                            <div className="text-sm font-normal text-green-100 mt-1 text-center">
                              Send aggressive qualification SMS to filter time-wasters
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Debug Info Button */}
                      {!isSending && (
                        <div className="mt-3 text-center space-y-2">
                          <button
                            onClick={() => {
                              console.log('🔍 DEBUG - Mass Email Diagnostic Info:');
                              console.log('📊 Safe Candidates:', safeFollowUpCandidates);
                              console.log('👤 User:', user);
                              console.log('📧 Quota Check:', canUse('email', safeFollowUpCandidates.length));
                              console.log('📈 Sent Leads:', sentLeads);
                              console.log('🔄 Follow-up History:', followUpHistory);
                              console.log('❌ Replied Leads:', repliedLeads);

                              alert(`Debug Info:\n\nSafe Candidates: ${safeFollowUpCandidates.length}\nUser ID: ${user?.uid ? '✅' : '❌'}\nSent Leads: ${sentLeads?.length || 0}\n\nCheck console for detailed info.`);
                            }}
                            className="text-xs text-gray-400 hover:text-indigo-300 underline"
                          >
                            🔍 Debug Info
                          </button>

                          <button
                            onClick={testFollowUpSend}
                            className="text-xs text-orange-400 hover:text-orange-300 underline block w-full"
                          >
                            🧪 Test Single Follow-Up
                          </button>

                          <button
                            onClick={testFollowUpBypassQuota}
                            className="text-xs text-red-400 hover:text-red-300 underline block w-full"
                          >
                            ⚡ Bypass Quota Test
                          </button>
                        </div>
                      )}

                      {/* 🧠 SMART AI ACTIONS */}
                      <div className="mt-4 p-4 border border-indigo-600/30 rounded-xl bg-indigo-950/20">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            onClick={runAutoReplyProcessor}
                            disabled={!autoReplyProcessorEnabled}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded-lg font-semibold"
                          >
                            🤖 Run AI Auto-Reply Processor
                          </button>
                          <button
                            onClick={runFollowupScheduler}
                            disabled={!autoFollowupSchedulerEnabled}
                            className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm py-2 rounded-lg font-semibold"
                          >
                            📩 Run Smart Follow-Up Scheduler
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-300">
                          Auto-reply status: {aiProcessorStatus} • follow-up status: {followupSchedulerStatus}
                        </div>
                        <div className="mt-2 flex gap-2 text-xs text-gray-400">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={autoReplyProcessorEnabled}
                              onChange={(e) => setAutoReplyProcessorEnabled(e.target.checked)}
                              className="form-checkbox"
                            />
                            AI Auto-Reply Enabled
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={autoFollowupSchedulerEnabled}
                              onChange={(e) => setAutoFollowupSchedulerEnabled(e.target.checked)}
                              className="form-checkbox"
                            />
                            Smart Follow-Up Enabled
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {safeFollowUpCandidates.slice(0, showAllReadyLeads ? safeFollowUpCandidates.length : 10).map((contact) => {
                    const followUpCount = contact.followUpCount;
                    const followUpAt = new Date(contact.followUpAt);
                    const hoursOverdue = Math.floor((new Date() - followUpAt) / (1000 * 60 * 60));
                    return (
                      <div key={contact.email} className="group relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-all"></div>
                        <div className="relative p-5 rounded-xl bg-gradient-to-br from-gray-800/80 to-gray-900/80 border border-gray-700 hover:border-indigo-500/50 transition-all flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-bold text-white text-lg mb-1">{contact.email}</div>
                            <div className="text-xs text-gray-400 mb-2">{contact.businessName || 'No company'}</div>
                            <div className="flex gap-4 text-sm flex-wrap">
                              <span className="text-indigo-400 font-medium">
                                📅 {Math.ceil(contact.daysSinceSent)} days ago
                              </span>
                              <span className="text-purple-400 font-medium">
                                📨 Follow-up #{followUpCount + 1}
                              </span>
                              <span className={`font-bold ${hoursOverdue > 24 ? 'text-red-400' : hoursOverdue > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                ⏰ {hoursOverdue > 0 ? `${hoursOverdue}h overdue` : 'Ready now'}
                              </span>
                              <span className={`font-bold ${contact.safetyScore >= 80 ? 'text-green-400' :
                                  contact.safetyScore >= 60 ? 'text-yellow-400' :
                                    'text-orange-400'
                                }`}>
                                ✓ {Math.round(contact.safetyScore)}% safe
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 ml-6">
                            <button
                              onClick={async () => {
                                const confirmed = confirm(`Mark ${contact.email} as replied? This will cancel all scheduled follow-ups.`);
                                if (!confirmed) return;
                                try {
                                  const res = await fetch('/api/mark-replied', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: user.uid, email: contact.email })
                                  });
                                  if (res.ok) {
                                    addNotification(`✅ Marked ${contact.email} as replied`, 'success');
                                    await loadSentLeads();
                                    await loadRepliedAndFollowUp();
                                  } else {
                                    addNotification('Failed to mark as replied', 'error');
                                  }
                                } catch (err) {
                                  addNotification('Error marking as replied', 'error');
                                }
                              }}
                              className="relative group/btn overflow-hidden"
                              title="Mark as Replied"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-600 group-hover/btn:from-green-500 group-hover/btn:to-emerald-500 transition-all"></div>
                              <div className="relative px-4 py-3 text-white font-bold text-sm rounded-lg">
                                ✓ Replied
                              </div>
                            </button>
                            <button
                              onClick={async () => {
                                const confirmed = confirm(`Send follow-up #${followUpCount + 1} to ${contact.email}?`);
                                if (!confirmed) return;
                                try {
                                  const token = await requestGmailToken();
                                  await sendFollowUpWithToken(contact.email, token);
                                } catch (err) {
                                  alert('Gmail access failed.');
                                }
                              }}
                              className="relative group/btn overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 group-hover/btn:from-blue-500 group-hover/btn:to-indigo-500 transition-all"></div>
                              <div className="relative px-6 py-3 text-white font-bold text-base rounded-lg">
                                Send Now →
                              </div>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {safeFollowUpCandidates.length > 10 && (
                    <button
                      onClick={() => setShowAllReadyLeads(!showAllReadyLeads)}
                      className="w-full mt-4 py-3 px-4 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 rounded-lg text-sm font-medium transition-all"
                    >
                      {showAllReadyLeads ? `Show Less (10)` : `View All ${safeFollowUpCandidates.length} Ready Leads`}
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-700/50 bg-gradient-to-r from-gray-900/80 to-gray-800/80">
              <div className="text-sm text-gray-300 text-center space-y-1">
                <div className="font-semibold text-indigo-300 mb-2">💡 Best Practices:</div>
                <div className="flex justify-center gap-8 text-xs">
                  <span>✓ 2-day minimum between sends</span>
                  <span>✓ Max 3 follow-ups per contact</span>
                  <span>✓ 30-day campaign window</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CALL HISTORY MODAL */}
      {showCallHistoryModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gradient-to-r from-green-900/20 to-blue-900/20">
              <div>
                <h2 className="text-xl font-bold text-white">📞 Call History & Analytics</h2>
                <p className="text-sm text-gray-400">Track all your Twilio calls</p>
              </div>
              <button
                onClick={() => setShowCallHistoryModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>
            <div className="p-4 bg-gray-800 border-b border-gray-700 grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{callHistory.length}</div>
                <div className="text-xs text-gray-400">Total Calls</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {callHistory.filter(c => c.status === 'completed').length}
                </div>
                <div className="text-xs text-gray-400">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {callHistory.filter(c => c.status === 'failed').length}
                </div>
                <div className="text-xs text-gray-400">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {callHistory.filter(c => c.answeredBy === 'human').length}
                </div>
                <div className="text-xs text-gray-400">Human Answered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {callHistory.filter(c => c.answeredBy?.includes('machine')).length}
                </div>
                <div className="text-xs text-gray-400">Voicemail</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingCallHistory ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">⏳</div>
                  <div className="text-lg text-gray-300">Loading call history...</div>
                </div>
              ) : callHistory.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📞</div>
                  <div className="text-xl font-medium mb-2 text-gray-300">No calls yet</div>
                  <div className="text-gray-500">Start making calls to see them here</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {callHistory.map((call) => {
                    const isCompleted = call.status === 'completed';
                    const hasRecording = !!call.recordingUrl;
                    return (
                      <div
                        key={call.id}
                        className={`p-4 rounded-lg border-2 ${isCompleted
                            ? 'border-green-700 bg-green-900/10'
                            : call.status === 'failed'
                              ? 'border-red-700 bg-red-900/10'
                              : 'border-gray-700 bg-gray-800'
                          }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="font-bold text-white">{call.businessName}</h3>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${call.status === 'completed'
                                  ? 'bg-green-900/30 text-green-300'
                                  : call.status === 'failed'
                                    ? 'bg-red-900/30 text-red-300'
                                    : 'bg-gray-700 text-gray-300'
                                }`}>
                                {call.status === 'completed' ? 'Completed' : call.status === 'failed' ? 'Failed' : 'In Progress'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm text-gray-400 mt-2">
                              <div><span className="font-medium">📞 Phone:</span> {call.toPhone}</div>
                              <div><span className="font-medium">⏱️ Duration:</span> {call.duration || 0}s</div>
                              <div><span className="font-medium">🎤 Answered by:</span>{' '}
                                {call.answeredBy === 'human' ? '👤 Human' : call.answeredBy?.includes('machine') ? '📠 Voicemail' : '❓ Unknown'}
                              </div>
                              <div><span className="font-medium">📅 Date:</span>{' '}
                                {new Date(call.createdAt).toLocaleDateString() + ' ' + new Date(call.createdAt).toLocaleTimeString()}
                              </div>
                            </div>
                            {call.callSid && (
                              <div className="text-xs text-gray-500 mt-2 font-mono">SID: {call.callSid}</div>
                            )}
                            {call.error && (
                              <div className="mt-2 p-2 bg-red-900/20 rounded text-xs text-red-300">
                                <strong>Error:</strong> {call.error}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col space-y-2 ml-4">
                            {hasRecording && (
                              <a
                                href={call.recordingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-center"
                              >
                                🎙️ Listen
                              </a>
                            )}
                            {isCompleted && (
                              <span className="text-xs bg-green-900/30 text-green-300 px-3 py-1.5 rounded text-center font-medium">
                                ✅ Success
                              </span>
                            )}
                            {call.toPhone && (
                              <button
                                onClick={() => {
                                  let contact = whatsappLinks.find(c => c.phone === call.toPhone.replace(/\D/g, ''));
                                  if (!contact) {
                                    contact = {
                                      business: call.businessName || 'Unknown Business',
                                      phone: call.toPhone,
                                      email: null,
                                      address: ''
                                    };
                                  }
                                  handleTwilioCall(contact, call.callType || 'direct');
                                }}
                                className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded"
                              >
                                🔄 Retry
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONVERSATION THREAD MODAL */}
      {showConversationModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-purple-500/30">
            <div className="relative p-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-900/40 via-pink-900/40 to-indigo-900/40">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 to-pink-600/10 backdrop-blur-xl"></div>
              <div className="relative flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    <span className="text-3xl">💬</span>
                    <span>Email Conversation</span>
                  </h2>
                  <p className="text-sm text-purple-200 mt-2">
                    {conversationThread?.leadEmail} • {conversationThread?.leadBusiness || 'No company'}
                  </p>
                </div>
                <button
                  onClick={() => setShowConversationModal(false)}
                  className="text-gray-400 hover:text-white hover:bg-red-500/20 transition-all duration-200 text-3xl w-12 h-12 rounded-full flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingConversation ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4 animate-spin">⏳</div>
                  <div className="text-lg text-gray-300">Loading conversation...</div>
                </div>
              ) : conversationThread?.messages ? (
                <div className="space-y-4">
                  {conversationThread.messages.map((message, idx) => {
                    const isFromUser = message.from.includes(user?.email || process.env.GMAIL_SENDER_EMAIL);
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isFromUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[80%] rounded-2xl p-4 ${
                          isFromUser
                            ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white'
                            : 'bg-gradient-to-br from-gray-700 to-gray-800 text-gray-100 border border-gray-600'
                        }`}>
                          <div className="text-xs opacity-75 mb-2">
                            {isFromUser ? '📤 You' : '📥 ' + message.from.split('<')[0].trim()}
                          </div>
                          <div className="font-medium mb-2 text-sm">
                            {message.subject}
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {message.body || message.snippet}
                          </div>
                          <div className="text-xs opacity-60 mt-2 text-right">
                            {new Date(message.date).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📭</div>
                  <div className="text-xl font-medium mb-2 text-gray-300">No conversation found</div>
                  <div className="text-gray-500">Unable to load email thread</div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-700/50 bg-gray-900/50">
              <div className="flex justify-between items-center text-sm text-gray-400">
                <span>{conversationThread?.totalMessages || 0} messages</span>
                <button
                  onClick={() => window.open(`mailto:${conversationThread?.leadEmail}`, '_blank')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition"
                >
                  📧 Reply via Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-CHANNEL OUTREACH MODAL - ✅ MOBILE RESPONSIVE */}
      {showMultiChannelModal && (
        <div className={`fixed inset-0 bg-black/70 flex items-center justify-center z-50 ${isMultiChannelFullscreen ? '' : 'p-2 sm:p-4'
          }`}>
          <div className={`bg-gray-800 rounded-xl shadow-2xl ${isMultiChannelFullscreen
              ? 'w-screen h-screen max-h-screen rounded-none'
              : 'w-full max-w-6xl max-h-[90vh]'
            } overflow-hidden flex flex-col border border-gray-700`}>
            <div className="p-3 sm:p-4 border-b border-gray-700 flex justify-between items-center bg-gradient-to-r from-indigo-900/20 to-blue-900/20">
              <div className="flex-1 min-w-0">
                <h2 className="text-base sm:text-2xl font-bold text-white truncate">🌐 Multi-Channel Outreach Manager</h2>
                <p className="text-xs sm:text-sm text-gray-400 truncate">
                  Manage all your communication channels ({whatsappLinks.length} contacts)
                </p>
              </div>
              <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                <button
                  onClick={() => setIsMultiChannelFullscreen(!isMultiChannelFullscreen)}
                  className="text-white hover:text-indigo-400 transition px-2 sm:px-3 py-2 rounded hover:bg-gray-700 text-xs sm:text-sm"
                  title={isMultiChannelFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {isMultiChannelFullscreen ? '⛶ Exit' : '⛶ Full'}
                </button>
                <button
                  onClick={() => setShowMultiChannelModal(false)}
                  className="text-gray-400 hover:text-white text-xl sm:text-2xl"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stats Row - Mobile Responsive */}
            <div className="p-2 sm:p-4 bg-gray-800 border-b border-gray-700 grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-3">
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-blue-400">{whatsappLinks.length}</div>
                <div className="text-[10px] sm:text-xs text-gray-400">Total</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-green-400">
                  {Object.keys(repliedLeads).filter(k => repliedLeads[k]).length}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400">Replied</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-yellow-400">
                  {Object.keys(followUpLeads).filter(k => followUpLeads[k]).length}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400">Follow-Up</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-purple-400">
                  {whatsappLinks.filter(l => lastSent[l.email || l.phone]).length}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400">Contacted</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-orange-400">
                  {whatsappLinks.filter(l => !l.email).length}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400">Phone Only</div>
              </div>
              <div className="text-center">
                <div className="text-sm sm:text-xl font-bold text-cyan-400">
                  {whatsappLinks.filter(l => l.email && (leadScores[l.email] || 0) >= 70).length}
                </div>
                <div className="text-[10px] sm:text-xs text-gray-400">High Quality</div>
              </div>
            </div>

            {/* Contact List - Mobile Responsive Grid */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-4">
              {(() => {
                const notContactedLinks = sortedWhatsappLinks.filter(link => !isContactedOnAnyChannel(link));
                const contactedLinks = sortedWhatsappLinks.filter(link => isContactedOnAnyChannel(link));
                const formatTimestamp = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : null;

                const renderContactCard = (link, isContacted) => {
                  const contactKey = normalizeContactKey(link);
                  const isReplied = repliedLeads[link.email];
                  const score = leadScores[link.email] || 0;
                  const history = getContactHistory(link);
                  const lastEmail = history.email ? formatTimestamp(history.email) : null;
                  const lastWA = history.whatsapp ? formatTimestamp(history.whatsapp) : null;
                  const lastSMS = history.sms ? formatTimestamp(history.sms) : null;
                  const lastCall = history.call ? formatTimestamp(history.call) : null;
                  const lastContacted = history.lastContacted ? formatTimestamp(history.lastContacted) : 'Never contacted';

                  return (
                    <div
                      key={link.id}
                      className={`p-3 rounded-xl border-2 transition-all ${isReplied
                          ? 'border-green-700 bg-green-900/15'
                          : isContacted
                            ? 'border-gray-600 bg-gray-750'
                            : 'border-gray-700 bg-gray-800'
                        }`}
                    >
                      <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white text-sm sm:text-base truncate">
                            {link.business || 'Unnamed'}
                          </h3>
                          <p className="text-xs sm:text-sm text-gray-400 truncate">📞 +{link.phone}</p>
                          {link.email && (
                            <p className="text-[10px] sm:text-xs text-blue-300 truncate">📧 {link.email}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {isReplied && (
                            <span className="bg-green-900/40 text-green-300 text-[10px] sm:text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                              ✅ Replied
                            </span>
                          )}
                          {isContacted && !isReplied && (
                            <span className="bg-indigo-900/30 text-indigo-200 text-[10px] sm:text-xs px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                              📌 Contacted
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mb-3 p-3 rounded-lg bg-gray-900/70 border border-gray-700 text-[11px] sm:text-xs text-gray-300 space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Last Contact</span>
                          <span className="font-medium text-white">{lastContacted}</span>
                        </div>
                        {lastEmail && (
                          <div className="flex justify-between text-blue-200">
                            <span>📧 Email</span>
                            <span>{lastEmail}</span>
                          </div>
                        )}
                        {lastWA && (
                          <div className="flex justify-between text-green-200">
                            <span>💬 WhatsApp</span>
                            <span>{lastWA}</span>
                          </div>
                        )}
                        {lastSMS && (
                          <div className="flex justify-between text-purple-200">
                            <span>📱 SMS</span>
                            <span>{lastSMS}</span>
                          </div>
                        )}
                        {lastCall && (
                          <div className="flex justify-between text-orange-200">
                            <span>📞 Call</span>
                            <span>{lastCall}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-400">Lead score</span>
                          <span className={`font-semibold ${score >= 70 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-orange-400'
                            }`}>{score}/100</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => handleCall(link.phone)}
                            className="text-[10px] sm:text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded"
                          >
                            📞 Call
                          </button>
                          <button
                            onClick={() => handleSendWhatsApp(link)}
                            className="text-[10px] sm:text-xs bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded"
                          >
                            💬 WA
                          </button>
                        </div>
                        <button
                          onClick={() => handleOpenNativeSMS(link)}
                          className="w-full text-[10px] sm:text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded"
                        >
                          📱 SMS
                        </button>
                        {link.email && (
                          <select
                            value={dealStage[link.email] || 'new'}
                            onChange={(e) => updateDealStage(link.email, e.target.value)}
                            className="w-full text-[10px] sm:text-xs bg-gray-800 text-white border border-gray-600 rounded px-2 py-1"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="demo">Demo</option>
                            <option value="won">Won</option>
                          </select>
                        )}
                        <button
                          onClick={() => markContactManually(link, !isContacted, 'Manual update from modal')}
                          className={`w-full text-[10px] sm:text-xs px-2 py-1 rounded font-medium ${isContacted
                              ? 'bg-gray-600 hover:bg-gray-500 text-white'
                              : 'bg-green-600 hover:bg-green-500 text-white'
                            }`}
                        >
                          {isContacted ? '↩️ Mark Not Contacted' : '✅ Mark Contacted'}
                        </button>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setMultiChannelPanel('not-contacted')}
                        className={`px-3 py-2 rounded-full text-sm font-semibold transition ${multiChannelPanel === 'not-contacted'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                          }`}
                      >
                        🆕 Not Contacted ({notContactedLinks.length})
                      </button>
                      <button
                        onClick={() => setMultiChannelPanel('contacted')}
                        className={`px-3 py-2 rounded-full text-sm font-semibold transition ${multiChannelPanel === 'contacted'
                            ? 'bg-green-600 text-white shadow-lg'
                            : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
                          }`}
                      >
                        ✅ Contacted ({contactedLinks.length})
                      </button>
                    </div>

                    {multiChannelPanel === 'not-contacted' ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700">
                          <div>
                            <div className="text-sm font-semibold text-white">🆕 Not Contacted</div>
                            <div className="text-[11px] text-gray-400">{notContactedLinks.length} leads not yet marked as contacted</div>
                          </div>
                          <span className="text-sm font-bold text-cyan-300">{notContactedLinks.length}</span>
                        </div>
                        {notContactedLinks.length > 0 ? notContactedLinks.map(link => renderContactCard(link, false)) : (
                          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-4 text-sm text-gray-400">
                            No not-contacted leads found. Use the button to switch to Contacted and move leads back.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-700">
                          <div>
                            <div className="text-sm font-semibold text-white">✅ Contacted</div>
                            <div className="text-[11px] text-gray-400">{contactedLinks.length} contacts tracked with time stamps</div>
                          </div>
                          <span className="text-sm font-bold text-green-300">{contactedLinks.length}</span>
                        </div>
                        {contactedLinks.length > 0 ? contactedLinks.map(link => renderContactCard(link, true)) : (
                          <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/60 p-4 text-sm text-gray-400">
                            No contacted leads yet. Mark contacts as contacted to move them here.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-2 sm:p-4 border-t border-gray-700 bg-gray-800 flex justify-between items-center">
              <div className="text-[10px] sm:text-xs text-gray-500">
                💡 Contacted contacts shown at bottom • 077 numbers prioritized
              </div>
              <button
                onClick={() => setShowMultiChannelModal(false)}
                className="text-xs sm:text-sm bg-gray-700 hover:bg-gray-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI RESEARCH MODAL */}
      {showResearchModal && researchingCompany && researchResults[researchingCompany] && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-purple-500/30">
            <div className="relative p-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-900/40 via-pink-900/40 to-purple-900/40">
              <div className="relative flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400">
                    🤖 AI Research Results
                  </h2>
                  <p className="text-sm text-purple-200 mt-1">
                    {researchResults[researchingCompany].companyName}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowResearchModal(false);
                    setResearchingCompany(null);
                  }}
                  className="text-gray-400 hover:text-white hover:bg-red-500/20 transition-all duration-200 text-3xl w-12 h-12 rounded-full flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-900/30 to-gray-800/30">
              <div className="space-y-4">
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-blue-300 mb-2">📋 General Value Proposition</h3>
                  <div className="text-sm text-gray-300 space-y-2">
                    <div><span className="font-semibold">Service:</span> {researchResults[researchingCompany].generalIdea?.service || 'N/A'}</div>
                    <div><span className="font-semibold">Value:</span> {researchResults[researchingCompany].generalIdea?.valueProposition || 'N/A'}</div>
                    <div><span className="font-semibold">Target:</span> {researchResults[researchingCompany].generalIdea?.targetAudience || 'N/A'}</div>
                  </div>
                </div>
                {researchResults[researchingCompany].personalizedEmail?.researchNotes && (
                  <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                    <h3 className="text-sm font-bold text-yellow-300 mb-2">🔍 Research Notes</h3>
                    <p className="text-sm text-gray-300">{researchResults[researchingCompany].personalizedEmail.researchNotes}</p>
                  </div>
                )}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-purple-700">
                  <h3 className="text-sm font-bold text-purple-300 mb-3">✉️ Personalized Email</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Subject:</label>
                      <div className="bg-gray-900/50 p-3 rounded border border-gray-600 text-sm text-white font-medium">
                        {researchResults[researchingCompany].personalizedEmail?.subject || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Body:</label>
                      <div className="bg-gray-900/50 p-3 rounded border border-gray-600 text-sm text-white whitespace-pre-wrap">
                        {researchResults[researchingCompany].personalizedEmail?.body || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-700/50 bg-gradient-to-r from-gray-800/30 to-gray-900/30 flex justify-end gap-3">
              <button
                onClick={() => {
                  const emailText = `Subject: ${researchResults[researchingCompany].personalizedEmail?.subject || ''}\n${researchResults[researchingCompany].personalizedEmail?.body || ''}`;
                  navigator.clipboard.writeText(emailText);
                  alert('Email copied to clipboard!');
                }}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded font-medium"
              >
                📋 Copy Email
              </button>
              <button
                onClick={() => {
                  setShowResearchModal(false);
                  setResearchingCompany(null);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BUSINESS INTELLIGENCE DASHBOARD */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setAnalyticsTab(analyticsTab === 'hidden' ? 'overview' : 'hidden')}
          className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg font-bold text-lg transition-all"
          title="Business Intelligence"
        >
          📊
        </button>
      </div>

      {analyticsTab !== 'hidden' && (
        <div className="fixed bottom-24 right-4 z-40 bg-gray-900 border-2 border-cyan-500/50 rounded-2xl shadow-2xl w-96 max-h-96 overflow-hidden">
          <div className="bg-gradient-to-r from-cyan-900 to-blue-900 p-4 border-b border-cyan-500/30 flex justify-between items-center">
            <h3 className="text-lg font-bold text-cyan-200">📊 Business Intelligence</h3>
            <button
              onClick={() => setAnalyticsTab('hidden')}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-3 overflow-y-auto max-h-80">
            <div className="flex gap-2">
              <button
                onClick={() => { setAnalyticsTab('overview'); loadAnalytics('comprehensive'); }}
                className={`flex-1 py-2 px-3 rounded text-sm font-bold transition ${analyticsTab === 'overview' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                📈 ROI & Analytics
              </button>
              <button
                onClick={() => { setAnalyticsTab('pipeline'); loadPipeline('comprehensive'); }}
                className={`flex-1 py-2 px-3 rounded text-sm font-bold transition ${analyticsTab === 'pipeline' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                🎯 Pipeline
              </button>
              <button
                onClick={() => { setAnalyticsTab('predict'); loadPredictiveAnalysis('comprehensive'); }}
                className={`flex-1 py-2 px-3 rounded text-sm font-bold transition ${analyticsTab === 'predict' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                🔮 AI Predict
              </button>
            </div>

            {analyticsTab === 'overview' && analyticsData && (
              <div className="space-y-3">
                {analyticsData.roi && (
                  <div className="bg-green-900/30 border border-green-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-green-400 mb-2">💹 ROI Analysis</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-400">ROI:</span> <span className="font-bold text-green-400">{analyticsData.roi.roi}%</span></div>
                      <div><span className="text-gray-400">Revenue:</span> <span className="font-bold text-green-400">${analyticsData.roi.revenue}</span></div>
                      <div><span className="text-gray-400">Cost:</span> <span className="font-bold text-red-400">${analyticsData.roi.totalCost}</span></div>
                      <div><span className="text-gray-400">Margin:</span> <span className="font-bold text-blue-400">{(analyticsData.roi.profitMargin || 0).toFixed(1)}%</span></div>
                    </div>
                  </div>
                )}

                {analyticsData.funnel && analyticsData.funnel.conversionRates && (
                  <div className="bg-purple-900/30 border border-purple-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-purple-400 mb-2">📊 Conversion Funnel</div>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-gray-400">Overall:</span> <span className="font-bold text-purple-400">{(analyticsData.funnel.conversionRates.overall * 100).toFixed(1)}%</span></div>
                      <div><span className="text-gray-400">Open Rate:</span> <span className="font-bold text-purple-400">{(analyticsData.funnel.conversionRates.sent_to_open * 100).toFixed(1)}%</span></div>
                      <div><span className="text-gray-400">Click Rate:</span> <span className="font-bold text-purple-400">{(analyticsData.funnel.conversionRates.open_to_click * 100).toFixed(1)}%</span></div>
                    </div>
                  </div>
                )}

                {analyticsData.channelPerformance && (
                  <div className="bg-orange-900/30 border border-orange-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-orange-400 mb-2">📱 Best Channel</div>
                    {Object.entries(analyticsData.channelPerformance).map(([channel, data]) => (
                      data.conversionRate > 0 && (
                        <div key={channel} className="text-xs">
                          <span className="text-gray-400 capitalize">{channel}:</span> <span className="font-bold text-orange-400">{(data.conversionRate * 100).toFixed(1)}%</span>
                        </div>
                      )
                    ))}
                  </div>
                )}

                {loadingAnalytics && <div className="text-center text-sm text-gray-400">Loading analytics...</div>}
              </div>
            )}

            {analyticsTab === 'pipeline' && pipelineData && (
              <div className="space-y-3">
                {pipelineData.expectedRevenue && (
                  <div className="bg-cyan-900/30 border border-cyan-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-cyan-400 mb-2">💰 Pipeline Value</div>
                    <div className="text-lg font-bold text-cyan-300">${(pipelineData.expectedRevenue.totalExpected / 1000).toFixed(0)}k</div>
                    <div className="text-xs text-cyan-400 mt-1">Expected Revenue</div>
                  </div>
                )}

                {pipelineData.forecast && (
                  <div className="bg-blue-900/30 border border-blue-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-blue-400 mb-2">📈 Forecast (90d)</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-400">Forecasted:</span> <span className="font-bold text-blue-400">${(pipelineData.forecast.forecastedRevenue / 1000).toFixed(0)}k</span></div>
                      <div><span className="text-gray-400">Cycle:</span> <span className="font-bold text-blue-400">{pipelineData.forecast.avgSalesCycleDays}d</span></div>
                    </div>
                  </div>
                )}

                {pipelineData.suggestions && pipelineData.suggestions.length > 0 && (
                  <div className="bg-yellow-900/30 border border-yellow-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-yellow-400 mb-2">💡 Next Steps</div>
                    {pipelineData.suggestions.slice(0, 2).map((suggestion, idx) => (
                      <div key={idx} className="text-xs text-yellow-300 mb-1">
                        🎯 {suggestion.action}
                      </div>
                    ))}
                  </div>
                )}

                {loadingPipeline && <div className="text-center text-sm text-gray-400">Loading pipeline...</div>}
              </div>
            )}

            {analyticsTab === 'predict' && predictiveData && (
              <div className="space-y-3">
                {predictiveData.closureProbability && (
                  <div className="bg-teal-900/30 border border-teal-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-teal-400 mb-2">🎯 Close Probability</div>
                    <div className="text-lg font-bold text-teal-300">{(predictiveData.closureProbability * 100).toFixed(0)}%</div>
                    <div className="text-xs text-teal-400 mt-1">Likelihood to win</div>
                  </div>
                )}

                {predictiveData.bestContactTime && (
                  <div className="bg-pink-900/30 border border-pink-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-pink-400 mb-2">⏰ Best Contact Time</div>
                    <div className="text-sm text-pink-300 capitalize">{predictiveData.bestContactTime.recommendedDay}</div>
                    <div className="text-xs text-pink-400 mt-1 capitalize">{predictiveData.bestContactTime.recommendedTime}</div>
                  </div>
                )}

                {predictiveData.priceSensitivity && (
                  <div className="bg-indigo-900/30 border border-indigo-700/50 p-3 rounded">
                    <div className="text-xs font-bold text-indigo-400 mb-2">💵 Price Sensitivity</div>
                    <div className="text-sm text-indigo-300">{predictiveData.priceSensitivity.sensitivityTier}</div>
                    <div className="text-xs text-indigo-400 mt-1">{predictiveData.priceSensitivity.recommendedStrategy.substring(0, 40)}...</div>
                  </div>
                )}

                {loadingPredictive && <div className="text-center text-sm text-gray-400">Loading predictions...</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

