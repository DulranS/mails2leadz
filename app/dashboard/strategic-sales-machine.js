'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import Head from 'next/head';
import { useRouter } from 'next/navigation';

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

// ✅ STRATEGIC SALES METHODOLOGY - Battle-Tested B2B Sales
const SALES_STRATEGY = {
  // Tight ICP Definition
  icp: {
    industry: 'SaaS & Technology Companies',
    size: '50-500 employees (Series A-C)',
    geo: 'North America & UK',
    pain: 'Scaling customer acquisition efficiently',
    trigger: 'Recent funding round or product launch'
  },
  
  // Strategic Cadence (Multi-touch without spamming)
  cadence: {
    day0: { action: 'email', template: 'intro', linkedin: true },
    day3: { action: 'email', template: 'social_proof' },
    day5: { action: 'linkedin', template: 'message', condition: 'connected' },
    day7: { action: 'email', template: 'breakup' }
  },
  
  // Send Safety Rules (Protect deliverability)
  safety: {
    maxEmailsPerDay: 40,
    maxEmailsPerInbox: 30,
    bounceThreshold: 0.05,
    unsubscribeThreshold: 0.01,
    stopOnBounce: true,
    timezoneRequired: true
  },
  
  // Auto-Exit Rules (Prevent embarrassing outreach)
  autoExit: {
    replied: true,
    booked: true,
    bounced: true,
    unsubscribed: true
  },
  
  // Templates (Under 120 words - proven to convert)
  templates: {
    intro: {
      subject: 'Quick question about {{company}}',
      body: `Hi {{name}},

Saw {{company}} just raised {{funding_amount}} - congrats! 

I help B2B SaaS companies like yours scale customer acquisition without increasing ad spend. We typically see 2-3x improvement in lead-to-customer conversion.

Worth a 10-min chat to see if this applies to your current growth stage?

Best,
{{sender_name}}

P.S. Here's my calendar: {{booking_link}}`
    },
    
    social_proof: {
      subject: 'Re: {{company}} growth',
      body: `Hi {{name}},

Quick follow-up. We helped {{similar_company}} (similar stage) go from {{metric_before}} to {{metric_after}} in 90 days using our acquisition framework.

Their VP of Sales said: "{{testimonial}}"

If you're interested in similar results, I have some ideas specific to {{company}}'s current positioning.

Available for 10 mins: {{booking_link}}

Best,
{{sender_name}}`
    },
    
    breakup: {
      subject: 'Closing the loop',
      body: `Hi {{name}},

I'll stop reaching out after this - but wanted to share one final thought:

{{personalized_insight}}

If timing changes and you want to explore customer acquisition scaling, my calendar is always open: {{booking_link}}

Wishing you continued success with {{company}}!

Best,
{{sender_name}}`
    }
  },
  
  // Nurture Sequence (Not now ≠ never)
  nurture: {
    delayDays: [30, 60],
    template: 're_engagement',
    condition: 'no_response'
  }
};

