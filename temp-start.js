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
  sendPasswordResetEmail
} from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

// ============================================================================
// FIREBASE CONFIGURATION
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

// ============================================================================
// FIREBASE INITIALIZATION WITH ERROR HANDLING
// ============================================================================
const initializeFirebase = () => {
  try {
    if (typeof window === 'undefined') return null;
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    return {
      db: getFirestore(app),
      auth: getAuth(app),
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
// CONFIGURATION CONSTANTS
// ============================================================================
const CONFIG = {
  MAX_DAILY_EMAILS: 500,
  MAX_DAILY_WHATSAPP: 100,
  MAX_DAILY_SMS: 50,
  MAX_DAILY_CALLS: 30,
  MIN_DAYS_BETWEEN_CONTACT: 2,
  MAX_FOLLOW_UPS: 3,
  CAMPAIGN_WINDOW_DAYS: 30,
  LEAD_SCORE_HOT: 75,
  LEAD_SCORE_WARM: 50,
  AUTO_SAVE_DELAY_MS: 1500,
  POLL_INTERVAL_MS: 6000,
  MAX_POLL_ATTEMPTS: 20,
  DEFAULT_AVG_DEAL_VALUE: 5000,
  DEFAULT_CLOSE_RATE: 0.15,
  DEFAULT_DEMO_RATE: 0.40,
  CACHE_EXPIRY_MS: 300000,
  MAX_RECENT_CONTACTS: 1000,
  BACKUP_INTERVAL_HOURS: 24,
  ITEMS_PER_PAGE: 50,
  DEBOUNCE_DELAY_MS: 300,
  NOTIFICATION_DURATION_MS: 5000,
  MAX_NOTIFICATIONS: 50,
  SESSION_TIMEOUT_MS: 3600000,
  MAX_IMAGE_SIZE_MB: 5,
  MAX_IMAGES_PER_EMAIL: 3,
  RATE_LIMIT_DELAY_MS: 200,
  BATCH_SIZE: 50,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000
};

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
    name: 'Breakup Email (Day 7)',
    channel: 'email',
    enabled: true,
    delayDays: 7,
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
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format phone number for international dialing (Sri Lanka format)
 */
function formatForDialing(raw) {
  if (!raw || raw === 'N/A' || raw === '' || raw === 'undefined' || raw === 'null') return null;
  let cleaned = raw.toString().replace(/\D/g, '');
  
  // Handle Sri Lankan numbers starting with 0
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }
  
  // Handle numbers without country code
  if (cleaned.length === 9 && /^[7-9]/.test(cleaned)) {
    cleaned = '94' + cleaned;
  }
  
  // Validate international format
  const isValid = /^[1-9]\d{9,14}$/.test(cleaned);
  return isValid ? cleaned : null;
}

/**
 * Format phone for display
 */
function formatPhoneForDisplay(phone) {
  if (!phone) return '';
  const cleaned = phone.toString().replace(/\D/g, '');
  if (cleaned.startsWith('94') && cleaned.length === 11) {
    return '+' + cleaned.slice(0, 2) + ' ' + cleaned.slice(2, 5) + ' ' + cleaned.slice(5, 8) + ' ' + cleaned.slice(8);
  }
  return '+' + cleaned;
}

/**
 * Extract template variables from text (e.g., {{business_name}})
 */
const extractTemplateVariables = (text) => {
  if (!text) return [];
  const matches = text.match(/\{\{\s*([^}]+?)\s*\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{\s*|\s*\}\}/g, '').trim()))];
};

/**
 * Validate email address with strict rules
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  let cleaned = email.trim()
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
  
  // Additional email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleaned)) return false;
  
  return true;
};

/**
 * Parse CSV row with proper quote handling
 */
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

/**
 * Render template text with variable substitution
 */
