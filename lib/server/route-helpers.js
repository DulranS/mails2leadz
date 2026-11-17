// lib/server/route-helpers.js - small shared helpers for the AI routes.
// The signed-in user comes from the header that proxy.js sets AFTER verifying the Firebase token
// (proxy.js also strips any x-user-id sent by the browser), never from the request body.
import crypto from 'node:crypto';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { isAdmin } from '../access.js';
import { getFirestore, doc, getDoc, getDocs, collection, query, where, limit, isAdminMode } from '../server-firestore.js';
import { buildOptOut, cleanAddress } from './unsubscribe.js';
import { dealDocId, normalizeStage } from '../deal-utils.js';
import { blockDecision, STOP_REASONS, owesTooLong, TOPIC_SOURCE, DEFAULT_TOPIC, topicBlocked, kindOfSource } from '../contact-rules.js';

export function getDb() {
  const cfg = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
  };
  return getFirestore(!getApps().length ? initializeApp(cfg) : getApp());
}

export const uidFromRequest = (request) => request.headers.get('x-user-id') || '';

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * WHO is calling, decided only from the verified identity (the header proxy.js sets after checking the Firebase token),
 * never from the request body. A userId in the body is only a CLAIM: it must match, or the request is refused.
 * The one exception is the server's own scheduled jobs calling a route directly (no browser, no proxy): they prove themselves
 * with the CRON_SECRET in `x-internal-cron`. An outside caller can neither set x-user-id (the proxy overwrites it) nor know that secret.
 * @returns {{uid:string}|{response:Response}} (a standard Response: route handlers may return it as is)
 */
export function identify(request, claimed) {
  const headerUid = request.headers.get('x-user-id');
  if (headerUid) {
    if (claimed && String(claimed) !== headerUid) return { response: Response.json({ error: 'You can only access your own data.' }, { status: 403, headers: NO_STORE }) };
    return { uid: headerUid };
  }
  const secret = process.env.CRON_SECRET;
  const internal = request.headers.get('x-internal-cron');
  if (secret && internal && claimed && sameSecret(internal, secret)) return { uid: String(claimed) };
  return { response: Response.json({ error: 'Please sign in again.' }, { status: 401, headers: NO_STORE }) };
}

/**
 * The real person behind a request, which differs from the tenant when they work inside someone else's workspace (team logins).
 * Both values come from headers the gate (proxy.js) sets after verifying the token; it strips any the browser sends.
 */
export function actorFromRequest(request) {
  const tenant = request.headers.get('x-user-id') || '';
  return { uid: request.headers.get('x-actor-uid') || tenant, role: request.headers.get('x-actor-role') || 'owner', tenantUid: tenant, email: request.headers.get('x-user-email') || '' };
}

/** Operator-only routes (ADMIN_EMAILS). The email comes from the verified token (header set by proxy.js), not from the request. */
export function requireAdmin(request) {
  const email = request.headers.get('x-user-email') || '';
  if (!request.headers.get('x-user-id') || !isAdmin(email)) return { response: Response.json({ error: 'Operator access only.' }, { status: 403, headers: NO_STORE }) };
  return { uid: request.headers.get('x-user-id'), email };
}

export const NO_STORE = { 'Cache-Control': 'no-store' };

/** Plain text for a prompt: no control characters, collapsed whitespace runs, hard length cap. */
export function clip(value, max = 500) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

