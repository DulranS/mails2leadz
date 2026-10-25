// lib/contracts.js - a register of the agreements the business lives on (customers, suppliers, staff, leases, loans): who, until when,
// how much notice, and where the signed document is. Not legal advice and no document is generated: it makes sure no renewal or notice
// deadline passes unnoticed. Pure.
const DAY = 86400000;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
export const TYPES = [
  { id: 'customer', label: 'Customer agreement' }, { id: 'supplier', label: 'Supplier agreement' }, { id: 'employee', label: 'Employment or contractor' },
  { id: 'lease', label: 'Lease or rent' }, { id: 'loan', label: 'Loan or finance' }, { id: 'other', label: 'Other' },
];
export const LIMITS = { items: 200, soonDays: 60 };

export function sanitizeContract(raw, { id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const title = clean(raw.title, 100);
  if (!title) return { error: 'Give the agreement a title, for example "Office lease".' };
  const party = clean(raw.party, 80);
  if (!party) return { error: 'Who is it with?' };
  const startDate = day(raw.startDate), endDate = day(raw.endDate);
  if (startDate && endDate && Date.parse(endDate) < Date.parse(startDate)) return { error: 'The end date cannot be before the start.' };
  const nd = Number(raw.noticeDays);
  const link = String(raw.link ?? '').trim().slice(0, 300);
  if (link && !/^https?:\/\//i.test(link)) return { error: 'The document link must start with http:// or https://.' };
  const value = raw.value === '' || raw.value === null || raw.value === undefined ? null : Number(raw.value);
  return { contract: { id: clean(raw.id || id, 60), title, party, type: TYPES.some((t) => t.id === raw.type) ? raw.type : 'other', startDate, endDate, autoRenews: raw.autoRenews === true, noticeDays: Number.isFinite(nd) && nd >= 0 && nd <= 365 ? Math.round(nd) : 30, value: Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null, link, status: raw.status === 'ended' ? 'ended' : 'active', note: clean(raw.note, 300) } };
}

/** What needs a decision, most urgent first. A fixed term that has passed needs closing or renewing; an auto-renewing one needs a decision BEFORE the notice date. */
export function computeContracts({ items = [], now = Date.now() } = {}) {
  const today = new Date(now).setUTCHours(0, 0, 0, 0);
  const active = items.filter((c) => c && c.status !== 'ended');
  const attention = [];
  for (const c of active) {
    if (!c.endDate) continue;
    const end = Date.parse(`${c.endDate}T00:00:00Z`);
    const daysToEnd = Math.round((end - today) / DAY);
    const noticeBy = end - (Number(c.noticeDays) || 0) * DAY;
    const daysToNotice = Math.round((noticeBy - today) / DAY);
    let state = null;
    if (daysToEnd < 0 && !c.autoRenews) state = 'ended';
    else if (daysToEnd < 0 && c.autoRenews) state = 'renewed';
    else if (daysToNotice <= 0) state = 'notice_due';
    else if (daysToEnd <= LIMITS.soonDays) state = 'ending_soon';
    if (!state) continue;
    attention.push({ id: c.id, title: c.title, party: c.party, type: c.type, endDate: c.endDate, autoRenews: !!c.autoRenews, daysToEnd, noticeBy: new Date(noticeBy).toISOString().slice(0, 10), daysToNotice, state, link: c.link || '',
      message: state === 'ended' ? 'The term has passed. Renew it or mark it ended.'
        : state === 'renewed' ? 'It has renewed automatically. Check the new term, or mark it ended if you left.'
        : state === 'notice_due' ? (c.autoRenews ? `The notice date has passed: it renews on ${c.endDate} unless you act.` : `Decide now: renew or end it (it finishes ${c.endDate}, notice period ${c.noticeDays} days).`)
        : `Ends in ${daysToEnd} days. Notice by ${new Date(noticeBy).toISOString().slice(0, 10)}.` });
  }
  const rank = { ended: 0, renewed: 1, notice_due: 2, ending_soon: 3 };
  attention.sort((a, b) => rank[a.state] - rank[b.state] || a.daysToEnd - b.daysToEnd);
  return { active: active.length, attention, urgent: attention.filter((a) => a.state !== 'ending_soon') };
}
