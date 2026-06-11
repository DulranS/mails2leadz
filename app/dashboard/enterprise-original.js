'use client';

/**
 * ============================================================================
 * B2B GROWTH ENGINE - ENTERPRISE DASHBOARD WITH AI INTEGRATION
 * ============================================================================
 * Combines stable authentication with full enterprise functionality
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';

// Firebase imports
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, updateDoc, deleteDoc, orderBy, limit, addDoc, arrayUnion, increment } from 'firebase/firestore';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';

// Initialize Firebase with error handling (client-side only)
let app;
let db;
let auth;

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
    } else {
      console.warn('Firebase configuration incomplete - using mock services');
      db = null;
      auth = null;
    }
  } catch (error) {
    console.error('Firebase initialization error:', error);
    db = null;
    auth = null;
  }
}

// ============================================================================
// YOUR ACTUAL TEMPLATES & BUSINESS LOGIC
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
// CONTACT STATUS DEFINITIONS (Business-Driven Workflow)
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
// UTILITY FUNCTIONS
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

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function Dashboard() {
  // AUTH & NAVIGATION STATE
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const router = useRouter();
  const pathname = usePathname();
  const mountedRef = useRef(true);

  // CORE FUNCTIONALITY STATE
  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [senderName, setSenderName] = useState('Dulran Samarasinghe');
  const [abTestMode, setAbTestMode] = useState(false);
  const [templateA, setTemplateA] = useState(DEFAULT_TEMPLATE_A);
  const [templateB, setTemplateB] = useState(DEFAULT_TEMPLATE_B);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);
  const [instagramTemplate, setInstagramTemplate] = useState(`Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat about how we can help?
No pressure at all.`);
  const [twitterTemplate, setTwitterTemplate] = useState(`Hi {{business_name}} 👋
I run Syndicate Solutions – we help businesses like yours with web, AI, and digital ops.
Would you be open to a quick chat?`);
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

  // CONTACT STATUS MANAGEMENT STATE
  const [contactStatuses, setContactStatuses] = useState({});
  const [statusHistory, setStatusHistory] = useState({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedContactForStatus, setSelectedContactForStatus] = useState(null);
  const [statusNote, setStatusNote] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [archivedContactsCount, setArchivedContactsCount] = useState(0);

  // AI FEATURES STATE (Graceful degradation)
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

  // ENHANCED FOLLOW-UP OPTIONS
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

  // UI STATE
  const [activeTab, setActiveTab] = useState('outreach');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contactFilter, setContactFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');
  const [showDetailedAnalytics, setShowDetailedAnalytics] = useState(false);

  // AUTHENTICATION FUNCTIONS
  const signInWithGoogle = async () => {
    if (!auth) {
      setAuthError('Firebase Auth not available');
      return;
    }

    try {
      setAuthError(null);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      console.log('User signed in:', result.user);
    } catch (error) {
      console.error('Sign-in error:', error);
      setAuthError(error.message);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;

    try {
      await signOut(auth);
      setUser(null);
      setAuthError(null);
    } catch (error) {
      console.error('Sign-out error:', error);
      setAuthError(error.message);
    }
  };

  // Load settings from Firestore
  const loadSettings = async (userId) => {
    if (!mountedRef.current || !db) return;

    try {
      const docRef = doc(db, 'users', userId, 'settings', 'templates');
      const snap = await getDoc(docRef);

      if (snap.exists() && mountedRef.current) {
        const data = snap.data();
        setSenderName(data.senderName || 'Dulran Samarasinghe');
        setTemplateA(data.templateA || DEFAULT_TEMPLATE_A);
        setTemplateB(data.templateB || DEFAULT_TEMPLATE_B);
        setWhatsappTemplate(data.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE);
        setSmsTemplate(data.smsTemplate || DEFAULT_SMS_TEMPLATE);
        setInstagramTemplate(data.instagramTemplate || instagramTemplate);
        setTwitterTemplate(data.twitterTemplate || twitterTemplate);
        setAbTestMode(data.abTestMode || false);
        setSmsConsent(data.smsConsent !== false);
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  };

  // Save settings to Firestore
  const saveSettings = useCallback(async () => {
    if (!user?.uid || !mountedRef.current || !db) return;

    try {
      const docRef = doc(db, 'users', user.uid, 'settings', 'templates');
      await setDoc(docRef, {
        senderName,
        templateA,
        templateB,
        whatsappTemplate,
        smsTemplate,
        instagramTemplate,
        twitterTemplate,
        abTestMode,
        smsConsent,
        lastUpdated: serverTimestamp()
      });
      setStatus('Settings saved successfully!');
      setTimeout(() => setStatus(''), 3000);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setStatus('Failed to save settings');
    }
  }, [user?.uid, senderName, templateA, templateB, whatsappTemplate, smsTemplate, instagramTemplate, twitterTemplate, abTestMode, smsConsent]);

  // LOAD CONTACTS FROM FIRESTORE
  const loadContactsFromFirestore = useCallback(async (userId) => {
    if (!userId || !db) return;
    setLoadingContacts(true);
    try {
      const contactsRef = collection(db, 'users', userId, 'contacts');
      const q = query(contactsRef, orderBy('lastUpdated', 'desc'));
      const snapshot = await getDocs(q);
      
      const contacts = [];
      const statuses = {};
      const history = {};
      
      snapshot.forEach(doc => {
        const data = doc.data();
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
      
      setWhatsappLinks(contacts);
      setContactStatuses(statuses);
      setStatusHistory(history);
      
    } catch (error) {
      console.error('Failed to load contacts from Firestore:', error);
      if (mountedRef.current) {
        setStatus('Failed to load contact database. Check console for details.');
      }
    } finally {
      if (mountedRef.current) {
        setLoadingContacts(false);
      }
    }
  }, [fieldMappings, senderName, whatsappTemplate]);

  // UPDATE CONTACT STATUS
  const updateContactStatus = useCallback(async (contactId, newStatus, note = '') => {
    if (!user?.uid || !contactId || !newStatus || !db) {
      console.warn('Missing required data for status update');
      return false;
    }
    
    const currentStatus = contactStatuses[contactId] || 'new';
    if (currentStatus !== newStatus && 
        !STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) &&
        currentStatus !== 'archived') {
      const validTransitions = STATUS_TRANSITIONS[currentStatus] || [];
      console.warn(`Invalid status transition: ${currentStatus} -> ${newStatus}. Valid:`, validTransitions);
      if (mountedRef.current) {
        alert(`Cannot change status from "${currentStatus}" to "${newStatus}".\nValid next statuses: ${validTransitions.join(', ') || 'none'}`);
      }
      return false;
    }
    
    try {
      const contactsRef = collection(db, 'users', user.uid, 'contacts');
      let contactDocRef = null;
      let contactData = null;
      
      if (contactId.includes('@')) {
        const emailQuery = query(contactsRef, where('email', '==', contactId));
        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
          contactDocRef = doc(db, 'users', user.uid, 'contacts', emailSnapshot.docs[0].id);
          contactData = emailSnapshot.docs[0].data();
        }
      } else if (contactId.startsWith('phone_')) {
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
        if (mountedRef.current) {
          alert('Contact not found in database. Please refresh and try again.');
        }
        return false;
      }
      
      const now = new Date();
      const historyEntry = {
        status: newStatus,
        timestamp: now,
        note: note || `Status changed from ${currentStatus} to ${newStatus}`,
        userId: user.uid,
        userName: user.displayName || user.email
      };
      
      const updateData = {
        status: newStatus,
        lastUpdated: serverTimestamp(),
        statusHistory: [...(contactData?.statusHistory || []), historyEntry]
      };
      
      if (newStatus === 'contacted' && !contactData?.lastContacted) {
        updateData.lastContacted = serverTimestamp();
      }
      
      if (newStatus === 'closed_won') {
        updateData.closedDate = serverTimestamp();
        updateData.dealValue = 5000;
      }
      
      await updateDoc(contactDocRef, updateData);
      
      if (mountedRef.current) {
        setContactStatuses(prev => ({ ...prev, [contactId]: newStatus }));
        setStatusHistory(prev => ({
          ...prev,
          [contactId]: [...(prev[contactId] || []), historyEntry]
        }));
        
        setWhatsappLinks(prev => 
          prev.map(contact => 
            contact.contactId === contactId 
              ? { ...contact, status: newStatus, lastUpdated: now }
              : contact
          )
        );
        
        console.log(`✅ Status updated for ${contactId}: ${currentStatus} → ${newStatus}`);
      }
      return true;
      
    } catch (error) {
      console.error('Failed to update contact status:', error);
      if (mountedRef.current) {
        alert(`Failed to update status: ${error.message}`);
      }
      return false;
    }
  }, [user, contactStatuses, whatsappLinks]);

  // CSV PROCESSING
  const processCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const headers = parseCsvRow(lines[0]).map(h => h.trim());
    setCsvHeaders(headers);

    const data = lines.slice(1).map(line => {
      const values = parseCsvRow(line);
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    // Calculate basic stats
    const emailCount = data.filter(row => 
      row.email && isValidEmail(row.email)
    ).length;

    const phoneCount = data.filter(row => {
      const rawPhone = row.whatsapp_number || row.phone_raw || row.phone;
      return formatForDialing(rawPhone);
    }).length;

    setValidEmails(emailCount);
    setValidWhatsApp(phoneCount);
    setCsvContent(text);

    // Set up field mappings
    const allVars = [...new Set([
      ...extractTemplateVariables(templateA.body),
      ...extractTemplateVariables(templateB.body),
      ...extractTemplateVariables(whatsappTemplate),
      ...extractTemplateVariables(smsTemplate),
      'sender_name',
      ...headers
    ])];
    
    const initialMappings = {};
    allVars.forEach(varName => {
      if (headers.includes(varName)) {
        initialMappings[varName] = varName;
      }
    });
    initialMappings.sender_name = 'sender_name';
    if (headers.includes('email')) initialMappings.email = 'email';
    setFieldMappings(initialMappings);
  };

  // HANDLE CSV UPLOAD
  const handleCsvUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rawContent = event.target.result;
      processCSV(rawContent);
      
      if (status) {
        setTimeout(() => setStatus(''), 5000);
      }
    };
    reader.readAsText(file);
  }, [templateA, templateB, whatsappTemplate, smsTemplate]);

  // AI FEATURE WRAPPERS (Graceful degradation)
  const handleAIResearch = async (contact) => {
    if (!aiFeaturesEnabled) {
      setStatus('AI features are currently disabled. Using manual mode.');
      return;
    }
    
    try {
      setResearchingCompany(contact.email);
      setStatus('🧠 Researching company...');
      
      // Mock AI research - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockResults = {
        strategy: `Focus on their recent ${contact.business} projects and mention how automation could improve their workflow.`,
        insights: [
          'Company appears to be growing rapidly',
          'Likely needs scalable solutions',
          'Decision maker seems responsive to innovation'
        ],
        approach: 'Direct value proposition with clear ROI',
        subjectLine: `Innovation opportunity for ${contact.business}`,
        emailTemplate: `Hi {{first_name}},\n\nBased on my research of ${contact.business}, I noticed...\n\n[Personalized content based on AI analysis]\n\nBest regards,\n${senderName}`
      };
      
      setResearchResults(prev => ({
        ...prev,
        [contact.email]: mockResults
      }));
      
      setStatus('✅ Research completed successfully!');
      setShowResearchModal(true);
      
    } catch (error) {
      console.error('AI Research error:', error);
      setStatus('❌ AI research failed. Please try manual research.');
      setAiFeaturesEnabled(false); // Disable AI on failure
    } finally {
      setResearchingCompany(null);
    }
  };

  // Auth state monitoring
  useEffect(() => {
    if (!auth) {
      console.warn('Auth not available - skipping auth state monitoring');
      setLoadingAuth(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!mountedRef.current) return;

      if (currentUser) {
        setUser(currentUser);
        loadSettings(currentUser.uid);
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
  }, [loadContactsFromFirestore, loadSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Filter contacts
  const getFilteredContacts = useCallback(() => {
    let filtered = [...whatsappLinks];
    
    if (searchQuery) {
      filtered = filtered.filter(c =>
        c.business.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery.replace(/\D/g, ''))
      );
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    if (contactFilter === 'replied') {
      filtered = filtered.filter(c => c.status === 'replied');
    } else if (contactFilter === 'pending') {
      filtered = filtered.filter(c => !['replied', 'closed_won', 'not_interested', 'do_not_contact'].includes(c.status));
    }
    
    if (sortBy === 'recent') {
      filtered.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => a.business.localeCompare(b.business));
    } else if (sortBy === 'status') {
      const statusOrder = CONTACT_STATUSES.reduce((acc, s, i) => ({ ...acc, [s.id]: i }), {});
      filtered.sort((a, b) => (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99));
    }
    
    return filtered;
  }, [whatsappLinks, searchQuery, statusFilter, contactFilter, sortBy]);

  // Status Badge Component
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

  // Status Dropdown Component
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

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div>Loading Dashboard...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="max-w-md w-full mx-auto p-6 bg-gray-800 rounded-lg shadow-lg">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Welcome to Auto-Leads</h1>
            <p className="text-gray-400 mb-6">Please sign in to access your dashboard</p>
            
            {authError && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-500 rounded-lg text-red-200 text-sm">
                {authError}
              </div>
            )}

            <button
              onClick={signInWithGoogle}
              disabled={!auth}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>

            {!auth && (
              <div className="mt-4 text-sm text-gray-400">
                Firebase is not properly configured. Please check your environment variables.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Syndicate Solutions Dashboard</h1>
              <p className="text-gray-400 text-sm">B2B Growth Engine</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">
                Welcome, {user.displayName || user.email}
              </span>
              <button
                onClick={handleSignOut}
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
          {['outreach', 'analytics', 'ai-features', 'settings'].map((tab) => (
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
                <h3 className="text-sm font-medium text-gray-400 mb-1">Active Campaigns</h3>
                <p className="text-2xl font-bold">{abTestMode ? '2' : '1'}</p>
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
                  <button
                    onClick={saveSettings}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition duration-200"
                  >
                    Save Settings
                  </button>
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
                    status.includes('success') ? 'bg-green-900/50 text-green-200' : 'bg-blue-900/50 text-blue-200'
                  }`}>
                    {status}
                  </div>
                )}
              </div>
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

        {activeTab === 'ai-features' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">AI Features</h2>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    aiFeaturesEnabled ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                  }`}>
                    {aiFeaturesEnabled ? '✅ AI Enabled' : '❌ AI Disabled'}
                  </span>
                  <button
                    onClick={() => setAiFeaturesEnabled(!aiFeaturesEnabled)}
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
                    AI features are currently disabled. You can continue using all manual features, and enable AI when ready.
                    The system will gracefully fallback to manual mode if AI services are unavailable.
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
                    onClick={() => {
                      if (!aiFeaturesEnabled) {
                        setStatus('Enable AI features to use predictive scoring');
                        return;
                      }
                      setStatus('Predictive scoring coming soon...');
                    }}
                    disabled={!aiFeaturesEnabled}
                    className="w-full py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded text-sm transition"
                  >
                    Score All Leads
                  </button>
                </div>
                
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-medium mb-2 text-green-400">✨ Smart Follow-ups</h3>
                  <p className="text-gray-300 text-sm mb-3">AI generates context-aware follow-up messages</p>
                  <button
                    onClick={() => {
                      if (!aiFeaturesEnabled) {
                        setStatus('Enable AI features to use smart follow-ups');
                        return;
                      }
                      setStatus('Smart follow-ups coming soon...');
                    }}
                    disabled={!aiFeaturesEnabled}
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
                    {user.emailVerified && <div className="text-green-400">✓ Email verified</div>}
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
                        onChange={(e) => setAiFeaturesEnabled(e.target.checked)}
                        className="rounded"
                      />
                      <span>Enable AI features (experimental)</span>
                    </label>
                    <p className="text-sm text-gray-400">
                      AI features include company research, predictive scoring, and smart follow-ups. 
                      Manual features will always work even if AI is disabled.
                    </p>
                  </div>
                </div>
                <button
                  onClick={saveSettings}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition duration-200"
                >
                  Save All Settings
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contacts Management */}
        {(activeTab === 'outreach' || activeTab === 'analytics') && whatsappLinks.length > 0 && (
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
                            >
                              AI Research
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {getFilteredContacts().length > 10 && (
                <div className="text-center py-4 text-gray-400">
                  Showing 10 of {getFilteredContacts().length} contacts
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
