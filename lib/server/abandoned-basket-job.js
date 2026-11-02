// lib/server/abandoned-basket-job.js - sends the one reminder for each saved basket that was not ordered (see lib/abandoned-basket.js).
// Each reminder gets a fresh basket link, made from the basket's items and the storefront key it was saved from. The owner's
// key is re-checked before anything is sent, so a revoked key stops reminders.
import { randomBytes } from 'node:crypto';
import { collection, doc, getDocs, query, where, limit, setDoc, updateDoc } from '../server-firestore.js';
import { isBlockedContact } from './route-helpers.js';
import { ownerFromKey } from './owner-key.js';
import { hashToken } from '../shop-basket.js';
import { abandonedBaskets, basketReminderDraft } from '../abandoned-basket.js';

const DAYS = 7;

export async function runAbandonedBaskets(db, uid, { mail, base = '', max = 30, now = Date.now(), senderName = '', businessName = '' } = {}) {
  if (!/^https:\/\//i.test(String(base || ''))) return { sent: 0, skipped: 'no_base_url' };
  const bSnap = await getDocs(query(collection(db, 'shop_baskets'), where('userId', '==', uid), limit(300)));
  const baskets = bSnap.docs.map((d) => ({ ref: d.ref, id: d.id, ...d.data() }));
  if (!baskets.length) return { sent: 0 };
  const iSnap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), where('source', '==', 'storefront'), limit(1000)));
  const invoices = iSnap.docs.map((d) => d.data());
  const cands = abandonedBaskets({ baskets, invoices, now }).slice(0, max);
  let sent = 0;
  for (const c of cands) {
    if (await isBlockedContact(db, uid, c.email)) continue;
    const k = String(c.storefrontKey);
    if ((await ownerFromKey(db, k)) !== uid) continue; // the key was revoked or belongs elsewhere: say nothing
    const token = randomBytes(24).toString('base64url');
    const stamp = new Date(now).toISOString();
    // The new basket is marked as a reminder already, so it is never reminded about in turn.
    await setDoc(doc(db, 'shop_baskets', hashToken(token)), {
      userId: uid, email: c.email, items: c.items, createdAt: stamp, expiresAt: new Date(now + DAYS * 86400000).toISOString(),
      storefrontKey: k, reminderOf: c.id, remindedAt: stamp,
    });
    const link = `${base.replace(/\/+$/, '')}/site?k=${encodeURIComponent(k)}&basket=${token}`;
    const draft = basketReminderDraft({ link, businessName, senderName });
    const r = await mail(c.email, draft.subject, draft.body).catch(() => ({ sent: false }));
    if (!r || !r.sent) break; // the mail side is unavailable: stop, and try again tomorrow
    await updateDoc(c.ref, { remindedAt: stamp }).catch(() => {});
    sent++;
  }
  return { sent, candidates: cands.length };
}
