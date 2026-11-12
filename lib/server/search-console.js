// lib/server/search-console.js - the owner's Search Console queries, read with their own Google connection. Never throws.
import { parseSearchRows, opportunities } from '../seo-insights.js';
import { operatorEnv } from './operator-settings.js';

const TOKEN = 'https://oauth2.googleapis.com/token';

export async function searchAccessToken(refresh, env, f = fetch) {
  const r = await f(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', client_secret: env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET || '', refresh_token: refresh, grant_type: 'refresh_token' }) });
  return r?.ok ? (await r.json())?.access_token || '' : '';
}

/** The first site the owner has verified in Search Console, then its last 28 days of queries. */
export async function weekSeoOpportunities(refresh, env = operatorEnv(), f = fetch, now = Date.now()) {
  try {
    const token = await searchAccessToken(refresh, env, f);
    if (!token) return { ok: false, opportunities: [] };
    const auth = { Authorization: `Bearer ${token}` };
    const sites = await f('https://www.googleapis.com/webmasters/v3/sites', { headers: auth });
    if (!sites?.ok) return { ok: false, opportunities: [] };
    const site = ((await sites.json()).siteEntry || [])[0]?.siteUrl;
    if (!site) return { ok: false, opportunities: [] };
    const end = new Date(now - 2 * 86400000), start = new Date(end.getTime() - 27 * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    const q = await f(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ startDate: iso(start), endDate: iso(end), dimensions: ['query'], rowLimit: 100 }),
    });
    if (!q?.ok) return { ok: false, opportunities: [] };
    return { ok: true, site, opportunities: opportunities(parseSearchRows(await q.json())) };
  } catch (e) {
    console.error('[search-console] failed:', String(e?.message || '').slice(0, 120));
    return { ok: false, opportunities: [] };
  }
}
