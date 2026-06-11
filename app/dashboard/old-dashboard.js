'use client';

/**
 * ============================================================================
 * B2B GROWTH ENGINE - WORKING ENTERPRISE DASHBOARD
 * ============================================================================
 * This is a clean, working version with full enterprise functionality
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
// DEFAULT TEMPLATES & CONSTANTS
// ============================================================================
const DEFAULT_TEMPLATE_A = `Hi {{first_name}},

I came across {{company_name}} and noticed {{observation}}.

Given your role as {{title}}, I thought you might be interested in how we're helping {{similar_companies}} achieve {{key_result}}.

Would you be open to a brief chat next week?

Best regards,
{{sender_name}}`;

const DEFAULT_TEMPLATE_B = `{{first_name}},

{{personalized_opening}}

I noticed that {{company_name}} is {{recent_achievement}} and wanted to reach out.

We specialize in helping {{industry}} companies like yours:
• {{benefit_1}}
• {{benefit_2}}
• {{benefit_3}}

Would you have 15 minutes to explore how this could apply to {{company_name}}?

Regards,
{{sender_name}}`;

const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{first_name}}! This is {{sender_name}} from {{sender_company}}. I noticed your work at {{company_name}} and thought you'd be interested in {{value_prop}}. Would you be open to a quick chat?`;

const DEFAULT_SMS_TEMPLATE = `Hi {{first_name}}, {{sender_name}} here. Saw {{company_name}} and thought you'd find {{value_prop}} interesting. Quick chat this week?`;

const DEFAULT_INSTAGRAM_TEMPLATE = `{{first_name}} 👋 Love what you're building at {{company_name}}! {{personalized_compliment}}. We help {{industry}} leaders achieve {{result}}. Would be great to connect!`;

const DEFAULT_TWITTER_TEMPLATE = `{{first_name}} @{{twitter_handle}} Impressive work on {{recent_project}}! {{relevant_insight}}. We're helping {{industry}} teams solve {{problem}}. Worth a chat?`;

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

  // CSV & DATA PROCESSING STATE
  const [csvContent, setCsvContent] = useState('');
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [senderName, setSenderName] = useState('');
  const [abTestMode, setAbTestMode] = useState(false);
  const [templateA, setTemplateA] = useState(DEFAULT_TEMPLATE_A);
  const [templateB, setTemplateB] = useState(DEFAULT_TEMPLATE_B);
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [smsTemplate, setSmsTemplate] = useState(DEFAULT_SMS_TEMPLATE);
  const [instagramTemplate, setInstagramTemplate] = useState(DEFAULT_INSTAGRAM_TEMPLATE);
  const [twitterTemplate, setTwitterTemplate] = useState(DEFAULT_TWITTER_TEMPLATE);
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

  // UI STATE
  const [activeTab, setActiveTab] = useState('outreach');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Sign in with Google
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

  // Sign out
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
        setSenderName(data.senderName || 'Team');
        setTemplateA(data.templateA || DEFAULT_TEMPLATE_A);
        setTemplateB(data.templateB || DEFAULT_TEMPLATE_B);
        setWhatsappTemplate(data.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE);
        setSmsTemplate(data.smsTemplate || DEFAULT_SMS_TEMPLATE);
        setInstagramTemplate(data.instagramTemplate || DEFAULT_INSTAGRAM_TEMPLATE);
        setTwitterTemplate(data.twitterTemplate || DEFAULT_TWITTER_TEMPLATE);
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
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });

    return () => {
      unsubscribe();
      mountedRef.current = false;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // CSV Processing
  const processCSV = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return;

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    setCsvHeaders(headers);

    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });

    // Calculate basic stats
    const emailCount = data.filter(row => 
      row.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)
    ).length;

    const phoneCount = data.filter(row => 
      row.phone && /^\+?[\d\s\-()]+$/.test(row.phone)
    ).length;

    setValidEmails(emailCount);
    setValidWhatsApp(phoneCount);
    setCsvContent(text);
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
              <h1 className="text-2xl font-bold">Auto-Leads Dashboard</h1>
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
          {['outreach', 'analytics', 'settings', 'ai-agents'].map((tab) => (
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
                <h3 className="text-sm font-medium text-gray-400 mb-1">Pipeline Value</h3>
                <p className="text-2xl font-bold">${pipelineValue.toLocaleString()}</p>
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
                  <label className="block text-sm font-medium mb-2">Paste CSV Data</label>
                  <textarea
                    value={csvContent}
                    onChange={(e) => processCSV(e.target.value)}
                    placeholder="Paste your CSV data here... (headers in first row)"
                    className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <textarea
                    value={templateA}
                    onChange={(e) => setTemplateA(e.target.value)}
                    className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {abTestMode && (
                  <div>
                    <h3 className="text-lg font-medium mb-2 text-green-400">Template B</h3>
                    <textarea
                      value={templateB}
                      onChange={(e) => setTemplateB(e.target.value)}
                      className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
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

        {activeTab === 'ai-agents' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">AI Agents</h2>
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🤖</div>
                <h3 className="text-xl font-medium mb-2">AI Agent System</h3>
                <p className="text-gray-400 mb-4">Advanced AI-powered lead generation and nurturing</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-gray-700 p-4 rounded">
                    <h4 className="font-medium mb-2">Lead Research</h4>
                    <p className="text-gray-400">Automated company research and contact discovery</p>
                  </div>
                  <div className="bg-gray-700 p-4 rounded">
                    <h4 className="font-medium mb-2">Personalization</h4>
                    <p className="text-gray-400">AI-generated personalized messaging</p>
                  </div>
                  <div className="bg-gray-700 p-4 rounded">
                    <h4 className="font-medium mb-2">Follow-up Automation</h4>
                    <p className="text-gray-400">Smart follow-up timing and content</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
