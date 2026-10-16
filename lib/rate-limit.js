// lib/rate-limit.js - a small sliding-window limiter, per key (here: per signed-in account). Pure; no network.
// In-memory, so it is per server instance: a safety net against a runaway script or a stuck retry loop, not a billing control
// (plans and AI caps are the billing controls). Generous by design: a normal dashboard session is far below it.
export function makeLimiter({ limit, windowMs = 60000, maxKeys = 10000 } = {}) {
  const hits = new Map();
  return {
    /** @returns {{ok:boolean, retryAfterSec:number}} */
    hit(key, now = Date.now()) {
      if (!(limit > 0)) return { ok: true, retryAfterSec: 0 }; // 0 = switched off
      const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return { ok: false, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) }; }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) { for (const k of hits.keys()) { if (hits.size <= maxKeys / 2) break; hits.delete(k); } }
      return { ok: true, retryAfterSec: 0 };
    },
  };
}
