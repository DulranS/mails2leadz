// lib/companies.js - companies are grouped from the people on the owner's records by email domain (pass 405). Pure.
// Free email providers (PERSONAL_DOMAINS in lib/consent-rules.js) never make a company. Only the owner's name, website and
// notes are stored (users/{uid}/companies/{domain}); the grouping, the contact count and the deal count are computed each time.
// Our own decision: each exact domain is one company, so mail.acme.com and acme.com are two until the owner says otherwise.
import { PERSONAL_DOMAINS } from './consent-rules.js';

export const COMPANY_LIMITS = { name: 120, website: 200, notes: 2000 };
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** The company domain of an email address, or '' when it has none or is a free email provider. */
export function companyDomainOf(email) {
  const e = String(email ?? '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return '';
  const d = e.slice(at + 1);
  if (!DOMAIN_RE.test(d) || PERSONAL_DOMAINS.includes(d)) return '';
  return d;
}

/** A domain as stored in the owner's record: lower case, well formed, never a free provider. '' when not valid. */
export function cleanCompanyDomain(raw) {
  const d = String(raw ?? '').trim().toLowerCase();
  return DOMAIN_RE.test(d) && !PERSONAL_DOMAINS.includes(d) ? d : '';
}

/** A website as the owner typed it, with https:// added when missing. '' when blank; null when it is not a web address. */
export function normaliseWebsite(raw) {
  const s = clean(raw, COMPANY_LIMITS.website);
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
    return u.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/** The owner's override fields, cleaned. Notes keep their line breaks. */
export function sanitizeCompanyOverride(input = {}) {
  const website = normaliseWebsite(input?.website);
  if (website === null) return { ok: false, error: 'Enter the website as an address, such as example.com.' };
  const notes = String(input?.notes ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, COMPANY_LIMITS.notes);
  return { ok: true, value: { name: clean(input?.name, COMPANY_LIMITS.name), website, notes } };
}

/**
 * The companies on the owner's records.
 * @param {{contacts?: object[], deals?: object[], overrides?: Record<string, object>}} input
 *   contacts: rows with an email (users/{uid}/contacts); deals: rows with an email (the deals collection); overrides: by domain.
 * @returns {{domain:string, name:string, website:string, notes:string, contactCount:number, dealCount:number}[]} sorted by name.
 *   contactCount counts distinct people (a person on a contact and a deal counts once). dealCount counts deals.
 *   An override with no people on its domain is ignored: a company exists only where there are people.
 */
export function groupCompanies({ contacts = [], deals = [], overrides = {} } = {}) {
  const byDomain = new Map();
  const slot = (d) => {
    if (!byDomain.has(d)) byDomain.set(d, { people: new Set(), deals: 0 });
    return byDomain.get(d);
  };
  for (const c of Array.isArray(contacts) ? contacts : []) {
    const d = companyDomainOf(c?.email);
    if (d) slot(d).people.add(String(c.email).trim().toLowerCase());
  }
  for (const x of Array.isArray(deals) ? deals : []) {
    const d = companyDomainOf(x?.email);
    if (!d) continue;
    const s = slot(d);
    s.people.add(String(x.email).trim().toLowerCase());
    s.deals++;
  }
  const out = [...byDomain.entries()].map(([domain, s]) => {
    const o = overrides?.[domain] && typeof overrides[domain] === 'object' ? overrides[domain] : {};
    const website = normaliseWebsite(o.website);
    return {
      domain,
      name: clean(o.name, COMPANY_LIMITS.name) || domain,
      website: website || `https://${domain}`,
      notes: String(o.notes ?? '').slice(0, COMPANY_LIMITS.notes),
      contactCount: s.people.size,
      dealCount: s.deals,
    };
  });
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.domain.localeCompare(b.domain));
}
