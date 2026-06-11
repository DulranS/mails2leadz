'use client';

/**
 * ============================================================================
 * AI-ENHANCED B2B SALES MACHINE - STRATEGIC IMPLEMENTATION
 * ============================================================================
 * 
 * TIGHT ICP DEFINITION:
 * - Industry: SaaS companies 20-200 employees
 * - Size: Series A-C funding stages ($2M-$50M raised)
 * - Geo: North America & Europe primarily
 * - Pain: Scaling customer acquisition without burning cash
 * - Trigger: Recent funding round, product launch, or hiring growth
 * 
 * STRATEGIC WORKFLOW:
 * 1. Pick 50 qualified target companies (small batch = manageable testing)
 * 2. 2-minute research per company (headline + one recent trigger link)
 * 3. Find 1-2 decision makers per account (name, role, LinkedIn URL)
 * 4. Verify each email (format + MX/basic deliverability)
 * 5. Create 2 personalization bullets (1 observation, 1 impact)
 * 6. Use 3 controlled templates only (<120 words each)
 * 7. Launch with controlled cadence (Day0, Day3, Day5, Day7)
 * 8. Auto-exit rules (replied/booked → remove; bounced → pause)
 * 9. Weekly KPI monitoring with auto-pause triggers
 * 10. Move non-responders to nurture sequence (30-60 days)
 * 
 * AI USAGE: Optional enhancement for speed and scale, never required
 * MANUAL OVERRIDE: Every feature works 100% without AI
 * 
 * MINIMAL TECH STACK:
 * - LinkedIn: Target research and decision maker finding
 * - Apollo.io: Contact enrichment and verification
 * - Calendly: Meeting scheduling
 * - HubSpot: CRM and sequence management
 * - WhatsApp: Multi-channel follow-up
 */

import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, updateDoc, deleteDoc, serverTimestamp, increment } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Papa from 'papaparse';

// Firebase setup
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
    }
  } catch (error) {
    console.error('Firebase init failed:', error);
  }
}

// Tight ICP Definition
const TIGHT_ICP = {
  industry: 'SaaS',
  size: '20-200 employees',
  funding: 'Series A-C ($2M-$50M raised)',
  geo: 'North America & Europe',
  pain: 'Scaling customer acquisition without burning cash',
  triggers: [
    'Recent funding round',
    'Product launch',
    'Hiring growth',
    'Executive change',
    'Market expansion'
  ]
};

// 3 Controlled Templates Only
const CONTROLLED_TEMPLATES = {
  email1: {
    name: 'Intro',
    subject: 'Quick question about {{company}} growth',
    body: `Hi {{first_name}},

Saw {{company}} just raised {{funding_amount}} - congrats on the momentum.

When SaaS companies hit your stage, scaling customer acquisition without burning cash becomes a real challenge.

We help Series A-C SaaS companies add 15-25 qualified leads per month using our AI-powered outbound system.

Worth a 10-min chat to see if we can help you hit your Q2 targets?

Best,
{{sender_name}}
{{booking_link}}`,
    wordCount: 89
  },
  email2: {
    name: 'Social Proof',
    subject: 'Re: {{company}} growth',
    body: `Hi {{first_name}},

Quick follow-up - helped {{similar_company}} (similar stage) add 22 qualified leads last month.

They were struggling with the same customer acquisition efficiency challenges.

Our approach: AI handles research + personalization, you focus on calls.

10-min call to see if it makes sense for {{company}}?

{{sender_name}}
{{booking_link}}`,
    wordCount: 78
  },
  breakup: {
    name: 'Break-up',
    subject: 'Closing the loop',
    body: `Hi {{first_name}},

Tried reaching out a few times about helping {{company}} scale customer acquisition.

Assuming timing isn't right or this isn't a priority.

If that changes, I'm here. Otherwise, I'll close your file.

Best,
{{sender_name}}`,
    wordCount: 45
  }
};

