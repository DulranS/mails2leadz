// lib/server/owner-report.js - loads the rows the Monday email needs for one owner (the report itself is the pure lib/owner-report.js).
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
export { buildOwnerReport, buildMorningBrief } from '../owner-report.js';

/** Loads the rows the report needs for one owner. */
export async function loadOwnerRows(db, uid) {
  const rd = async (coll, n) => (await getDocs(query(collection(db, coll), where('userId', '==', uid), limit(n)))).docs.map((d) => d.data());
  const [deals, invoices, sentRows] = await Promise.all([rd('deals', 2000), rd('invoices', 2000).catch(() => []), rd('sent_emails', 3000)]);
  return { deals, invoices, sentRows };
}

/** The rows the morning brief needs: the report rows plus content posts, pending follow-up tasks and Lead Inbox rows. Each extra read is allowed to fail. */
export async function loadBriefRows(db, uid) {
  const base = await loadOwnerRows(db, uid);
  const [posts, tasks, inbox] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'content_posts')).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), where('status', '==', 'pending'), limit(500))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
    getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(3000))).then((s) => s.docs.map((d) => d.data())).catch(() => []),
  ]);
  return { ...base, posts, tasks, inbox };
}
