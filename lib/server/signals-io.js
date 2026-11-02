// lib/server/signals-io.js - the network side of buying signals: asks Companies House for newly registered companies (the owner's own
// key), and checks a company's likely homepages to confirm the domain really belongs to it. Each homepage is read once, with a
// time limit, and only the title and main heading are used. The app identifies itself in its request.
import { domainCandidates, titleMatches } from '../signals.js';

const ENDPOINT = 'https://api.company-information.service.gov.uk/advanced-search/companies';
const USER_AGENT = 'AutoLeadsBot/1.0 (checks that a company website carries the company name; reply to the site owner to opt out)';

/** Newly incorporated active companies between two dates, in the given SIC codes. Never echoes the reply body into errors. */
export async function fetchIncorporations({ apiKey, from, to, sicCodes = [], location = '', size = 100, fetchImpl = fetch }) {
  const p = new URLSearchParams({ incorporated_from: from, incorporated_to: to, company_status: 'active', size: String(size) });
  if (sicCodes.length) p.set('sic_codes', sicCodes.join(','));
  if (location) p.set('location', location);
  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  const res = await fetchImpl(`${ENDPOINT}?${p}`, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Companies House responded ${res.status}`);
  return res.json();
}

/** The first candidate domain whose homepage carries the company name. '' when none does. */
export async function resolveDomain(name, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  for (const d of domainCandidates(name)) {
    try {
      const res = await fetchImpl(`https://${d}/`, {
        redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 200000);
      if (!titleMatches(html, name)) continue;
      let host = d;
      try { host = new URL(res.url || `https://${d}/`).hostname.replace(/^www\./, ''); } catch { /* keep the candidate */ }
      return host;
    } catch { /* unreachable or timed out: try the next */ }
  }
  return '';
}
