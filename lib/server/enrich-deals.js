// lib/server/enrich-deals.js - adds job title and company to deals and inbox leads that have none. A waterfall: Apollo first when its key is set,
// then People Data Labs when its key is set and Apollo had nothing. Off unless the owner turns on enrichDeals in Account. At most 20 records per run.
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { apolloEnrichment } from '../apollo.js';
import { pdlEnrichment } from '../pdl.js';
import { secretsFor } from './integration-secrets.js';

const MAX_PER_RUN = 20;
const hasAnyKey = (env) => !!(env.APOLLO_API_KEY || env.PDL_API_KEY);

async function fromApollo(email, env, now, fetchImpl) {
  const r = await fetchImpl('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': env.APOLLO_API_KEY },
    body: JSON.stringify({ email, reveal_personal_emails: false }),
  });
  return r?.ok ? apolloEnrichment(await r.json(), now) : null;
}

async function fromPdl(email, env, now, fetchImpl) {
  const r = await fetchImpl(`https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}`, {
    headers: { 'X-Api-Key': env.PDL_API_KEY },
  });
  return r?.ok ? pdlEnrichment(await r.json(), now) : null;
}

async function enrichOne(db, colName, rec, { env, now, fetchImpl }) {
  const email = String(rec.email).trim().toLowerCase();
  let fields = null;
  if (env.APOLLO_API_KEY) fields = await fromApollo(email, env, now, fetchImpl);
  if (!fields && env.PDL_API_KEY) fields = await fromPdl(email, env, now, fetchImpl);
  const enrichment = fields || { enrichedAt: now.toISOString(), source: 'none', none: true };
  await setDoc(doc(db, colName, rec.id), { enrichment }, { merge: true });
  return !!fields;
}

export async function enrichDealsForUser(db, uid, { env = process.env, now = new Date(), fetchImpl = fetch } = {}) {
  env = { ...env, ...(await secretsFor(db, uid, ['APOLLO_API_KEY', 'PDL_API_KEY'], { env }).catch(() => ({}))) }; // the owner's own keys first, the server's only as a fallback
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    if (switchState('enrichDeals', biz, env).status !== 'on') return { enriched: 0, skipped: 'off' };
    if (!hasAnyKey(env)) return { enriched: 0, skipped: 'no_keys' };
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
