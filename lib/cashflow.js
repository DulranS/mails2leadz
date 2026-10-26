// lib/cashflow.js - will the money be there on the day the bill is due? Profit is an opinion; cash in the bank on the due date is a fact.
// A 13 week forecast of cash in and out, shown as two bookends so nobody plans on the happy case:
//   "paid on time":   every unpaid invoice arrives on its due date (overdue ones within two weeks)
//   "late and short": invoices not yet due arrive 14 days late, and overdue ones never arrive
// Money out = what the business costs to run each month (spread over the weeks) plus the bills you enter (one-off or monthly: rent,
// suppliers, loan repayments). Pure; with no starting cash figure it says nothing rather than something false.
import { loanPaymentsBetween } from './balance.js';
const DAY = 86400000;
export const WEEKS = 13;
export const LATE_DAYS = 14;
const r0 = (n) => Math.round(n);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

export const BILL_LIMITS = { items: 120, name: 80 };

export function sanitizeBill(raw, { now = Date.now(), id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, BILL_LIMITS.name);
  if (!name) return { error: 'Say what the bill is for, for example "Rent" or "Supplier invoice".' };
  const amount = Number(raw.amount);
  if (raw.amount === '' || raw.amount === null || raw.amount === undefined || !Number.isFinite(amount) || amount <= 0) return { error: 'Enter the amount (more than 0).' };
  const dueDate = day(raw.dueDate);
  if (!dueDate) return { error: 'Pick the day it is due.' };
  // issuedAt (the bill date, optional) and paidAt (set when marked paid) let Business Value measure how long you take to pay suppliers.
  const issuedAt = day(raw.issuedAt);
  const paidAt = raw.status === 'paid' ? (day(raw.paidAt) || new Date(now).toISOString().slice(0, 10)) : null;
  return { bill: { id: clean(raw.id || id, 60), name, amount: Math.round(amount * 100) / 100, dueDate, issuedAt, paidAt, repeat: raw.repeat === 'monthly' ? 'monthly' : 'once', status: raw.status === 'paid' ? 'paid' : 'due' } };
}

const addMonths = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); const day0 = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day0, last)); return d.getTime(); };

/** Every payment date of a bill that falls inside the window (an unpaid one-off already past counts as due now). */
export function billDates(bill, start, end) {
  const out = [];
  if (!bill || bill.status === 'paid') return out;
  const due = Date.parse(`${bill.dueDate}T00:00:00Z`);
  if (bill.repeat === 'monthly') {
    for (let i = 0; i < 40; i++) { const t = addMonths(bill.dueDate, i); if (t >= end) break; if (t >= start) out.push(t); }
  } else if (due < end) out.push(Math.max(due, start));
  return out;
}

/**
 * @param {{ cash?: number|string|null, invoices?: Array<{amount:number,dueAt:number|null,state:string}>, bills?: object[], operatingMonthly?: number, now?: number }} a
 *   invoices: the open and overdue rows from computeBilling (dueAt in ms)
 */
