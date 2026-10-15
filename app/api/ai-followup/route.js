// app/api/ai-followup/route.js
// Drafts the NEXT follow-up email for ONE lead, using what was actually sent to them.
// It never sends anything: the customer reviews/edits the draft and approves it, and it then goes through
// /api/send-followup (which still enforces: not replied, max 3 follow-ups, minimum gap between sends).
import { NextResponse } from 'next/server';
import { callAI, AiError, getBusinessProfile, profileBlock, SALES_GUARDRAILS } from '../../../lib/ai-client.js';
import { getDb, uidFromRequest, clip, NO_STORE } from '../../../lib/server/route-helpers.js';
import { draftFollowUp, DraftError } from '../../../lib/server/draft-core.js';
import { POST_SALE_STAGES } from '../../../lib/default-templates.js';

export const maxDuration = 45;
// Check-ins to people who ALREADY bought (they are customers, not prospects: no sales-sequence limits apply).
const POST_SALE_BRIEF = {
  onboarding: 'A warm welcome a day after they said yes. Thank them, say what happens next in general terms, and ask if there is anything they need from you or anything they are unsure about.',
  delivery_check: 'A short check-in about a week in. Ask how things are going, invite honest feedback, and offer to fix anything that is not right.',
  upsell_opportunity: 'A one-month check-in. Ask what is working and what is not. Only if it fits the business profile, mention ONE relevant way you could help further, softly. No pressure, no discounts.',
  quarterly_review: 'A friendly quarterly review invitation. Offer a short call to look at how things are going and plan the next quarter together.',
};

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
      const prompt = `${profileBlock(profile)}\n\nCustomer: ${clip(businessName || to, 100)}\nSign off as: ${clip(senderName || profile.businessName || 'the sender', 80)}\n\nWrite the email.`;
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
