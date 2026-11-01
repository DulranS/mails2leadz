// lib/server/sender-auth.js - looks up a sending domain's SPF, DKIM and DMARC records in public DNS.
import { resolveTxt } from 'node:dns/promises';
import { DKIM_SELECTORS, normalizeDomain, buildSenderReport, FREE_MAIL } from '../sender-auth.js';

const LOOKUP_TIMEOUT_MS = 4000;

/** TXT records for one name. A missing name is an empty list; a timeout also counts as empty (the report says what was not found). */
export async function txtRecords(name, { resolve = resolveTxt } = {}) {
  let timer;
  try {
    const rows = await Promise.race([
      resolve(name),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), LOOKUP_TIMEOUT_MS); }),
    ]);
    return rows.map((r) => r.join(''));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Checks one domain: returns buildSenderReport()'s answer. Lookups run in parallel where possible. */
export async function checkSenderDomain(domain, { lookup = txtRecords } = {}) {
  const d = normalizeDomain(domain);
  if (!d) return buildSenderReport(domain);
  if (FREE_MAIL.has(d)) return buildSenderReport(d);
  const [spf, dmarc] = await Promise.all([lookup(d), lookup(`_dmarc.${d}`)]);
  let dkim = null;
  for (const selector of DKIM_SELECTORS) {
    const txts = await lookup(`${selector}._domainkey.${d}`);
    if (txts.some((t) => /v=DKIM1/i.test(t))) { dkim = { selector, txts }; break; }
  }
  return buildSenderReport(d, { spf, dmarc, dkim });
}
