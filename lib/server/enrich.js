// lib/server/enrich.js - finds the public business contacts at a company's domain, through Hunter (the owner's own key).
// Nothing is saved by the lookup: the owner chooses who to contact, and each lookup uses that account's Hunter credits.
export const validDomain = (d) => /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(String(d || '').trim());

/** Hunter's domain-search reply -> [{ email, name, position, confidence }], best first, at most 25. */
export function parseHunterDomain(json) {
  const emails = Array.isArray(json?.data?.emails) ? json.data.emails : [];
  return emails
    .map((e) => ({
      email: String(e?.value || '').trim().toLowerCase(),
      name: [e?.first_name, e?.last_name].filter(Boolean).join(' ').slice(0, 120),
      position: String(e?.position || '').slice(0, 120),
      confidence: Math.max(0, Math.min(100, Number(e?.confidence) || 0)),
    }))
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 25);
}

export async function fetchHunterDomain({ apiKey, domain, fetchImpl = fetch }) {
  const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=10&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Hunter responded ${res.status}`); // never echo the body: it can name the key's account
  return parseHunterDomain(await res.json());
}
