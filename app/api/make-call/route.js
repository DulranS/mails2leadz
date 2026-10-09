// app/api/make-call/route.js
import { NextResponse } from 'next/server';
import { normalizePhone } from '../../../lib/phone.js';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, setDoc, query, where, getDocs } from '../../../lib/server-firestore.js';
import twilio from 'twilio';
import { getBusinessProfile } from '../../../lib/ai-client.js';

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
// TWILIO CONFIGURATION (created lazily: a missing key must never break the build or other routes)
// ============================================================================
let _twilio = null;
const getTwilio = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) return null;
  if (!_twilio) _twilio = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _twilio;
};

// Twilio calls this back with call status. proxy.js only lets webhooks through with ?key=WEBHOOK_SECRET.
const webhookUrl = () => {
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (!base) return null;
  const key = process.env.WEBHOOK_SECRET ? `?key=${encodeURIComponent(process.env.WEBHOOK_SECRET)}` : '';
  return `${base}/api/call-webhook${key}`;
};

// ============================================================================
// CALL SCRIPTS - each customer's own business name; nothing about anyone else's business
// ============================================================================
const xml = (t) => String(t || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

const buildScript = (callType, { business, bridgeNumber, hook }) => {
  const who = business ? xml(business) : 'a local business';
  if (callType === 'bridge') {
    // Connects the person to the CUSTOMER's own phone (set in Account > Your business), never anyone else's.
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to ${who}. Please hold.</Say>
  <Dial>${xml(bridgeNumber)}</Dial>
</Response>`;
  }
  if (callType === 'interactive') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="10" numDigits="1" method="POST" action="${xml(hook)}">
    <Say voice="alice">Hello, this is ${who}. Press 1 to speak with someone, press 2 to receive more information by email, or press 3 if you would rather not be called again.</Say>
  </Gather>
  <Say voice="alice">Thank you. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is an automated message from ${who}. We would love to tell you how we can help. Please look out for our email or reply to it. Thank you!</Say>
  <Hangup/>
</Response>`;
};

// ============================================================================
// FORMAT PHONE NUMBER
// ============================================================================
const formatForDialing = normalizePhone;

// ============================================================================
// POST HANDLER
// ============================================================================
export async function POST(request) {
  try {
    const payload = await request.json();
    const { toPhone, businessName, callType = 'direct' } = payload;
    const userId = request.headers.get('x-user-id') || payload.userId; // verified user wins

    if (!toPhone || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const client = getTwilio();
    if (!client) {
      return NextResponse.json({ error: 'Phone calls are not set up for this account yet.' }, { status: 503 });
    }
    const hook = webhookUrl();
    if (!hook) {
      return NextResponse.json({ error: 'Phone calls need NEXT_PUBLIC_BASE_URL to be set so call results can be recorded.' }, { status: 503 });
    }

    const formattedPhone = formatForDialing(toPhone);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Someone who pressed 3 ("do not call again") on an earlier call is never dialled again.
    try {
      const optedOut = await getDocs(query(collection(db, 'calls'), where('userId', '==', userId), where('toPhone', '==', formattedPhone), where('optedOut', '==', true)));
      if (!optedOut.empty) {
        return NextResponse.json({ error: 'This person asked not to be called again, so the call was not placed.', code: 'OPTED_OUT' }, { status: 409 });
      }
    } catch (e) { /* if the lookup fails, do not block the call */ }

    // Who is calling: the customer's own business name and (for bridge calls) their own phone.
    const profile = await getBusinessProfile(userId);
    const bridgeDigits = formatForDialing(profile.phone);
    if (callType === 'bridge' && !bridgeDigits) {
      return NextResponse.json({ error: 'Add your phone number in Account → "Your business" so we can connect the call to you.' }, { status: 422 });
    }
    const twiml = buildScript(callType, { business: profile.businessName, bridgeNumber: bridgeDigits ? `+${bridgeDigits}` : '', hook });

    // Make call via Twilio. Recording third parties is OFF unless the owner of this deployment turns it on.
    const record = ['1', 'true', 'yes'].includes(String(process.env.TWILIO_RECORD_CALLS || '').toLowerCase());
    const call = await client.calls.create({
      twiml: twiml,
      to: `+${formattedPhone}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      statusCallback: hook,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      ...(record ? { record: true, recordingStatusCallback: hook } : {}),
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