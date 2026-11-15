// lib/server/call-backfill.js - links this owner's older calls to their customers, from the phone numbers already on file.
// Safe to repeat: a call that already has its customer is not touched.
import { collection, getDocs, query, where, limit, updateDoc, doc } from '../server-firestore.js';
import { callsToLink } from '../call-backfill.js';

const rows = (p) => p.then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);

export async function backfillCallEmails(db, uid, { max = 200 } = {}) {
  const calls = await rows(getDocs(query(collection(db, 'calls'), where('userId', '==', uid), limit(500))));
  if (!calls.some((c) => !c.email)) return { linked: 0 };
  const [leads, attempts, deals] = await Promise.all([
    rows(getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(3000)))),
    rows(getDocs(query(collection(db, 'users', uid, 'call_attempts'), limit(1000)))),
    rows(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(1000)))),
  ]);
  const sources = [
    ...leads.map((l) => ({ email: l.email, phone: l.whatsapp_number })),
    ...attempts.map((a) => ({ email: a.email, phone: a.phone })),
    ...deals.map((d) => ({ email: d.email, phone: d.phone })),
  ];
  let linked = 0;
  for (const link of callsToLink(calls, sources).slice(0, max)) {
    try { await updateDoc(doc(db, 'calls', link.id), { email: link.email, emailLinkedBy: 'phone_match' }); linked++; } catch { /* left for the next run */ }
  }
  return { linked };
}
