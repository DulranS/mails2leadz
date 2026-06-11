// app/api/get-daily-count/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
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

// ============================================================================
// GET TODAY'S DATE RANGE
// ============================================================================
const getTodayRange = () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { startOfDay, endOfDay };
};

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
    
    const { startOfDay, endOfDay } = getTodayRange();
    
    // Get email count
    let emailSnapshot;
    try {
      const emailQuery = query(
        collection(db, 'sent_emails'),
        where('userId', '==', userId),
        where('sentAt', '>=', Timestamp.fromDate(startOfDay)),
        where('sentAt', '<=', Timestamp.fromDate(endOfDay))
      );
      emailSnapshot = await getDocs(emailQuery);
    } catch (indexError) {
      if (indexError.code === 'failed-precondition') {
        console.warn('Index not ready for sent_emails, using fallback query');
        // Fallback: get all user emails and filter by date in code
        const fallbackQuery = query(
          collection(db, 'sent_emails'),
          where('userId', '==', userId)
        );
        const allEmails = await getDocs(fallbackQuery);
        emailSnapshot = {
          size: allEmails.docs.filter(doc => {
            const data = doc.data();
            const sentAt = data.sentAt;
            if (!sentAt) return false;
            
            // Handle different timestamp formats
            let date;
            if (typeof sentAt?.toDate === 'function') {
              date = sentAt.toDate();
            } else if (sentAt instanceof Date) {
              date = sentAt;
            } else if (typeof sentAt === 'string' || typeof sentAt === 'number') {
              date = new Date(sentAt);
            } else {
              return false;
            }
            
            return date >= startOfDay && date <= endOfDay;
          }).length
        };
      } else {
        throw indexError;
      }
    }
    
    // Get WhatsApp count
    let whatsappSnapshot;
    try {
      const whatsappQuery = query(
        collection(db, 'whatsapp_sent'),
        where('userId', '==', userId),
        where('sentAt', '>=', Timestamp.fromDate(startOfDay)),
        where('sentAt', '<=', Timestamp.fromDate(endOfDay))
      );
      whatsappSnapshot = await getDocs(whatsappQuery);
    } catch (indexError) {
      if (indexError.code === 'failed-precondition') {
        console.warn('Index not ready for whatsapp_sent, using fallback query');
        // Fallback: get all user WhatsApp and filter by date in code
        const fallbackQuery = query(
          collection(db, 'whatsapp_sent'),
          where('userId', '==', userId)
        );
        const allWhatsapp = await getDocs(fallbackQuery);
        whatsappSnapshot = {
          size: allWhatsapp.docs.filter(doc => {
            const data = doc.data();
            const sentAt = data.sentAt;
            if (!sentAt) return false;
            
            // Handle different timestamp formats
            let date;
            if (typeof sentAt?.toDate === 'function') {
              date = sentAt.toDate();
            } else if (sentAt instanceof Date) {
              date = sentAt;
            } else if (typeof sentAt === 'string' || typeof sentAt === 'number') {
              date = new Date(sentAt);
            } else {
              return false;
            }
            
            return date >= startOfDay && date <= endOfDay;
          }).length
        };
      } else {
        throw indexError;
      }
    }
    
    // Get SMS count
    let smsSnapshot;
    try {
      const smsQuery = query(
        collection(db, 'sms_sent'),
        where('userId', '==', userId),
        where('sentAt', '>=', Timestamp.fromDate(startOfDay)),
        where('sentAt', '<=', Timestamp.fromDate(endOfDay))
      );
      smsSnapshot = await getDocs(smsQuery);
    } catch (indexError) {
      if (indexError.code === 'failed-precondition') {
        console.warn('Index not ready for sms_sent, using fallback query');
        // Fallback: get all user SMS and filter by date in code
        const fallbackQuery = query(
          collection(db, 'sms_sent'),
          where('userId', '==', userId)
        );
        const allSms = await getDocs(fallbackQuery);
        smsSnapshot = {
          size: allSms.docs.filter(doc => {
            const data = doc.data();
            const sentAt = data.sentAt;
            if (!sentAt) return false;
            
            // Handle different timestamp formats
            let date;
            if (typeof sentAt?.toDate === 'function') {
              date = sentAt.toDate();
            } else if (sentAt instanceof Date) {
              date = sentAt;
            } else if (typeof sentAt === 'string' || typeof sentAt === 'number') {
              date = new Date(sentAt);
            } else {
              return false;
            }
            
            return date >= startOfDay && date <= endOfDay;
          }).length
        };
      } else {
        throw indexError;
      }
    }
    
    // Get call count
    let callSnapshot;
    try {
      const callQuery = query(
        collection(db, 'calls'),
        where('userId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(startOfDay)),
        where('createdAt', '<=', Timestamp.fromDate(endOfDay))
      );
      callSnapshot = await getDocs(callQuery);
    } catch (indexError) {
      if (indexError.code === 'failed-precondition') {
        console.warn('Index not ready for calls, using fallback query');
        // Fallback: get all user calls and filter by date in code
        const fallbackQuery = query(
          collection(db, 'calls'),
          where('userId', '==', userId)
        );
        const allCalls = await getDocs(fallbackQuery);
        callSnapshot = {
          size: allCalls.docs.filter(doc => {
            const data = doc.data();
            const createdAt = data.createdAt;
            if (!createdAt) return false;
            
            // Handle different timestamp formats
            let date;
            if (typeof createdAt?.toDate === 'function') {
              date = createdAt.toDate();
            } else if (createdAt instanceof Date) {
              date = createdAt;
            } else if (typeof createdAt === 'string' || typeof createdAt === 'number') {
              date = new Date(createdAt);
            } else {
              return false;
            }
            
            return date >= startOfDay && date <= endOfDay;
          }).length
        };
      } else {
        throw indexError;
      }
    }
    
    // Calculate reset time (midnight tomorrow)
    const tomorrow = new Date(startOfDay);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return NextResponse.json({
      count: emailSnapshot.size,
      whatsappCount: whatsappSnapshot.size,
      smsCount: smsSnapshot.size,
      callCount: callSnapshot.size,
      limits: {
        emails: CONFIG.MAX_DAILY_EMAILS,
        whatsapp: CONFIG.MAX_DAILY_WHATSAPP,
        sms: CONFIG.MAX_DAILY_SMS,
        calls: CONFIG.MAX_DAILY_CALLS
      },
      resetTime: tomorrow.toISOString(),
      remaining: {
        emails: Math.max(0, CONFIG.MAX_DAILY_EMAILS - emailSnapshot.size),
        whatsapp: Math.max(0, CONFIG.MAX_DAILY_WHATSAPP - whatsappSnapshot.size),
        sms: Math.max(0, CONFIG.MAX_DAILY_SMS - smsSnapshot.size),
        calls: Math.max(0, CONFIG.MAX_DAILY_CALLS - callSnapshot.size)
      }
    });
    
  } catch (error) {
    console.error('Get daily count error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to get daily count',
        details: error.message,
        count: 0,
        whatsappCount: 0,
        smsCount: 0,
        callCount: 0
      },
      { status: 200 }
    );
  }
}