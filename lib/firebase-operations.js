// lib/firebase-operations.js
// Common Firebase operations with performance optimizations

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
  deleteDoc, 
  orderBy
} from 'firebase/firestore';
import { cachedQuery, invalidateCache } from './firebase-cache.js';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || ''
};

let app;
let db;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase initialization error:', error);
};

export const getFirebaseDB = () => db;

/**
 * Load settings from Firebase with improved caching and error handling
 */
export const loadSettingsFromFirebase = async (userId) => {
  if (!userId || !db) return null;

  try {
    return await cachedQuery(
      async () => {
        // Check cache first
        const cacheKey = `user_settings:${userId}`;
        const cachedData = sessionStorage.getItem(cacheKey);
        if (cachedData) {
          return JSON.parse(cachedData);
        }
        
        // Primary fetch
        const docRef = doc(db, 'users', userId, 'settings', 'templates');
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
          const data = snap.data();
          // Cache in sessionStorage for this session
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
          return data;
        }
        
        return null;
      },
      'user_settings',
      { userId },
      { userId },
      10 * 60 * 1000 // 10 minutes cache for settings
    );
  } catch (error) {
    console.error('Load settings error:', error);
    return null;
  }
};

/**
 * Save settings to Firebase with cache invalidation and reduced overhead
 */
export const saveSettingsToFirebase = async (userId, settings) => {
  if (!userId || !db) return false;

  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    await setDoc(docRef, settings, { merge: true });
    
    // Invalidate cache for this user's settings
    invalidateCache('user_settings', userId);
    
    // Optimize session storage cleanup
    const keysToRemove = Object.keys(sessionStorage)
      .filter(key => key.startsWith('user_settings:'))
      .forEach(key => sessionStorage.removeItem(key));
    
    return true;
  } catch (error) {
    console.error('Save settings error:', error);
    return false;
  }
};

/**
 * Load manual contact status with optimized query
 */
export const loadManualContactStatus = async (userId) => {
  if (!userId || !db) return {};

  try {
    const q = query(
      collection(db, 'manual_contact_status'),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    
    const status = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const key = data.contactKey;
      if (key) {
        status[key] = data;
      }
    });

    return status;
  } catch (error) {
    console.error('Load manual contact status error:', error);
    return {};
  }
};

