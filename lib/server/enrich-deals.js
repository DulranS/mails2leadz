// lib/server/enrich-deals.js - adds job title and company size to deals that have none, through Apollo. Off unless the owner
// turns on enrichDeals (Account) AND the server has APOLLO_API_KEY. At most 20 deals per run, so the cost stays bounded.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { apolloEnrichment } from '../apollo.js';

const MAX_PER_RUN = 20;

export async function enrichDealsForUser(db, uid, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (switchState('enrichDeals', biz, env).status !== 'on') return { enriched: 0, skipped: 'off' };
    const snap = await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)));
    const todo = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.email && !d.enrichment).slice(0, MAX_PER_RUN);
    let enriched = 0;
    for (const deal of todo) {
      try {
        const r = await fetchImpl('https://api.apollo.io/api/v1/people/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.APOLLO_API_KEY },
          body: JSON.stringify({ email: String(deal.email).trim().toLowerCase(), reveal_personal_emails: false }),
        });
        if (!r?.ok) continue;
        const fields = apolloEnrichment(await r.json(), now);
        if (!fields) { await setDoc(doc(db, 'deals', deal.id), { enrichment: { enrichedAt: now.toISOString(), source: 'apollo', none: true } }, { merge: true }); continue; }
        await setDoc(doc(db, 'deals', deal.id), { enrichment: fields }, { merge: true });
        enriched++;
      } catch (e) {
        console.error('[enrich] deal failed:', String(e?.message || '').slice(0, 120));
      }
    }
    return { enriched };
  } catch (e) {
    console.error('[enrich] failed:', uid, String(e?.message || '').slice(0, 120));
    return { enriched: 0, skipped: 'error' };
  }
}
