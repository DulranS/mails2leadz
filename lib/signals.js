// lib/signals.js - buying signals: businesses that have just appeared, found in public registers (pure, no network).
// Source: the UK Companies House register, companies newly incorporated in the SIC codes the owner chooses. A register gives a
// company name and address, never a website or an email. So each company is first matched to a domain whose homepage carries
// its name (checked on the network by lib/server/signals-io.js), and only then goes on to the contact lookup.
export const SIGNAL_LIMITS = { sicMax: 10, daysMax: 30, perNightMax: 25, locationMax: 80 };

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const SUFFIX = /\b(limited|ltd|llp|plc|cic)\b\.?/gi;
const GENERIC = new Set(['the', 'and', 'of', 'uk', 'group', 'services', 'solutions', 'company', 'co', 'holdings', 'international']);

/** Owner settings from a form or a saved record. An enabled search needs at least one five-digit SIC code, or it would match everything. */
export function sanitizeSignalSettings(raw = {}) {
  const sicText = Array.isArray(raw.sicCodes) ? raw.sicCodes.join(',') : String(raw.sicCodes ?? '');
  const sic = [...new Set(sicText.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))];
  if (sic.some((c) => !/^\d{5}$/.test(c))) return { error: 'SIC codes are five digits each, for example 62012, separated by commas.' };
  if (sic.length > SIGNAL_LIMITS.sicMax) return { error: `Up to ${SIGNAL_LIMITS.sicMax} SIC codes.` };
  const days = Math.floor(Number(raw.daysBack ?? 7));
  if (!Number.isFinite(days) || days < 1 || days > SIGNAL_LIMITS.daysMax) return { error: `Look back 1 to ${SIGNAL_LIMITS.daysMax} days.` };
  const enabled = raw.enabled === true;
  if (enabled && !sic.length) return { error: 'Choose at least one SIC code, so the search is about the businesses you want.' };
  return { settings: { enabled, sicCodes: sic, location: clean(raw.location, SIGNAL_LIMITS.locationMax), daysBack: days } };
}

/** Lower-case words of a company name with the legal suffix removed. */
export function companyWords(name) {
  return String(name || '').toLowerCase().replace(SUFFIX, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
}

/** Likely domains for a company, most likely first: the name joined, then with dashes; .co.uk then .com. Never more than four. */
export function domainCandidates(name) {
  const words = companyWords(name);
  if (!words.length) return [];
  const bases = [...new Set([words.join(''), words.join('-')])].filter((b) => b.length >= 4 && b.length <= 40 && /^[a-z0-9-]+$/.test(b));
  const out = [];
  for (const b of bases.slice(0, 2)) out.push(`${b}.co.uk`, `${b}.com`);
  return [...new Set(out)].slice(0, 4);
}

/** The text a visitor sees first: the page title and the main heading. */
export function pageNames(html) {
  const pick = (re) => { const m = String(html || '').match(re); return m ? m[1].replace(/<[^>]+>/g, ' ') : ''; };
  return `${pick(/<title[^>]*>([\s\S]*?)<\/title>/i)} ${pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i)}`.toLowerCase();
}

/** True only when every distinctive word of the company name appears in the page's title or main heading. */
export function titleMatches(html, name) {
  const words = companyWords(name).filter((w) => w.length >= 3 && !GENERIC.has(w));
  if (!words.length) return false;
  const text = pageNames(html).replace(/[^a-z0-9 ]+/g, ' ');
  return words.every((w) => text.includes(w));
}

/** Companies House advanced-search reply -> active companies with the fields used here. */
export function parseIncorporations(json) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .map((i) => ({
      number: String(i?.company_number || '').trim(),
      name: clean(i?.company_name, 160),
      status: String(i?.company_status || ''),
      incorporated: String(i?.date_of_creation || '').slice(0, 10),
      sic: Array.isArray(i?.sic_codes) ? i.sic_codes.map(String).slice(0, 4) : [],
    }))
    .filter((c) => /^[A-Z0-9]{6,8}$/i.test(c.number) && c.name && c.status === 'active');
}

/** A queue entry for the contact lookup, built from a company and the domain confirmed for it. */
export function signalItem(company, domain, { score = 60 } = {}) {
  return {
    domain,
    score,
    place_id: `ch:${company.number}`,
    business_name: company.name,
    website: `https://${domain}`,
    category: company.sic[0] ? `New company (SIC ${company.sic[0]})` : 'New company',
    campaign: 'New company · Companies House',
    lead_quality: 'WARM',
  };
}