/**
 * Batch load multiple types of data efficiently
 * This replaces multiple separate API calls with a single optimized call
 */
 export const loadUserAnalyticsData = async (userId) => {
   if (!userId || !db) return {
     settings: null,
     clickStats: {},
     deals: [],
     abResults: [],
     repliedFollowups: [],
     sentLeads: [],
     whatsappContacts: [],
     dailyCount: 0,
     sendTimeOptimization: null,
     manualContactStatus: {}
   };

   try {
     // Use Promise.allSettled for better error handling, but limit concurrency
     const promises = [
       // Individual calls but with better error isolation
       loadSettingsFromFirebase(userId),
       loadSentLeads(userId),
       loadWhatsAppContacts(userId),
       loadDailyEmailCount(userId),
       loadSendTimeOptimization(userId),
       loadManualContactStatus(userId),
       loadAbResults(userId),
       loadRepliedAndFollowUp(userId),
     ];

     const results = await Promise.allSettled(promises);
     
     // Process results safely
     return {
       settings: results[0].value,
       clickStats: results[1].value || {},
       deals: results[2]?.value || [],
       abResults: results[3]?.value || [],
       repliedFollowups: results[4]?.value || [],
       sentLeads: results[5]?.value || [],
       whatsappContacts: results[6]?.value || [],
       dailyCount: results[7]?.value || 0,
       sendTimeOptimization: results[8]?.value || null,
       manualContactStatus: results[9]?.value || {},
     };
   } catch (error) {
     console.error('Batch load error:', error);
     return {
       settings: null,
       clickStats: {},
       deals: [],
       abResults: [],
       repliedFollowups: [],
       sentLeads: [],
       whatsappContacts: [],
       dailyCount: 0,
       sendTimeOptimization: null,
       manualContactStatus: {},
     };
   }
 };

 /**
  * Optimized sent leads loader with caching
  */
 export const loadSentLeads = async (userId) => {
   if (!userId || !db) return [];

   try {
     // Check existing cache first
     const cached = localStorage.getItem(`sent_leads:${userId}`);
     if (cached) {
       return JSON.parse(cached);
     }

     const q = query(
       collection(db, 'sent_leads'),
       where('userId', '==', userId),
       orderBy('sentAt', 'desc'),
       limit(50) // Limit to recent leads
     );
     
     const snapshot = await getDocs(q);
     const leads = snapshot.docs.map(doc => doc.data());
     
     // Save to cache
     localStorage.setItem(`sent_leads:${userId}`, JSON.stringify(leads));
     
     return leads;
   } catch (error) {
     console.error('Load sent leads error:', error);
     return [];
   }
 };

 /**
  * Optimized WhatsApp contacts loader with pagination
  */
 export const loadWhatsAppContacts = async (userId) => {
   if (!userId || !db) return [];

   try {
     // Simple limiting to prevent performance issues
     const q = query(
       collection(db, 'whatsapp_contacts'),
       where('userId', '==', userId),
       orderBy('lastContactedAt', 'desc'),
       limit(20)
     );
     
     const snapshot = await getDocs(q);
     const contacts = snapshot.docs.map(doc => doc.data());
     
     return contacts;
   } catch (error) {
     console.error('Load WhatsApp contacts error:', error);
     return [];
   }
 };

 /**
  * Optimized daily count loader with fallback
  */
 export const loadDailyEmailCount = async (userId) => {
   if (!userId || !db) return 0;

   try {
     // Check cache first
     const cached = sessionStorage.getItem(`daily_count:${userId}`);
     if (cached !== null) {
       return parseInt(cached, 10);
     }

     // Simple count query
     const q = query(
       collection(db, 'daily_metrics'),
       where('userId', '==', userId),
       where('metric', '==', 'emails')
     );

     const snapshot = await getDocs(q);
     const count = snapshot.docs.length;

     // Cache result
     sessionStorage.setItem(`daily_count:${userId}`, count.toString());

     return count;
   } catch (error) {
     console.error('Load daily count error:', error);
     return 0;
   }
 };

 /**
  * Send time optimization loader with local fallback
  */
 export const loadSendTimeOptimization = async (userId) => {
   if (!userId || !db) return null;

   try {
     // Check cache first
     const cached = sessionStorage.getItem(`send_time_opt:${userId}`);
     if (cached) {
       const parsed = JSON.parse(cached);
       // Validate cache isn't too old (older than 1 hour)
       if (Date.now() - parsed.timestamp < 3600000) {
         return parsed.data;
       }
     }

     // Try to fetch from Firestore
     const q = query(
       collection(db, 'send_time_optimization'),
       where('userId', '==', userId)
     );

     const snapshot = await getDocs(q);
     let result = null;
     if (!snapshot.empty) {
       result = snapshot.docs[0].data();
     }

     // Cache result if exists
     if (result) {
       sessionStorage.setItem(`send_time_opt:${userId}`, JSON.stringify({
         data: result,
         timestamp: Date.now()
       }));
     }

     return result;
   } catch (error) {
     console.error('Load send time optimization error:', error);
     return null;
   }
 };
  if (!userId || !email || !db) return false;

  try {
    const dealRef = doc(db, 'deals', email);
    await setDoc(dealRef, {
      userId,
      email,
      stage,
      lastUpdate: new Date().toISOString(),
      value: avgDealValue
    }, { merge: true });

    return true;
  } catch (error) {
    console.error('Update deal error:', error);
    return false;
  }
};

// Load sent leads (with caching)
export const loadSentLeads = async (userId) => {
  if (!userId || !db) return [];

  try {
    return await cachedQuery(
      async () => {
        const q = query(collection(db, 'sent_emails'), where('userId', '==', userId));
        const snapshot = await getDocs(q);

        const leads = [];
        snapshot.forEach(doc => {
          leads.push({ id: doc.id, ...doc.data() });
        });

        return leads;
      },
      'sent_emails',
      { userId },
      {},
      2 * 60 * 1000 // 2 minutes cache for sent leads
    );
  } catch (error) {
    console.error('Load sent leads error:', error);
    return [];
  }
};

// Load replied leads and follow-up history (with caching)
export const loadRepliedAndFollowUp = async (userId) => {
  if (!userId || !db) {
    return { repliedMap: {}, followUpMap: {}, history: {}, stats: null };
  }

  try {
    return await cachedQuery(
      async () => {
        const q = query(collection(db, 'sent_emails'), where('userId', '==', userId));
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
            dates: data.followUpDates ?? [],
            loopClosed: data.followUpCount >= 3
          };
        });

        // Calculate follow-up stats
        const replied = normalizedLeads.filter(l => l.replied).length;
        const followedUp = normalizedLeads.filter(l => Number(l.followUpCount) > 0).length;
        const awaiting = normalizedLeads.filter(l => {
          const followUpAt = getLeadNextFollowUpAt(l);
          return !l.replied && (!followUpAt || followUpAt > now);
        }).length;
        const interested = normalizedLeads.filter(l =>
          l.seemsInterested && !l.replied
        ).length;

        const stats = {
          totalSent: normalizedLeads.length,
          totalReplied: replied,
          totalFollowedUp: followedUp,
          awaitingFollowUp: awaiting,
          interestedLeads: interested
        };

        return { repliedMap, followUpMap, history, stats };
      },
      'replied_followup',
      { userId },
      {},
      1 * 60 * 1000 // 1 minute cache for follow-up data (more frequent updates)
    );
  } catch (error) {
    console.error('Load replied and follow-up error:', error);
    return { repliedMap: {}, followUpMap: {}, history: {}, stats: null };
  }
};

