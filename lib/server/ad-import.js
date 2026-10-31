// lib/server/ad-import.js - reads monthly paid-ads spend from Meta and Google Ads (read-only) and turns it into marketing-spend entries.
// Pure parts are tested; fetchMetaMonthly / fetchGoogleMonthly are the only network calls.
// A month the owner entered by hand is never overwritten, and an import of one source never counts as a "manual" entry for another.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const IMPORT_SOURCES = { meta: 'Meta Ads', google: 'Google Ads' };
export const GOOGLE_ADS_VERSION = 'v17';

/* ---------- Meta ---------- */
export function metaInsightsUrl({ accountId, since, until, version = 'v20.0' }) {
  const range = encodeURIComponent(JSON.stringify({ since, until }));
  return `https://graph.facebook.com/${version}/act_${encodeURIComponent(String(accountId).replace(/^act_/, ''))}/insights?fields=spend&time_increment=monthly&time_range=${range}`;
}

/** Meta's monthly rows -> [{ month: 'YYYY-MM', amount }]. Anything that is not a clean month and a non-negative amount is dropped. */
export function parseMetaMonthly(json) {
  return (Array.isArray(json?.data) ? json.data : [])
    .map((r) => ({ month: String(r?.date_start || '').slice(0, 7), amount: Math.round(Number(r?.spend || 0) * 100) / 100 }))
    .filter((r) => MONTH.test(r.month) && Number.isFinite(r.amount) && r.amount >= 0);
}

export async function fetchMetaMonthly({ token, accountId, since, until, fetchImpl = fetch }) {
  const res = await fetchImpl(metaInsightsUrl({ accountId, since, until }), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Meta responded ${res.status}`); // never echo the body: it can name the account
  return parseMetaMonthly(await res.json());
}

/* ---------- Google Ads ---------- */
/** The reporting query: one row per month, cost in micros (millionths of the account currency). Dates are checked by the caller. */
export function googleCostQuery(since, until) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error('Bad date range.');
  return `SELECT segments.month, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`;
}

/** Google's searchStream reply (a list of batches of rows) -> [{ month, amount }] in whole cents, summed per month. */
export function parseGoogleMonthly(batches) {
  const byMonth = new Map();
  for (const b of Array.isArray(batches) ? batches : []) {
    for (const r of Array.isArray(b?.results) ? b.results : []) {
      const month = String(r?.segments?.month || '').slice(0, 7);
      const micros = Number(r?.metrics?.costMicros || 0);
      if (!MONTH.test(month) || !Number.isFinite(micros) || micros < 0) continue;
      byMonth.set(month, (byMonth.get(month) || 0) + micros);
    }
  }
  return [...byMonth].map(([month, micros]) => ({ month, amount: Math.round(micros / 10000) / 100 }));
}

/**
 * creds: { devToken, clientId, clientSecret, refreshToken, customerId, loginCustomerId? }. Exchanges the refresh token for an
 * access token, then runs the read-only report. Errors never echo the response body (it can name the account).
 */
export async function fetchGoogleMonthly({ creds, since, until, fetchImpl = fetch }) {
  const customer = String(creds.customerId || '').replace(/-/g, '');
  const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: creds.refreshToken }),
  });
  if (!tokenRes.ok) throw new Error(`Google sign-in responded ${tokenRes.status}`);
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) throw new Error('Google sign-in gave no access token');

  const headers = { Authorization: `Bearer ${accessToken}`, 'developer-token': creds.devToken, 'Content-Type': 'application/json' };
  const login = String(creds.loginCustomerId || '').replace(/-/g, '');
  if (login) headers['login-customer-id'] = login;
  const res = await fetchImpl(`https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${customer}/googleAds:searchStream`, {
    method: 'POST', headers, body: JSON.stringify({ query: googleCostQuery(since, until) }),
  });
  if (!res.ok) throw new Error(`Google Ads responded ${res.status}`);
  return parseGoogleMonthly(await res.json());
}

/* ---------- planning (shared) ---------- */
/** A manual entry (not imported) covers a month if it is that month, or a same-every-month entry that started on or before it. */
const isManual = (e) => e && e.channel === 'paid_ads' && !Object.prototype.hasOwnProperty.call(IMPORT_SOURCES, e.source);
const coversMonth = (e, month) => isManual(e) && (e.recurring === true ? String(e.month) <= month : e.month === month);

/**
 * @param source  'meta' | 'google'
 * @returns {{ writes: object[], skipped: string[] }}  each import has a fixed id per month, so importing again replaces that month.
 */
export function planAdImport({ rows = [], existing = [], months = [], source }) {
  if (!Object.prototype.hasOwnProperty.call(IMPORT_SOURCES, source)) throw new Error('Unknown ad source.');
  const wanted = new Set(months);
  const writes = [];
  const skipped = [];
  for (const r of rows) {
    if (!wanted.has(r.month)) continue;
    if ((existing || []).some((e) => coversMonth(e, r.month))) { skipped.push(r.month); continue; }
    writes.push({ id: `${source}_${r.month}`, channel: 'paid_ads', amount: r.amount, month: r.month, note: `Imported from ${IMPORT_SOURCES[source]}`, recurring: false, source });
  }
  return { writes, skipped };
}

export const planMetaImport = (args) => planAdImport({ ...args, source: 'meta' });
