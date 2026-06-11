// app/api/call-webhook/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

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
// POST HANDLER - TWILIO WEBHOOK
// ============================================================================
export async function POST(request) {
  try {
    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    const callDuration = formData.get('CallDuration');
    const recordingUrl = formData.get('RecordingUrl');
    const answeredBy = formData.get('AnsweredBy');
    
    if (!callSid) {
      return NextResponse.json({ error: 'Missing CallSid' }, { status: 400 });
    }
    
    // Find call in Firebase
    const q = query(
      collection(db, 'calls'),
      where('callSid', '==', callSid)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    
    const callDoc = snapshot.docs[0];
    const updateData = {
      status: callStatus,
      updatedAt: new Date().toISOString()
    };
    
    if (callDuration) {
      updateData.duration = parseInt(callDuration);
    }
    
    if (recordingUrl) {
      updateData.recordingUrl = recordingUrl;
    }
    
    if (answeredBy) {
      updateData.answeredBy = answeredBy;
    }
    
    await updateDoc(doc(db, 'calls', callDoc.id), updateData);
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Call webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// GET HANDLER - TWILIO WEBHOOK (for call instructions)
// ============================================================================
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const digits = searchParams.get('Digits');
  
  // Interactive menu response
  if (digits === '1') {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you to a representative now. Please hold.</Say>
  <Dial>+94741143323</Dial>
</Response>`, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } else if (digits === '2') {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We'll send you more information via email shortly. Thank you!</Say>
  <Hangup/>
</Response>`, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } else if (digits === '3') {
    return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">You've been removed from our list. We apologize for any inconvenience.</Say>
  <Hangup/>
</Response>`, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
  
  // Default response
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your interest. Goodbye!</Say>
  <Hangup/>
</Response>`, {
    headers: { 'Content-Type': 'text/xml' }
  });
}