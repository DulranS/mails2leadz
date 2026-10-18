// lib/server/owner-report.js - loads the rows the Monday email needs for one owner (the report itself is the pure lib/owner-report.js).
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
export { buildOwnerReport } from '../owner-report.js';

/** Loads the rows the report needs for one owner. */
export async function loadOwnerRows(db, uid) {
  const rd = async (coll, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => d.data());
  const [deals, invoices, sentRows] = await Promise.all([rd('deals', 2000), rd('invoices', 2000).catch(() => []), rd('sent_emails', 3000)]);
  return { deals, invoices, sentRows };
}
