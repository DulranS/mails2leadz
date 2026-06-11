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
const AUTO_CLEANUP_DAYS = 30; // Delete records older than this
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

    // Get all sent emails for user
    const q = query(collection(db, 'sent_emails'), where('userId', '==', userId));
    const snapshot = await getDocs(q);

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

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      try {
        const sentAt = safeToDate(data.sentAt);
        const daysSinceSent = (now - sentAt) / (1000 * 60 * 60 * 24);
        
        // Check if loop is closed (30 days or 3 follow-ups or replied)
        const loopClosed = daysSinceSent > CAMPAIGN_WINDOW_DAYS || 
                          (data.followUpCount || 0) >= MAX_FOLLOW_UPS ||
                          data.replied === true;

        // Only delete if old AND loop is closed
        if (sentAt < cutoffDate && loopClosed) {
          await deleteDoc(doc(db, 'sent_emails', docSnapshot.id));
          console.log(`🗑️ Deleted: ${data.to || data.email} (${daysSinceSent.toFixed(0)} days old)`);
          deletedCount++;
        } else {
          skippedCount++;
        }
      } catch (deleteError) {
        console.error(`❌ Error processing record ${docSnapshot.id}:`, deleteError);
        errors.push({
          id: docSnapshot.id,
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
