// lib/server/invoice-number.js - hands out the next invoice number for an account.
// With the server SDK the counter moves inside a transaction, so two invoices made at once never share a number.
// The client SDK uses its own transaction, so the counter is atomic in both setups.
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from '../server-firestore.js';
import { normalizePrefix, formatInvoiceNumber, maxExistingNumber, nextNumberValue } from '../invoice-numbering.js';

export async function nextInvoiceNumber(db, uid) {
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const prefix = normalizePrefix(biz.exists() ? biz.data().invoicePrefix : undefined);
  const scan = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000)));
  const maxExisting = maxExistingNumber(scan.docs.map((d) => d.data().number), prefix);
  const ref = doc(db, 'users', uid, 'settings', 'invoice_counter');
  const bump = async (tx) => {
    const s = await tx.get(ref);
    const n = nextNumberValue({ counterNext: s.exists() ? s.data().next : 0, maxExisting });
    tx.set(ref, { next: n + 1 });
    return formatInvoiceNumber(prefix, n);
  };
  if (typeof db.runTransaction === 'function') return db.runTransaction(bump); // server SDK
  // client SDK (the login-based setup): the same transaction, from the client library. Only for a real client database.
  if (db && db.type === 'firestore') {
    const client = await import('firebase/firestore');
    return client.runTransaction(db, bump);
  }
  const s0 = await getDoc(ref); // no transaction available for this database: a plain read and write
  const n = nextNumberValue({ counterNext: s0.exists() ? s0.data().next : 0, maxExisting });
  await setDoc(ref, { next: n + 1 });
  return formatInvoiceNumber(prefix, n);
}
