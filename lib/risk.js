// lib/risk.js - what could hurt the business that revenue does not show. Only things the app can actually measure from the owner's
// own records; competition and regulation are judgement calls and are not pretended about. Each finding says what it means and
// what to do. Pure; with too little data it says nothing rather than something false.
const DAY = 86400000;
const toMs = (v) => { if (!v) return null; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const WON = new Set(['closed_won', 'won']);

export const TOP1_WATCH = 25; export const TOP1_HIGH = 40; export const MIN_WON_FOR_CONCENTRATION = 3;

/**
 * @param {{ deals?: object[], mrr?: number, supplierConcentrationPct?: number|null, pricePct?: number|null, whyRecorded?: number, capacity?: object|null, now?: number }} a
 *   deals: normalised deals (one per customer) { stage, value, closedAt, email, businessName, recurringMonthly? }
 */
export function computeRisks({ deals = [], mrr = 0, supplierConcentrationPct = null, pricePct = null, whyRecorded = 0, capacity = null, now = Date.now() } = {}) {
  const year = deals.filter((d) => d && WON.has(String(d.stage)) && num(d.value) > 0 && (toMs(d.closedAt) === null || now - toMs(d.closedAt) <= 365 * DAY));
  const total = year.reduce((a, d) => a + num(d.value), 0);
  const findings = [];
  let concentration = null;

  if (year.length >= MIN_WON_FOR_CONCENTRATION && total > 0) {
    const sorted = [...year].sort((a, b) => num(b.value) - num(a.value));
    const top1 = Math.round((num(sorted[0].value) / total) * 100);
    const top3 = Math.round((sorted.slice(0, 3).reduce((a, d) => a + num(d.value), 0) / total) * 100);
    concentration = { top1Pct: top1, top3Pct: top3, topName: sorted[0].businessName || sorted[0].email || 'Your largest customer', customers: year.length };
    if (top1 >= TOP1_HIGH) findings.push({ id: 'customer', level: 'high', title: `One customer is ${top1}% of your revenue`, detail: `${concentration.topName} brings ${top1}% of what you won in the last year. If they leave, so does a large part of the business. Win two or three more customers of that size before leaning on them further.` });
    else if (top1 >= TOP1_WATCH || top3 >= 70) findings.push({ id: 'customer', level: 'watch', title: top1 >= TOP1_WATCH ? `Your largest customer is ${top1}% of revenue` : `Your top 3 customers are ${top3}% of revenue`, detail: 'Not dangerous yet, but a single loss would hurt. Keep adding new customers so no one customer decides your month.' });
  }

  // How much of the monthly revenue repeats by itself (predictable) versus has to be won again.
  const oneOff90 = deals.filter((d) => d && WON.has(String(d.stage)) && !(num(d.recurringMonthly) > 0) && toMs(d.closedAt) !== null && now - toMs(d.closedAt) <= 90 * DAY).reduce((a, d) => a + num(d.value), 0);
  const oneOffMonthly = oneOff90 / 3;
  const base = num(mrr) + oneOffMonthly;
  const predictablePct = base > 0 ? Math.round((num(mrr) / base) * 100) : null;
  if (predictablePct !== null && base > 0 && predictablePct < 30 && year.length >= MIN_WON_FOR_CONCENTRATION) {
    findings.push({ id: 'predictable', level: 'watch', title: `Only ${predictablePct}% of your monthly revenue repeats by itself`, detail: 'Most of it has to be won again every month, so a slow month is a real month. Turn one-off work into a retainer or subscription where the customer would accept it: predictable revenue is easier to plan and to borrow against.' });
  }

  if (supplierConcentrationPct !== null && supplierConcentrationPct >= 60) findings.push({ id: 'supplier', level: supplierConcentrationPct >= 80 ? 'high' : 'watch', title: `One supplier is ${supplierConcentrationPct}% of what you spend on stock`, detail: 'If they raise prices or stop supplying, you have nothing to sell. Line up a second source for your best-selling items.' });
  if (pricePct !== null && whyRecorded >= 5 && pricePct >= 50) findings.push({ id: 'price', level: 'watch', title: `${pricePct}% of customers chose you on price`, detail: 'Anyone can undercut price. Find what makes you hard to replace (speed, a problem only you solve, a name people want) and sell that.' });
  if (capacity && capacity.set && (capacity.state === 'full' || capacity.state === 'over')) findings.push({ id: 'capacity', level: 'high', title: 'Delivery is full', detail: 'More sales now would damage the customers you already have. Raise price, add capacity, or pause outreach.' });

  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
  return { findings, concentration, predictablePct, enough: year.length >= MIN_WON_FOR_CONCENTRATION };
}
