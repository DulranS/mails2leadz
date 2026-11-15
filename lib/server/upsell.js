// lib/server/upsell.js - upsell options for one customer, and the count of customers ready for one. Reads only. Never throws.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { loadCatalog } from './catalog.js';
import { purchasedNames, upsellOptions } from '../upsell.js';

async function invoicesFor(db, uid) {
  return (await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(1000)))).docs.map((d) => d.data());
}

export async function upsellFor(db, uid, email, now = Date.now()) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return { ok: false, error: 'Enter the customer\'s email address.' };
  const [invoices, catalog] = await Promise.all([invoicesFor(db, uid), loadCatalog(db, uid)]);
  const bought = purchasedNames(invoices, e);
  return { ok: true, bought: [...bought], options: upsellOptions({ purchased: bought, catalog, now }) };
}

/** Customers who paid in the last sixty days and have at least one upsell option now. */
export async function upsellReadyCount(db, uid, now = Date.now()) {
  try {
    const [invoices, catalog] = await Promise.all([invoicesFor(db, uid), loadCatalog(db, uid)]);
    const cutoff = now - 60 * 86400000;
    const emails = new Set(invoices.filter((i) => i.status === 'paid' && i.email && (Date.parse(i.paidAt || i.issuedAt || '') || 0) >= cutoff).map((i) => String(i.email).toLowerCase()));
    let ready = 0;
    for (const e of emails) {
      const bought = purchasedNames(invoices, e);
      if (upsellOptions({ purchased: bought, catalog, now }).length) ready++;
    }
    return ready;
  } catch (err) {
    return 0;
  }
}
