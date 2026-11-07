// lib/meeting-brief.js - a short brief before each confirmed meeting, from the owner's own records. Pure. Nothing is sent.
const toMs = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : null; };
const money = (n) => (Number(n) || 0).toFixed(2);

export function meetingBriefs({ bookings = [], deals = [], invoices = [], quotes = [], callNotes = [], now = Date.now(), windowHours = 24 } = {}) {
  const horizon = now + windowHours * 3600000;
  const byEmail = (rows) => { const m = new Map(); for (const r of rows || []) { const k = String(r?.email || '').trim().toLowerCase(); if (k) m.set(k, [...(m.get(k) || []), r]); } return m; };
  // quotes keep the customer's address in customerEmail
  const dealsBy = byEmail(deals), invBy = byEmail(invoices), quoteBy = byEmail((Array.isArray(quotes) ? quotes : []).map((q) => ({ ...q, email: q.email || q.customerEmail }))), callsBy = byEmail(callNotes);
  const out = [];
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const start = toMs(b?.startIso);
    if (!b || b.status !== 'confirmed' || !b.email || start === null || start <= now || start > horizon) continue;
    const email = String(b.email).trim().toLowerCase();
    const lines = [];
    const deal = (dealsBy.get(email) || [])[0];
    if (deal) lines.push(`Deal: ${deal.stage || 'open'}${Number(deal.value) ? `, worth ${money(deal.value)}` : ''}.`);
    const q = (quoteBy.get(email) || []).find((x) => x.status !== 'accepted' && x.status !== 'declined' && x.status !== 'withdrawn');
    if (q) lines.push(`Open quote${q.title ? ` "${String(q.title).slice(0, 80)}"` : ''}${Number(q.viewCount) ? `, opened ${q.viewCount} time${q.viewCount === 1 ? '' : 's'}` : ', not opened yet'}.`);
    const unpaid = (invBy.get(email) || []).filter((i) => i.status !== 'paid' && i.status !== 'void');
    if (unpaid.length) lines.push(`Unpaid: ${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'}, ${money(unpaid.reduce((a, i) => a + (Number(i.total ?? i.amount) || 0), 0))} in total.`);
    const lastCall = (callsBy.get(email) || []).sort((a, c) => (toMs(c.createdAt) || 0) - (toMs(a.createdAt) || 0))[0];
    if (lastCall) {
      lines.push(`Last call: ${String(lastCall.summary || '').slice(0, 220)}`);
      if (lastCall.nextStep) lines.push(`Agreed next step: ${String(lastCall.nextStep).slice(0, 160)}`);
    }
    if (!lines.length) lines.push('No earlier records for this person. A first meeting.');
    out.push({ email, name: String(b.name || b.businessName || email).slice(0, 120), startIso: b.startIso, lines });
  }
  return out.sort((a, c) => (toMs(a.startIso) || 0) - (toMs(c.startIso) || 0)).slice(0, 20);
}
