// lib/server/credit-number.js - the next credit note number (CN-0001, CN-0002...) for one account.
// Same rule as invoices: never below the counter, never below the highest number already used.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, isAdminMode } from '../server-firestore.js';
import { maxExistingNumber, nextNumberValue } from '../invoice-numbering.js';
import { CREDIT_PREFIX, formatCreditNumber } from '../credit-notes.js';

export async function nextCreditNumber(db, uid) {
  const scan = await getDocs(query(collection(db, 'credit_notes'), where('userId', '==', uid), limit(2000)));
  const maxExisting = maxExistingNumber(scan.docs.map((d) => d.data().number), CREDIT_PREFIX);
  const ref = doc(db, 'users', uid, 'settings', 'credit_note_counter');
  if (typeof db.runTransaction === 'function') {
    // Server SDK: the read and the write happen together, so two credit notes can never take the same number.
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const n = nextNumberValue({ counterNext: s.exists() ? s.data().next : 0, maxExisting });
      tx.set(ref, { next: n + 1 });
      return formatCreditNumber(n);
    });
  }
  // Login-based (client) database without transactions: a plain read and write. Credit notes are rare, so this is acceptable there.
  if (!isAdminMode()) console.warn('[credit-number] no transactions on this database; numbering is not atomic');
  const s0 = await getDoc(ref);
  const n = nextNumberValue({ counterNext: s0.exists() ? s0.data().next : 0, maxExisting });
  await setDoc(ref, { next: n + 1 });
  return formatCreditNumber(n);
}
