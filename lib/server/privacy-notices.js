// lib/server/privacy-notices.js - records the privacy notice owed to each sourced person, adds it to their first email, and erases on request.
// Needs the Firebase Admin SDK (privacy_notices is server-only, like suppressions; see firestore.rules).
import { collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, limit } from '../server-firestore.js';
import { NOTICE_COLLECTION, noticeKey, noticeDocId, noticeText, withNotice, overdueNotices } from '../privacy-notice.js';
import { inboxDocId } from './ingest-key.js';
import { dealDocId } from '../deal-utils.js';

/**
 * Writes one notice record per person in `rows` (the rows that passed screening). A person who already has a record keeps it:
 * the first date stays, and a notice already given stays given. Returns how many records were new.
 */
export async function writeSourcedNotices(db, uid, rows, { noticeBy, source, lawfulBasis, now = new Date().toISOString() }) {
  const people = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ key: noticeKey(r), email: String(r?.email || '').trim().toLowerCase() }))
    .filter((p) => p.key);
  let written = 0;
  for (let i = 0; i < people.length; i += 8) {
    await Promise.all(people.slice(i, i + 8).map(async (p) => {
      const ref = doc(db, NOTICE_COLLECTION, noticeDocId(uid, p.key));
      if ((await getDoc(ref)).exists()) return;
      await setDoc(ref, {
        userId: uid, key: p.key, email: p.email || null, noticeBy, source: String(source || '').slice(0, 120),
        lawfulBasis: String(lawfulBasis || '').slice(0, 60), givenAt: null, createdAt: now,
      });
      written++;
    }));
  }
  return written;
}

/**
 * The notice this person is still owed, or null. A read failure throws on purpose: a send must not go out
 * to a sourced person without the notice just because the check could not run.
 */
export async function openNoticeFor(db, uid, email) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr) return null;
  const snap = await getDoc(doc(db, NOTICE_COLLECTION, noticeDocId(uid, `e:${addr}`)));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return data.givenAt ? null : { id: snap.id, ...data };
}

/** The body to send, with the privacy notice after it when this person is still owed one. */
export async function bodyWithNotice(db, uid, email, body, controller) {
  const notice = await openNoticeFor(db, uid, email);
  if (!notice) return { body, notice: null };
  const text = noticeText({ controller, source: notice.source, lawfulBasis: notice.lawfulBasis });
  return { body: withNotice(body, text), notice };
}

/** Call after the email has really gone out. If this write fails the person may get the notice twice, never zero times. */
export async function markNoticeGiven(db, notice, at = new Date().toISOString()) {
  if (!notice?.id) return;
  await updateDoc(doc(db, NOTICE_COLLECTION, notice.id), { givenAt: at });
}

/** Records whose notice date has passed and that have not been given: the owner must send the notice by hand, or erase the person. */
export async function overdueFor(db, uid, today) {
  const snap = await getDocs(query(collection(db, NOTICE_COLLECTION), where('userId', '==', uid), where('givenAt', '==', null), limit(500)));
  return overdueNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })), today).map((r) => ({
    id: r.id, email: r.email || '', noticeBy: r.noticeBy, source: r.source || '',
  }));
}

/**
 * The owner has told this person by hand (a phone-only person, or any person the owner reached outside email).
 * Marks the record given, with who gave it, so it leaves the overdue list. Only the owner's own records.
 */
export async function markNoticeTold(db, uid, id) {
  const ref = doc(db, NOTICE_COLLECTION, String(id || ''));
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.userId !== uid) return { ok: false };
  if (snap.data().givenAt) return { ok: true, already: true };
  await updateDoc(ref, { givenAt: new Date().toISOString(), givenBy: 'owner' });
  return { ok: true, already: false };
}

/**
 * Erasure on request: removes the notice record and the inbox lead for the same person, and blocks all mail to the address
 * so a re-imported list cannot bring them back. An existing stronger stop (a bounce) is kept as it is.
 */
export async function eraseNotice(db, uid, id) {
  const ref = doc(db, NOTICE_COLLECTION, String(id || ''));
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data()?.userId !== uid) return { ok: false, email: '' };
  const d = snap.data();
  if (d.key && (d.key.startsWith('e:') || d.key.startsWith('t:'))) {
    await deleteDoc(doc(db, 'lead_inbox', inboxDocId(uid, d.key))).catch(() => {});
  }
  if (d.email) {
    const sup = doc(db, 'suppressions', dealDocId(uid, d.email));
    if (!(await getDoc(sup)).exists()) {
      await setDoc(sup, { userId: uid, email: d.email, source: 'all_mail', topics: [], createdAt: new Date().toISOString() });
    }
  }
  await deleteDoc(ref);
  return { ok: true, email: d.email || '' };
}