const renderPreviewText = (text, recipient, mappings, sender) => {
  if (!text) return '';
  let result = text;
  
  Object.entries(mappings).forEach(([varName, col]) => {
    const regex = new RegExp(`{{\\s*${varName}\\s*}}`, 'g');
    
    if (varName === 'sender_name') {
      result = result.replace(regex, sender || 'Team');
    } else if (recipient && col && recipient[col] !== undefined) {
      const value = recipient[col];
      result = result.replace(regex, value !== null && value !== undefined ? String(value) : `[${varName}]`);
    } else {
      result = result.replace(regex, `[${varName}]`);
    }
  });
  
  // Replace any remaining unmatched variables
  result = result.replace(/\{\{\s*[^}]+\s*\}\}/g, (match) => {
    const varName = match.replace(/\{\{\s*|\s*\}\}/g, '').trim();
    return `[${varName}]`;
  });
  
  return result;

/**
 * Generate social media handle from business name
 */
const generateSocialHandle = (businessName, platform) => {
  if (!businessName) return null;
  
  let handle = businessName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);
  
  // Remove leading/trailing underscores
  handle = handle.replace(/^_+|_+$/g, '');
  
  return handle || null;
};

/**
 * Copy text to clipboard with feedback
 */
const copyToClipboard = async (text, label = 'Text') => {
  try {
    await navigator.clipboard.writeText(text);
    return { success: true, message: `✅ Copied ${label}` };
  } catch (error) {
    console.error('Clipboard copy failed:', error);
    return { success: false, message: `❌ Failed to copy ${label}` };
  }
};

/**
 * Calculate days between two dates
 */
const daysBetween = (date1, date2) => {
  if (!date1 || !date2) return 999;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Generate unique ID
 */
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Debounce function
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 */
const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Local storage helper with error handling
 */
const localStorageHelper = {
  get: (key, defaultValue = null) => {
    try {
      const item = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('LocalStorage set error:', error);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(key);
      }
      return true;
    } catch (error) {
      console.error('LocalStorage remove error:', error);
      return false;
    }
  }
};

/**
 * Session storage helper
 */
