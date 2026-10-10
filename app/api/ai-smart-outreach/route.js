// app/api/ai-smart-outreach/route.js
// Drafts a personalised outreach email for ONE prospect. It never sends anything:
// the user reviews/edits the draft in the dashboard and sends it through the normal
// send pipeline (duplicate protection, logging, tracking, follow-up tasks).
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs } from '../../../lib/server-firestore.js';
import { callAI, AiError, getBusinessProfile, profileBlock, SALES_GUARDRAILS } from '../../../lib/ai-client.js';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};
let db;
try {
  db = getFirestore(!getApps().length ? initializeApp(firebaseConfig) : getApp());
} catch (err) {
  console.error('Firebase init failed:', err.message);
}

export async function POST(request) {
  try {
    if (!db) return NextResponse.json({ error: 'Database not initialised' }, { status: 500 });
    const { companyName, companyWebsite, contactEmail, contactName, userId: bodyUserId, senderName } = await request.json();
    const userId = request.headers.get('x-user-id') || bodyUserId; // the verified user wins over the body
    if (!companyName || !userId) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    if (contactEmail) {
      const dup = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', userId), where('to', '==', contactEmail.trim().toLowerCase())));
      if (!dup.empty) return NextResponse.json({ success: false, error: 'You already emailed this contact. Use a follow-up instead.' }, { status: 409 });
    }

    const profile = await getBusinessProfile(userId);
    if (!profile.offer) {
      return NextResponse.json(
        { success: false, code: 'NO_PROFILE', error: 'Tell the AI what you sell first: Business Value → Settings → "Your business".' },
        { status: 422 },
      );
    }

    const system = `You write short, honest B2B outreach emails for a small business.\n${SALES_GUARDRAILS}\nReturn JSON only: {"angle": string (one sentence on why this prospect may care), "reasons": [up to 3 short strings], "emailDraft": {"subject": string, "body": string}}.`;
    const prompt = `${profileBlock(profile)}\n\nProspect company: ${companyName}\nProspect website: ${companyWebsite || 'not provided'}\nGreeting: ${contactName ? `Hi ${contactName},` : 'Hi there,'}\nSign off as: ${senderName || profile.businessName || 'the sender'}\n\nWrite the email. Base the angle only on the company name/website and the sender's offer above.`;

    const ai = await callAI({ uid: userId, feature: 'smart_outreach', tier: 'fast', system, prompt, maxTokens: 500 });
    const d = ai.data;
    if (!d?.emailDraft?.subject || !d?.emailDraft?.body) {
      return NextResponse.json({ success: false, error: 'The AI returned an unusable draft. Try again.' }, { status: 502 });
    }

    await addDoc(collection(db, 'ai_smart_outreach'), {
      userId, companyName, companyWebsite: companyWebsite || null, contactEmail: contactEmail || null,
      draft: d.emailDraft, angle: d.angle || '', status: 'drafted', model: ai.model, createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, draft: d.emailDraft, angle: d.angle || '', reasons: Array.isArray(d.reasons) ? d.reasons.slice(0, 3) : [], cached: ai.cached });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status });
    console.error('ai-smart-outreach error:', error);
    return NextResponse.json({ success: false, error: 'Could not create a draft right now.' }, { status: 500 });
  }
}
