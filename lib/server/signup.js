// lib/server/signup.js - the mailing list in Firestore: join, confirm, and the owner's key. Uses the pure rules in lib/signup.js.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc, increment } from '../server-firestore.js';
import { ownerFromKey } from './owner-key.js';
import { sendSystemMail } from './system-mail.js';
import { isSuppressed } from './route-helpers.js';
import { contactId, newContact, confirmPatch, signConfirmToken, verifyConfirmToken, parseSignupKey, signupKeyMatches, SIGNUP_LIMITS } from '../signup.js';
import { optOutFor, getSenderAddress } from './route-helpers.js';
import { withTextFooter } from './unsubscribe.js';
import { buildRawEmail } from '../raw-email.js';
import { openMailbox } from './autosend.js';
import { consentLine } from '../broadcast.js';

/** The owner a sign-up key belongs to, or null when the key is missing, wrong, or replaced. */
export async function signupOwnerFromKey(db, rawKey) {
  const parsed = parseSignupKey(rawKey);
  if (parsed) {
    const snap = await getDoc(doc(db, 'users', parsed.uid, 'settings', 'list_key'));
    const d = snap.exists() ? snap.data() : null;
    if (d && !d.revokedAt && signupKeyMatches(d.hash, parsed.secret)) return parsed.uid;
  }
  // The business's public-page key (the one on the Landing page) also opens the sign-up form, so the public page can link to it.
  return ownerFromKey(db, rawKey);
}

/**
 * A new sign-up. The confirmation email is sent BEFORE the contact is kept: if mail cannot be sent, nothing is stored.
 * Returns the same answer whether or not the address is already on the list, so the form cannot be used to find out who is.
 * @returns {Promise<{status:'sent'|'already'|'limit'|'mail_unavailable'|'no_base'}>}
 */
export async function requestSignup(db, uid, value, { baseUrl = '', businessName = '', now = new Date() } = {}) {
  if (!/^https:\/\//i.test(baseUrl)) return { status: 'no_base' };
  const cid = contactId(uid, value.email);
  const ref = doc(db, 'list_contacts', cid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    const d = existing.data();
    if (d.status !== 'pending') return { status: 'already' };
    // Still waiting: send the link again (the per-address resend is limited by the caller's rate limit).
  } else {
    if (await isSuppressed(db, uid, value.email)) return { status: 'already' };
    const stats = await getDoc(doc(db, 'users', uid, 'settings', 'list_stats'));
    const total = stats.exists() ? Number(stats.data().total) || 0 : 0;
    if (total >= SIGNUP_LIMITS.listMax) return { status: 'limit' };
  }
  const token = signConfirmToken(uid, cid, { now: now.getTime() });
  if (!token) return { status: 'no_base' };
  const link = `${baseUrl}/api/signup/confirm?t=${token}`;
  const name = businessName || 'us';
  const mail = await sendSystemMail({
    db, uid, kind: 'other', to: value.email,
    subject: `Please confirm your sign-up with ${name}`,
    text: `You asked to receive emails from ${name}.\n\nConfirm here (the link expires in ${SIGNUP_LIMITS.confirmDays} days):\n${link}\n\nIf you did not ask for this, ignore this email. You will not be added.`,
  });
  if (!mail.sent) return { status: 'mail_unavailable' };
  if (!existing.exists()) {
    await setDoc(ref, newContact({ uid, email: value.email, name: value.name, source: value.source, now }));
    await setDoc(doc(db, 'users', uid, 'settings', 'list_stats'), { total: increment(1) }, { merge: true });
  }
  return { status: 'sent' };
}

/** Confirms a contact from the emailed link. Idempotent: confirming twice is fine. */
export async function confirmSignup(db, token, { now = new Date() } = {}) {
  const who = verifyConfirmToken(token, { now: now.getTime() });
  if (!who) return { status: 'invalid' };
  const ref = doc(db, 'list_contacts', who.cid);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().userId !== who.uid) return { status: 'invalid' };
  const d = snap.data();
  if (d.status === 'unsubscribed') return { status: 'unsubscribed' };
  if (d.status === 'confirmed') return { status: 'already' };
  await updateDoc(ref, confirmPatch(now));
  return { status: 'confirmed', uid: who.uid, contact: { email: d.email, name: d.name || '' } };
}

/** The account's list, capped. */
export async function loadList(db, uid) {
  const snap = await getDocs(query(collection(db, 'list_contacts'), where('userId', '==', uid), limit(SIGNUP_LIMITS.listMax)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Addresses this account has suppressed (unsubscribed or bounced), read in one query. */
export async function suppressedEmails(db, uid) {
  const snap = await getDocs(query(collection(db, 'suppressions'), where('userId', '==', uid), limit(20000)));
  return new Set(snap.docs.map((d) => String(d.data().email || '').trim().toLowerCase()).filter(Boolean));
}

/**
 * The welcome email with the lead magnet, sent from the owner's Gmail once the person has confirmed. Skipped quietly when
 * no magnet is set, and never fails the confirmation itself.
 */
export async function sendWelcome(db, uid, contact) {
  const s = await getDoc(doc(db, 'users', uid, 'settings', 'list'));
  const m = s.exists() ? s.data() : {};
  if (!/^https:\/\//i.test(m.magnetUrl || '')) return { sent: false, reason: 'no_magnet' };
  const box = await openMailbox(db, uid);
  if (!box.ok) return { sent: false, reason: box.reason };
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const businessName = biz.exists() ? String((biz.data().profile || {}).businessName || '') : '';
  const address = await getSenderAddress(db, uid);
  const optOut = optOutFor(uid, contact.email, address);
  const title = String(m.magnetTitle || 'your download').slice(0, 80);
  const first = String(contact.name || '').trim().split(' ')[0];
  const text = `Thanks for confirming${first ? ', ' + first : ''}.\n\nHere is ${title}:\n${m.magnetUrl}\n\n${consentLine(businessName)}`;
  try {
    await box.sendRaw(buildRawEmail({ from: box.email, fromName: businessName, to: contact.email, subject: `Your ${title}`, body: withTextFooter(text, optOut), extraHeaders: optOut?.headers || '' }));
    return { sent: true };
  } catch (e) {
    console.error('[signup] welcome failed:', String(e?.message || '').slice(0, 120));
    return { sent: false, reason: 'failed' };
  }
}