// Helper functions
export const normalizeSentLead = (lead) => {
  if (!lead) return lead;

  return {
    ...lead,
    email: lead.email?.toLowerCase().trim() || lead.email,
    followUpCount: Number(lead.followUpCount ?? 0),
    replied: Boolean(lead.replied),
    seemsInterested: Boolean(lead.seemsInterested)
  };
};

export const getLeadNextFollowUpAt = (lead) => {
  if (!lead || lead.replied) return null;

  // First check if there's an explicit followUpAt set (from initial email send)
  if (lead.followUpAt) {
    const followUpDate = new Date(lead.followUpAt);
    return adjustToWorkingHours(followUpDate);
  }

  // Otherwise calculate based on lastFollowUpAt and follow-up count
  // Delays match the follow-up templates: 2 days for first, 5 days for second, 10 days for third
  const followUpCount = Number(lead.followUpCount ?? 0);
  const lastFollowUpAt = lead.lastFollowUpAt || lead.lastFollowUpSentAt;

  if (!lastFollowUpAt) return null;

  const lastDate = new Date(lastFollowUpAt);
  const daysToAdd = followUpCount === 0 ? 2 : followUpCount === 1 ? 5 : 10;
  const nextDate = new Date(lastDate);
  nextDate.setDate(nextDate.getDate() + daysToAdd);

  // Adjust to working hours on the same follow-up day
  return adjustToWorkingHours(nextDate);
};

// Helper function to adjust a date to working hours (9 AM - 6 PM, weekdays)
const adjustToWorkingHours = (date) => {
  const adjusted = new Date(date);
  const hour = adjusted.getHours();
  const day = adjusted.getDay();

  // If it's weekend, move to Monday 9 AM
  if (day === 0) { // Sunday
    adjusted.setDate(adjusted.getDate() + 1);
    adjusted.setHours(9, 0, 0, 0);
    return adjusted;
  }
  if (day === 6) { // Saturday
    adjusted.setDate(adjusted.getDate() + 2);
    adjusted.setHours(9, 0, 0, 0);
    return adjusted;
  }

  // If it's weekday but outside business hours, adjust to same day working hour
  if (hour < 9) {
    // Before 9 AM, set to 9 AM same day
    adjusted.setHours(9, 0, 0, 0);
    return adjusted;
  }
  if (hour >= 18) {
    // After 6 PM, set to 9 AM same day (user wants same day)
    adjusted.setHours(9, 0, 0, 0);
    return adjusted;
  }

  // Already in business hours
  return adjusted;
};

// ============================================================================
// FOLLOW-UP QUEUE OPERATIONS
// ============================================================================

// Create a follow-up task in the queue
export const createFollowUpTask = async (userId, taskData) => {
  if (!userId || !db) return null;

  try {
    const tasksRef = collection(db, 'users', userId, 'follow_up_tasks');
    const taskRef = await addDoc(tasksRef, {
      ...taskData,
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null
    });
    invalidateCache('follow_up_tasks');
    return taskRef.id;
  } catch (error) {
    console.error('Create follow-up task error:', error);
    return null;
  }
};

// Load all follow-up tasks for a user
export const loadFollowUpTasks = async (userId) => {
  if (!userId || !db) return { pending: [], completed: [] };

  try {
    return await cachedQuery(
      async () => {
        const q = query(
          collection(db, 'users', userId, 'follow_up_tasks'),
          orderBy('scheduledFor', 'asc')
        );
        const snapshot = await getDocs(q);

        const pending = [];
        const completed = [];

        snapshot.forEach(doc => {
          const task = { id: doc.id, ...doc.data() };
          if (task.status === 'completed') {
            completed.push(task);
          } else {
            pending.push(task);
          }
        });

        return { pending, completed };
      },
      'follow_up_tasks',
      { userId },
      {},
      5 * 60 * 1000 // Increased cache to 5 minutes for better performance
    );
  } catch (error) {
    console.error('Load follow-up tasks error:', error);
    return { pending: [], completed: [] };
  }
};

