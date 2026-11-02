// lib/postage.js - postage for storefront orders that are posted (pure, no network).
// Bands are weight limits, each optionally for certain destination countries. The cheapest band that fits wins.
// With no bands, the single flat charge applies to every order. An order is refused, not guessed, when postage cannot be worked out.
export const POSTAGE_LIMITS = { bands: 12, maxKg: 1000, maxFee: 100000 };

const COUNTRY = /^[A-Z]{2}$/;

/** Accepts a list of bands, or the text the owner types: one band per line, "upToKg, fee, COUNTRY COUNTRY" (countries optional). */
export function sanitizePostage(raw) {
  const rows = typeof raw === 'string'
    ? raw.split(/\r?\n/).map((line) => {
        const [kg = '', fee = '', countries = ''] = line.split(',').map((x) => x.trim());
        return { upToKg: kg, fee, countries: countries.split(/[\s/]+/) };
      })
    : (Array.isArray(raw) ? raw : []).map((r) => ({ upToKg: r?.upToKg, fee: r?.fee, countries: Array.isArray(r?.countries) ? r.countries : [] }));
  const bands = [];
  for (const r of rows) {
    if (!String(r.upToKg ?? '').trim() && !String(r.fee ?? '').trim()) continue; // blank line
    const kg = Number(r.upToKg);
    const fee = Number(r.fee);
    if (!Number.isFinite(kg) || kg <= 0 || kg > POSTAGE_LIMITS.maxKg) continue;
    if (!Number.isFinite(fee) || fee < 0 || fee > POSTAGE_LIMITS.maxFee) continue;
    const countries = [...new Set((r.countries || []).map((c) => String(c).trim().toUpperCase()).filter((c) => COUNTRY.test(c)))].slice(0, 60);
    bands.push({ upToKg: Math.round(kg * 1000) / 1000, fee: Math.round(fee * 100) / 100, countries });
  }
  return bands.sort((a, b) => a.upToKg - b.upToKg).slice(0, POSTAGE_LIMITS.bands);
}

export const formatPostage = (bands = []) => (bands || [])
  .map((b) => `${b.upToKg}, ${b.fee}${b.countries && b.countries.length ? `, ${b.countries.join(' ')}` : ''}`).join('\n');

/**
 * Postage for one posted order.
 * @returns {{ok:true, fee:number, band:string} | {ok:false, error:string}}
 */
export function quotePostage({ bands = [], flatFee = 0, weightKg = 0, country = '', unweighed = [] } = {}) {
  if (!bands.length) return { ok: true, fee: Math.round((Number(flatFee) || 0) * 100) / 100, band: 'flat' };
  if (unweighed.length) return { ok: false, error: `Postage cannot be worked out for ${unweighed[0]} yet, because it has no weight. Get in touch.` };
  const c = String(country || '').trim().toUpperCase();
  if (!COUNTRY.test(c)) return { ok: false, error: 'Enter your country (two letters, for example GB or LK) to work out postage.' };
  const for_country = bands.filter((b) => !b.countries.length || b.countries.includes(c));
  if (!for_country.length) return { ok: false, error: 'We do not post to that country. Choose collection, or get in touch.' };
  const fit = for_country.filter((b) => weightKg <= b.upToKg).sort((a, b) => a.upToKg - b.upToKg);
  if (!fit.length) return { ok: false, error: 'This order is too heavy to post by the usual service. Get in touch.' };
  return { ok: true, fee: fit[0].fee, band: `up to ${fit[0].upToKg} kg` };
}
