// lib/api-writes.js - which browser -> server calls can change stored data (so the shared read cache must be dropped after them).
// Pure. A GET never writes. These POST routes only read or compute, so they leave the cache alone; every other call is
// treated as a possible write, because a stale screen is worse than one extra read.
const READ_ONLY_POSTS = new Set([
  '/api/ai-insights', '/api/get-thread', '/api/list-sent-leads', '/api/list-whatsapp-contacts', '/api/get-daily-count',
  '/api/health', '/api/system-check', '/api/cache-stats',
]);

export function pathOf(url) {
  try { return new URL(String(url), 'http://local').pathname.replace(/\/+$/, ''); } catch { return String(url || ''); }
}

/** @returns {boolean} true when this call may have written to Firestore on the server. */
export function callMayWrite(method, url) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  return !READ_ONLY_POSTS.has(pathOf(url));
}
