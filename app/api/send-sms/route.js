// app/api/send-sms/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import twilio from 'twilio';

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
// TWILIO CONFIGURATION
// ============================================================================
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// ============================================================================
// FORMAT PHONE NUMBER
// ============================================================================
const formatForDialing = (raw) => {
  if (!raw || raw === 'N/A' || raw === '' || raw === 'undefined' || raw === 'null') return null;
  let cleaned = raw.toString().replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length >= 9) {
    cleaned = '94' + cleaned.slice(1);
  }
  if (cleaned.length === 9 && /^[7-9]/.test(cleaned)) {
    cleaned = '94' + cleaned;
  }
  const isValid = /^[1-9]\d{9,14}$/.test(cleaned);
  return isValid ? cleaned : null;
};

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  try {
    const { phone, message, businessName, userId } = await request.json();
    
    if (!phone || !message || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const formattedPhone = formatForDialing(phone);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }
    
    // Send SMS via Twilio
    const sms = await twilioClient.messages.create({
      body: message,
      from: FROM_NUMBER,
      to: `+${formattedPhone}`
    });
    
    // Save to Firebase
    await addDoc(collection(db, 'sms_sent'), {
      userId,
      to: formattedPhone,
      businessName: businessName || 'Unknown',
      message,
      sentAt: new Date().toISOString(),
      status: sms.status,
      sid: sms.sid,
      cost: sms.price || 0
    });
    
    return NextResponse.json({
      success: true,
      messageId: sms.sid,
      status: sms.status
    });
    
  } catch (error) {
    console.error('Send SMS error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to send SMS',
        details: error.message
      },
      { status: 500 }
    );
  }
}