// lib/server/route-helpers.js - small shared helpers for the AI routes.
// The signed-in user comes from the header that proxy.js sets AFTER verifying the Firebase token
// (proxy.js also strips any x-user-id sent by the browser), never from the request body.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, isAdminMode } from '../server-firestore.js';
import { buildOptOut } from './unsubscribe.js';
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
export function optOutFor(uid, email) {
  return isAdminMode() ? buildOptOut(uid, email) : null;
}
