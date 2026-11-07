// lib/day-start.js - the start of the working day, built once per day however the day starts (nightly job or first open). Pure.
// The call list is prepared, never dialled: the owner taps each call. Only people with a phone number and an open deal or new lead are listed.
const OPEN_STAGES_EXCLUDED = ['closed_won', 'closed_lost'];

/** The leads to call today: open deals first (biggest value), then new inbox leads. Each line says why it is there. */
export function callToday({ deals = [], leads = [], limit = 15 } = {}) {
  const out = [];
  const seen = new Set();
  const phoneOf = (x) => String(x?.phone || x?.phoneNumber || '').replace(/[\s\-().]/g, '');
  const dealRows = (Array.isArray(deals) ? deals : [])
    .filter((d) => d && phoneOf(d) && !OPEN_STAGES_EXCLUDED.includes(d.stage))
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
    .map((d) => ({ name: d.businessName || d.name || d.email || 'Lead', phone: phoneOf(d), email: String(d.email || '').toLowerCase(), why: `Open deal${Number(d.value) ? ` worth ${Number(d.value).toFixed(2)}` : ''} at ${d.stage || 'an early stage'}` }));
  const leadRows = (Array.isArray(leads) ? leads : [])
    .filter((l) => l && phoneOf(l) && l.status === 'new')
    .map((l) => ({ name: l.businessName || l.name || l.email || 'Lead', phone: phoneOf(l), email: String(l.email || '').toLowerCase(), why: 'New inbound lead, no reply yet' }));
  for (const r of [...dealRows, ...leadRows]) {
    const key = r.phone || r.email;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** True when the day has already been started for this date key (so the work is never repeated). */
export function dayAlreadyStarted(lastDayKey, dateKey) {
  return !!dateKey && lastDayKey === dateKey;
}
