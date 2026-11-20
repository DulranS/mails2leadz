// lib/server/ga4-report.js - traffic and bounce rate for the last 28 days from Google Analytics (GA4). Needs the analytics read permission on the Google connection. Never throws.
import { searchAccessToken } from './search-console.js';
import { ga4Report } from '../traffic.js';
import { operatorEnv } from './operator-settings.js';

export async function ga4Totals(refresh, propertyId, env = operatorEnv(), f = fetch, now = Date.now()) {
  try {
    if (!propertyId) return { ok: false, reason: 'no property' };
    const token = await searchAccessToken(refresh, env, f);
    if (!token) return { ok: false, reason: 'no token' };
    // The runReport request and its reading live in lib/traffic.js (shared with the Dashboard route, pass 341).
    return await ga4Report({ token, propertyId, fetchImpl: f, now });
  } catch (e) {
    return { ok: false, reason: 'could not read' };
  }
}
