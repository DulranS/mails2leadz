// lib/client-data.js - the screens' shared, cached reads of Firestore (browser side).
//
// Every page asks for the same few collections (deals, sent emails, invoices, pending follow-ups, settings...). Before, each page
// downloaded its own copy on every visit. Now the first page to ask downloads it, the others reuse it for a short time, and
// any write made through lib/client-firestore.js (or any server call that writes, see AuthFetch) drops exactly what it changed.
//
// The readers return objects shaped like Firestore snapshots (`.docs[i].id / .data()`, `.exists()`), so the pages' own code did not
// have to change. `.data()` hands out a shallow copy each time, so a page that edits a field cannot corrupt what the others see.
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { load, put, invalidate } from './swr-cache.js';

export const TTL = {
  volatile: 60 * 1000, // deals, sent emails, invoices, inbox, follow-ups: change all day, and server jobs also write them
  moderate: 2 * 60 * 1000, // content posts, conversations, enquiries
  settings: 5 * 60 * 1000, // settings documents, AI usage counters, contacts
};

/** Firestore snapshot -> plain rows that are safe to keep. */
const rowsOf = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));

/** Plain rows -> something shaped like a QuerySnapshot. */
export function asSnapshot(rows = []) {
  const docs = rows.map((r) => ({ id: r.id, exists: () => true, data: () => ({ ...r.data }) }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
}

/** One stored document (or its absence) -> something shaped like a DocumentSnapshot. */
export function asDoc(row) {
  const there = !!row && row.exists === true;
  return { id: row?.id || '', exists: () => there, data: () => (there ? { ...row.data } : undefined) };
}

const key = (uid, name) => `${uid}|${name}`;

function cachedList(uid, name, ttlMs, build, force) {
  return load(key(uid, name), async () => rowsOf(await build()), { ttlMs, force }).then(asSnapshot);
}
function cachedDoc(uid, name, ttlMs, ref, force) {
  return load(key(uid, name), async () => {
    const snap = await ref();
    return { id: snap.id, exists: snap.exists(), data: snap.exists() ? snap.data() : undefined };
  }, { ttlMs, force }).then(asDoc);
}

export const getDeals = (db, uid, o = {}) =>
  cachedList(uid, 'deals', TTL.volatile, () => getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000))), o.force);
export const getSentEmails = (db, uid, o = {}) =>
  cachedList(uid, 'sent_emails', TTL.volatile, () => getDocs(query(collection(db, 'sent_emails'), where('userId', '==', uid), limit(3000))), o.force);
export const getInvoices = (db, uid, o = {}) =>
  cachedList(uid, 'invoices', TTL.volatile, () => getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000))), o.force);
export const getLeadInbox = (db, uid, o = {}) =>
  cachedList(uid, 'lead_inbox', TTL.volatile, () => getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(3000))), o.force);
export const getPendingFollowUps = (db, uid, o = {}) =>
  cachedList(uid, 'follow_up_tasks', TTL.volatile, () => getDocs(query(collection(db, 'users', uid, 'follow_up_tasks'), where('status', '==', 'pending'), limit(500))), o.force);
export const getInboundEnquiries = (db, uid, o = {}) =>
  cachedList(uid, 'inbound_enquiries', TTL.moderate, () => getDocs(query(collection(db, 'inbound_enquiries'), where('userId', '==', uid), limit(1000))), o.force);
export const getAiUsage = (db, uid, o = {}) =>
  cachedList(uid, 'ai_usage', TTL.settings, () => getDocs(query(collection(db, 'ai_usage'), where('userId', '==', uid), limit(1000))), o.force);
export const getContentPosts = (db, uid, o = {}) =>
  cachedList(uid, 'content_posts', TTL.moderate, () => getDocs(collection(db, 'users', uid, 'content_posts')), o.force);
export const getConversations = (db, uid, o = {}) =>
  cachedList(uid, 'conversations', TTL.moderate, () => getDocs(collection(db, 'users', uid, 'conversations')), o.force);
export const getContacts = (db, uid, o = {}) =>
  cachedList(uid, 'contacts', TTL.settings, () => getDocs(collection(db, 'users', uid, 'contacts')), o.force);

/** users/{uid}/settings/{name}: business, team, autopilot ... */
export const getSettingsDoc = (db, uid, name, o = {}) =>
  cachedDoc(uid, `settings:${name}`, TTL.settings, () => getDoc(doc(db, 'users', uid, 'settings', name)), o.force);
/** ai_usage_monthly/{uid}_{YYYY-MM} */
export const getAiMonth = (db, uid, month, o = {}) =>
  cachedDoc(uid, `ai_month:${month}`, TTL.settings, () => getDoc(doc(db, 'ai_usage_monthly', `${uid}_${month}`)), o.force);

/** Seed the cache after a page already holds fresh data (for example right after it wrote and re-read it). */
export const seed = (uid, name, rows) => put(key(uid, name), rows);

/**
 * Which cache entry does a Firestore path feed? ("deals/abc" -> "deals", "users/u1/settings/team" -> "settings:team".)
 * null = nothing cached depends on it.
 */
export function cacheNameForPath(path) {
  const p = String(path || '').split('/').filter(Boolean);
  if (!p.length) return null;
  if (['deals', 'sent_emails', 'invoices', 'lead_inbox', 'inbound_enquiries', 'ai_usage'].includes(p[0])) return p[0];
  if (p[0] === 'ai_usage_monthly') return 'ai_month:';
  if (p[0] === 'users' && p.length >= 3) {
    if (p[2] === 'settings') return p[3] ? `settings:${p[3]}` : 'settings:';
    if (['follow_up_tasks', 'content_posts', 'conversations', 'contacts'].includes(p[2])) return p[2];
  }
  return null;
}

/** Drop what a write to `path` may have changed (for every user id: the cache only ever holds the current user's data). */
export function invalidatePath(path) {
  const name = cacheNameForPath(path);
  if (!name) return 0;
  // A screen's saved snapshot (`uid|page|...`) is deliberately kept: it paints instantly and the screen refreshes behind it.
  return invalidate((k) => { const i = k.indexOf('|'); const rest = i >= 0 ? k.slice(i + 1) : k; return rest === name || (name.endsWith(':') && rest.startsWith(name)); });
}
