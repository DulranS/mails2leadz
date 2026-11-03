// lib/server/ga4.js - posts one conversion to GA4. Never throws; a slow Google gives up after five seconds. Does nothing without the keys.
import { doc, getDoc } from '../server-firestore.js';
import { ga4Ready, ga4Body } from '../ga4.js';

export async function notifyGa4(db, uid, event, data, { fetchImpl = fetch, env = process.env } = {}) {
  if (!ga4Ready(env)) return { sent: false, skipped: 'no_keys' };
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null);
    const currency = snap?.exists?.() ? snap.data().currency : 'USD';
    const body = ga4Body({ uid, event, data, currency });
    if (!body) return { sent: false, skipped: 'not_mapped' };
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      return { sent: !!r?.ok };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { sent: false };
  }
}