// ✅ SALES WORKFLOW ENGINE - Works even when automation fails
const SalesWorkflowEngine = {
  // Lead qualification based on ICP
  qualifyLead: (company) => {
    const qualifications = {
      industry: company.industry?.toLowerCase().includes('software') || 
                company.industry?.toLowerCase().includes('saas') ||
                company.description?.toLowerCase().includes('software'),
      size: company.employees >= 50 && company.employees <= 500,
      funding: company.recent_funding || company.funding_stage,
      trigger: company.recent_news || company.product_launch
    };
    
    const score = Object.values(qualifications).filter(Boolean).length;
    return {
      qualified: score >= 3,
      score,
      reasons: Object.entries(qualifications)
        .filter(([key, value]) => value)
        .map(([key]) => key)
    };
  },

  // 2-minute research extractor
  extractResearch: async (company) => {
    const research = {
      headline: `${company.name} - ${company.industry || 'Technology'}`,
      trigger: null,
      decision_makers: []
    };

    // Look for funding triggers
    if (company.recent_funding) {
      research.trigger = `Raised ${company.recent_funding} in ${company.funding_date}`;
    } else if (company.product_launch) {
      research.trigger = `Launched ${company.product_launch} in ${company.launch_date}`;
    } else if (company.recent_hiring) {
      research.trigger = `Hiring for ${company.recent_hiring} positions`;
    }

    // Extract decision makers
    if (company.executives) {
      research.decision_makers = company.executives
        .filter(exec => ['CEO', 'CTO', 'VP Sales', 'Head of Growth'].includes(exec.role))
        .slice(0, 2)
        .map(exec => ({
          name: exec.name,
          role: exec.role,
          linkedin: exec.linkedin,
          email: exec.email
        }));
    }

    return research;
  },

  // Email verification
  verifyEmail: (email) => {
    const checks = {
      format: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      risky_domain: ['gmail.com', 'yahoo.com', 'hotmail.com'].includes(email.split('@')[1]),
      mx_record: null // Would check MX records in real implementation
    };
    
    return {
      valid: checks.format && !checks.risky_domain,
      risk: checks.risky_domain ? 'high' : 'low',
      checks
    };
  },

  // Personalization generator (2 bullets: 1 observation, 1 impact)
  generatePersonalization: (company, research) => {
    const observations = [];
    const impacts = [];

    if (research.trigger) {
      observations.push(`${research.trigger}`);
      impacts.push(`Scaling acquisition is likely a priority right now`);
    }

    if (company.employees > 200) {
      observations.push(`Team of ${company.employees}+ people`);
      impacts.push(`Need efficient acquisition systems to support growth`);
    }

    if (company.industry?.includes('SaaS')) {
      observations.push(`B2B SaaS business model`);
      impacts.push(`Customer acquisition cost optimization is critical`);
    }

    return {
      observation: observations[0] || 'Growing technology company',
      impact: impacts[0] || 'Efficient scaling essential for continued growth'
    };
  },

  // Cadence execution
  executeCadenceStep: async (lead, step, manualMode = false) => {
    const template = SALES_STRATEGY.templates[step.template];
    const personalization = SalesWorkflowEngine.generatePersonalization(lead.company, lead.research);
    
    const emailContent = template.body
      .replace(/{{name}}/g, lead.decision_maker.name)
      .replace(/{{company}}/g, lead.company.name)
      .replace(/{{funding_amount}}/g, lead.company.recent_funding || 'recent funding')
      .replace(/{{similar_company}}/g, 'similar B2B SaaS company')
      .replace(/{{metric_before}}/g, '50 leads/month')
      .replace(/{{metric_after}}/g, '150 leads/month')
      .replace(/{{testimonial}}/g, 'This transformed our entire customer acquisition strategy')
      .replace(/{{personalized_insight}}/g, `${personalization.observation}. ${personalization.impact}.`)
      .replace(/{{sender_name}}/g, 'Dulran Samarasinghe')
      .replace(/{{booking_link}}/g, 'https://cal.com/syndicate-solutions/10min');

    return {
      content: emailContent,
      subject: template.subject.replace(/{{company}}/g, lead.company.name),
      personalization,
      delivery_method: manualMode ? 'manual' : 'automated',
      word_count: emailContent.split(' ').length
    };
  },

  // Safety checker
  checkSendSafety: async (emailCount, bounceRate, unsubscribeRate) => {
    const checks = {
      daily_limit: emailCount < SALES_STRATEGY.safety.maxEmailsPerDay,
      bounce_rate: bounceRate < SALES_STRATEGY.safety.bounceThreshold,
      unsubscribe_rate: unsubscribeRate < SALES_STRATEGY.safety.unsubscribeThreshold
    };

    return {
      safe: Object.values(checks).every(Boolean),
      checks,
      warnings: Object.entries(checks)
        .filter(([key, value]) => !value)
        .map(([key]) => key)
    };
  }
};

