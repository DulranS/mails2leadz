// lib/offers.js - offers with a real end date and a stated guarantee, and the reminder before one ends. Pure. Expiry must be real: an offer that ends is never shown as still running.
const DAY = 86400000;

/** "name | discount % | ends YYYY-MM-DD | guarantee" lines. Bad lines are skipped and counted. */
export function parseOffers(text) {
  const out = []; let skipped = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [name, disc = '', ends = '', ...rest] = line.split('|').map((x) => x.trim());
    const discount = Number(String(disc).replace('%', ''));
    const ms = Date.parse(ends);
    if (!name || !(discount >= 0 && discount <= 90) || !Number.isFinite(ms)) { skipped++; continue; }
    out.push({ name: name.slice(0, 80), discountPct: discount, endsAt: new Date(ms).toISOString(), guarantee: rest.join(' | ').slice(0, 300) });
  }
  return { offers: out.slice(0, 20), skipped };
}

/** Offers that have not ended yet. */
export function activeOffers(offers = [], now = Date.now()) {
  return (Array.isArray(offers) ? offers : []).filter((o) => o && Date.parse(o.endsAt) > now);
}

/** Offers that end within the given days. */
export function endingSoon(offers = [], now = Date.now(), days = 3) {
  return activeOffers(offers, now).filter((o) => Date.parse(o.endsAt) - now <= days * DAY);
}
