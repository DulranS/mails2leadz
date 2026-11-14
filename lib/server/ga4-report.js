// lib/server/ga4-report.js - traffic and bounce rate for the last 28 days from Google Analytics (GA4). Needs the analytics read permission on the Google connection. Never throws.
import { searchAccessToken } from './search-console.js';
import { parseGa4Totals } from '../seo-totals.js';
import { operatorEnv } from './operator-settings.js';

export async function ga4Totals(refresh, propertyId, env = operatorEnv(), f = fetch, now = Date.now()) {
  try {
    if (!propertyId) return { ok: false, reason: 'no property' };
    const token = await searchAccessToken(refresh, env, f);
    if (!token) return { ok: false, reason: 'no token' };
    const r = await f(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }], metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'bounceRate' }] }),
    });
    if (!r?.ok) return { ok: false, reason: 'not allowed yet (reconnect Google with the analytics permission)' };
    const g = parseGa4Totals(await r.json());
    if (!g) return { ok: false, reason: 'no data yet' };
    return { ok: true, ...g, days: 28, at: new Date(now).toISOString() };
  } catch (e) {
    return { ok: false, reason: 'could not read' };
  }
}
