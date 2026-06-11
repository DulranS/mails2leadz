// app/api/cleanup-old-data/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

// Firebase Config
const getFirebaseConfig = () => {
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing Firebase env vars: ${missingVars.join(', ')}`);
  }

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
  };
};

let app, db;
try {
  const firebaseConfig = getFirebaseConfig();
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (configError) {
  console.error('Firebase config error:', configError);
}

// Cleanup Configuration
const CLEANUP_CONFIG = {
  // Delete sent emails older than 90 days that haven't replied
  SENT_EMAILS_RETENTION_DAYS: 90,
  
  // Delete contact history older than 180 days
  CONTACT_HISTORY_RETENTION_DAYS: 180,
  
  // Delete closed deals older than 365 days
  CLOSED_DEALS_RETENTION_DAYS: 365,
  
  // Delete old analytics data older than 30 days
  ANALYTICS_RETENTION_DAYS: 30,
  
  // Maximum number of documents to delete in one batch
  MAX_BATCH_DELETE: 500
};

// Helper function to check if a document is old enough to delete
const isOldEnoughToDelete = (timestamp, retentionDays) => {
  if (!timestamp) return false;
  
  const docDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  
  return docDate < cutoffDate;
};

// Cleanup sent emails
const cleanupSentEmails = async (userId) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.SENT_EMAILS_RETENTION_DAYS);
  
  const q = query(
    collection(db, 'sent_emails'),
    where('userId', '==', userId),
    where('sentAt', '<', cutoffDate.toISOString()),
    where('replied', '==', false)
  );
  
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  
  for (const docSnapshot of snapshot.docs.slice(0, CLEANUP_CONFIG.MAX_BATCH_DELETE)) {
    try {
      await deleteDoc(doc(db, 'sent_emails', docSnapshot.id));
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete sent email ${docSnapshot.id}:`, error);
    }
  }
  
  return deletedCount;
};

// Cleanup contact history
const cleanupContactHistory = async (userId) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.CONTACT_HISTORY_RETENTION_DAYS);
  
  const q = query(
    collection(db, 'contact_history'),
    where('userId', '==', userId),
    where('timestamp', '<', cutoffDate.toISOString())
  );
  
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  
  for (const docSnapshot of snapshot.docs.slice(0, CLEANUP_CONFIG.MAX_BATCH_DELETE)) {
    try {
      await deleteDoc(doc(db, 'contact_history', docSnapshot.id));
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete contact history ${docSnapshot.id}:`, error);
    }
  }
  
  return deletedCount;
};

// Cleanup closed deals
const cleanupClosedDeals = async (userId) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.CLOSED_DEALS_RETENTION_DAYS);
  
  const q = query(
    collection(db, 'deals'),
    where('userId', '==', userId),
    where('stage', 'in', ['closed_won', 'closed_lost']),
    where('created_at', '<', cutoffDate.toISOString())
  );
  
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  
  for (const docSnapshot of snapshot.docs.slice(0, CLEANUP_CONFIG.MAX_BATCH_DELETE)) {
    try {
      await deleteDoc(doc(db, 'deals', docSnapshot.id));
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete deal ${docSnapshot.id}:`, error);
    }
  }
  
  return deletedCount;
};

// Cleanup analytics data
const cleanupAnalytics = async (userId) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_CONFIG.ANALYTICS_RETENTION_DAYS);
  
  const q = query(
    collection(db, 'analytics'),
    where('userId', '==', userId),
    where('timestamp', '<', cutoffDate.toISOString())
  );
  
  const snapshot = await getDocs(q);
  let deletedCount = 0;
  
  for (const docSnapshot of snapshot.docs.slice(0, CLEANUP_CONFIG.MAX_BATCH_DELETE)) {
    try {
      await deleteDoc(doc(db, 'analytics', docSnapshot.id));
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete analytics ${docSnapshot.id}:`, error);
    }
  }
  
  return deletedCount;
};

// POST Handler
export async function POST(request) {
  try {
    const { userId, collections = ['all'] } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }
    
    if (!db) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }
    
    const results = {};
    
    if (collections.includes('all') || collections.includes('sent_emails')) {
      results.sentEmailsDeleted = await cleanupSentEmails(userId);
    }
    
    if (collections.includes('all') || collections.includes('contact_history')) {
      results.contactHistoryDeleted = await cleanupContactHistory(userId);
    }
    
    if (collections.includes('all') || collections.includes('deals')) {
      results.dealsDeleted = await cleanupClosedDeals(userId);
    }
    
    if (collections.includes('all') || collections.includes('analytics')) {
      results.analyticsDeleted = await cleanupAnalytics(userId);
    }
    
    const totalDeleted = Object.values(results).reduce((sum, count) => sum + count, 0);
    
    return NextResponse.json({
      success: true,
      message: `Cleaned up ${totalDeleted} old documents`,
      results,
      config: CLEANUP_CONFIG
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET Handler - Get cleanup statistics
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }
    
    if (!db) {
      return NextResponse.json({ error: 'Firebase not initialized' }, { status: 500 });
    }
    
    // Get counts of documents that would be deleted
    const cutoffDates = {
      sentEmails: new Date(Date.now() - CLEANUP_CONFIG.SENT_EMAILS_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      contactHistory: new Date(Date.now() - CLEANUP_CONFIG.CONTACT_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      deals: new Date(Date.now() - CLEANUP_CONFIG.CLOSED_DEALS_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      analytics: new Date(Date.now() - CLEANUP_CONFIG.ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    };
    
    const stats = {};
    
    // Count sent emails to delete
    const sentEmailsQuery = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('sentAt', '<', cutoffDates.sentEmails.toISOString()),
      where('replied', '==', false)
    );
    stats.sentEmailsToDelete = (await getDocs(sentEmailsQuery)).size;
    
    // Count contact history to delete
    const contactHistoryQuery = query(
      collection(db, 'contact_history'),
      where('userId', '==', userId),
      where('timestamp', '<', cutoffDates.contactHistory.toISOString())
    );
    stats.contactHistoryToDelete = (await getDocs(contactHistoryQuery)).size;
    
    // Count deals to delete
    const dealsQuery = query(
      collection(db, 'deals'),
      where('userId', '==', userId),
      where('stage', 'in', ['closed_won', 'closed_lost']),
      where('created_at', '<', cutoffDates.deals.toISOString())
    );
    stats.dealsToDelete = (await getDocs(dealsQuery)).size;
    
    // Count analytics to delete
    const analyticsQuery = query(
      collection(db, 'analytics'),
      where('userId', '==', userId),
      where('timestamp', '<', cutoffDates.analytics.toISOString())
    );
    stats.analyticsToDelete = (await getDocs(analyticsQuery)).size;
    
    stats.totalToDelete = Object.values(stats).reduce((sum, count) => sum + count, 0);
    stats.config = CLEANUP_CONFIG;
    
    return NextResponse.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('Cleanup stats error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
