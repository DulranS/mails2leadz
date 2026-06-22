// app/api/cleanup-old-records/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const getFirebaseConfig = () => {
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required Firebase environment variables: ${missingVars.join(', ')}`);
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

let app;
let db;

try {
  const firebaseConfig = getFirebaseConfig();
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (configError) {
  console.error('Firebase configuration error:', configError);
}

// ============================================================================
// CONFIGURATION
// ============================================================================
const AUTO_CLEANUP_DAYS = 15; // Delete records older than this (strategic 15-day retention)
const MAX_FOLLOW_UPS = 3;
const CAMPAIGN_WINDOW_DAYS = 30;

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  try {
    const { userId, days = AUTO_CLEANUP_DAYS } = await request.json();
    
    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    if (!db) {
      return NextResponse.json(
        { error: 'Firebase not configured' },
        { status: 500 }
      );
    }

    console.log(`🧹 Starting cleanup for user ${userId} (deleting records older than ${days} days)`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let deletedCount = 0;
    let skippedCount = 0;
    const errors = [];

    const safeToDate = (timestamp) => {
      if (!timestamp) return new Date();
      if (typeof timestamp?.toDate === 'function') {
        return timestamp.toDate();
      } else if (timestamp instanceof Date) {
        return timestamp;
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        return new Date(timestamp);
      } else {
        return new Date();
      }
    };

    const now = new Date();

    // Cleanup sent emails
    const sentEmailsQuery = query(collection(db, 'sent_emails'), where('userId', '==', userId));
    const sentEmailsSnapshot = await getDocs(sentEmailsQuery);

    for (const docSnapshot of sentEmailsSnapshot.docs) {
      const data = docSnapshot.data();
      try {
        const sentAt = safeToDate(data.sentAt);
        const daysSinceSent = (now - sentAt) / (1000 * 60 * 60 * 24);

        // Delete all records older than cutoff date
        if (sentAt < cutoffDate) {
          await deleteDoc(doc(db, 'sent_emails', docSnapshot.id));
          console.log(`🗑️ Deleted email: ${data.to || data.email} (${daysSinceSent.toFixed(0)} days old)`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (deleteError) {
        console.error(`❌ Error processing email record ${docSnapshot.id}:`, deleteError);
        errors.push({
          id: docSnapshot.id,
          type: 'email',
          error: deleteError.message
        });
      }
    }

    // Cleanup WhatsApp contacts
    const whatsappQuery = query(collection(db, 'whatsapp_contacts'), where('userId', '==', userId));
    const whatsappSnapshot = await getDocs(whatsappQuery);

    for (const docSnapshot of whatsappSnapshot.docs) {
      const data = docSnapshot.data();
      try {
        const createdAt = safeToDate(data.createdAt || data.sentAt);
        const daysSinceCreated = (now - createdAt) / (1000 * 60 * 60 * 24);

        // Delete all records older than cutoff date
        if (createdAt < cutoffDate) {
          await deleteDoc(doc(db, 'whatsapp_contacts', docSnapshot.id));
          console.log(`🗑️ Deleted WhatsApp contact: ${data.phone || data.business} (${daysSinceCreated.toFixed(0)} days old)`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (deleteError) {
        console.error(`❌ Error processing WhatsApp record ${docSnapshot.id}:`, deleteError);
        errors.push({
          id: docSnapshot.id,
          type: 'whatsapp',
          error: deleteError.message
        });
      }
    }

    console.log(`✅ Cleanup complete: ${deletedCount} deleted, ${skippedCount} skipped`);

    return NextResponse.json({
      success: true,
      deletedCount,
      skippedCount,
      errors: errors.length > 0 ? errors : undefined,
      cutoffDate: cutoffDate.toISOString()
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup old records',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
