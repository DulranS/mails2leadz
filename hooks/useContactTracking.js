// hooks/useContactTracking.js
// Custom hook for tracking contact history

import { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, doc, setDoc, increment } from 'firebase/firestore';
import { daysBetween, normalizeContactKey } from '../lib/dashboard-utils.js';
import { CONFIG } from '../lib/dashboard-config.js';

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

export const useContactTracking = (userId) => {
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
          const key = data.contactKey;
          if (key) {
            history[key] = {
              contacted: data.contacted || false,
              lastContacted: data.lastContacted || null,
              emailCount: data.emailCount || 0,
              whatsappCount: data.whatsappCount || 0,
              smsCount: data.smsCount || 0,
              callCount: data.callCount || 0,
              lastUpdated: data.lastUpdated || null
            };
          }
        });

        setContactHistory(history);
        localStorageHelper.set(`contact_history_${userId}`, history);
      } catch (err) {
        console.error('Contact history load error:', err);
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

    const normalizedKey = normalizeContactKey({ email: contactKey, phone: contactKey });
    if (!normalizedKey) return false;

    try {
      const now = new Date().toISOString();
      const docRef = doc(db, 'contact_history', `${userId}_${normalizedKey}`);

      const updateData = {
        userId,
        contactKey: normalizedKey,
        contacted: true,
        lastContacted: now,
        lastUpdated: now,
        ...data
      };

      await setDoc(docRef, updateData, { merge: true });

      // Update local state
      setContactHistory(prev => ({
        ...prev,
        [normalizedKey]: {
          ...prev[normalizedKey],
          ...updateData
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
        reason: `Too soon (${daysSince} days since last contact)`,
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
        emailCount: 0,
        whatsappCount: 0,
        smsCount: 0,
        callCount: 0,
        lastContacted: null,
        lastChannel: null
      };
    }

    return {
      contacted: history.contacted || false,
      totalContacts: (history.emailCount || 0) + (history.whatsappCount || 0) + (history.smsCount || 0) + (history.callCount || 0),
      emailCount: history.emailCount || 0,
      whatsappCount: history.whatsappCount || 0,
      smsCount: history.smsCount || 0,
      callCount: history.callCount || 0,
      lastContacted: history.lastContacted,
      lastChannel: null // Could be enhanced to track last channel
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

// Local storage helper (needed for fallback)
const localStorageHelper = {
  get: (key, defaultValue = null) => {
    try {
      if (typeof window !== 'undefined') {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      }
      return defaultValue;
    } catch (error) {
      return defaultValue;
    }
  },
  set: (key, value) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      // Silent fail
    }
  }
};
