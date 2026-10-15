// lib/gmail-watch.js - pure rules for the timed reply check ("Reply watch"): what the owner may see, and whose turn it is. No database, no Google.

export const MIN_INTERVAL_MS = 8 * 60 * 1000; // the timed job never re-checks one owner more often than this, however often it is pinged
export const RECENT_KEEP = 20;

/** Everything the owner's screen may see: never the token, never the encrypted token. */
export function publicStatus(c) {
  if (!c) return { connected: false };
  return {
    connected: true,
    email: c.email || '',
    enabled: c.enabled !== false,
    status: c.status || 'ok', // ok | needs_reconnect | error
    connectedAt: c.connectedAt || null,
    lastCheckAt: c.lastCheckAt || null,
    lastResult: c.lastResult || null,
    lastError: c.lastError || '',
    recent: Array.isArray(c.recent) ? c.recent.slice(0, RECENT_KEEP) : [],
  };
}

/** Oldest check first (never-checked before everything), so no owner is starved when time runs out. Skips owners checked a moment ago and ones that need to reconnect. */
export function pickDue(connections, now = Date.now(), minIntervalMs = MIN_INTERVAL_MS) {
  const last = (c) => { const t = Date.parse(c.lastCheckAt || ''); return Number.isFinite(t) ? t : 0; };
  return (connections || [])
    .filter((c) => c && c.enabled !== false && c.status !== 'needs_reconnect' && now - last(c) >= minIntervalMs)
    .sort((a, b) => last(a) - last(b));
}
