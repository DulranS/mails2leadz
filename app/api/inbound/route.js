// app/api/inbound/route.js - PUBLIC endpoint behind the owner's enquiry form (hosted page /enquire, a website embed, or a no-code form tool).
//
//   POST { k, name, email, phone, company, message, src, campaign, company_site (honeypot) } -> stores the enquiry,
//        creates the deal ("Inbound enquiry", with the channel it came through) and drafts a reply into the owner's review queue.
//   GET  ?k=<key> -> { name }: the business name for the page heading (nothing else).
//
// Safe by design: the key can only SUBMIT an enquiry to its owner (it reads nothing); the owner is taken from the key, never from
// the body; spam gets a normal-looking 200 and is not stored; AI replies are capped per owner per day; nothing is ever sent.
// The proxy lets this path through without a sign-in because visitors are not users.
import { NextResponse, after } from 'next/server';
import { collection, doc, getDoc, getDocs, query, where, setDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { getDb } from '../../../lib/server/route-helpers.js';
import { parseIngestKey, verifySecret } from '../../../lib/server/ingest-key.js';
import { getBusinessProfile, AiError } from '../../../lib/ai-client.js';
import { sanitizeEnquiry, enquiryDocId, enquiryContext, isReferralSrc, intakeToQualification, intakeFit, INBOUND_DRAFTS_PER_DAY, INBOUND_PER_KEY_PER_HOUR } from '../../../lib/inbound.js';
import { buildDealWrite, dealDocId } from '../../../lib/deal-utils.js';
import { queueDocId, QUEUE_KINDS, QUEUE_STATUS } from '../../../lib/draft-queue.js';
import { draftInboundReply, DraftError } from '../../../lib/server/draft-core.js';
import { loadAutopilot } from '../../../lib/server/prepare-drafts.js';
import { getEntitlement } from '../../../lib/server/tenant.js';
import { featureAllowed } from '../../../lib/tenant.js';

export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*', // the key is write-only and public by design; the page that embeds it can be on any site
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Inbound-Key',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};
const out = (status, body) => NextResponse.json(body, { status, headers: CORS });

// Best-effort flood brake (per server instance; the per-owner daily AI cap below is the one that is always enforced).
const hits = new Map();
function tooMany(id, limit) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < 3600000);
  if (arr.length >= limit) { hits.set(id, arr); return true; }
  arr.push(now);
  hits.set(id, arr);
  if (hits.size > 5000) hits.clear();
  return false;
}

async function ownerFromKey(db, rawKey) {
  const parsed = parseIngestKey(rawKey);
  if (!parsed) return null;
  const snap = await getDoc(doc(db, 'users', parsed.uid, 'settings', 'inbound_key'));
  const d = snap.exists() ? snap.data() : null;
  if (!d || d.revokedAt || !verifySecret(d.hash, parsed.secret)) return null;
  return parsed.uid;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request) {
  try {
    if (!isAdminMode()) return out(503, { error: 'Not available.' });
    const uid = await ownerFromKey(getDb(), request.nextUrl.searchParams.get('k'));
    if (!uid) return out(404, { error: 'This link is not active.' });
    const profile = await getBusinessProfile(uid);
    return out(200, { name: String(profile.businessName || '').slice(0, 100), bookingLink: profile.bookingLink || '', intake: profile.intake === true });
  } catch {
    return out(404, { error: 'This link is not active.' });
  }
}

