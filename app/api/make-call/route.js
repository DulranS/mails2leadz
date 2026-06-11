// app/api/make-call/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc } from 'firebase/firestore';
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
const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL + '/api/call-webhook';

// ============================================================================
// CALL SCRIPTS
// ============================================================================
const CALL_SCRIPTS = {
  direct: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is an automated message from Syndicate Solutions. We help businesses with web development, AI automation, and digital operations. If you'd like to learn more, please visit our website or reply to our email. Thank you!</Say>
  <Hangup/>
</Response>`,
  
  bridge: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to a representative from Syndicate Solutions. Please hold.</Say>
  <Dial>+94741143323</Dial>
</Response>`,
  
  interactive: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="10" numDigits="1" action="${WEBHOOK_URL}">
    <Say voice="alice">Thank you for your interest! Press 1 to speak with a representative, press 2 to receive more information via email, or press 3 to be removed from our list.</Say>
  </Gather>
  <Say voice="alice">Thank you. Goodbye!</Say>
  <Hangup/>
</Response>`
};

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
    const { toPhone, businessName, userId, callType = 'direct' } = await request.json();
    
    if (!toPhone || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const formattedPhone = formatForDialing(toPhone);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }
    
    const twiml = CALL_SCRIPTS[callType] || CALL_SCRIPTS.direct;
    
    // Make call via Twilio
    const call = await twilioClient.calls.create({
      twiml: twiml,
      to: `+${formattedPhone}`,
      from: FROM_NUMBER,
      statusCallback: WEBHOOK_URL,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      record: true,
      recordingStatusCallback: WEBHOOK_URL
    });
    
    // Save to Firebase
    const callData = {
      userId,
      toPhone: formattedPhone,
      businessName: businessName || 'Unknown',
      callType,
      callSid: call.sid,
      status: call.status,
      createdAt: new Date().toISOString(),
      duration: 0,
      answeredBy: 'unknown',
      recordingUrl: null
    };
    
    const docRef = await addDoc(collection(db, 'calls'), callData);
    
    return NextResponse.json({
      success: true,
      callId: docRef.id,
      callSid: call.sid,
      status: call.status
    });
    
  } catch (error) {
    console.error('Make call error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to make call',
        details: error.message
      },
      { status: 500 }
    );
  }
}