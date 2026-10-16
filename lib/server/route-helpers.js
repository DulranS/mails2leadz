// lib/server/route-helpers.js - small shared helpers for the AI routes.
// The signed-in user comes from the header that proxy.js sets AFTER verifying the Firebase token
// (proxy.js also strips any x-user-id sent by the browser), never from the request body.
import crypto from 'node:crypto';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { isAdmin } from '../access.js';
import { getFirestore, doc, getDoc, isAdminMode } from '../server-firestore.js';
import { buildOptOut, cleanAddress } from './unsubscribe.js';
import { dealDocId, normalizeStage } from '../deal-utils.js';

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

/** Server-side guard used before any email goes out. Fails open if the lookup itself fails, so an outage never blocks sending. */
export async function isLostDeal(db, uid, email) {
  try {
    const snap = await getDoc(doc(db, 'deals', dealDocId(uid, email)));
    return snap.exists() && dealBlocksContact(snap.data());
  } catch {
    return false;
  }
}

/** Recipient opted out through the link in one of our emails. Same fail-open rule as above (an outage never blocks sending). */
export async function isSuppressed(db, uid, email) {
  try {
    const snap = await getDoc(doc(db, 'suppressions', dealDocId(uid, email)));
    return snap.exists();
  } catch {
    return false;
  }
}

/** The one server-side guard every send/draft route uses: opted out OR the owner marked the deal Lost. */
export async function isBlockedContact(db, uid, email) {
  const [suppressed, lost] = await Promise.all([isSuppressed(db, uid, email), isLostDeal(db, uid, email)]);
  return suppressed || lost;
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
