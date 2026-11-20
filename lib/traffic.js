// lib/traffic.js - website traffic for the Dashboard (pass 341): sessions, visitors and bounce rate for the last 28 days from the
// Google Analytics 4 Data API (runReport). Needs the owner's Google connection with the analytics.readonly permission, and a GA4 property ID.
// Pure apart from the injected fetch, so it runs in tests with no network. Never throws.
import { parseGa4Totals } from './seo-totals.js';

export const GA4_DAYS = 28;
export const TRAFFIC_FRESH_MS = 12 * 60 * 60 * 1000;
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const ga4RunReportUrl = (propertyId) => `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;

/** The report asked for: last 28 days up to yesterday, sessions, visitors and bounce rate. */
export function ga4ReportBody() {
  return {
    dateRanges: [{ startDate: `${GA4_DAYS}daysAgo`, endDate: 'yesterday' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }],
  };
}

/** A fresh Google access token from the saved refresh token, or '' when that is not possible. Uses the same client keys as sign-in. */
export async function googleAccessToken(refresh, env = process.env, fetchImpl = globalThis.fetch) {
  if (!refresh) return '';
  const r = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', client_secret: env.GOOGLE_CLIENT_SECRET || '', refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  return r?.ok ? (await r.json().catch(() => ({})))?.access_token || '' : '';
}

/**
 * The 28-day figures from GA4. Returns { ok:true, sessions, users, bouncePct, days, at } or { ok:false, reason }.
 * A permission the owner has not granted (403) gives a reason to show, not an error.
 */
export async function ga4Report({ token, propertyId, fetchImpl = globalThis.fetch, now = Date.now() }) {
  try {
    if (!propertyId) return { ok: false, reason: 'no property' };
    if (!token) return { ok: false, reason: 'no token' };
    const r = await fetchImpl(ga4RunReportUrl(propertyId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(ga4ReportBody()),
    });
    if (!r?.ok) return { ok: false, reason: 'not allowed yet (reconnect Google with the analytics permission)' };
    const g = parseGa4Totals(await r.json());
    if (!g) return { ok: false, reason: 'no data yet' };
    return { ok: true, ...g, days: GA4_DAYS, at: new Date(now).toISOString() };
  } catch {
    return { ok: false, reason: 'could not read' };
  }
}

/** A saved reading is reused for 12 hours, so the Dashboard does not call Google on every load. */
export function isFresh(at, now = Date.now()) {
  const t = Date.parse(at || '');
  return Number.isFinite(t) && now - t >= 0 && now - t < TRAFFIC_FRESH_MS;
}

/**
 * What the Dashboard shows. Three states besides ready: not configured (no property, or no Google connection), which says what to set up;
 * and unavailable, with the reason. Nothing is shown as zero when the data is missing.
 */
export function trafficView(ga4, { hasProperty = false, hasRefresh = false } = {}) {
  if (!hasProperty) return { state: 'not_configured', text: 'Website traffic is off. Enter your GA4 property ID on Integrations.' };
  if (!hasRefresh) return { state: 'not_configured', text: 'Website traffic is off. Connect Google on Integrations, with the analytics permission.' };
  if (!ga4) return { state: 'unavailable', text: 'Website traffic is not loaded yet.' };
  if (!ga4.ok) return { state: 'unavailable', text: `Website traffic is not shown yet: ${ga4.reason}.` };
  const bounce = ga4.bouncePct === null || ga4.bouncePct === undefined ? 'n/a' : `${ga4.bouncePct}%`;
  return {
    state: 'ready',
    sessions: ga4.sessions,
    users: ga4.users,
    bouncePct: ga4.bouncePct ?? null,
    days: ga4.days,
    text: `Last ${ga4.days} days: ${ga4.sessions} sessions, ${ga4.users} visitors, bounce rate ${bounce}.`,
  };
}
