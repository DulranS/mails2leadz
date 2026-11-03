// lib/server/push.js - sends an owner's pipeline alert to their subscribed phones and browsers.
// Does nothing without the VAPID keys (see lib/push.js). A subscription the push service rejects as gone is removed.
import webpush from 'web-push';
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { pushKeysPresent, cleanSubscription } from '../push.js';

export async function sendOwnerPush(db, uid, payload, env = process.env) {
  if (!payload) return { sent: 0, skipped: 'nothing' };
  if (!pushKeysPresent(env)) return { sent: 0, skipped: 'no_keys' };
  try {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const ref = doc(db, 'users', uid, 'settings', 'push');
    const snap = await getDoc(ref).catch(() => null);
    const subs = (snap?.exists?.() ? snap.data().subscriptions : []) || [];
    let sent = 0;
    const keep = [];
    for (const raw of subs) {
      const sub = cleanSubscription(raw);
      if (!sub) continue;
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 });
        sent++;
        keep.push(sub);
      } catch (e) {
        // 404 / 410: the browser unsubscribed; anything else may be temporary, so keep it.
        if (e?.statusCode !== 404 && e?.statusCode !== 410) keep.push(sub);
      }
    }
    if (keep.length !== subs.length) await setDoc(ref, { subscriptions: keep }, { merge: true });
    return { sent, removed: subs.length - keep.length };
  } catch (e) {
    console.error('[push] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
