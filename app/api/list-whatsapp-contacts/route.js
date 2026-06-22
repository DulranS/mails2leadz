// app/api/list-whatsapp-contacts/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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
  try {
    const { userId } = await request.json();
    
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

    // Query sent_emails for records that have phone numbers (WhatsApp contacts)
    const q = query(
      collection(db, 'sent_emails'),
      where('userId', '==', userId),
      where('phone', '!=', null)
    );
    const snapshot = await getDocs(q);

    const contacts = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.phone) {
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

    return NextResponse.json({
      success: true,
      contacts,
      count: contacts.length
    });

  } catch (error) {
    console.error('List WhatsApp contacts error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list WhatsApp contacts',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
