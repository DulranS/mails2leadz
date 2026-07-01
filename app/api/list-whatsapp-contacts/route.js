// app/api/list-whatsapp-contacts/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';

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
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
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
// POST HANDLER
// ============================================================================
export async function POST(request) {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  if (request.method !== 'POST') {
    return NextResponse.json(
      { error: 'Method not allowed' },
      { status: 405, headers }
    );
  }

  try {
    const body = await request.json().catch((err) => {
      throw new Error(`Invalid JSON body: ${err?.message || 'unknown error'}`);
    });

    const { userId, limit: limitParam = 50 } = body || {};

    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json(
        { error: 'userId is required', contacts: [] },
        { status: 400, headers }
      );
    }

    if (!db) {
      console.warn('Firebase not configured, returning empty contacts list');
      return NextResponse.json(
        { 
          success: false,
          message: 'WhatsApp contact listing skipped - database not configured',
          code: 'FIREBASE_NOT_CONFIGURED',
          contacts: []
        },
        { status: 200, headers }
      );
    }

    // Validate limit to prevent excessive reads
    const requestedLimit = Number(limitParam) || 50;
    const maxLimit = Math.min(Math.max(requestedLimit, 1), 200); // Cap between 1 and 200
    console.log(`📱 Querying WhatsApp contacts for userId: ${userId} (limit: ${maxLimit})`);

    // Query sent_emails for records that have phone numbers (WhatsApp contacts)
    let snapshot;
    try {
      const q = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('phone', '!=', null),
        limit(maxLimit)
      );
      snapshot = await getDocs(q);
    } catch (queryError) {
      console.warn(
        'WhatsApp contact query failed, falling back to client-side phone filter',
        queryError,
      );
      const fallbackQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        limit(maxLimit),
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);
      const filteredDocs = fallbackSnapshot.docs.filter((doc) => {
        const data = doc.data();
        return data?.phone !== undefined && data?.phone !== null && data?.phone !== '';
      });
      snapshot = {
        docs: filteredDocs,
        forEach: (fn) => filteredDocs.forEach((doc) => fn(doc)),
      };
    }

    const contacts = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data?.phone) {
        contacts.push({
          id: doc.id,
          phone: data.phone,
          email: data.to || data.email,
          business: data.businessName || data.company || 'Unknown',
          businessName: data.businessName || data.company || 'Unknown',
          sentAt: data.sentAt,
          createdAt: data.createdAt
        });
      }
    });

    console.log(`✅ Successfully loaded ${contacts.length} WhatsApp contacts for user ${userId}`);

    return NextResponse.json({
      success: true,
      contacts,
      count: contacts.length,
      limit: maxLimit
    }, { headers });

  } catch (error) {
    console.error('List WhatsApp contacts error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list WhatsApp contacts',
        details: error?.message || 'Unknown server error',
        contacts: []
      },
      { status: 500, headers }
    );
  }
}