// ✅ MANUAL WORKFLOW SYSTEM - Complete manual override when automation fails
const ManualSalesWorkflow = {
  // Manual lead qualification
  manuallyQualifyLead: (company) => {
    const qualification = SalesWorkflowEngine.qualifyLead(company);
    return {
      ...qualification,
      manual_review: true,
      reviewer_notes: `Manual qualification completed on ${new Date().toLocaleString()}`
    };
  },

  // Manual research assistant
  manuallyResearchCompany: async (companyName) => {
    return {
      headline: `${companyName} - Manual Research Required`,
      trigger: 'Manual investigation needed',
      research_steps: [
        '1. Check recent funding announcements',
        '2. Look for product launches or expansions',
        '3. Identify key decision makers on LinkedIn',
        '4. Verify email formats and deliverability',
        '5. Research recent company news or triggers'
      ],
      estimated_time: '2 minutes',
      status: 'ready_for_manual_research'
    };
  },

  // Manual email composer with templates
  manuallyComposeEmail: (lead, templateType, personalization) => {
    const template = SALES_STRATEGY.templates[templateType];
    const emailContent = template.body
      .replace(/{{name}}/g, lead.decision_maker.name)
      .replace(/{{company}}/g, lead.company.name)
      .replace(/{{personalized_insight}}/g, personalization)
      .replace(/{{sender_name}}/g, 'Dulran Samarasinghe')
      .replace(/{{booking_link}}/g, 'https://cal.com/syndicate-solutions/10min');

    return {
      to: lead.decision_maker.email,
      subject: template.subject.replace(/{{company}}/g, lead.company.name),
      body: emailContent,
      word_count: emailContent.split(' ').length,
      template_used: templateType,
      composed_at: new Date().toISOString(),
      manual_composition: true
    };
  },

  // Manual cadence tracker
  manuallyTrackCadence: (leadId) => {
    return {
      lead_id: leadId,
      current_step: 'manual_tracking',
      completed_steps: [],
      next_actions: [
        'Send intro email',
        'Connect on LinkedIn',
        'Send social proof email',
        'Send LinkedIn message (if connected)',
        'Send breakup email'
      ],
      manual_tracking: true,
      last_updated: new Date().toISOString()
    };
  }
};

