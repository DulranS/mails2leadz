// app/dashboard/DashboardClient.js
'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { auth, db } from '../../lib/firebase';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

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
  RETRY_DELAY_MS: 1000,
  // AI & AUTOPILOT CONFIG
  AI_AUTOPILOT_INTERVAL_MS: 300000, // 5 minutes
  MAX_AI_BATCH_SIZE: 10,
  AUTO_REPLY_ENABLED: true,
  TRIGGER_SENSITIVITY: 'high' // low, medium, high
};

// ============================================================================
// EMAIL TEMPLATES - ENHANCED WITH AI HOOKS
// ============================================================================
const DEFAULT_TEMPLATE_A = {
  id: 'template_a',
  name: 'AI-Powered Outreach',
  subject: 'Quick question for {{business_name}} {{recent_trigger}}',
  body: `Hi {{business_name}}, 😊👋🏻
I hope you're doing well.

I'm reaching out because I noticed {{recent_trigger}}.

{{ai_personalized_content}}

Would you be open to a quick 15-minute call to discuss how we might help?

Best regards,
{{sender_name}}`
};

const DEFAULT_TEMPLATE_B = {
  id: 'template_b',
  name: 'Value-First Approach',
  subject: 'Following up on {{business_name}} {{recent_trigger}}',
  body: `Hi {{business_name}},

I wanted to follow up on {{recent_trigger}} that caught my attention.

{{ai_personalized_content}}

We're helping similar companies achieve {{ai_quantified_value}}.

Would you be interested in learning more about how we do this?

Best,
{{sender_name}}`
};

const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{business_name}}! 👋

I noticed {{recent_trigger}} and thought you might find this interesting.

{{ai_personalized_content}}

Would you be open to a quick chat about this?

Best regards,
{{sender_name}}`;

const DEFAULT_SMS_TEMPLATE = `Hi {{business_name}}, noticed {{recent_trigger}}. {{ai_personalized_content}}. Open to quick chat? - {{sender_name}}`;

const DEFAULT_INSTAGRAM_TEMPLATE = `Hey {{business_name}}! Saw {{recent_trigger}} and thought this might interest you. {{ai_personalized_content}} DM me if you'd like to learn more! 🚀`;

const DEFAULT_TWITTER_TEMPLATE = `Hey {{business_name}}! {{recent_trigger}} caught my eye. {{ai_personalized_content}} Let's connect! #B2B #Sales`;

const DEFAULT_LINKEDIN_TEMPLATE = `Hi {{business_name}},

{{recent_trigger}} prompted me to reach out.

{{ai_personalized_content}}

Would love to hear your thoughts on this approach.

Best regards,
{{sender_name}}`;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const extractTemplateVariables = (template) => {
  const matches = template.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(match => match.slice(2, -2));
};

