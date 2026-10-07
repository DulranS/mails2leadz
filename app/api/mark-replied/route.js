// app/api/mark-replied/route.js
import { NextResponse } from 'next/server';
import { cancelPendingFollowUps } from '../../../lib/reply-sync.js';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from '../../../lib/server-firestore.js';

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
  // db will be undefined, and we'll handle this in the API route
}

// ============================================================================
// EXTRACT DOMAIN FROM EMAIL
// ============================================================================
const extractDomainFromEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  const parts = email.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : null;
};

// ============================================================================
// POST HANDLER - Mark email as replied
// ============================================================================
export async function POST(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    // Check Firebase configuration
    if (!db) {
      console.warn('Firebase not configured, skipping reply marking');
      return NextResponse.json(
        {
          success: false,
          message: 'Reply tracking skipped - database not configured',
          code: 'FIREBASE_NOT_CONFIGURED'
        },
        { status: 200, headers } // Return 200 to not break the UI
      );
    }

    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400, headers }
      );
    }

    // Find the sent email record
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('to', '==', email.toLowerCase().trim())
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return NextResponse.json(
        { error: 'Email not found in sent records' },
        { status: 404, headers }
      );
    }

    // Mark EVERY email we sent this lead (initial + follow-ups), not just the first.
    const existingData = snapshot.docs[0].data();
    const repliedAt = new Date().toISOString();
    for (const d of snapshot.docs) {
      if (d.data().replied === true) continue;
      await updateDoc(d.ref, { replied: true, repliedAt, followUpAt: null });
    }
    // ...and stop the follow-up reminders (the UI promises this).
    const cancelledFollowUps = await cancelPendingFollowUps(db, userId, email);

    // Track company reply (forward the caller's token: /api is auth-gated)
    try {
      const domain = extractDomainFromEmail(email);
      const authHeader = request.headers.get('authorization');
      await fetch(`${new URL(request.url).origin}/api/track-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
        body: JSON.stringify({
          userId,
          companyName: existingData.businessName || 'Unknown Company',
          domain,
          email: email.toLowerCase().trim(),
          contactName: existingData.contactName || '',
          csvSource: existingData.csvSource || 'unknown',
          action: 'reply'
        })
      });
    } catch (trackError) {
      console.warn('Failed to track company reply:', trackError);
    }

    return NextResponse.json({
      success: true,
      message: `Marked ${email} as replied`,
      cancelledFollowUps
    }, { headers });

  } catch (error) {
    console.error('Mark replied error:', error);
    return NextResponse.json(
      { error: 'Failed to mark as replied', details: error.message },
      { status: 500, headers }
    );
  }
}