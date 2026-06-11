// lib/firebase-operations.js
// Common Firebase operations

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
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
}

export const getFirebaseDB = () => db;

// Load settings from Firebase (with caching)
export const loadSettingsFromFirebase = async (userId) => {
  if (!userId || !db) return null;

  try {
    return await cachedQuery(
      async () => {
        const docRef = doc(db, 'users', userId, 'settings', 'templates');
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          return snap.data();
        }
        return null;
      },
      'user_settings',
      { userId },
      {},
      10 * 60 * 1000 // 10 minutes cache for settings
    );
  } catch (error) {
    console.error('Load settings error:', error);
    return null;
  }
};

// Save settings to Firebase (with cache invalidation)
export const saveSettingsToFirebase = async (userId, settings) => {
  if (!userId || !db) return false;

  try {
    const docRef = doc(db, 'users', userId, 'settings', 'templates');
    await setDoc(docRef, settings, { merge: true });
    // Invalidate cache for this user's settings
    invalidateCache('user_settings');
    return true;
  } catch (error) {
    console.error('Save settings error:', error);
    return false;
  }
};

// Load manual contact status
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

// Update deal stage
export const updateDealStage = async (userId, email, stage, avgDealValue = 5000) => {
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
    return new Date(lead.followUpAt);
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

  return nextDate;
};
