// lib/postmaster.js - Google Postmaster Tools: the spam rate Google measures for one sending domain (API v2, domainStats:query).
// Pure: it builds the request and reads the answer. The route app/api/gmail-postmaster makes the call with the owner's own grant.
//
// Checked against Google's reference (22 Nov 2026):
//  * POST https://gmailpostmastertools.googleapis.com/v2/domains/{domain}/domainStats:query
//  * scope https://www.googleapis.com/auth/postmaster.traffic.readonly (or the broader postmaster scopes)
//  * the metric is standardMetric SPAM_RATE; each DomainStat carries the metric name we chose, a value and, for DAILY, a date.
//
// What Google does NOT say, so this code does not guess:
//  * the unit of SPAM_RATE. The reference gives no unit or range. Google's own warning text for SPAM_RATE_HIGH reads
//    "above 0.1%", so the number is shown exactly as Google returns it, with UNIT_NOTE beside it. Autosend never reads it:
//    Autosend keeps using the owner's typed counts against the 0.3% line.
//  * domain reputation: it is not a metric in v2, so it is not requested.

export const POSTMASTER_API = 'https://gmailpostmastertools.googleapis.com/v2';
export const SPAM_RATE_NAME = 'spam_rate'; // our name for the metric; Google echoes it back as DomainStat.metric
export const UNIT_NOTE = 'Google does not state the unit of this number in its documentation, so it is shown as Google returns it. Google\'s own warning for this metric reads "above 0.1%".';

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A bare domain from what the owner typed ("https://Example.com/path" or "me@example.com" → "example.com"), or null. */
export function cleanDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (s.includes('@')) s = s.split('@').pop();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return DOMAIN_RE.test(s) ? s : null;
}

/** "2026-11-01" → { year, month, day } for Google's Date type, or null when it is not a real calendar date. */
export function toDateParts(iso) {
  const m = ISO_RE.exec(String(iso || ''));
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

const pad = (n) => String(n).padStart(2, '0');

/** The request for one domain's daily spam rate between two dates, both inclusive. Null when the domain or the dates are not usable. */
export function spamRateRequest({ domain, from, to } = {}) {
  const d = cleanDomain(domain);
  const start = toDateParts(from);
  const end = toDateParts(to);
  if (!d || !start || !end) return null;
  if (String(from) > String(to)) return null;
  return {
    domain: d,
    url: `${POSTMASTER_API}/domains/${encodeURIComponent(d)}/domainStats:query`,
    body: {
      timeQuery: { dateRanges: { dateRanges: [{ start, end }] } },
      metricDefinitions: [{ name: SPAM_RATE_NAME, baseMetric: { standardMetric: 'SPAM_RATE' } }],
      aggregationGranularity: 'DAILY',
      pageSize: 200,
    },
  };
}

/** A StatisticValue (doubleValue, floatValue, intValue as a string, or a numeric stringValue) as a finite number, or null. */
function numberFrom(v) {
  if (!v || typeof v !== 'object') return null;
  for (const key of ['doubleValue', 'floatValue', 'intValue', 'stringValue']) {
    if (v[key] === undefined || v[key] === null || v[key] === '') continue;
    const n = Number(v[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Google's Date ({year, month, day}) as "YYYY-MM-DD", or null. */
function isoFrom(d) {
  if (!d || !Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) return null;
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** The SPAM_RATE rows in a QueryDomainStatsResponse, oldest first: [{ date, value }]. Other metrics and empty values are dropped. */
export function readSpamRate(json) {
  const stats = Array.isArray(json?.domainStats) ? json.domainStats : [];
  const rows = [];
  for (const s of stats) {
    if (s?.metric !== SPAM_RATE_NAME) continue;
    const value = numberFrom(s.value);
    if (value === null) continue;
    rows.push({ date: isoFrom(s.date), value });
  }
  rows.sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : (a.date || '') > (b.date || '') ? 1 : 0));
  return rows;
}

/** What the owner sees: the latest day Google reported and the average over the days returned. Null when there are no values. */
export function summariseSpamRate(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const average = rows.reduce((sum, r) => sum + r.value, 0) / rows.length;
  return { days: rows.length, latest, average };
}
