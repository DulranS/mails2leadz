// app/api/research-company/route.js
import { NextResponse } from 'next/server';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from '../../../lib/server-firestore.js';
import { callAI, AiError, getBusinessProfile, profileBlock, SALES_GUARDRAILS } from '../../../lib/ai-client.js';

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
// POST HANDLER - AI research notes + a suggested email for one company (no sending)
// ============================================================================
export async function POST(request) {
  try {
    const { companyName, companyWebsite, defaultEmailTemplate, userId } = await request.json();
    if (!companyName || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const profile = await getBusinessProfile(userId);
    if (!profile.offer) {
      return NextResponse.json(
        { code: 'NO_PROFILE', error: 'Tell the AI what you sell first: Business Value → Settings → "Your business".' },
        { status: 422 },
      );
    }

    const system = `You are a careful B2B sales assistant for a small business.\n${SALES_GUARDRAILS}\nReturn JSON only: {"generalIdea": {"service": string, "valueProposition": string, "targetAudience": string}, "personalizedEmail": {"subject": string, "body": string, "researchNotes": string}}. In researchNotes list what you are ASSUMING versus what was provided, so the user knows what to verify.`;
    const prompt = `${profileBlock(profile)}\n\nProspect company: ${companyName}\nWebsite: ${companyWebsite || 'not provided'}\n${defaultEmailTemplate ? `The user's usual email, for style reference only:\n${String(defaultEmailTemplate).slice(0, 1200)}` : ''}`;

    const ai = await callAI({ uid: userId, feature: 'company_research', tier: 'fast', system, prompt, maxTokens: 700 });
    const r = ai.data;
    if (!r?.personalizedEmail?.subject || !r?.personalizedEmail?.body) {
      return NextResponse.json({ error: 'The AI returned an unusable result. Try again.' }, { status: 502 });
    }

    await addDoc(collection(db, 'company_research'), {
      userId,
      companyName,
      companyWebsite: companyWebsite || null,
      result: r,
      model: ai.model,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ companyName, ...r, cached: ai.cached });
  } catch (error) {
    if (error instanceof AiError) {
      return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
    }
    console.error('Research company error:', error);
    return NextResponse.json({ error: 'Could not research this company right now.' }, { status: 500 });
  }
}