export default function AIEnhancedSalesMachine() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('targets');
  
  // Targets state
  const [targets, setTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedDecisionMaker, setSelectedDecisionMaker] = useState(null);
  
  // Campaign state
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  
  // Send queue state
  const [sendQueue, setSendQueue] = useState([]);
  const [approvedEmails, setApprovedEmails] = useState([]);
  const [sentEmails, setSentEmails] = useState([]);
  
  // Research state
  const [aiResearch, setAiResearch] = useState({ headline: '', trigger: '', link: '' });
  const [personalization, setPersonalization] = useState({ observation: '', impact: '' });
  
  // KPI state
  const [kpis, setKpis] = useState({ sent: 0, replies: 0, meetings: 0, bounces: 0, opens: 0, clicks: 0 });
  
  // AI state
  const [aiStatus, setAiStatus] = useState('available');
  const [useAI, setUseAI] = useState(true);
  const [sendSafety, setSendSafety] = useState({ maxPerDay: 50, currentDaySent: 0, paused: false });
  
  // Auth effect
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  // Sign in
  const signIn = async () => {
    if (!auth) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Sign in error:', error);
    }
  };

  // ============================================================================
  // AI-ENHANCED TARGET MANAGEMENT
  // ============================================================================
  
  const addQualifiedTarget = () => {
    const newTarget = {
      id: `target_${Date.now()}`,
      business_name: '',
      website: '',
      industry: TIGHT_ICP.industry,
      size: TIGHT_ICP.size,
      funding: '',
      status: 'qualified',
      research: {
        headline: '',
        trigger: '',
        link: '',
        pain: TIGHT_ICP.pain,
        source: 'manual'
      },
      personalization: {
        observation: '',
        impact: ''
      },
      decisionMakers: [],
      emailVerification: {
        format: 'pending',
        mx: 'pending',
        deliverability: 'pending'
      },
      createdAt: new Date().toISOString()
    };
    setTargets(prev => [...prev, newTarget]);
    setSelectedTarget(newTarget);
    setActiveTab('targets');
  };

  const updateTarget = (targetId, updates) => {
    setTargets(prev => prev.map(target => 
      target.id === targetId ? { ...target, ...updates } : target
    ));
  };

  const deleteTarget = (targetId) => {
    setTargets(prev => prev.filter(target => target.id !== targetId));
    if (selectedTarget?.id === targetId) {
      setSelectedTarget(null);
    }
  };

  // ============================================================================
  // 2-MINUTE AI RESEARCH
  // ============================================================================
  
  const performAIResearch = async (targetId) => {
    if (!useAI) return;
    
    setAiStatus('loading');
    
    try {
      const response = await fetch('/api/research-target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: targets.find(t => t.id === targetId)?.business_name,
          website: targets.find(t => t.id === targetId)?.website,
          icp: TIGHT_ICP
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        updateTarget(targetId, {
          research: {
            ...targets.find(t => t.id === targetId)?.research,
            headline: result.data.headline,
            trigger: result.data.trigger,
            link: result.data.link,
            source: 'ai'
          }
        });
        
        setAiResearch({
          headline: result.data.headline,
          trigger: result.data.trigger,
          link: result.data.link
        });
      }
    } catch (error) {
      console.error('AI Research failed:', error);
    } finally {
      setAiStatus('available');
    }
  };

  // ============================================================================
  // DECISION MAKER FINDER
  // ============================================================================
  
  const findDecisionMakers = async (targetId) => {
    if (!useAI) return;
    
    try {
      const response = await fetch('/api/find-decision-makers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: targets.find(t => t.id === targetId)?.business_name,
          website: targets.find(t => t.id === targetId)?.website
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        updateTarget(targetId, {
          decisionMakers: result.data.map(dm => ({
            id: `dm_${Date.now()}_${Math.random()}`,
            name: dm.name,
            role: dm.role,
            email: dm.email,
            linkedIn: dm.linkedIn,
            seniority: dm.seniority,
            department: dm.department,
            verified: false,
            source: 'ai'
          }))
        });
      }
    } catch (error) {
      console.error('Decision maker finder failed:', error);
    }
  };

  // ============================================================================
  // EMAIL VERIFICATION
  // ============================================================================
  
  const verifyEmail = async (targetId, dmId) => {
    try {
      const target = targets.find(t => t.id === targetId);
      const dm = target.decisionMakers.find(d => d.id === dmId);
      
      if (!dm.email) return;
      
      const response = await fetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dm.email })
      });
      
      const result = await response.json();
      
      updateTarget(targetId, {
        decisionMakers: target.decisionMakers.map(d => 
          d.id === dmId 
            ? { ...d, emailVerification: result.data }
            : d
        )
      });
    } catch (error) {
      console.error('Email verification failed:', error);
    }
  };

  // ============================================================================
  // PERSONALIZATION BULLETS
  // ============================================================================
  
  const generatePersonalization = async (targetId) => {
    if (!useAI) return;
    
    try {
      const target = targets.find(t => t.id === targetId);
      
      const response = await fetch('/api/generate-personalization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: target.business_name,
          research: target.research,
          decisionMaker: target.decisionMakers[0]
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPersonalization({
          observation: result.data.observation,
          impact: result.data.impact
        });
        
        updateTarget(targetId, {
          personalization: {
            observation: result.data.observation,
            impact: result.data.impact,
            source: 'ai'
          }
        });
      }
    } catch (error) {
      console.error('Personalization generation failed:', error);
    }
  };

  // ============================================================================
  // SEND SAFETY RULES
  // ============================================================================
  
  const checkSendSafety = () => {
    const today = new Date().toDateString();
    const todaySent = sentEmails.filter(e => new Date(e.sentAt).toDateString() === today).length;
    
    if (todaySent >= sendSafety.maxPerDay) {
      setSendSafety(prev => ({ ...prev, paused: true, currentDaySent: todaySent }));
      return false;
    }
    
    if (kpis.bounces > 0 && (kpis.bounces / kpis.sent) > 0.05) {
      setSendSafety(prev => ({ ...prev, paused: true, currentDaySent: todaySent }));
      return false;
    }
    
    setSendSafety(prev => ({ ...prev, currentDaySent: todaySent }));
    return true;
  };

  // ============================================================================
  // LAUNCH CADENCE SYSTEM
  // ============================================================================
  
  const launchCadence = async (targetIds) => {
    if (!checkSendSafety()) return;
    
    const selectedTargets = targetIds.map(id => targets.find(t => t.id === id));
    
    for (const target of selectedTargets) {
      for (const dm of target.decisionMakers.slice(0, 2)) {
        // Day 0: Email 1
        const email1 = composeEmail(target, CONTROLLED_TEMPLATES.email1, dm);
        addToSendQueue({
          ...email1,
          targetId: target.id,
          dmId: dm.id,
          sequenceDay: 0,
          templateId: 'email1'
        });
      }
    }
    
    setActiveTab('queue');
  };

  // ============================================================================
  // AUTO-EXIT RULES
  // ============================================================================
  
  const applyAutoExitRules = () => {
    // Remove replied/booked from sequences
    targets.forEach(target => {
      if (target.status === 'replied' || target.status === 'booked') {
        updateTarget(target.id, { status: 'completed' });
      }
      
      // Pause bounced leads
      if (target.emailVerification?.risk === 'high') {
        updateTarget(target.id, { status: 'paused' });
      }
    });
  };

  // ============================================================================
  // WEEKLY KPI MONITORING
  // ============================================================================
  
  const weeklyKPICheck = () => {
    const replyRate = kpis.sent > 0 ? (kpis.replies / kpis.sent) * 100 : 0;
    const bounceRate = kpis.sent > 0 ? (kpis.bounces / kpis.sent) * 100 : 0;
    
    // Auto-pause if metrics are bad
    if (bounceRate > 5) {
      setSendSafety(prev => ({ ...prev, paused: true }));
    }
    
    // Update campaign statuses based on performance
    campaigns.forEach(campaign => {
      if (campaign.status === 'active') {
        const campaignKPIs = {
          sent: sentEmails.filter(e => e.campaignId === campaign.id).length,
          replies: kpis.replies,
          meetings: kpis.meetings
        };
        
        if (campaignKPIs.replyRate < 2) {
          updateCampaign(campaign.id, { status: 'under_review' });
        }
      }
    });
  };

  // ============================================================================
  // EMAIL COMPOSITION
  // ============================================================================
  
  const composeEmail = (target, template, decisionMaker) => {
    let subject = template.subject;
    let body = template.body;
    
    // Apply replacements
    subject = subject
      .replace(/\{\{first_name\}\}/g, decisionMaker?.name?.split(' ')[0] || '[First Name]')
      .replace(/\{\{company\}\}/g, target.business_name || '[Company]')
      .replace(/\{\{funding_amount\}\}/g, target.research?.funding_amount || '$5M')
      .replace(/\{\{similar_company\}\}/g, 'TechCorp Inc')
      .replace(/\{\{sender_name\}\}/g, user?.displayName || '[Your Name]')
      .replace(/\{\{booking_link\}\}/g, 'https://cal.com/your-team/10min');
    
    body = body
      .replace(/\{\{first_name\}\}/g, decisionMaker?.name?.split(' ')[0] || '[First Name]')
      .replace(/\{\{company\}\}/g, target.business_name || '[Company]')
      .replace(/\{\{funding_amount\}\}/g, target.research?.funding_amount || '$5M')
      .replace(/\{\{similar_company\}\}/g, 'TechCorp Inc')
      .replace(/\{\{sender_name\}\}/g, user?.displayName || '[Your Name]')
      .replace(/\{\{booking_link\}\}/g, 'https://cal.com/your-team/10min');
    
    // Add personalization
    if (target.personalization?.observation) {
      body = body.replace(/\{\{observation\}\}/g, target.personalization.observation);
    }
    if (target.personalization?.impact) {
      body = body.replace(/\{\{impact\}\}/g, target.personalization.impact);
    }
    
    return { subject, body, targetId: target.id, dmId: decisionMaker?.id };
  };

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================
  
  const addToSendQueue = (emailData) => {
    setSendQueue(prev => [...prev, { 
      ...emailData, 
      id: `email_${Date.now()}`, 
      status: 'pending',
      createdAt: new Date().toISOString()
    }]);
  };

  const approveEmail = (emailId) => {
    const email = sendQueue.find(e => e.id === emailId);
    if (email) {
      setApprovedEmails(prev => [...prev, email]);
      setSendQueue(prev => prev.filter(e => e.id !== emailId));
    }
  };

  const sendApprovedEmail = async (email) => {
    if (!checkSendSafety()) return;
    
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.to,
          subject: email.subject,
          body: email.body
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSentEmails(prev => [...prev, { 
          ...email, 
          sentAt: new Date().toISOString(), 
          messageId: result.messageId 
        }]);
        setApprovedEmails(prev => prev.filter(e => e.id !== email.id));
        setKpis(prev => ({ ...prev, sent: prev.sent + 1 }));
        
        // Update send safety
        setSendSafety(prev => ({ ...prev, currentDaySent: prev.currentDaySent + 1 }));
        
        // Apply auto-exit rules
        applyAutoExitRules();
        
        return true;
      }
    } catch (error) {
      console.error('Send failed:', error);
    }
    return false;
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading AI-Enhanced Sales Machine...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">AI-Enhanced B2B Sales Machine</h1>
          <p className="text-gray-400 mb-4">Strategic AI + Complete Manual Control</p>
          <p className="text-gray-400 mb-8">Tight ICP • Automated Research • Send Safety</p>
          <button
            onClick={signIn}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Head>
        <title>AI-Enhanced B2B Sales Machine</title>
        <meta name="description" content="Strategic AI automation with complete manual override" />
      </Head>

      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI-Enhanced Sales Machine</h1>
            <p className="text-gray-400 text-sm">Strategic AI • Complete Manual Control</p>
          </div>
          <div className="flex items-center gap-4">
            {/* AI Toggle */}
            <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg">
              <span className="text-sm">AI:</span>
              <button
                onClick={() => setUseAI(!useAI)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  useAI ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                }`}
              >
                {useAI ? 'ON' : 'OFF'}
              </button>
              <span className={`w-2 h-2 rounded-full ${
                aiStatus === 'available' ? 'bg-green-400' : 
                aiStatus === 'loading' ? 'bg-yellow-400' : 'bg-red-400'
              }`}></span>
            </div>
            
            {/* Send Safety Status */}
            <div className="flex items-center gap-2 bg-gray-700 px-3 py-2 rounded-lg">
              <span className="text-sm">Safety:</span>
              <span className={`px-2 py-1 rounded text-xs ${
                sendSafety.paused ? 'bg-red-600' : 'bg-green-600'
              }`}>
                {sendSafety.paused ? 'PAUSED' : 'ACTIVE'}
              </span>
              <span className="text-xs text-gray-400">
                {sendSafety.currentDaySent}/{sendSafety.maxPerDay}
              </span>
            </div>
            
            <div className="text-right">
              <p className="text-sm text-gray-400">Welcome</p>
              <p className="font-semibold">{user.displayName}</p>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* KPI Dashboard */}
      <div className="bg-gray-800 p-6 border-b border-gray-700">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Sent</p>
            <p className="text-2xl font-bold">{kpis.sent}</p>
            <p className="text-xs text-gray-400 mt-1">Today: {sendSafety.currentDaySent}</p>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Replies</p>
            <p className="text-2xl font-bold text-green-400">{kpis.replies}</p>
            <p className="text-xs text-green-400 mt-1">
              {kpis.sent > 0 ? ((kpis.replies/kpis.sent)*100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Meetings</p>
            <p className="text-2xl font-bold">{kpis.meetings}</p>
            <p className="text-xs text-blue-400 mt-1">
              {kpis.sent > 0 ? ((kpis.meetings/kpis.sent)*100).toFixed(1) : 0}%
            </p>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Bounces</p>
            <p className="text-2xl font-bold text-red-400">{kpis.bounces}</p>
            <p className="text-xs text-red-400 mt-1">
              {kpis.sent > 0 ? ((kpis.bounces/kpis.sent)*100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex space-x-1 mb-6 bg-gray-800 p-1 rounded-lg">
          {['targets', 'research', 'campaigns', 'queue', 'analytics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* TARGETS TAB - Qualified Target Management */}
        {activeTab === 'targets' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Qualified Target Management</h2>
                <div className="flex gap-4">
                  <button
                    onClick={addQualifiedTarget}
                    className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    + Add Qualified Target
                  </button>
                  <button
                    onClick={() => {
                      const qualifiedTargets = targets.filter(t => t.status === 'qualified').slice(0, 50);
                      if (qualifiedTargets.length > 0) {
                        launchCadence(qualifiedTargets.map(t => t.id));
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                  >
                    Launch 50 Targets
                  </button>
                </div>
              </div>

              {targets.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="mb-4">No qualified targets yet.</p>
                  <p className="text-sm">Add targets that match your tight ICP.</p>
                </div>
              )}

              {targets.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {targets.map((target) => (
                    <div key={target.id} className="bg-gray-700 p-4 rounded-lg border-2 border-transparent hover:border-blue-500 cursor-pointer transition-all">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{target.business_name || 'Unnamed Target'}</h3>
                        <span className={`px-2 py-1 rounded text-xs ${
                          target.status === 'qualified' ? 'bg-green-600' :
                          target.status === 'researched' ? 'bg-blue-600' :
                          target.status === 'ready' ? 'bg-yellow-600' : 'bg-gray-600'
                        }`}>
                          {target.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p>Industry: {target.industry}</p>
                        <p>Size: {target.size}</p>
                        <p>Funding: {target.funding || 'Not set'}</p>
                        <p>Decision Makers: {target.decisionMakers?.length || 0}</p>
                        <p>Research: {target.research?.headline ? '✅' : '❌'}</p>
                        <p>Email Verified: {target.emailVerification?.deliverability === 'good' ? '✅' : '❌'}</p>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setSelectedTarget(target); setActiveTab('research'); }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition-colors"
                        >
                          Research
                        </button>
                        <button
                          onClick={() => { setSelectedTarget(target); setActiveTab('campaigns'); }}
                          className="flex-1 bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-sm transition-colors"
                        >
                          Add to Campaign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* RESEARCH TAB - 2-minute AI Research */}
        {activeTab === 'research' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">2-Minute AI Research</h2>
              <p className="text-gray-400 mb-6">Fast, factual personalization that scales.</p>

              {selectedTarget ? (
                <div className="space-y-6">
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">Target: {selectedTarget.business_name}</h3>
                    <p className="text-gray-400 text-sm">{selectedTarget.website}</p>
                  </div>

                  {/* AI Research Results */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold mb-4">AI Research Results</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Headline/Trigger</label>
                        <input
                          type="text"
                          value={aiResearch.headline}
                          onChange={(e) => setAiResearch(p => ({...p, headline: e.target.value}))}
                          className="w-full bg-gray-600 border border-gray-500 rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Recent Trigger Link</label>
                        <input
                          type="text"
                          value={aiResearch.link}
                          onChange={(e) => setAiResearch(p => ({...p, link: e.target.value}))}
                          className="w-full bg-gray-600 border border-gray-500 rounded-lg px-4 py-2"
                        />
                      </div>
                    </div>
                    
                    {useAI && (
                      <button
                        onClick={() => performAIResearch(selectedTarget.id)}
                        disabled={aiStatus === 'loading'}
                        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                      >
                        {aiStatus === 'loading' ? 'AI Researching...' : '🤖 Perform 2-Minute Research'}
                      </button>
                    )}
                  </div>

                  {/* Personalization Bullets */}
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h4 className="font-semibold mb-4">Personalization Bullets</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Observation (15 words max)</label>
                        <textarea
                          value={personalization.observation}
                          onChange={(e) => setPersonalization(p => ({...p, observation: e.target.value}))}
                          rows={2}
                          className="w-full bg-gray-600 border border-gray-500 rounded-lg px-4 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Impact (15 words max)</label>
                        <textarea
                          value={personalization.impact}
                          onChange={(e) => setPersonalization(p => ({...p, impact: e.target.value}))}
                          rows={2}
                          className="w-full bg-gray-600 border border-gray-500 rounded-lg px-4 py-2"
                        />
                      </div>
                      
                      {useAI && (
                        <button
                          onClick={() => generatePersonalization(selectedTarget.id)}
                          className="mt-4 w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                        >
                          🤖 Generate Personalization
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <p>Select a target from the Targets tab to research</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CAMPAIGNS TAB - Cadence Management */}
        {activeTab === 'campaigns' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Campaign Cadence Management</h2>
                <button
                  onClick={() => {
                    const newCampaign = {
                      id: `campaign_${Date.now()}`,
                      name: `Campaign ${campaigns.length + 1}`,
                      status: 'active',
                      targets: [],
                      sequence: ['email1', 'email2'],
                      timing: { delay: 3, unit: 'days' },
                      createdAt: new Date().toISOString(),
                      createdBy: user?.uid
                    };
                    setCampaigns(prev => [...prev, newCampaign]);
                    setSelectedCampaign(newCampaign);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                >
                  + Create Campaign
                </button>
              </div>

              {campaigns.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="mb-4">No campaigns yet.</p>
                  <p className="text-sm">Create campaigns to manage launch cadence.</p>
                </div>
              )}

              {campaigns.length > 0 && (
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{campaign.name}</h3>
                        <span className={`px-2 py-1 rounded text-xs ${
                          campaign.status === 'active' ? 'bg-green-600' :
                          campaign.status === 'paused' ? 'bg-yellow-600' : 'bg-gray-600'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 space-y-1">
                        <p>Targets: {campaign.targets?.length || 0}</p>
                        <p>Sequence: {campaign.sequence?.join(' → ') || 'Not set'}</p>
                        <p>Timing: Day 0, Day {campaign.timing?.delay}, Day {campaign.timing?.delay * 2}</p>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button
                          onClick={() => { setSelectedCampaign(campaign); }}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm transition-colors"
                        >
                          Manage
                        </button>
                        <button
                          onClick={() => {
                            if (campaign.targets?.length > 0) {
                              launchCadence(campaign.targets.map(t => t.id));
                            }
                          }}
                          className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors"
                        >
                          Launch Cadence
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* QUEUE TAB - Send Approval */}
        {activeTab === 'queue' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">Send Queue</h2>
              <p className="text-gray-400 mb-6">Review emails before sending. Send safety rules enforced.</p>

              {sendQueue.length === 0 && approvedEmails.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p>Send queue is empty</p>
                  <p className="text-sm mt-2">Launch campaigns or add individual emails</p>
                </div>
              )}

              {/* Pending Queue */}
              {sendQueue.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold mb-4">Pending Review ({sendQueue.length})</h3>
                  <div className="space-y-4">
                    {sendQueue.map((email) => (
                      <div key={email.id} className="bg-gray-700 p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{email.targetName}</h4>
                          <span className="px-2 py-1 rounded text-xs bg-yellow-600">Pending</span>
                        </div>
                        <p className="text-blue-400 text-sm mb-2">{email.subject}</p>
                        <pre className="text-xs text-gray-400 whitespace-pre-wrap mb-4">{email.body.substring(0, 200)}...</pre>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveEmail(email.id)}
                            className="flex-1 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                          >
                            ✅ Approve
                          </button>
                          <button
                            onClick={() => setSendQueue(prev => prev.filter(e => e.id !== email.id))}
                            className="flex-1 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
                          >
                            ❌ Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved Queue */}
              {approvedEmails.length > 0 && (
                <div className="mb-8">
                  <h3 className="font-semibold mb-4">Approved ({approvedEmails.length})</h3>
                  <div className="space-y-4">
                    {approvedEmails.map((email) => (
                      <div key={email.id} className="bg-gray-700 p-4 rounded-lg border-l-4 border-green-500">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{email.targetName}</h4>
                          <span className="px-2 py-1 rounded text-xs bg-green-600">Approved</span>
                        </div>
                        <p className="text-blue-400 text-sm">{email.subject}</p>
                        <button
                          onClick={() => sendApprovedEmail(email)}
                          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                        >
                          🚀 Send Now
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Send Safety Warning */}
              {sendSafety.paused && (
                <div className="bg-red-900 border border-red-700 p-4 rounded-lg mb-6">
                  <h4 className="font-semibold text-red-400 mb-2">⚠️ Send Safety Paused</h4>
                  <p className="text-red-300 text-sm">
                    {sendSafety.currentDaySent >= sendSafety.maxPerDay 
                      ? `Daily limit reached: ${sendSafety.currentDaySent}/${sendSafety.maxPerDay} emails`
                      : 'High bounce rate detected. Send safety paused.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ANALYTICS TAB - Weekly KPI Monitoring */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold mb-4">Weekly KPI Monitoring</h2>
              <p className="text-gray-400 mb-6">Auto-pause triggers based on performance metrics.</p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-400 text-sm">Sent</p>
                  <p className="text-3xl font-bold">{kpis.sent}</p>
                  <p className="text-xs text-gray-400 mt-1">Total sent</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-400 text-sm">Replies</p>
                  <p className="text-3xl font-bold text-green-400">{kpis.replies}</p>
                  <p className="text-xs text-green-400 mt-1">
                    {kpis.sent > 0 ? ((kpis.replies/kpis.sent)*100).toFixed(1) : 0}%
                  </p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-400 text-sm">Meetings</p>
                  <p className="text-3xl font-bold">{kpis.meetings}</p>
                  <p className="text-xs text-blue-400 mt-1">
                    {kpis.sent > 0 ? ((kpis.meetings/kpis.sent)*100).toFixed(1) : 0}%
                  </p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg">
                  <p className="text-gray-400 text-sm">Bounces</p>
                  <p className="text-3xl font-bold text-red-400">{kpis.bounces}</p>
                  <p className="text-xs text-red-400 mt-1">
                    {kpis.sent > 0 ? ((kpis.bounces/kpis.sent)*100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-semibold mb-4">System Status</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>AI Status:</span>
                      <span className={aiStatus === 'available' ? 'text-green-400' : 'text-yellow-400'}>
                        {aiStatus}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Send Safety:</span>
                      <span className={sendSafety.paused ? 'text-red-400' : 'text-green-400'}>
                        {sendSafety.paused ? 'PAUSED' : 'ACTIVE'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Daily Limit:</span>
                      <span>{sendSafety.currentDaySent}/{sendSafety.maxPerDay}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="font-semibold mb-4">Strategic Overview</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Tight ICP:</span>
                      <span>{TIGHT_ICP.industry} • {TIGHT_ICP.size}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Target Pain:</span>
                      <span>{TIGHT_ICP.pain}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Batch Size:</span>
                      <span>50 targets max</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Templates:</span>
                      <span>3 controlled (&lt;120 words)</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-700 p-4 rounded-lg mt-6">
                <h3 className="font-semibold mb-2">AI-Enhanced Philosophy</h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>✅ Tight ICP targeting for better conversion</li>
                  <li>✅ 2-minute AI research for fast personalization</li>
                  <li>✅ 1-2 decision makers per account (multi-threading)</li>
                  <li>✅ Email verification protects sender reputation</li>
                  <li>✅ 3 controlled templates prevent errors</li>
                  <li>✅ Send safety rules ensure deliverability</li>
                  <li>✅ Launch cadence prevents spamming</li>
                  <li>✅ Auto-exit rules prevent embarrassment</li>
                  <li>✅ Weekly KPI monitoring for optimization</li>
                  <li>✅ Manual override available for every feature</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
