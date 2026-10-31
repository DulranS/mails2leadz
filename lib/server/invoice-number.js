// lib/server/invoice-number.js - hands out the next invoice number for an account.
// With the server SDK the counter moves inside a transaction, so two invoices made at once never share a number.
// Without it (the client-side fallback) the read and write are separate, which is a known limit.
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from '../server-firestore.js';
import { normalizePrefix, formatInvoiceNumber, maxExistingNumber, nextNumberValue } from '../invoice-numbering.js';

export async function nextInvoiceNumber(db, uid) {
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const prefix = normalizePrefix(biz.exists() ? biz.data().invoicePrefix : undefined);
  const scan = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000)));
  const maxExisting = maxExistingNumber(scan.docs.map((d) => d.data().number), prefix);
  const ref = doc(db, 'users', uid, 'settings', 'invoice_counter');
  if (typeof db.runTransaction === 'function') {
    return db.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      const n = nextNumberValue({ counterNext: s.exists() ? s.data().next : 0, maxExisting });
      tx.set(ref, { next: n + 1 });
      return formatInvoiceNumber(prefix, n);
    });
  }
  const s = await getDoc(ref);
  const n = nextNumberValue({ counterNext: s.exists() ? s.data().next : 0, maxExisting });
  await setDoc(ref, { next: n + 1 });
  return formatInvoiceNumber(prefix, n);
}
