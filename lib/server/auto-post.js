// lib/server/auto-post.js - hands the day's due posts to the owner's own webhook (Zapier / Make / Buffer / n8n), which publishes them.
// The rules (what is due, what is held back, what the payload looks like) are in lib/post-webhook.js. This file is the I/O around them.
// Safety: only public https addresses are called (same check as the website reader), short timeout, no redirects, nothing is logged but counts.
import { collection, doc, getDoc, getDocs, updateDoc } from '../server-firestore.js';
import { assertPublicUrl, defaultCtx } from './lead-finder-io.js';
import { planAutoPosts, webhookPayload, testPayload } from '../post-webhook.js';
import { withPostTag } from '../content.js';

const nowIso = () => new Date().toISOString();
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** POST one JSON payload to the webhook. Returns { ok, status, why }. Never throws. */
export async function callWebhook(url, payload, ctx = defaultCtx()) {
  try {
    await assertPublicUrl(url, ctx);
    const res = await ctx.fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', 'User-Agent': ctx.userAgent }, body: JSON.stringify(payload) });
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return res.status >= 200 && res.status < 300 ? { ok: true, status: res.status } : { ok: false, status: res.status, why: `Your automation answered with HTTP ${res.status}.` };
  } catch (e) {
    return { ok: false, status: 0, why: e?.code === 'UNSAFE_URL' ? 'That address is not a public https address.' : 'Your automation did not answer in time.' };
  }
}

export const sendTestPost = (url, ctx) => callWebhook(url, testPayload(), ctx);

/**
 * @returns {{ posted: number, held: number, error: string }}
 * A failed call stops the run (the post stays scheduled and is tried again tomorrow); the reason is returned so the owner is told.
 */
export async function autoPostForUser(db, uid, { url, dateKey, now = Date.now(), ctx = defaultCtx(), sleep = defaultSleep } = {}) {
  const out = { posted: 0, held: 0, error: '' };
  if (!url) return out;
  const snap = await getDocs(collection(db, 'users', uid, 'content_posts'));
  const posts = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
  const { send, held } = planAutoPosts(posts, dateKey, now);
  out.held = held.length;
  if (!send.length) return out;
  const keySnap = await getDoc(doc(db, 'users', uid, 'settings', 'inbound_key')).catch(() => null);
  const kd = keySnap?.exists?.() ? keySnap.data() : null;
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  for (const p of send) {
    const link = kd && !kd.revokedAt && kd.key && base ? withPostTag(`${base}/enquire?k=${kd.key}&src=${p.platform}`, p.id) : '';
    const r = await callWebhook(url, webhookPayload(p, { link }), ctx);
    if (!r.ok) { out.error = r.why; break; }
    await updateDoc(p.ref, { status: 'posted', postedOn: dateKey, postedBy: 'webhook', updatedAt: nowIso() }).catch(() => {});
    out.posted++;
    await sleep(1000);
  }
  return out;
}