export function computeCashForecast({ cash = null, invoices = [], bills = [], loans = [], incomeMonthly = 0, operatingMonthly = 0, now = Date.now() } = {}) {
  const c = Number(cash);
  if (cash === null || cash === '' || !Number.isFinite(c) || c < 0) return { set: false };
  const start = new Date(now).setUTCHours(0, 0, 0, 0);
  const end = start + WEEKS * 7 * DAY;
  const weekOf = (t) => Math.min(WEEKS - 1, Math.max(0, Math.floor((t - start) / (7 * DAY))));
  const runningWeekly = (Number(operatingMonthly) || 0) * 12 / 52;

  const out = Array.from({ length: WEEKS }, () => 0);
  for (const b of bills) for (const t of billDates(b, start, end)) out[weekOf(t)] += Number(b.amount) || 0;

  // Loan repayments (interest and principal) fall on their own dates from the loan's schedule. Enter loans on the Assets page, not as bills.
  for (const l of loans) if (l && l.direction !== 'lent') for (const pay of loanPaymentsBetween(l, start, end)) out[weekOf(pay.t)] += pay.amount;
  const incomeWeekly = (Number(incomeMonthly) || 0) * 12 / 52; // rent and lease income, spread evenly

  const live = invoices.filter((i) => i && (i.state === 'open' || i.state === 'overdue') && Number(i.amount) > 0);
  const inflow = (scenario) => {
    const arr = Array.from({ length: WEEKS }, () => 0);
    for (const i of live) {
      const due = Number(i.dueAt) || start;
      let t;
      if (i.state === 'overdue') { if (scenario === 'late') continue; t = start + 7 * DAY; } // overdue: within two weeks, or never
      else t = scenario === 'late' ? due + LATE_DAYS * DAY : due;
      if (t >= end) continue;
      arr[weekOf(Math.max(t, start))] += Number(i.amount);
    }
    // Money lent out comes back on its own dates (a month later in the harsher case); rent and lease income arrives week by week.
    for (const l of loans) if (l && l.direction === 'lent') for (const pay of loanPaymentsBetween(l, start - (scenario === 'late' ? LATE_DAYS * DAY : 0), end - (scenario === 'late' ? LATE_DAYS * DAY : 0))) {
      const t = pay.t + (scenario === 'late' ? LATE_DAYS * DAY : 0);
      if (t < end) arr[weekOf(Math.max(t, start))] += pay.amount;
    }
    for (let w = 0; w < WEEKS; w++) arr[w] += incomeWeekly;
    return arr;
  };

  const run = (scenario) => {
    const inn = inflow(scenario);
    let bal = c; let low = { week: 0, amount: c }; let shortfall = null;
    const weeks = inn.map((v, w) => {
      const o = out[w] + runningWeekly;
      const begin = bal; bal = bal + v - o;
      if (bal < low.amount) low = { week: w + 1, amount: bal };
      if (shortfall === null && bal < 0) shortfall = { week: w + 1, date: new Date(start + w * 7 * DAY).toISOString().slice(0, 10) };
      return { week: w + 1, from: new Date(start + w * 7 * DAY).toISOString().slice(0, 10), begin: r0(begin), in: r0(v), out: r0(o), end: r0(bal) };
    });
    return { weeks, lowest: { week: low.week, amount: r0(low.amount) }, shortfall, endCash: r0(bal) };
  };

  const onTime = run('ontime'); const late = run('late');
  // 'late and short' is always the harsher of the two, so "short" means even the happy case runs out of cash.
  const state = onTime.shortfall ? 'short' : late.shortfall ? 'tight' : late.lowest.amount < (Number(operatingMonthly) || 0) ? 'thin' : 'ok';
  const message = state === 'short' ? `Even if everyone pays on time you run out of cash in week ${onTime.shortfall.week} (from ${onTime.shortfall.date}). Bills fall due before the money arrives: chase invoices now, move bills later where you can, or hold back spending.`
    : state === 'tight' ? `If payments come late you run out of cash in week ${late.shortfall.week} (from ${late.shortfall.date}). Chase invoices before they are due and keep a cushion.`
    : state === 'thin' ? 'You stay above zero, but at the low point you have less than one month of running costs. A single late payment would hurt.'
    : 'You stay above zero for the next 13 weeks, even if payments come late.';
  const notes = ['Counts unpaid invoices, your running costs and the bills you entered. It does not count new sales, subscriptions not yet invoiced, stock sales, tax or what you pay yourself.'];
  if (live.length === 0) notes.push('No unpaid invoices, so nothing is expected in.');
  if ((Number(operatingMonthly) || 0) === 0 && bills.length === 0 && loans.length === 0 && !(Number(incomeMonthly) > 0)) notes.push('No running costs or bills entered, so nothing goes out yet. Add them for a real picture.');
  return { set: true, startCash: r0(c), state, message, onTime, late, notes, unpaidInvoices: live.length, unpaidAmount: r0(live.reduce((a, i) => a + Number(i.amount), 0)) };
}
