// lib/server/relationship-asks.js - drafts review and feedback asks for customers who are ready for them, into the approval queue.
// Nothing is sent here. The drafts wait for the owner's approval (or the owner's own auto-send). Referral asks need a personal
// link built from the request, so they remain a button on the Customers page.
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from '../server-firestore.js';
import { callAI, getBusinessProfile } from '../ai-client.js';
import { postSaleMessages, pickAsks, ASK_FIELD } from '../post-sale.js';
import { computeCustomers } from '../customers.js';
import { QUEUE_KINDS, QUEUE_STATUS } from '../draft-queue.js';

const nowIso = () => new Date().toISOString();
const MAX_PER_NIGHT = 5;
const askDocId = (uid, purpose, email) => `${uid}_ask_${purpose}_${String(email || '').trim().toLowerCase()}`;
const safeLink = (v) => (/^https:\/\/\S{4,300}$/.test(String(v || '')) ? String(v) : '');

/** Writes one ask with the same wording the Customers page button uses. Throws if the model returns nothing usable. */
export async function draftAsk({ uid, profile, email, businessName, purpose, reviewLink = '', senderName = '' }) {
  const { system, prompt } = postSaleMessages({ profile, purpose, businessName, to: email, refLink: purpose === 'review_ask' ? reviewLink : '', senderName });
  const ai = await callAI({ uid, feature: 'customer_checkin', tier: 'fast', system, prompt, maxTokens: 400 });
  const subject = String(ai.data?.subject || '').slice(0, 150).replace(/[\r\n]+/g, ' ').trim();
  const body = String(ai.data?.body || '').trim().slice(0, 2500);
  if (!subject || body.length < 20) throw new Error('UNUSABLE_DRAFT');
  return { subject, body };
}

/**
 * Finds customers ready for a review or feedback ask, drafts each one into the queue, and records the ask on the deal so it is not
 * asked again for a quarter. Never throws: a failure is logged and the rest of the night carries on.
 */
export async function prepareRelationshipAsks(db, uid, { settings = {}, deadline = Date.now() + 60000, now = Date.now(), draft = draftAsk, max = MAX_PER_NIGHT } = {}) {
  const out = { made: 0, skipped: '' };
  try {
    const profile = await getBusinessProfile(uid);
    if (!profile.offer) return { made: 0, skipped: 'no_profile' };
    const [dealsSnap, invSnap, bizSnap] = await Promise.all([
      getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000))),
      getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000))),
      getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null),
    ]);
    const reviewLink = bizSnap?.exists?.() ? safeLink(bizSnap.data().reviewLink) : '';
    const deals = dealsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { customers } = computeCustomers({ deals, invoices, avgDealValue: settings.avgDealValue, reviewLink, now });
    const picks = pickAsks(customers, { max });

    for (const p of picks) {
      if (Date.now() > deadline) { out.skipped = 'time'; break; }
      const id = askDocId(uid, p.purpose, p.email);
      if ((await getDoc(doc(db, 'draft_queue', id))).exists()) continue; // already waiting, sent or dismissed
      try {
        const r = await draft({ uid, profile, email: p.email, businessName: p.business, purpose: p.purpose, reviewLink, senderName: String(settings.senderName || '').slice(0, 80) });
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