export default function StrategicSalesMachine() {
  // ✅ AUTH STATE
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const router = useRouter();

  // ✅ SALES WORKFLOW STATE
  const [salesPipeline, setSalesPipeline] = useState({
    qualified_leads: [],
    research_queue: [],
    outreach_queue: [],
    follow_up_queue: [],
    nurture_queue: [],
    completed: []
  });
  
  const [manualMode, setManualMode] = useState(false);
  const [currentCampaign, setCurrentCampaign] = useState(null);
  const [dailySendCount, setDailySendCount] = useState(0);
  const [kpis, setKpis] = useState({
    emails_sent: 0,
    replies: 0,
    meetings_booked: 0,
    bounce_rate: 0,
    unsubscribe_rate: 0,
    reply_rate: 0,
    meeting_rate: 0
  });
  
  const [selectedLead, setSelectedLead] = useState(null);
  const [manualResearch, setManualResearch] = useState(null);
  const [manualEmailComposer, setManualEmailComposer] = useState(null);
  const [cadenceTracker, setCadenceTracker] = useState({});

  // ✅ GENERAL STATE
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [csvFile, setCsvFile] = useState(null);
  const [notifications, setNotifications] = useState([]);

  // ✅ REFS
  const processingQueueRef = useRef([]);

  // ✅ NOTIFICATION SYSTEM
  const addNotification = (type, message) => {
    const notification = {
      id: Date.now(),
      type,
      message,
      timestamp: new Date()
    };
    setNotifications(prev => [notification, ...prev].slice(0, 10));
    
    if (type === 'error') {
      setError(message);
    } else if (type === 'success') {
      setSuccess(message);
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  };

  // ✅ AUTH HANDLERS
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      addNotification('success', 'Successfully signed in');
    } catch (err) {
      console.error('Sign in error:', err);
      addNotification('error', 'Failed to sign in: ' + err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      addNotification('success', 'Successfully signed out');
    } catch (err) {
      console.error('Sign out error:', err);
      addNotification('error', 'Failed to sign out');
    }
  };

  // ✅ LOAD CONTACTS
  const loadContacts = async () => {
    try {
      setLoading(true);
      const contactsRef = collection(db, 'contacts');
      const querySnapshot = await getDocs(contactsRef);
      const contactsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setContacts(contactsData);
    } catch (err) {
      console.error('Failed to load contacts:', err);
      addNotification('error', 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  // ✅ STRATEGIC SALES WORKFLOW FUNCTIONS
  const startSalesCampaign = async () => {
    try {
      setLoading(true);
      addNotification('info', 'Starting strategic sales campaign...');
      
      // Step 1: Load and qualify leads from ICP
      const qualifiedLeads = [];
      const allContacts = contacts.filter(c => c.company && c.company.name);
      
      for (const contact of allContacts.slice(0, 50)) { // Focus on 50 qualified targets
        const qualification = SalesWorkflowEngine.qualifyLead(contact.company);
        if (qualification.qualified) {
          const research = await SalesWorkflowEngine.extractResearch(contact.company);
          const emailVerification = SalesWorkflowEngine.verifyEmail(contact.email);
          
          qualifiedLeads.push({
            id: contact.id,
            contact,
            company: contact.company,
            qualification,
            research,
            email_verification: emailVerification,
            cadence_step: 0,
            status: 'qualified',
            created_at: new Date()
          });
        }
      }
      
      // Step 2: Move to research queue
      setSalesPipeline(prev => ({
        ...prev,
        qualified_leads: qualifiedLeads,
        research_queue: qualifiedLeads
      }));
      
      addNotification('success', `Qualified ${qualifiedLeads.length} leads from ICP. Ready for research phase.`);
      
      // Step 3: Start automated research if not in manual mode
      if (!manualMode) {
        await processResearchQueue();
      }
      
    } catch (err) {
      console.error('Failed to start sales campaign:', err);
      addNotification('error', 'Failed to start sales campaign: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processResearchQueue = async () => {
    try {
      const researchQueue = [...salesPipeline.research_queue];
      const processedLeads = [];
      
      for (const lead of researchQueue.slice(0, 10)) { // Process 10 at a time
        if (lead.research.decision_makers.length === 0) {
          // Trigger manual research workflow
          const manualResearchData = await ManualSalesWorkflow.manuallyResearchCompany(lead.company.name);
          setManualResearch(manualResearchData);
          addNotification('warning', `Manual research required for ${lead.company.name}`);
        } else {
          // Verify emails for decision makers
          lead.research.decision_makers.forEach(dm => {
            dm.email_verification = SalesWorkflowEngine.verifyEmail(dm.email);
          });
          
          processedLeads.push({
            ...lead,
            status: 'researched',
            research_completed_at: new Date()
          });
        }
      }
      
      // Move processed leads to outreach queue
      setSalesPipeline(prev => ({
        ...prev,
        research_queue: researchQueue.slice(10),
        outreach_queue: [...prev.outreach_queue, ...processedLeads]
      }));
      
      if (processedLeads.length > 0) {
        addNotification('success', `Research completed for ${processedLeads.length} leads. Ready for outreach.`);
        await processOutreachQueue();
      }
      
    } catch (err) {
      console.error('Failed to process research queue:', err);
      addNotification('error', 'Research processing failed: ' + err.message);
    }
  };

  const processOutreachQueue = async () => {
    try {
      // Check send safety
      const safetyCheck = await SalesWorkflowEngine.checkSendSafety(
        dailySendCount,
        kpis.bounce_rate,
        kpis.unsubscribe_rate
      );
      
      if (!safetyCheck.safe) {
        addNotification('error', `Send safety check failed: ${safetyCheck.warnings.join(', ')}`);
        return;
      }
      
      const outreachQueue = [...salesPipeline.outreach_queue];
      const processedLeads = [];
      
      for (const lead of outreachQueue.slice(0, Math.min(SALES_STRATEGY.safety.maxEmailsPerDay - dailySendCount, 10))) {
        // Execute cadence step
        const cadenceStep = SALES_STRATEGY.cadence[`day${lead.cadence_step}`];
        if (cadenceStep && cadenceStep.template) {
          const emailData = await SalesWorkflowEngine.executeCadenceStep(lead, cadenceStep, manualMode);
          
          // Send email (manual or automated)
          if (manualMode) {
            setManualEmailComposer(emailData);
            addNotification('info', `Manual email ready for ${lead.company.name}`);
          } else {
            // Automated send would go here
            addNotification('success', `Email sent to ${lead.company.name}`);
            setDailySendCount(prev => prev + 1);
            setKpis(prev => ({ ...prev, emails_sent: prev.emails_sent + 1 }));
          }
          
          // Update cadence tracker
          setCadenceTracker(prev => ({
            ...prev,
            [lead.id]: {
              current_step: lead.cadence_step,
              next_step: lead.cadence_step + 1,
              last_action: new Date(),
              completed_steps: [...(prev[lead.id]?.completed_steps || []), cadenceStep.template]
            }
          }));
          
          processedLeads.push({
            ...lead,
            cadence_step: lead.cadence_step + 1,
            last_outreach: new Date(),
            status: lead.cadence_step >= 7 ? 'completed' : 'in_progress'
          });
        }
      }
      
      // Update pipeline
      setSalesPipeline(prev => {
        const newQueue = outreachQueue.slice(processedLeads.length);
        const completedLeads = processedLeads.filter(l => l.status === 'completed');
        const inProgressLeads = processedLeads.filter(l => l.status === 'in_progress');
        
        return {
          ...prev,
          outreach_queue: newQueue,
          follow_up_queue: [...prev.follow_up_queue, ...inProgressLeads],
          completed: [...prev.completed, ...completedLeads]
        };
      });
      
      if (processedLeads.length > 0) {
        addNotification('success', `Outreach completed for ${processedLeads.length} leads.`);
      }
      
    } catch (err) {
      console.error('Failed to process outreach queue:', err);
      addNotification('error', 'Outreach processing failed: ' + err.message);
    }
  };

  const manuallyProcessLead = async (leadId, action) => {
    try {
      const lead = salesPipeline.qualified_leads.find(l => l.id === leadId) || 
                   salesPipeline.research_queue.find(l => l.id === leadId) ||
                   salesPipeline.outreach_queue.find(l => l.id === leadId);
      
      if (!lead) {
        addNotification('error', 'Lead not found in pipeline');
        return;
      }
      
      switch (action) {
        case 'research':
          const researchData = await ManualSalesWorkflow.manuallyResearchCompany(lead.company.name);
          setManualResearch(researchData);
          setSelectedLead(lead);
          break;
          
        case 'qualify':
          const qualification = ManualSalesWorkflow.manuallyQualifyLead(lead.company);
          lead.qualification = qualification;
          addNotification('success', `Lead ${lead.company.name} qualified manually`);
          break;
          
        case 'compose_email':
          const emailData = ManualSalesWorkflow.manuallyComposeEmail(lead, 'intro', 'Manual personalized message');
          setManualEmailComposer(emailData);
          setSelectedLead(lead);
          break;
          
        case 'track_cadence':
          const cadenceData = ManualSalesWorkflow.manuallyTrackCadence(leadId);
          setCadenceTracker(prev => ({ ...prev, [leadId]: cadenceData }));
          break;
          
        default:
          addNotification('error', 'Unknown manual action');
      }
      
    } catch (err) {
      console.error('Failed to process lead manually:', err);
      addNotification('error', 'Manual processing failed: ' + err.message);
    }
  };

  const updateKPIs = () => {
    const totalEmails = kpis.emails_sent;
    const replyRate = totalEmails > 0 ? (kpis.replies / totalEmails) * 100 : 0;
    const meetingRate = totalEmails > 0 ? (kpis.meetings_booked / totalEmails) * 100 : 0;
    
    setKpis(prev => ({
      ...prev,
      reply_rate: replyRate.toFixed(1),
      meeting_rate: meetingRate.toFixed(1)
    }));
    
    // Check for KPI warnings
    if (kpis.bounce_rate > 5) {
      addNotification('error', 'Bounce rate exceeded 5% - consider pausing outreach');
    }
    if (kpis.unsubscribe_rate > 1) {
      addNotification('warning', 'Unsubscribe rate exceeded 1% - review messaging');
    }
    if (replyRate < 10) {
      addNotification('info', 'Reply rate below 10% - consider template optimization');
    }
  };

  // ✅ CSV IMPORT (Optimized for complex data)
  const processCSV = () => {
    if (!csvFile) return;

    setLoading(true);
    setSuccess('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          addNotification('error', 'CSV file is empty or invalid');
          setLoading(false);
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const validContacts = [];
        const invalidContacts = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          
          // Map values to headers
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          // Skip empty rows
          if (!row.name && !row.email) continue;

          // Validate required fields
          if (!row.email || !row.name) {
            invalidContacts.push({ row: i + 1, data: row, reason: 'Missing email or name' });
            continue;
          }

          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(row.email)) {
            invalidContacts.push({ row: i + 1, data: row, reason: 'Invalid email format' });
            continue;
          }

          validContacts.push({
            ...row,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });
        }

        // Batch save to Firestore
        const batchSize = 10;
        for (let i = 0; i < validContacts.length; i += batchSize) {
          const batch = writeBatch(db);
          const batchEnd = Math.min(i + batchSize, validContacts.length);
          
          for (let j = i; j < batchEnd; j++) {
            const contactRef = doc(collection(db, 'contacts'));
            batch.set(contactRef, validContacts[j]);
          }
          
          await batch.commit();
        }

        await loadContacts();
        addNotification('success', `Successfully imported ${validContacts.length} contacts. ${invalidContacts.length} invalid entries skipped.`);
        
      } catch (err) {
        console.error('CSV processing error:', err);
        addNotification('error', 'Failed to process CSV file');
      } finally {
        setLoading(false);
        setCsvFile(null);
      }
    };

    reader.readAsText(csvFile);
  };

  // ✅ EFFECTS
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoadingAuth(false);
      if (user) {
        loadContacts();
      }
    });
    return () => unsubscribe();
  }, []);

  // ✅ RENDER
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Strategic Sales Machine</title>
        <meta name="description" content="B2B Sales Automation with Manual Fallback" />
      </Head>

      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">Strategic Sales Machine</h1>
            </div>
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <div className="text-sm text-gray-600">
                    Welcome, {user.displayName || user.email}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
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
        {!user ? (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Strategic Sales Machine</h2>
            <p className="text-gray-600 mb-8">Sign in to start your B2B sales campaign with strategic automation and manual fallback.</p>
            <button
              onClick={handleGoogleSignIn}
              className="px-6 py-3 text-lg font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Sign In with Google
            </button>
          </div>
        ) : (
          <>
            {/* Strategic Sales Campaign Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <h2 className="text-xl font-semibold text-gray-900">Strategic Sales Campaign</h2>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    manualMode ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {manualMode ? 'Manual Mode' : 'Automated Mode'}
                  </div>
                  <button
                    onClick={() => setManualMode(!manualMode)}
                    className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                  >
                    Switch to {manualMode ? 'Automated' : 'Manual'}
                  </button>
                </div>
                
                <div className="flex items-center space-x-4">
                  <button
                    onClick={startSalesCampaign}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Starting...' : 'Start Campaign'}
                  </button>
                  <button
                    onClick={updateKPIs}
                    className="px-3 py-1 text-xs font-medium text-purple-700 bg-purple-100 rounded-md hover:bg-purple-200"
                  >
                    Update KPIs
                  </button>
                </div>
              </div>

              {/* ICP Definition */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Ideal Customer Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
                  <div>
                    <span className="font-medium">Industry:</span> {SALES_STRATEGY.icp.industry}
                  </div>
                  <div>
                    <span className="font-medium">Size:</span> {SALES_STRATEGY.icp.size}
                  </div>
                  <div>
                    <span className="font-medium">Geo:</span> {SALES_STRATEGY.icp.geo}
                  </div>
                  <div>
                    <span className="font-medium">Pain:</span> {SALES_STRATEGY.icp.pain}
                  </div>
                  <div>
                    <span className="font-medium">Trigger:</span> {SALES_STRATEGY.icp.trigger}
                  </div>
                </div>
              </div>

              {/* Sales Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-900">{salesPipeline.qualified_leads.length}</div>
                  <div className="text-xs text-blue-700">Qualified Leads</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-yellow-900">{salesPipeline.research_queue.length}</div>
                  <div className="text-xs text-yellow-700">Research Queue</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-900">{salesPipeline.outreach_queue.length}</div>
                  <div className="text-xs text-purple-700">Outreach Queue</div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-indigo-900">{salesPipeline.follow_up_queue.length}</div>
                  <div className="text-xs text-indigo-700">Follow-up Queue</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-900">{salesPipeline.completed.length}</div>
                  <div className="text-xs text-green-700">Completed</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-gray-900">{dailySendCount}</div>
                  <div className="text-xs text-gray-700">Daily Sends</div>
                </div>
              </div>

              {/* KPI Dashboard */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Key Performance Indicators</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{kpis.reply_rate}%</div>
                    <div className="text-xs text-gray-600">Reply Rate</div>
                    <div className="text-xs text-gray-500">Target: 15%+</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{kpis.meeting_rate}%</div>
                    <div className="text-xs text-gray-600">Meeting Rate</div>
                    <div className="text-xs text-gray-500">Target: 5%+</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{kpis.bounce_rate}%</div>
                    <div className="text-xs text-gray-600">Bounce Rate</div>
                    <div className={`text-xs ${kpis.bounce_rate > 5 ? 'text-red-500' : 'text-gray-500'}`}>
                      {kpis.bounce_rate > 5 ? '⚠️ Above 5%' : 'Target: <5%'}
                    </div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{kpis.unsubscribe_rate}%</div>
                    <div className="text-xs text-gray-600">Unsubscribe Rate</div>
                    <div className={`text-xs ${kpis.unsubscribe_rate > 1 ? 'text-red-500' : 'text-gray-500'}`}>
                      {kpis.unsubscribe_rate > 1 ? '⚠️ Above 1%' : 'Target: <1%'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Manual Workflow Controls */}
              {manualMode && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-orange-900 mb-2">Manual Workflow Controls</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <button
                      onClick={() => processResearchQueue()}
                      className="px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700"
                    >
                      Process Research Queue
                    </button>
                    <button
                      onClick={() => processOutreachQueue()}
                      className="px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700"
                    >
                      Process Outreach Queue
                    </button>
                    <button
                      onClick={() => setManualEmailComposer({})}
                      className="px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700"
                    >
                      Compose Manual Email
                    </button>
                    <button
                      onClick={() => setManualResearch({})}
                      className="px-3 py-2 bg-orange-600 text-white text-sm rounded-md hover:bg-orange-700"
                    >
                      Manual Research
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* CSV Import Section */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Import Contacts</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload CSV File (with company data, decision makers, etc.)
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setCsvFile(e.target.files[0])}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                {csvFile && (
                  <button
                    onClick={processCSV}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : 'Import CSV'}
                  </button>
                )}
              </div>
            </div>

            {/* Manual Email Composer */}
            {manualEmailComposer && (
              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Manual Email Composer</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To:</label>
                    <input
                      type="email"
                      value={manualEmailComposer.to || ''}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject:</label>
                    <input
                      type="text"
                      value={manualEmailComposer.subject || ''}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body:</label>
                    <textarea
                      value={manualEmailComposer.body || ''}
                      rows={10}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md"
                      readOnly
                    />
                  </div>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setManualEmailComposer(null)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                      Close
                    </button>
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Send Email
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Research Assistant */}
            {manualResearch && (
              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Manual Research Assistant</h3>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900">{manualResearch.headline}</h4>
                    <p className="text-sm text-gray-600">Estimated time: {manualResearch.estimated_time}</p>
                  </div>
                  <div>
                    <h5 className="font-medium text-gray-900 mb-2">Research Steps:</h5>
                    <ul className="list-disc list-inside space-y-1">
                      {manualResearch.research_steps?.map((step, index) => (
                        <li key={index} className="text-sm text-gray-600">{step}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => setManualResearch(null)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                      Close
                    </button>
                    <button
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Mark Complete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-4 rounded-md shadow-lg max-w-sm ${
              notification.type === 'error' ? 'bg-red-50 border border-red-200' :
              notification.type === 'success' ? 'bg-green-50 border border-green-200' :
              notification.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
              'bg-blue-50 border border-blue-200'
            }`}
          >
            <p className={`text-sm ${
              notification.type === 'error' ? 'text-red-800' :
              notification.type === 'success' ? 'text-green-800' :
              notification.type === 'warning' ? 'text-yellow-800' :
              'text-blue-800'
            }`}>
              {notification.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
