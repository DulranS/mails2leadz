// lib/server/places-leads.js - each week, searches the owner's saved queries on Google Places and queues the businesses for the lead finder. Never throws.
import { doc, getDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { placesRequest, placesToRows, parseQueries, PLACES_URL, PLACES_FIELDS } from '../places.js';
import { startImport } from './lead-finder-job.js';

export async function placesSearch(key, textQuery, fetchImpl = fetch) {
  const r = await fetchImpl(PLACES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACES_FIELDS }, body: JSON.stringify(placesRequest(textQuery)) }).catch(() => null);
  if (!r?.ok) return { ok: false, rows: [] };
  return { ok: true, rows: placesToRows(await r.json()) };
}

export async function weeklyPlacesLeads(db, uid, { fetchImpl = fetch } = {}) {
  try {
    const s = await secretsFor(db, uid, ['GOOGLE_PLACES_API_KEY']).catch(() => ({}));
    if (!s.GOOGLE_PLACES_API_KEY) return { queued: 0 };
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const queries = parseQueries(biz.placesQueries);
    let queued = 0;
    for (const q of queries) {
      const r = await placesSearch(s.GOOGLE_PLACES_API_KEY, q, fetchImpl);
      if (!r.ok || !r.rows.length) continue;
      try {
        await startImport(db, uid, { label: `Google Places: ${q}`, rows: r.rows });
        queued += r.rows.length;
      } catch (e) {
        // a search already running is left to finish; the next week picks this up
      }
    }
    return { queued };
  } catch (e) {
    console.error('[places] weekly failed:', uid, String(e?.message || '').slice(0, 120));
    return { queued: 0 };
  }
}
