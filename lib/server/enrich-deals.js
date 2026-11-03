// lib/server/enrich-deals.js - adds job title and company size to deals and inbox leads that have none, through Apollo.
// Off unless the owner turns on enrichDeals (Account) AND the server has APOLLO_API_KEY. At most 20 records per run in total.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { apolloEnrichment } from '../apollo.js';

const MAX_PER_RUN = 20;

async function enrichOne(db, colName, rec, { env, now, fetchImpl }) {
  const r = await fetchImpl('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.APOLLO_API_KEY },
    body: JSON.stringify({ email: String(rec.email).trim().toLowerCase(), reveal_personal_emails: false }),
  });
  if (!r?.ok) return false;
  const fields = apolloEnrichment(await r.json(), now);
  const enrichment = fields || { enrichedAt: now.toISOString(), source: 'apollo', none: true };
  await setDoc(doc(db, colName, rec.id), { enrichment }, { merge: true });
  return !!fields;
}

export async function enrichDealsForUser(db, uid, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (switchState('enrichDeals', biz, env).status !== 'on') return { enriched: 0, skipped: 'off' };
    let budget = MAX_PER_RUN;
    let enriched = 0;
    const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))).docs
      .map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.email && !d.enrichment).slice(0, budget);
    for (const d of deals) {
      budget--;
      try { if (await enrichOne(db, 'deals', d, { env, now, fetchImpl })) enriched++; }
      catch (e) { console.error('[enrich] deal failed:', String(e?.message || '').slice(0, 120)); }
    }
    const leads = (await getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(300)))).docs
      .map((d) => ({ id: d.id, ...d.data() })).filter((l) => l.email && !l.enrichment).slice(0, Math.max(0, budget));
    for (const l of leads) {
      try { if (await enrichOne(db, 'lead_inbox', l, { env, now, fetchImpl })) enriched++; }
      catch (e) { console.error('[enrich] lead failed:', String(e?.message || '').slice(0, 120)); }
    }
    return { enriched };
  } catch (e) {
    console.error('[enrich] failed:', uid, String(e?.message || '').slice(0, 120));
    return { enriched: 0, skipped: 'error' };
  }
}