/** One line only. Anything that ends up in an email header must pass through this (no header injection). */
export function headerSafe(value) {
  return String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * A lead can have several rows in sent_emails (re-sends). The row that carries the follow-up
 * counter is the one with the highest count; ties go to the earliest send (the original email).
 */
export function pickOriginal(docs) {
  let best = null;
  for (const d of docs) {
    const x = d.data();
    const count = Number(x.followUpCount ?? x.followUpSentCount ?? 0);
    if (
      !best ||
      count > best.count ||
      (count === best.count && toMs(x.sentAt) < toMs(best.data.sentAt))
    ) {
      best = { doc: d, data: x, count };
    }
  }
  return best;
}

export const daysSince = (v, now = Date.now()) => {
  const t = toMs(v);
  return t ? Math.max(0, Math.floor((now - t) / 86400000)) : null;
};

/** A deal the owner marked Lost (or "asked to stop") is never contacted again by the app. Reopen the deal to contact again. */
export const dealBlocksContact = (deal) => !!deal && normalizeStage(deal.stage) === 'closed_lost';

/** The Lost reason of this email's deal when the deal blocks contact, otherwise null. Fails open (null) if the lookup fails. */
export async function lostReasonFor(db, uid, email) {
  try {
    const snap = await getDoc(doc(db, 'deals', dealDocId(uid, email)));
    if (!snap.exists() || !dealBlocksContact(snap.data())) return null;
    return String(snap.data().lostReason || 'lost');
  } catch {
    return null;
  }
}

/** Server-side guard used before any email goes out. Fails open if the lookup itself fails, so an outage never blocks sending. */
export async function isLostDeal(db, uid, email) {
  return (await lostReasonFor(db, uid, email)) !== null;
}

/**
 * Does ANY deal already exist for this email (inbound enquiry, WhatsApp/call conversation, referral, hand-added, customer)?
 * Used only by the automatic COLD paths (lead inbox delivery, overnight first-email drafts, Autosend): someone you already
 * deal with must never get a cold "first email". Fails open, like the other guards.
 */
export async function hasExistingDeal(db, uid, email) {
  try {
    if (!email) return false;
    return (await getDoc(doc(db, 'deals', dealDocId(uid, email)))).exists();
  } catch {
    return false;
  }
}

/** Recipient opted out through the link in one of our emails. Same fail-open rule as above (an outage never blocks sending). */
export async function isSuppressed(db, uid, email, topic = null) {
  if (topic === null) {
    try {
      const snap = await getDoc(doc(db, 'suppressions', dealDocId(uid, email)));
      return snap.exists();
    } catch {
      return false;
    }
  }
  // v318: a topic check only counts stops that cover this topic (a follow-up stop does not stop a campaign).
  return topicBlocked(await suppressionFacts(db, uid, email), topic);
}

/**
 * What kind of stop this address has: 'all' when it bounced (nothing can reach it), 'marketing' when it opted out
 * through a link or a STOP reply, or null. Fails open (null).
 */
export async function suppressionKind(db, uid, email) {
  try {
    const snap = await getDoc(doc(db, 'suppressions', dealDocId(uid, email)));
    if (!snap.exists()) return null;
    return kindOfSource(snap.data()?.source);
  } catch {
    return null;
  }
}

export { STOP_REASONS };

/** v318: what stops this address: its kind of stop (see suppressionKind) and the marketing topics it stopped. Fails open (no stop). */
export async function suppressionFacts(db, uid, email) {
  try {
    const snap = await getDoc(doc(db, 'suppressions', dealDocId(uid, email)));
    if (!snap.exists()) return { kind: null, topics: [] };
    const data = snap.data() || {};
    const topics = Array.isArray(data.topics) ? data.topics.filter((t) => typeof t === 'string') : [];
    return { kind: kindOfSource(data.source), topics };
  } catch {
    return { kind: null, topics: [] };
  }
}

/**
 * The one server-side guard every send/draft route uses (the rules are in lib/contact-rules.js). Purposes:
 *  - 'marketing' (broadcasts, journeys, follow-ups, cold first emails): blocked by a bounce, a marketing opt-out, or a Lost deal.
 *  - 'transactional' (a quote the customer asked for, a reply to them): blocked by a bounce or a Lost deal, but NOT by a
 *    marketing opt-out (opting out of marketing must not stop necessary service messages).
 */

/** Does this address owe 30+ days overdue? Reads only that customer's invoices. Fails open (false). */
export async function owesOverdueFor(db, uid, email) {
  try {
    const addr = String(email || '').trim().toLowerCase();
    if (!addr) return false;
    const snap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), where('email', '==', addr), limit(100)));
    return owesTooLong(snap.docs.map((d) => d.data()), addr, Date.now());
  } catch {
    return false;
  }
}

export async function isBlockedContact(db, uid, email, purpose = 'marketing', topic = DEFAULT_TOPIC) {
  const [facts, lostReason, overdue] = await Promise.all([
    suppressionFacts(db, uid, email),
    lostReasonFor(db, uid, email),
    purpose === 'marketing' ? owesOverdueFor(db, uid, email) : Promise.resolve(false),
  ]);
  return blockDecision({ kind: facts.kind, topics: facts.topics, lostReason, owesTooLong: overdue }, purpose, topic);
}

/**
 * Opt-out link + headers for one email, or null when they cannot work. The link needs a server that is allowed to write
 * the suppression list (Firebase Admin / service account), so without it the app sends as before and /api/system-check says why.
 */
export function optOutFor(uid, email, address = '') {
  return isAdminMode() ? buildOptOut(uid, email, { address }) : null;
}

/**
 * The postal address the owner typed in Account -> Your business ('' if none or on any error: a missing address
 * must never stop an email). Read it once per request, not once per email.
 */
export async function getSenderAddress(db, uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    return snap.exists() ? cleanAddress(snap.data()?.profile?.address) : '';
  } catch {
    return '';
  }
}