export async function POST(request) {
  try {
    if (!isAdminMode()) return out(503, { error: 'Enquiries are not available right now.' });
    if (Number(request.headers.get('content-length') || 0) > 20000) return out(413, { error: 'Too much text.' });

    let body = {};
    const type = request.headers.get('content-type') || '';
    try {
      if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) body = Object.fromEntries((await request.formData()).entries());
      else body = await request.json();
    } catch { return out(400, { error: 'Could not read the form.' }); }

    const rawKey = body?.k || request.headers.get('x-inbound-key') || request.nextUrl.searchParams.get('k');
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    if (tooMany(`ip:${ip}`, 10)) return out(429, { error: 'Too many requests. Please try again later.' });

    const db = getDb();
    const uid = await ownerFromKey(db, rawKey);
    if (!uid) return out(401, { error: 'This link is not active.' });
    const ent = await getEntitlement(db, uid);
    if (ent.mode === 'suspended') return out(503, { error: 'This enquiry form is not available.' });
    if (tooMany(`key:${uid}`, INBOUND_PER_KEY_PER_HOUR)) return out(429, { error: 'Too many requests. Please try again later.' });

    const parsed = sanitizeEnquiry(body);
    if (!parsed.ok) return parsed.spam ? out(200, { success: true }) : out(400, { error: parsed.error });
    const e = parsed.enquiry;

    const now = new Date();
    const id = enquiryDocId(uid, e.email, now);
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    const enqRef = doc(db, 'inbound_enquiries', id);
    if ((await getDoc(enqRef)).exists()) return out(200, { success: true }); // same person, same day: already received

    await setDoc(enqRef, { userId: uid, ...e, day, receivedAt: now.toISOString(), drafted: false });

    // The deal: a new enquiry opens one (source "inbound" + channel). A person who is already a deal keeps their stage; we only note the contact.
    const dealRef = doc(db, 'deals', dealDocId(uid, e.email));
    const dealSnap = await getDoc(dealRef);
    const existing = dealSnap.exists() ? dealSnap.data() : null;
    if (!existing) {
      // A link a customer passed on (ref-<customer>) makes this a REFERRAL from that customer; anything else is a plain inbound enquiry.
      const write = buildDealWrite({ uid, email: e.email, stage: 'new', businessName: e.company || e.name || '', source: isReferralSrc(e.src) ? 'referral' : 'inbound', sourceDetail: e.src || 'form' });
      if (e.intake) write.qualification = { ...intakeToQualification(e.intake), updatedAt: now.toISOString() }; // what they said fills budget, authority and timeline
      write.inboundAt = now.toISOString();
      await setDoc(dealRef, write, { merge: true });
    } else {
      await setDoc(dealRef, { lastInboundAt: now.toISOString(), lastUpdate: now.toISOString() }, { merge: true });
    }

    // The reply is drafted AFTER the visitor has their "thank you" (AI takes seconds). Draft only; the owner presses Send.
    after(async () => {
      try {
        const sentBefore = await getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), where('to', '==', e.email)));
        if (!sentBefore.empty) return; // already in a conversation with them: the owner answers from their inbox, nothing to "first-reply"
        const today = await getDocs(query(collection(db, 'inbound_enquiries'), where('userId', '==', uid), where('day', '==', day)));
        if (!featureAllowed(ent, 'inbound')) return; // unpaid / plan without it: the enquiry is stored for when they return, no AI reply is written
        const draftCap = Math.min(INBOUND_DRAFTS_PER_DAY, ent.limits.enquiryDraftsPerDay ?? INBOUND_DRAFTS_PER_DAY);
        if (today.docs.filter((d) => d.data().drafted === true).length >= draftCap) return; // daily AI cap: the enquiry is stored, the owner writes this one
        const settings = await loadAutopilot(db, uid);
        const r = await draftInboundReply({ db, uid, enquiry: e, senderName: settings.senderName });
        await setDoc(doc(db, 'draft_queue', queueDocId(uid, QUEUE_KINDS.FIRST, e.email)), {
          userId: uid, kind: QUEUE_KINDS.FIRST, status: QUEUE_STATUS.READY, inbound: true, email: e.email,
          business: e.company || e.name || e.email, quality: intakeFit(e.intake).level === 'light' ? 'WARM' : 'HOT', score: intakeFit(e.intake).level === 'light' ? 60 : 100, subject: r.draft.subject, body: r.draft.body,
          context: enquiryContext(e), createdAt: new Date().toISOString(),
        });
        await setDoc(enqRef, { drafted: true }, { merge: true });
      } catch (err) {
        if (!(err instanceof DraftError || err instanceof AiError)) console.warn('[inbound] draft skipped:', err?.message);
      }
    });

    return out(200, { success: true });
  } catch (err) {
    console.error('inbound error:', err?.message);
    return out(500, { error: 'Something went wrong. Please try again.' });
  }
}
