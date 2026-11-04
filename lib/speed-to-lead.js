// lib/speed-to-lead.js - a new inbound lead should get a first reply quickly. Pure: which leads are waiting too long.
export function staleNewLeads(leads = [], now = Date.now(), hours = 1) {
  return (Array.isArray(leads) ? leads : []).filter((l) => {
    if (!l || l.status !== 'new' || !l.email) return false;
    const at = Date.parse(l.receivedAt || '');
    return Number.isFinite(at) && now - at > hours * 3600000;
  }).map((l) => ({ id: String(l.id || ''), email: String(l.email).trim().toLowerCase(), hoursWaiting: Math.floor((now - Date.parse(l.receivedAt)) / 3600000) }));
}
