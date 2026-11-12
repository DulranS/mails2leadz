// lib/segments.js - lists and segments of contacts (tags, source, stage, city, value, recent activity), and broadcast batches that only reach people who agreed. Pure.
const DAY = 86400000;

/** Contacts that match every filter given. Empty filters match everyone. Tags and sources match if any is listed. */
export function applySegment(contacts = [], filter = {}, now = Date.now()) {
  const f = filter || {};
  const tags = (f.tags || []).map((t) => String(t).toLowerCase());
  const sources = (f.sources || []).map((s) => String(s).toLowerCase());
  const stages = (f.stages || []).map((s) => String(s).toLowerCase());
  const city = String(f.city || '').trim().toLowerCase();
  return (Array.isArray(contacts) ? contacts : []).filter((c) => {
    if (!c || !c.email) return false;
    if (tags.length && !(c.tags || []).some((t) => tags.includes(String(t).toLowerCase()))) return false;
    if (sources.length && !sources.includes(String(c.source || '').toLowerCase())) return false;
    if (stages.length && !stages.includes(String(c.stage || '').toLowerCase())) return false;
    if (city && !String(c.city || '').toLowerCase().includes(city)) return false;
    if (Number(f.minValue) > 0 && !((Number(c.value) || 0) >= Number(f.minValue))) return false;
    if (Number(f.activeWithinDays) > 0) {
      const at = Date.parse(c.lastActiveAt || '') || 0;
      if (!at || now - at > Number(f.activeWithinDays) * DAY) return false;
    }
    return true;
  });
}

/** Splits matched contacts into people who can be emailed and the rest, with the reason. */
export function broadcastRecipients(matched = [], suppressed = new Set()) {
  const eligible = [], excluded = [];
  for (const c of matched) {
    const email = String(c.email).toLowerCase();
    if (suppressed.has(email)) excluded.push({ email, why: 'opted out or do-not-contact' });
    else if (c.consent !== true) excluded.push({ email, why: 'no agreement to hear from you' });
    else eligible.push(email);
  }
  return { eligible: [...new Set(eligible)], excluded };
}

/** Texts go only to valid mobile numbers with recorded consent for texts, and never to someone who opted out. */
export function smsRecipients(matched = [], suppressed = new Set()) {
  const eligible = [], excluded = [];
  for (const c of matched) {
    const email = String(c.email).toLowerCase();
    const phone = String(c.phone || '').replace(/[\s-]/g, '');
    if (suppressed.has(email)) excluded.push({ email, why: 'opted out or do-not-contact' });
    else if (c.smsConsent !== true) excluded.push({ email, why: 'no agreement to receive texts' });
    else if (!/^\+[1-9]\d{7,14}$/.test(phone)) excluded.push({ email, why: 'no valid mobile number' });
    else eligible.push(phone);
  }
  return { eligible: [...new Set(eligible)], excluded };
}

export const MAX_BROADCAST = 300;
export const DAILY_BROADCAST_CAP = 200;

/** Campaign results: sends and won revenue per campaign name. Records without a campaign are grouped as untagged. */
export function campaignReport({ sends = [], deals = [], invoices = [] } = {}) {
  const rows = new Map();
  const row = (name) => { const k = String(name || 'untagged').slice(0, 80); if (!rows.has(k)) rows.set(k, { campaign: k, sends: 0, won: 0, revenue: 0 }); return rows.get(k); };
  for (const s of sends) if (s) row(s.campaign).sends += 1;
  for (const d of deals) if (d && d.stage === 'closed_won') { const r = row(d.utmCampaign); r.won += 1; r.revenue += Number(d.value) || 0; }
  for (const i of invoices) if (i && i.status === 'paid' && i.utmCampaign) { const r = row(i.utmCampaign); r.revenue += Number(i.amountPaid || i.total) || 0; }
  return [...rows.values()].map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 })).sort((a, b) => b.revenue - a.revenue || b.sends - a.sends);
}
