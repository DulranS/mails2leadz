// app/api/ai-followup/route.js
// Drafts the NEXT follow-up email for ONE lead, using what was actually sent to them.
// It never sends anything: the customer reviews/edits the draft and approves it, and it then goes through
// /api/send-followup (which still enforces: not replied, max 3 follow-ups, minimum gap between sends).
import { NextResponse } from 'next/server';
import { callAI, AiError, getBusinessProfile, profileBlock, SALES_GUARDRAILS } from '../../../lib/ai-client.js';
import { getDb, uidFromRequest, clip, NO_STORE } from '../../../lib/server/route-helpers.js';
import { draftFollowUp, DraftError } from '../../../lib/server/draft-core.js';
import { POST_SALE_STAGES } from '../../../lib/default-templates.js';
import { postSaleMessages } from '../../../lib/post-sale.js';
import { buildReferralLink } from '../../../lib/inbound.js';
import { doc, getDoc } from '../../../lib/server-firestore.js';

export const maxDuration = 45;

// The personal enquiry link a customer can pass on: it carries a ref-<customer> tag so the introduction is credited to them. Built here, never taken from the request.
async function referralLinkFor(db, uid, request, customerName) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'inbound_key'));
    const d = snap.exists() ? snap.data() : null;
    if (!d || d.revokedAt || !d.key) return '';
    const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
    const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
    return buildReferralLink({ origin, key: d.key, customerName });
  } catch { return ''; }
}

// The owner's public review page, read from their own business settings. Only a valid https link is ever sent.
async function reviewLinkFor(db, uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    const link = snap.exists() ? String(snap.data().reviewLink || '') : '';
    return /^https:\/\/\S{4,300}$/.test(link) ? link : '';
  } catch { return ''; }
}

export async function POST(request) {
  try {
    const uid = uidFromRequest(request);
    if (!uid) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401, headers: NO_STORE });
    const { email, senderName, purpose, businessName } = await request.json().catch(() => ({}));
    const to = String(email || '').trim().toLowerCase();
    if (!to) return NextResponse.json({ success: false, error: 'Missing email' }, { status: 400, headers: NO_STORE });

    if (POST_SALE_STAGES.includes(purpose)) {
      const profile = await getBusinessProfile(uid);
      if (!profile.offer) {
        return NextResponse.json({ success: false, code: 'NO_PROFILE', error: 'Tell the AI what you sell first: Account → "Your business".' }, { status: 422, headers: NO_STORE });
      }
      const refLink = purpose === 'referral_ask' ? await referralLinkFor(getDb(), uid, request, businessName || to) : purpose === 'review_ask' ? await reviewLinkFor(getDb(), uid) : '';
      const { system, prompt } = postSaleMessages({ profile, purpose, businessName, to, refLink, senderName });
      const ai = await callAI({ uid, feature: 'customer_checkin', tier: 'fast', system, prompt, maxTokens: 400 });
      const subject = clip(ai.data?.subject, 150).replace(/[\r\n]+/g, ' ');
      const text = String(ai.data?.body || '').trim();
      if (!subject || text.length < 20) return NextResponse.json({ success: false, error: 'The AI returned an unusable draft. Try again.' }, { status: 502, headers: NO_STORE });
      return NextResponse.json({ success: true, postSale: true, draft: { subject, body: text.slice(0, 2500) }, cached: ai.cached }, { headers: NO_STORE });
    }

    const r = await draftFollowUp({ db: getDb(), uid, email: to, senderName });
    return NextResponse.json({ success: true, followUpNumber: r.followUpNumber, isFinal: r.isFinal, draft: r.draft, cached: r.cached }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DraftError) return NextResponse.json({ success: false, ...(error.code ? { code: error.code } : {}), error: error.message }, { status: error.status, headers: NO_STORE });
    if (error instanceof AiError) return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: error.status, headers: NO_STORE });
    console.error('ai-followup error:', error);
    return NextResponse.json({ success: false, error: 'Could not create a follow-up draft right now.' }, { status: 500, headers: NO_STORE });
  }
}
