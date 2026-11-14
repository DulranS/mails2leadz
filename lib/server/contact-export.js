// lib/server/contact-export.js - gathers one person's records across the owner's account, using the same scan as erasure. Never throws.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { cleanEmail, holdsEmail, SCAN_COLLECTIONS, SCAN_SUBCOLLECTIONS } from '../erase-contact.js';
import { packageExport } from '../contact-export.js';

const MAX = 2000;

export async function exportContactData(db, uid, rawEmail, now = new Date()) {
  const email = cleanEmail(rawEmail);
  if (!email) return { ok: false, error: 'Enter a valid email address.' };
  const found = {};
  for (const name of SCAN_COLLECTIONS) {
    const rows = (await getDocs(query(collection(db, name), where('userId', '==', uid), limit(MAX)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const hits = rows.filter((r) => holdsEmail(r, email));
    if (hits.length) found[name] = hits;
  }
  for (const sub of SCAN_SUBCOLLECTIONS) {
    const rows = (await getDocs(query(collection(db, 'users', uid, sub), limit(MAX)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const hits = rows.filter((r) => holdsEmail(r, email));
    if (hits.length) found[`users/${sub}`] = hits;
  }
  return { ok: true, pack: packageExport({ email, found, now }) };
}