const sessionStorageHelper = {
  get: (key, defaultValue = null) => {
    try {
      const item = typeof window !== 'undefined' ? sessionStorage.getItem(key) : null;
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('SessionStorage get error:', error);
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(key, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error('SessionStorage set error:', error);
      return false;
    }
  }
};

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

/**
 * Hook for managing contact tracking with duplicate prevention
 */
const useContactTracking = (userId) => {
  const [contactHistory, setContactHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load contact history from Firebase
  useEffect(() => {
    if (!userId || !db) {
      setLoading(false);
      return;
    }
    
    const loadContactHistory = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, 'contact_history'),
          where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);
        
        const history = {};
        snapshot.forEach(doc => {
          const data = doc.data();
          const key = data.contactKey || data.email || data.phone;
          if (key) {
            history[key] = {
              ...data,
              id: doc.id,
              lastUpdated: data.lastUpdated || new Date().toISOString()
            };
          }
        });
        
        setContactHistory(history);
        localStorageHelper.set(`contact_history_${userId}`, history);
      } catch (err) {
        console.error('Load contact history error:', err);
        setError(err.message);
        
        // Fallback to localStorage
        const cached = localStorageHelper.get(`contact_history_${userId}`, {});
        setContactHistory(cached);
      } finally {
        setLoading(false);
      }
    };
    
    loadContactHistory();
  }, [userId]);
  
  // Update contact history
  const updateContact = useCallback(async (contactKey, channel, data = {}) => {
    if (!userId || !db || !contactKey) return false;
    
    try {
      const now = new Date().toISOString();
      const docRef = doc(db, 'contact_history', `${userId}_${contactKey}`);
      
      const updateData = {
        userId,
        contactKey,
        lastContacted: now,
        lastChannel: channel,
        contactCount: increment(1),
        channels: arrayUnion(channel),
        lastUpdated: now,
        ...data
      };
      
      await setDoc(docRef, updateData, { merge: true });
      
      // Update local state
      setContactHistory(prev => ({
        ...prev,
        [contactKey]: {
          ...(prev[contactKey] || {}),
          ...updateData,
          lastUpdated: now
        }
      }));
      
      return true;
    } catch (err) {
      console.error('Update contact error:', err);
      return false;
    }
  }, [userId]);
  
  // Check if contact can be reached
  const canContact = useCallback((contactKey, channel, minDays = CONFIG.MIN_DAYS_BETWEEN_CONTACT) => {
    const history = contactHistory[contactKey];
    
    if (!history) return { canContact: true, reason: 'No previous contact' };
    
    const lastContact = history.lastContacted;
    if (!lastContact) return { canContact: true, reason: 'No contact date' };
    
    const daysSince = daysBetween(lastContact, new Date());
    
    if (daysSince < minDays) {
      return {
        canContact: false,
        reason: `Contacted ${daysSince.toFixed(1)} days ago (min: ${minDays} days)`,
        daysSince,
        lastContact
      };
    }
    
    // Check channel-specific limits
    const channelCount = history[`${channel}Count`] || 0;
    const maxChannelContacts = channel === 'email' ? CONFIG.MAX_FOLLOW_UPS + 1 :
                               channel === 'whatsapp' ? 5 :
                               channel === 'sms' ? 3 : 2;
    
    if (channelCount >= maxChannelContacts) {
      return {
        canContact: false,
        reason: `Max ${channel} contacts reached (${channelCount}/${maxChannelContacts})`,
        channelCount,
        maxChannelContacts
      };
    }
    
    return { canContact: true, reason: 'Safe to contact', daysSince };
  }, [contactHistory]);
  
  // Get contact summary
  const getContactSummary = useCallback((contactKey) => {
    const history = contactHistory[contactKey];
    
    if (!history) {
      return {
        contacted: false,
        totalContacts: 0,
        channels: [],
        lastContacted: null,
        lastChannel: null
      };
    }
    
    return {
      contacted: true,
      totalContacts: history.contactCount || 0,
      channels: history.channels || [],
      lastContacted: history.lastContacted,
      lastChannel: history.lastChannel,
      emailCount: history.emailCount || 0,
      whatsappCount: history.whatsappCount || 0,
      smsCount: history.smsCount || 0,
      callCount: history.callCount || 0
    };
  }, [contactHistory]);
  
  return {
    contactHistory,
    loading,
    error,
    updateContact,
    canContact,
    getContactSummary,
    setContactHistory
  };
};

/**
 * Hook for managing daily quotas
 */
