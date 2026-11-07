// lib/support-alerts.js - a complaint or support request that has waited two hours for an answer raises one alert. Pure.
const WAIT_MS = 2 * 3600000;
const KINDS = ['complaint', 'support_request'];

/** rows: sent-email records with replyIntent and replyTriagedAt. keys: stage keys already alerted. Returns the new alerts to raise. */
export function planSupportAlerts(rows = [], alertedKeys = new Set(), now = Date.now()) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.id || !KINDS.includes(r.replyIntent)) continue;
    const at = Date.parse(r.replyTriagedAt || '');
    if (!Number.isFinite(at) || now - at < WAIT_MS) continue;
    const key = `support:${r.id}`;
    if (alertedKeys.has(key)) continue;
    const who = String(r.to || 'a customer').slice(0, 120);
    const what = r.replyIntent === 'complaint' ? 'A complaint' : 'A support request';
    out.push({ stageKey: key, leadEmail: String(r.to || '').toLowerCase(), kind: 'support_waiting', stage: r.replyIntent, reason: `${what} from ${who} has had no answer for over two hours. Reply today.` });
  }
  return out;
}