// Complete a follow-up task
export const completeFollowUpTask = async (userId, taskId, completionData = {}) => {
  if (!userId || !taskId || !db) return false;

  try {
    const taskRef = doc(db, 'users', userId, 'follow_up_tasks', taskId);
    await updateDoc(taskRef, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      ...completionData
    });
    invalidateCache('follow_up_tasks');
    return true;
  } catch (error) {
    console.error('Complete follow-up task error:', error);
    return false;
  }
};

// Delete a follow-up task
export const deleteFollowUpTask = async (userId, taskId) => {
  if (!userId || !taskId || !db) return false;

  try {
    const taskRef = doc(db, 'users', userId, 'follow_up_tasks', taskId);
    await deleteDoc(taskRef);
    invalidateCache('follow_up_tasks');
    return true;
  } catch (error) {
    console.error('Delete follow-up task error:', error);
    return false;
  }
};

// Check if a follow-up task already exists (for idempotency)
export const checkFollowUpTaskExists = async (userId, leadEmail, channel, followUpStage) => {
  if (!userId || !leadEmail || !db) return false;

  try {
    const q = query(
      collection(db, 'users', userId, 'follow_up_tasks'),
      where('leadEmail', '==', leadEmail),
      where('channel', '==', channel),
      where('followUpStage', '==', followUpStage),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error('Check follow-up task exists error:', error);
    return false;
  }
};

// ============================================================================
// LEAD NOTES & STATE OPERATIONS
// ============================================================================

// Save lead notes
export const saveLeadNotes = async (userId, leadEmail, notes) => {
  if (!userId || !leadEmail || !db) return false;

  try {
    const notesRef = doc(db, 'users', userId, 'lead_notes', leadEmail);
    await setDoc(notesRef, {
      userId,
      leadEmail,
      notes,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    invalidateCache('lead_notes');
    return true;
  } catch (error) {
    console.error('Save lead notes error:', error);
    return false;
  }
};

// Load lead notes
export const loadLeadNotes = async (userId) => {
  if (!userId || !db) return {};

  try {
    return await cachedQuery(
      async () => {
        const q = query(collection(db, 'users', userId, 'lead_notes'));
        const snapshot = await getDocs(q);

        const notes = {};
        snapshot.forEach(doc => {
          const data = doc.data();
          notes[data.leadEmail] = data.notes;
        });

        return notes;
      },
      'lead_notes',
      { userId },
      {},
      5 * 60 * 1000 // 5 minutes cache
    );
  } catch (error) {
    console.error('Load lead notes error:', error);
    return {};
  }
};

// Update lead state
export const updateLeadState = async (userId, leadEmail, stateData) => {
  if (!userId || !leadEmail || !db) return false;

  try {
    const stateRef = doc(db, 'users', userId, 'lead_states', leadEmail);
    await setDoc(stateRef, {
      userId,
      leadEmail,
      ...stateData,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    invalidateCache('lead_states');
    return true;
  } catch (error) {
    console.error('Update lead state error:', error);
    return false;
  }
};

// Load lead states
export const loadLeadStates = async (userId) => {
  if (!userId || !db) return {};

  try {
    return await cachedQuery(
      async () => {
        const q = query(collection(db, 'users', userId, 'lead_states'));
        const snapshot = await getDocs(q);

        const states = {};
        snapshot.forEach(doc => {
          const data = doc.data();
          states[data.leadEmail] = data;
        });

        return states;
      },
      'lead_states',
      { userId },
      {},
      5 * 60 * 1000 // 5 minutes cache
    );
  } catch (error) {
    console.error('Load lead states error:', error);
    return {};
  }
};

// ============================================================================
// AUTO-DELETE OLD RECORDS (PERFORMANCE OPTIMIZATION)
// ============================================================================

// Delete completed follow-up tasks older than specified days
export const deleteOldCompletedTasks = async (userId, daysToKeep = 30) => {
  if (!userId || !db) return { deleted: 0 };

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const q = query(
      collection(db, 'users', userId, 'follow_up_tasks'),
      where('status', '==', 'completed'),
      where('completedAt', '<', cutoffDate.toISOString())
    );
    const snapshot = await getDocs(q);

    let deleted = 0;
    const batch = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(batch);
    deleted = snapshot.docs.length;

    invalidateCache('follow_up_tasks');
    console.log(`[Cleanup] Deleted ${deleted} old completed tasks (older than ${daysToKeep} days)`);
    return { deleted };
  } catch (error) {
    console.error('Delete old completed tasks error:', error);
    return { deleted: 0, error };
  }
};

// Auto-cleanup function to be called periodically
export const autoCleanupOldRecords = async (userId) => {
  if (!userId) return;

  try {
    // Delete completed tasks older than 30 days
    await deleteOldCompletedTasks(userId, 30);
  } catch (error) {
    console.error('Auto cleanup error:', error);
  }
};
