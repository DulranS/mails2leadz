// lib/server/ticket-reopen.js - a customer's new message (email reply, WhatsApp or SMS) goes onto their support ticket:
// an open ticket takes the message, a resolved one is reopened with a fresh target (the rules are in lib/ticket-plan.js).
// Never throws.
import { collection, doc, getDocs, limit, query, setDoc } from '../server-firestore.js';
import { planCustomerMessage } from '../ticket-plan.js';

/**
 * @param {{ email?: string, phone?: string, body?: string, channel?: string, now?: number }} who
 * @returns {Promise<{ matched: number, reopened: number, ticketId: string|null }>}
 *   matched: how many of this customer's tickets exist (0 means the caller should open a new one)
 */
export async function attachCustomerMessage(db, uid, who = {}) {
  const none = { matched: 0, reopened: 0, ticketId: null };
  try {
    const rows = (await getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const plan = planCustomerMessage(rows, who);
    if (!plan.target) return none;
    await setDoc(doc(db, 'users', uid, 'support_tickets', plan.target.id), plan.target.patch, { merge: true });
    return { matched: plan.matched, reopened: plan.target.reopened ? 1 : 0, ticketId: plan.target.id };
  } catch (e) {
    console.error('[ticket-reopen] failed:', String(e?.message || '').slice(0, 120));
    return none;
  }
}