const useDailyQuotas = (userId) => {
  const [quotas, setQuotas] = useState({
    emails: { used: 0, limit: CONFIG.MAX_DAILY_EMAILS, resetTime: null },
    whatsapp: { used: 0, limit: CONFIG.MAX_DAILY_WHATSAPP, resetTime: null },
    sms: { used: 0, limit: CONFIG.MAX_DAILY_SMS, resetTime: null },
    calls: { used: 0, limit: CONFIG.MAX_DAILY_CALLS, resetTime: null }
  });
  const [loading, setLoading] = useState(true);
  
  // Load quotas from API
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    const loadQuotas = async () => {
      try {
        const res = await fetch('/api/get-daily-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        
        if (res.ok) {
          const data = await res.json();
          setQuotas({
            emails: { 
              used: data.count || 0, 
              limit: CONFIG.MAX_DAILY_EMAILS,
              resetTime: data.resetTime || null
            },
            whatsapp: { 
              used: data.whatsappCount || 0, 
              limit: CONFIG.MAX_DAILY_WHATSAPP,
              resetTime: data.resetTime || null
            },
            sms: { 
              used: data.smsCount || 0, 
              limit: CONFIG.MAX_DAILY_SMS,
              resetTime: data.resetTime || null
            },
            calls: { 
              used: data.callCount || 0, 
              limit: CONFIG.MAX_DAILY_CALLS,
              resetTime: data.resetTime || null
            }
          });
        }
      } catch (err) {
        console.error('Load quotas error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadQuotas();
    
    // Refresh quotas every hour
    const interval = setInterval(loadQuotas, 3600000);
    return () => clearInterval(interval);
  }, [userId]);
  
  // Check if quota available
  const canUse = useCallback((channel, count = 1) => {
    // Map channel names to quota keys
    const channelMap = {
      'email': 'emails',
      'whatsapp': 'whatsapp', 
      'sms': 'sms',
      'call': 'calls'
    };
    
    const quotaKey = channelMap[channel] || channel;
    const quota = quotas[quotaKey];
    if (!quota) return { available: false, reason: 'Invalid channel' };
    
    const remaining = quota.limit - quota.used;
    if (remaining < count) {
      return {
        available: false,
        reason: `Quota exceeded (${quota.used}/${quota.limit} used)`,
        remaining: 0,
        used: quota.used,
        limit: quota.limit
      };
    }
    
    return {
      available: true,
      reason: 'Quota available',
      remaining,
      used: quota.used,
      limit: quota.limit
    };
  }, [quotas]);
  
  // Increment quota usage
  const incrementQuota = useCallback((channel, count = 1) => {
    // Map channel names to quota keys
    const channelMap = {
      'email': 'emails',
      'whatsapp': 'whatsapp', 
      'sms': 'sms',
      'call': 'calls'
    };
    
    const quotaKey = channelMap[channel] || channel;
    
    setQuotas(prev => ({
      ...prev,
      [quotaKey]: {
        ...prev[quotaKey],
        used: prev[quotaKey].used + count
      }
    }));
  }, []);
  
  return {
    quotas,
    loading,
    canUse,
    incrementQuota,
    setQuotas
  };
};

/**
 * Hook for managing lead scoring
 */
const useLeadScoring = () => {
  const [scores, setScores] = useState({});
  
  const calculateScore = useCallback((contact, contactHistory = {}) => {
    if (!contact) return 50;
    
    let score = 50;
    const contactKey = contact.email || contact.phone;
    const history = contactHistory[contactKey] || {};
    
    // Email quality
    if (contact.email && isValidEmail(contact.email)) {
      score += 15;
    }
    
    // Phone quality
    if (contact.phone && formatForDialing(contact.phone)) {
      score += 10;
    }
    
    // Social media presence
    const socialChannels = [
      contact.twitter,
      contact.instagram,
      contact.facebook,
      contact.youtube,
      contact.linkedin_company,
      contact.linkedin_ceo,
      contact.linkedin_founder
    ].filter(Boolean).length;
    
    score += Math.min(15, socialChannels * 3);
    
    // Contact confidence
    if (contact.contact_confidence === 'High') score += 10;
    else if (contact.contact_confidence === 'Medium') score += 5;
    
    // Decision maker
    if (contact.linkedin_ceo || contact.linkedin_founder) score += 10;
    if (contact.decision_maker_found === 'Yes') score += 8;
    
    // Engagement history
    if (history.contactCount > 0) {
      score += Math.min(10, history.contactCount * 2);
    }
    
    if (history.replied) {
      score += 25;
    }
    
    // Company size
    if (contact.company_size_indicator === 'small') score += 5;
    else if (contact.company_size_indicator === 'medium') score += 10;
    else if (contact.company_size_indicator === 'enterprise') score += 12;
    
    // Website presence
    if (contact.website) score += 5;
    if (contact.contact_page_found === 'Yes') score += 5;
    
    // Lead quality from CSV
    if (contact.lead_quality === 'HOT') score += 30;
    else if (contact.lead_quality === 'WARM') score += 15;
    
    // Rating and reviews
    if (parseFloat(contact.rating) >= 4.8) score += 20;
    if (parseInt(contact.review_count) > 100) score += 10;
    
    return Math.min(100, Math.max(0, score));
  }, []);
  
  const updateScore = useCallback((contactKey, score) => {
    setScores(prev => ({
      ...prev,
      [contactKey]: score
    }));
  }, []);
  
  return {
    scores,
    calculateScore,
    updateScore,
    setScores
  };
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
