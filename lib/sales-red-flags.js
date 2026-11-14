// lib/sales-red-flags.js - early warnings from the sales numbers: won value falling, and too much money owed for too long. Pure.
const DAY = 86400000;

export function salesRedFlags({ deals = [], invoices = [], now = Date.now() } = {}) {
  const flags = [];
  const wonBetween = (fromDaysAgo, toDaysAgo) => deals
    .filter((d) => d && d.stage === 'closed_won')
    .filter((d) => { const t = Date.parse(d.stageTimes?.closed_won || d.closedAt || '') || 0; return t >= now - fromDaysAgo * DAY && t < now - toDaysAgo * DAY; })
    .reduce((a, d) => a + (Number(d.value) || 0), 0);
  const recent = wonBetween(90, 0), prior = wonBetween(180, 90);
  if (prior > 0 && recent < prior * 0.8) flags.push({ id: 'wonFalling', text: 'Won value fell more than 20% against the previous 90 days.' });
  const billed = (Array.isArray(invoices) ? invoices : []).filter((i) => i && i.status !== 'draft');
  const total = billed.reduce((a, i) => a + (Number(i.total || i.amount) || 0), 0);
  const overdue = billed.filter((i) => i.status !== 'paid' && (now - (Date.parse(i.dueDate || i.issuedAt || i.createdAt || '') || now)) > 30 * DAY)
    .reduce((a, i) => a + (Number(i.total || i.amount) || 0), 0);
  if (total > 0 && overdue / total > 0.25) flags.push({ id: 'overdueShare', text: 'More than a quarter of what you have billed is over 30 days unpaid.' });
  return flags;
}