const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function DashboardClient() {
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
  const [whatsappLinks, setWhatsappLinks] = useState([]);
  const [validEmails, setValidEmails] = useState(0);
  const [validWhatsApp, setValidWhatsApp] = useState(0);
  const [leadQualityFilter, setLeadQualityFilter] = useState('HOT');
  const [previewRecipient, setPreviewRecipient] = useState(null);
  const [fieldMappings, setFieldMappings] = useState({});
  const [csvFileName, setCsvFileName] = useState('');
  const [csvUploadDate, setCsvUploadDate] = useState(null);

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
  const [smsConsent, setSmsConsent] = useState(true);
  const [activeTemplateTab, setActiveTemplateTab] = useState('email');

  // ============================================================================
  // AI & AUTOPILOT STATES
  // ============================================================================
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);
  const [autoReplyConfig, setAutoReplyConfig] = useState({
    enabled: true,
    tone: 'professional',
    delayMinutes: 15,
    maxAutoRepliesPerDay: 20
  });
  const [aiResearchQueue, setAiResearchQueue] = useState([]);
  const [isResearching, setIsResearching] = useState(false);
  const [autoReplyCount, setAutoReplyCount] = useState(0);

  // ============================================================================
  // ADVANCED AI FEATURES STATES
  // ============================================================================
  const [aiOpeningDetectionEnabled, setAiOpeningDetectionEnabled] = useState(true);
  const [aiDecisionMakerFinderEnabled, setAiDecisionMakerFinderEnabled] = useState(true);
  const [aiSmartResearchEnabled, setAiSmartResearchEnabled] = useState(true);
  const [aiAutoEmailCraftingEnabled, setAiAutoEmailCraftingEnabled] = useState(true);
  const [aiSmartFollowUpEnabled, setAiSmartFollowUpEnabled] = useState(true);
  const [aiIntelligentAutoReplyEnabled, setAiIntelligentAutoReplyEnabled] = useState(true);
  const [aiResearchResults, setAiResearchResults] = useState({});
  const [aiOpeningsQueue, setAiOpeningsQueue] = useState([]);
  const [aiDecisionMakersFound, setAiDecisionMakersFound] = useState({});
  const [aiCraftedEmails, setAiCraftedEmails] = useState({});
  const [aiFollowUpStrategies, setAiFollowUpStrategies] = useState({});
  const [aiAutoReplyStrategies, setAiAutoReplyStrategies] = useState({});
  const [aiBackgroundProcessing, setAiBackgroundProcessing] = useState(false);

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

  // ============================================================================
  // MODAL & UI STATES
  // ============================================================================
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [researchingCompany, setResearchingCompany] = useState(null);
  const [researchResults, setResearchResults] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  // ============================================================================
  // SETTINGS & PREFERENCES STATES
  // ============================================================================
  const [userPreferences, setUserPreferences] = useState({
    autoSaveEnabled: true,
    notificationsEnabled: true,
    soundEnabled: false,
    batchSendingEnabled: true,
    batchSize: 10,
    batchDelaySeconds: 30,
    theme: 'dark',
    compactMode: false,
    autoBackupEnabled: true
  });

  // ============================================================================
  // OUTREACH & CAMPAIGN STATES
  // ============================================================================
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [outreachHistory, setOutreachHistory] = useState([]);
  const [contactHistory, setContactHistory] = useState({});
  const [quotas, setQuotas] = useState({
    emails: { used: 0, limit: CONFIG.MAX_DAILY_EMAILS, resetTime: null },
    whatsapp: { used: 0, limit: CONFIG.MAX_DAILY_WHATSAPP, resetTime: null },
    sms: { used: 0, limit: CONFIG.MAX_DAILY_SMS, resetTime: null },
    calls: { used: 0, limit: CONFIG.MAX_DAILY_CALLS, resetTime: null }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ============================================================================// WALLET CONFLICT PREVENTION
// ============================================================================
useEffect(() => {
  // Suppress wallet extension console warnings
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args) => {
    // Filter out wallet-related warnings
    if (args[0] && (
      args[0].includes('TronWeb') ||
      args[0].includes('TronLink') ||
      args[0].includes('bybit') ||
      args[0].includes('ethereum') ||
      args[0].includes('Cannot redefine property')
    )) {
      return; // Suppress these warnings
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    // Filter out wallet-related errors that don't affect functionality
    if (args[0] && (
      args[0].includes('TronWeb') ||
      args[0].includes('TronLink') ||
      args[0].includes('bybit') ||
      args[0].includes('Cannot redefine property: ethereum')
    )) {
      return; // Suppress these errors
    }
    originalError.apply(console, args);
  };

  return () => {
    // Restore original console methods
    console.warn = originalWarn;
    console.error = originalError;
  };
}, []);

// ============================================================================  // AUTHENTICATION EFFECT
  // ============================================================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
      if (!user) {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // ============================================================================
  // AUTO-SAVE FUNCTIONALITY
  // ============================================================================
  const autoSaveTimeoutRef = useRef(null);

  const saveSettings = useCallback(async () => {
    if (!user) return;

    try {
      await setDoc(doc(db, 'user_preferences', user.uid), {
        ...userPreferences,
        updatedAt: serverTimestamp()
      }, { merge: true });

      addNotification('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      addNotification('Failed to save settings', 'error');
    }
  }, [user, userPreferences]);

  const loadSettings = useCallback(async () => {
    if (!user) return;

    try {
      const docRef = doc(db, 'user_preferences', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserPreferences(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }, [user]);

  // Load settings when user changes
  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user, loadSettings]);

  // Auto-save effect
  useEffect(() => {
    if (!userPreferences.autoSaveEnabled) return;

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
  }, [userPreferences, saveSettings]);

  // ============================================================================
  // NOTIFICATION SYSTEM
  // ============================================================================
  const addNotification = useCallback((message, type = 'info', duration = CONFIG.NOTIFICATION_DURATION_MS) => {
    const notification = {
      id: generateId(),
      message,
      type,
      timestamp: Date.now(),
      duration
    };

    setNotifications(prev => [notification, ...prev].slice(0, CONFIG.MAX_NOTIFICATIONS));

    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, duration);
    }
  }, []);

  // ============================================================================
  // SETTINGS EXPORT/IMPORT FUNCTIONS
  // ============================================================================
  const exportSettings = useCallback(() => {
    const settingsData = {
      userPreferences,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(settingsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addNotification('Settings exported successfully!', 'success');
  }, [userPreferences, addNotification]);

  const importSettings = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const settingsData = JSON.parse(e.target.result);
            if (settingsData.userPreferences) {
              setUserPreferences(settingsData.userPreferences);
              addNotification('Settings imported successfully!', 'success');
            } else {
              addNotification('Invalid settings file format', 'error');
            }
          } catch (error) {
            addNotification('Failed to parse settings file', 'error');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [addNotification]);

  // ============================================================================
  // BASIC COMPONENT RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <Head>
        <title>B2B Sales Automation Dashboard</title>
        <meta name="description" content="AI-powered B2B sales automation platform" />
      </Head>

      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">B2B Sales Automation Dashboard</h1>
          <p className="text-xl text-gray-300 mb-8">AI-Powered Outreach & Lead Generation</p>

          {/* Settings Button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-6 py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors duration-200 mb-6"
          >
            ⚙️ Settings & Preferences
          </button>
        </div>

        {loadingAuth ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Authenticating...</p>
          </div>
        ) : !user ? (
          <div className="text-center">
            <p className="text-gray-400">Please sign in to access the dashboard.</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg font-medium"
            >
              Go to Sign In
            </button>
          </div>
        ) : loading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-400">Loading dashboard...</p>
          </div>
        ) : (
          <div className="bg-gray-800/50 rounded-lg p-6 max-w-4xl mx-auto">
            <p className="text-gray-300">Dashboard loaded successfully!</p>
            <p className="text-sm text-gray-400 mt-2">Auto-save settings functionality is ready.</p>
            <p className="text-sm text-gray-400 mt-1">Auto-save: {userPreferences.autoSaveEnabled ? 'Enabled' : 'Disabled'}</p>
          </div>
        )}
      </div>

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-purple-500/30">
            <div className="relative p-6 border-b border-gray-700/50 bg-gradient-to-r from-purple-900/40 via-pink-900/40 to-purple-900/40">
              <div className="relative flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400">
                    ⚙️ Settings & Preferences
                  </h2>
                  <p className="text-sm text-purple-200 mt-1">
                    Customize your outreach automation experience
                  </p>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-white hover:bg-red-500/20 transition-all duration-200 text-3xl w-12 h-12 rounded-full flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-gray-900/30 to-gray-800/30">
              <div className="space-y-6">
                {/* AUTO-SAVE SETTINGS */}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-blue-300 mb-3">💾 Auto-Save Settings</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Enable Auto-Save</span>
                        <p className="text-xs text-gray-400">Automatically save settings changes every 1.5 seconds</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.autoSaveEnabled}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, autoSaveEnabled: e.target.checked }))}
                        className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                      />
                    </label>
                  </div>
                </div>

                {/* NOTIFICATION SETTINGS */}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-green-300 mb-3">🔔 Notification Settings</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Enable Notifications</span>
                        <p className="text-xs text-gray-400">Show success/error messages and progress updates</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.notificationsEnabled}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, notificationsEnabled: e.target.checked }))}
                        className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500"
                      />
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Sound Notifications</span>
                        <p className="text-xs text-gray-400">Play sound effects for important events</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.soundEnabled}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, soundEnabled: e.target.checked }))}
                        className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500"
                      />
                    </label>
                  </div>
                </div>

                {/* SENDING PREFERENCES */}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-orange-300 mb-3">📤 Sending Preferences</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Batch Sending</span>
                        <p className="text-xs text-gray-400">Send emails in small batches to avoid spam filters</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.batchSendingEnabled}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, batchSendingEnabled: e.target.checked }))}
                        className="w-4 h-4 text-orange-600 bg-gray-700 border-gray-600 rounded focus:ring-orange-500"
                      />
                    </label>
                    <div>
                      <label className="block text-sm text-gray-200 mb-2">Batch Size</label>
                      <select
                        value={userPreferences.batchSize}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      >
                        <option value={5}>5 emails</option>
                        <option value={10}>10 emails</option>
                        <option value={25}>25 emails</option>
                        <option value={50}>50 emails</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-200 mb-2">Delay Between Batches (seconds)</label>
                      <input
                        type="number"
                        min="5"
                        max="300"
                        value={userPreferences.batchDelaySeconds}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, batchDelaySeconds: parseInt(e.target.value) }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* APPEARANCE SETTINGS */}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-purple-300 mb-3">🎨 Appearance</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-200 mb-2">Theme</label>
                      <select
                        value={userPreferences.theme}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, theme: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
                      >
                        <option value="dark">Dark</option>
                        <option value="light">Light</option>
                        <option value="auto">Auto (System)</option>
                      </select>
                    </div>
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Compact Mode</span>
                        <p className="text-xs text-gray-400">Reduce spacing and show more content</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.compactMode}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, compactMode: e.target.checked }))}
                        className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                      />
                    </label>
                  </div>
                </div>

                {/* BACKUP SETTINGS */}
                <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                  <h3 className="text-sm font-bold text-red-300 mb-3">💾 Backup & Export</h3>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-sm text-gray-200">Auto Backup</span>
                        <p className="text-xs text-gray-400">Automatically backup data daily</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={userPreferences.autoBackupEnabled}
                        onChange={(e) => setUserPreferences(prev => ({ ...prev, autoBackupEnabled: e.target.checked }))}
                        className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                      />
                    </label>
                    <button
                      onClick={exportSettings}
                      className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-medium text-sm"
                    >
                      📤 Export Settings
                    </button>
                    <button
                      onClick={importSettings}
                      className="w-full px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded font-medium text-sm"
                    >
                      📥 Import Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-700/50 bg-gradient-to-r from-gray-900/50 to-gray-800/50">
              <div className="flex gap-3">
                {!userPreferences.autoSaveEnabled && (
                  <button
                    onClick={saveSettings}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded font-medium"
                  >
                    💾 Save Settings
                  </button>
                )}
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}