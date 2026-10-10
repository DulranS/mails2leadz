// app/api/get-daily-count/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from '../../../lib/server-firestore.js';
import { countToday, startOfTomorrowIso } from '../../../lib/server/daily-count.js';

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

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  MAX_DAILY_EMAILS: 500,
  MAX_DAILY_WHATSAPP: 100,
  MAX_DAILY_SMS: 50,
  MAX_DAILY_CALLS: 30
};

// Daily usage for the dashboard's quota meters. Dates are compared as ISO strings (see lib/server/daily-count.js).
export async function POST(request) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400, headers });

    const [emails, whatsapp, sms, calls] = await Promise.all([
      countToday(db, 'sent_emails', 'sentAt', userId),
      countToday(db, 'whatsapp_sent', 'sentAt', userId), // WhatsApp is opened manually and not logged here, so this stays 0 unless logged elsewhere
      countToday(db, 'sms_sent', 'sentAt', userId),
      countToday(db, 'calls', 'createdAt', userId),
    ]);
    const n = (v) => (typeof v === 'number' ? v : 0);

    return NextResponse.json({
      count: n(emails),
      whatsappCount: n(whatsapp),
      smsCount: n(sms),
      callCount: n(calls),
      limits: { emails: CONFIG.MAX_DAILY_EMAILS, whatsapp: CONFIG.MAX_DAILY_WHATSAPP, sms: CONFIG.MAX_DAILY_SMS, calls: CONFIG.MAX_DAILY_CALLS },
      resetTime: startOfTomorrowIso(),
      remaining: {
        emails: Math.max(0, CONFIG.MAX_DAILY_EMAILS - n(emails)),
        whatsapp: Math.max(0, CONFIG.MAX_DAILY_WHATSAPP - n(whatsapp)),
        sms: Math.max(0, CONFIG.MAX_DAILY_SMS - n(sms)),
        calls: Math.max(0, CONFIG.MAX_DAILY_CALLS - n(calls)),
      },
      // true when a count could not be read, so the UI never shows a falsely reassuring "0 used"
      partial: [emails, whatsapp, sms, calls].some((v) => v === null),
    }, { headers });
  } catch (error) {
    console.error('get-daily-count error:', error);
    return NextResponse.json({ error: 'Could not load today\'s usage.' }, { status: 500, headers });
  }
}
