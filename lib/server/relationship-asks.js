// lib/server/relationship-asks.js - drafts review, referral and feedback asks for customers who are ready, into the approval queue.
// Nothing is sent here. The drafts wait for the owner's approval (or the owner's own auto-send).
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from '../server-firestore.js';
import { callAI, getBusinessProfile } from '../ai-client.js';
import { postSaleMessages, pickAsks, ASK_FIELD } from '../post-sale.js';
import { computeCustomers } from '../customers.js';
import { buildReferralLink } from '../inbound.js';
import { QUEUE_KINDS, QUEUE_STATUS } from '../draft-queue.js';

const nowIso = () => new Date().toISOString();
const MAX_PER_NIGHT = 5;
const askDocId = (uid, purpose, email) => `${uid}_ask_${purpose}_${String(email || '').trim().toLowerCase()}`;
const safeLink = (v) => (/^https:\/\/\S{4,300}$/.test(String(v || '')) ? String(v) : '');

/** Writes one ask with the same wording the Customers page buttons use. Throws if the model returns nothing usable. */
export async function draftAsk({ uid, profile, email, businessName, purpose, refLink = '', senderName = '' }) {
  const { system, prompt } = postSaleMessages({ profile, purpose, businessName, to: email, refLink, senderName });
  const ai = await callAI({ uid, feature: 'customer_checkin', tier: 'fast', system, prompt, maxTokens: 400 });
  const subject = String(ai.data?.subject || '').slice(0, 150).replace(/[\r\n]+/g, ' ').trim();
  const body = String(ai.data?.body || '').trim().slice(0, 2500);
  if (!subject || body.length < 20) throw new Error('UNUSABLE_DRAFT');
  return { subject, body };
}

/**
 * Finds customers ready for a review, referral or feedback ask, drafts each one into the queue, and records the ask on the deal so it
 * is not asked again for a quarter. Never throws: a failure is logged and the rest of the night carries on.
 */
export async function prepareRelationshipAsks(db, uid, { settings = {}, deadline = Date.now() + 60000, now = Date.now(), draft = draftAsk, max = MAX_PER_NIGHT } = {}) {
  const out = { made: 0, skipped: '' };
  try {
    const profile = await getBusinessProfile(uid);
    if (!profile.offer) return { made: 0, skipped: 'no_profile' };
    const [dealsSnap, invSnap, bizSnap, keySnap] = await Promise.all([
      getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000))),
      getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000))),
      getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null),
      getDoc(doc(db, 'users', uid, 'settings', 'inbound_key')).catch(() => null),
    ]);
    const reviewLink = bizSnap?.exists?.() ? safeLink(bizSnap.data().reviewLink) : '';
    // A referral ask needs the owner's inbound key and a public https address. Without both, referral asks stay a button.
    const keyDoc = keySnap?.exists?.() ? keySnap.data() : null;
    const referralKey = keyDoc && !keyDoc.revokedAt && keyDoc.key ? String(keyDoc.key) : '';
    const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
    const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : '';
    const canRefer = !!(referralKey && origin);

    const deals = dealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { customers } = computeCustomers({ deals, invoices, avgDealValue: settings.avgDealValue, reviewLink, now });
    const picks = pickAsks(customers, { max, referral: canRefer });
    const senderName = String(settings.senderName || '').slice(0, 80);

    for (const p of picks) {
      if (Date.now() > deadline) { out.skipped = 'time'; break; }
      const id = askDocId(uid, p.purpose, p.email);
      if ((await getDoc(doc(db, 'draft_queue', id))).exists()) continue; // already waiting, sent or dismissed
      try {
        const refLink = p.purpose === 'review_ask' ? reviewLink
          : p.purpose === 'referral_ask' ? buildReferralLink({ origin, key: referralKey, customerName: p.business })
          : '';
        const r = await draft({ uid, profile, email: p.email, businessName: p.business, purpose: p.purpose, refLink, senderName });
        await setDoc(doc(db, 'draft_queue', id), {
          userId: uid, kind: QUEUE_KINDS.FOLLOWUP, askType: p.purpose, status: QUEUE_STATUS.READY,
          email: p.email, business: p.business, subject: r.subject, body: r.body, number: null, createdAt: nowIso(),
        }, { merge: false });
        const dealRow = deals.find((d) => String(d.email || '').trim().toLowerCase() === p.email);
        if (dealRow) await setDoc(doc(db, 'deals', dealRow.id), { [ASK_FIELD[p.purpose]]: nowIso() }, { merge: true });
        out.made++;
      } catch (e) {
        console.error('[relationship asks] one draft failed:', uid, p.purpose, e?.message);
      }
    }
  } catch (e) {
    console.error('[relationship asks] skipped for owner:', uid, e?.message);
    out.skipped = 'error';
  }
  return out;
}
