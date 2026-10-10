// app/api/call-webhook/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from '../../../lib/server-firestore.js';
import { getBusinessProfile } from '../../../lib/ai-client.js';
import { normalizePhone } from '../../../lib/phone.js';

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
    // Twilio posts the key the caller pressed (Gather) to this same URL: answer it with call instructions.
    if (formData.get('Digits') !== null && formData.get('Digits') !== undefined) {
      return menuResponse(String(formData.get('Digits')), formData.get('CallSid'));
    }
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
// GET HANDLER - the same menu, for callers that use GET
// ============================================================================
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  return menuResponse(searchParams.get('Digits'), searchParams.get('CallSid'));
}

// ============================================================================
// PHONE MENU: what happens when the person presses a key
//   1 = connect to the CUSTOMER's own phone (Account > Your business), never anyone else's
//   2 = they would like information by email: recorded on the call so the owner can follow up
//   3 = do not call again: recorded, and the call route refuses to dial this number again
// ============================================================================
const esc = (t) => String(t || '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const twiml = (inner) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${inner}\n</Response>`, { headers: { 'Content-Type': 'text/xml' } });

async function findCall(callSid) {
  if (!callSid) return null;
  try {
    const snap = await getDocs(query(collection(db, 'calls'), where('callSid', '==', callSid)));
    return snap.empty ? null : snap.docs[0];
  } catch {
    return null;
  }
}

async function menuResponse(digits, callSid) {
  const call = await findCall(callSid);
  const data = call ? call.data() : null;
  const note = async (fields) => {
    if (!call) return;
    try { await updateDoc(doc(db, 'calls', call.id), { ...fields, updatedAt: new Date().toISOString() }); } catch {}
  };

  if (digits === '1') {
    const profile = data?.userId ? await getBusinessProfile(data.userId).catch(() => null) : null;
    const owner = normalizePhone(profile?.phone);
    await note({ keypress: '1', interest: 'wants_to_talk' });
    if (!owner) {
      return twiml('<Say voice="alice">Sorry, nobody is available to take your call right now. Please reply to our email and we will get back to you. Thank you!</Say>\n  <Hangup/>');
    }
    return twiml(`<Say voice="alice">Connecting you now. Please hold.</Say>\n  <Dial>+${esc(owner)}</Dial>`);
  }
  if (digits === '2') {
    await note({ keypress: '2', interest: 'wants_info_by_email' });
    return twiml('<Say voice="alice">Thank you. We will follow up by email.</Say>\n  <Hangup/>');
  }
  if (digits === '3') {
    await note({ keypress: '3', optedOut: true });
    return twiml('<Say voice="alice">Understood. We will not call you again. Goodbye.</Say>\n  <Hangup/>');
  }
  return twiml('<Say voice="alice">Thank you. Goodbye!</Say>\n  <Hangup/>');
}
