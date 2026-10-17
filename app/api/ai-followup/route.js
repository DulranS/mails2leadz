// app/api/ai-followup/route.js
// Drafts the NEXT follow-up email for ONE lead, using what was actually sent to them.
// It never sends anything: the customer reviews/edits the draft and approves it, and it then goes through
// /api/send-followup (which still enforces: not replied, max 3 follow-ups, minimum gap between sends).
import { NextResponse } from 'next/server';
import { callAI, AiError, getBusinessProfile, profileBlock, SALES_GUARDRAILS } from '../../../lib/ai-client.js';
import { getDb, uidFromRequest, clip, NO_STORE } from '../../../lib/server/route-helpers.js';
import { draftFollowUp, DraftError } from '../../../lib/server/draft-core.js';
import { POST_SALE_STAGES } from '../../../lib/default-templates.js';
import { buildReferralLink } from '../../../lib/inbound.js';
import { doc, getDoc } from '../../../lib/server-firestore.js';

export const maxDuration = 45;
// Check-ins to people who ALREADY bought (they are customers, not prospects: no sales-sequence limits apply).
const POST_SALE_BRIEF = {
  onboarding: 'A warm welcome a day after they said yes. Thank them, say what happens next in general terms, and ask if there is anything they need from you or anything they are unsure about.',
  delivery_check: 'A short check-in about a week in. Ask how things are going, invite honest feedback, and offer to fix anything that is not right.',
  upsell_opportunity: 'A one-month check-in. Ask what is working and what is not. Only if it fits the business profile, mention ONE relevant way you could help further, softly. No pressure, no discounts.',
  quarterly_review: 'A friendly quarterly review invitation. Offer a short call to look at how things are going and plan the next quarter together.',
  churn_winback: 'A short, honest note to a customer who stopped (cancelled or did not renew). Do not guilt, pressure or discount. Say you were glad to work with them, ask ONE open question about what would have made it better, and say the door is open if their needs change. Never claim to know why they left, and never invent changes or new features.',
  referral_ask: 'A short, warm, personal note to a customer who is doing well. Thank them genuinely, then ask for ONE introduction to someone who has the same need (the kind of business in "Who we help"). Make it easy: if a personal link is given, say they can simply pass it on or forward the email. No incentives, no pressure, no guilt; say you will look after anyone they send. Do not mention results or numbers that are not provided.',
};

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
      const system = `You write short, warm customer-care emails for a small business to a customer who has ALREADY bought.\n${SALES_GUARDRAILS.replace('one clear low-pressure call to action (e.g. a short reply or a quick call)', 'one easy question or next step')}\n${POST_SALE_BRIEF[purpose]}\nNever invent project details, results, dates or numbers; if you would need them, keep the wording general.\nReturn JSON only: {"subject": string, "body": string}. The body is plain text with a greeting and a sign-off.`;
      const refLink = purpose === 'referral_ask' ? await referralLinkFor(getDb(), uid, request, businessName || to) : '';
      const prompt = `${profileBlock(profile)}\n\nCustomer: ${clip(businessName || to, 100)}\n${purpose === 'referral_ask' ? (refLink ? `Personal link the customer can pass on (the ONLY link you may include, exactly as written): ${refLink}\n` : 'No link is available: ask them to reply with an introduction.\n') : ''}Sign off as: ${clip(senderName || profile.businessName || 'the sender', 80)}\n\nWrite the email.`;
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
