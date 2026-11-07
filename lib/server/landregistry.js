// lib/server/landregistry.js - fetches sold prices for a postcode (cached for six hours). Never throws; the owner can always paste prices instead.
import { LR_ENDPOINT, soldPricesQuery, parseSoldPrices, normalisePostcode } from '../landregistry.js';

const cache = new Map();
const TTL = 6 * 3600000;

export async function soldPricesFor(postcode, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const pc = normalisePostcode(postcode);
  if (!pc) return { ok: false, error: 'Enter a UK postcode, for example SW1A 1AA.' };
  const hit = cache.get(pc);
  if (hit && Date.now() - hit.at < TTL) return { ok: true, comps: hit.comps, cached: true };
  try {
    const url = `${LR_ENDPOINT}?query=${encodeURIComponent(soldPricesQuery(pc))}`;
    const r = await fetchImpl(url, { headers: { Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r?.ok) return { ok: false, error: 'The Land Registry did not answer. Try again later, or paste prices instead.' };
    const comps = parseSoldPrices(await r.json());
    cache.set(pc, { at: Date.now(), comps });
    return { ok: true, comps, cached: false };
  } catch (e) {
    return { ok: false, error: 'The Land Registry did not answer. Try again later, or paste prices instead.' };
  }
}
