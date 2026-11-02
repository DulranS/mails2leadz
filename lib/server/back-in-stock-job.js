// lib/server/back-in-stock-job.js - sends each customer who asked the one "back in stock" email, when the item can be ordered again.
// Runs in the daily run. A request is marked notified only after its email is sent, so nothing is sent twice.
import { collection, getDocs, query, where, limit, updateDoc } from '../server-firestore.js';
import { planBackInStock } from '../back-in-stock.js';

export async function runBackInStock(db, uid, { mail, max = 50 } = {}) {
  const snap = await getDocs(query(collection(db, 'restock_waits'), where('userId', '==', uid), where('notifiedAt', '==', null), limit(200)));
  if (snap.empty) return { sent: 0, waiting: 0 };
  const waits = snap.docs.map((d) => ({ ref: d.ref, ...d.data() }));
  const products = {};
  const pSnap = await getDocs(query(collection(db, 'users', uid, 'products'), limit(300)));
  for (const d of pSnap.docs) products[d.id] = d.data();
  const plan = planBackInStock({ waits, products }).slice(0, max);
  let sent = 0;
  for (const n of plan) {
    const r = await mail(n.wait.email, n.draft.subject, n.draft.body).catch(() => ({ sent: false }));
    if (!r || !r.sent) break;
    await updateDoc(n.wait.ref, { notifiedAt: new Date().toISOString() }).catch(() => {});
    sent++;
  }
  return { sent, waiting: waits.length };
}
