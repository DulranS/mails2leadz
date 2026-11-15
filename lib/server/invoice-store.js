// lib/server/invoice-store.js - where an owner's invoices live: one place, the top-level `invoices` collection, each row tagged with userId.
// Older invoices were written under users/{uid}/invoices. moveLegacyInvoices copies them across once: the copy keeps the same id,
// it is only written where that id is not already in the main collection, and the old rows are not deleted.
import { collection, doc, getDoc, getDocs, setDoc, query, limit } from '../server-firestore.js';
import { legacyToMove } from '../invoice-store-rules.js';

/**
 * Copies up to `max` legacy invoices per run. Once every legacy invoice has been copied, the owner's settings
 * record it, and later runs do nothing. Never throws for one bad row: it is skipped and the rest go on.
 * @returns {Promise<{ moved: number, done: boolean }>}
 */
export async function moveLegacyInvoices(db, uid, { max = 300, now = new Date().toISOString() } = {}) {
  const who = String(uid);
  const flagRef = doc(db, 'users', who, 'settings', 'invoice_store');
  const flag = await getDoc(flagRef).then((s) => s.data?.() || {}).catch(() => ({}));
  if (flag.legacyMoved === true) return { moved: 0, done: true };

  const legacy = (await getDocs(query(collection(db, 'users', who, 'invoices'), limit(max + 1)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const batch = legacy.slice(0, max);
  const existing = new Set();
  for (const row of batch) {
    const top = await getDoc(doc(db, 'invoices', row.id)).then((s) => s.data?.()).catch(() => undefined);
    if (top) existing.add(row.id);
  }
  let moved = 0;
  for (const { id, data } of legacyToMove(batch, existing, who, now)) {
    try { await setDoc(doc(db, 'invoices', id), data); moved++; } catch { /* left for the next run */ }
  }
  const done = legacy.length <= max;
  if (done) await setDoc(flagRef, { legacyMoved: true, legacyMovedAt: now }, { merge: true }).catch(() => {});
  return { moved, done };
}
