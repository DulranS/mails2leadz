// lib/balance.js - what the business OWNS and OWES. Assets that lose value (equipment, vehicles) or gain it (property, stock held for
// appreciation), loans with their real interest and payoff, and one snapshot: assets minus liabilities. Pure. The owner enters the
// facts (cost, rate, balance); the app does the arithmetic and never guesses a value.
const DAY = 86400000;
const YEAR = 365.25 * DAY;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const r0 = (n) => Math.round(n);
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
export const LIMITS = { assets: 100, loans: 30 };
export const ASSET_METHODS = [
  { id: 'straight_line', label: 'Loses value evenly over its useful life (equipment, vehicles, computers)' },
  { id: 'appreciating', label: 'Gains value each year (property, land, rare items)' },
  { id: 'manual', label: 'I will enter its current value myself' },
];

export function addMonthsIso(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`); const d0 = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  d.setUTCDate(Math.min(d0, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d.toISOString().slice(0, 10);
}

export function sanitizeAsset(raw, { id = '', now = Date.now() } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, 80);
  if (!name) return { error: 'Name the asset.' };
  const cost = num(raw.cost);
  if (cost === null || cost < 0) return { error: 'Enter what it cost (0 or more).' };
  const method = ASSET_METHODS.some((m) => m.id === raw.method) ? raw.method : 'straight_line';
  const acquiredAt = day(raw.acquiredAt) || new Date(now).toISOString().slice(0, 10);
  const a = { id: clean(raw.id || id, 60), name, cost: r2(cost), acquiredAt, method, lifeYears: 5, salvage: 0, ratePct: 0, manualValue: null, sold: raw.sold === true, note: clean(raw.note, 200) };
  if (method === 'straight_line') {
    const life = num(raw.lifeYears);
    if (life === null || life <= 0 || life > 100) return { error: 'Enter its useful life in years (more than 0).' };
    a.lifeYears = life; a.salvage = Math.min(a.cost, Math.max(0, r2(num(raw.salvage) ?? 0)));
  } else if (method === 'appreciating') {
    const rate = num(raw.ratePct);
    if (rate === null || rate < 0 || rate > 100) return { error: 'Enter the yearly gain as a percent (0 to 100).' };
    a.ratePct = rate;
  } else {
    const v = num(raw.manualValue);
    if (v === null || v < 0) return { error: 'Enter its current value.' };
    a.manualValue = r2(v);
  }
  return { asset: a };
}

/** What an asset is worth today by the owner's own method. */
export function assetValue(a, now = Date.now()) {
  if (!a || a.sold) return 0;
  const years = Math.max(0, (now - Date.parse(a.acquiredAt)) / YEAR);
  if (a.method === 'manual') return Number(a.manualValue) || 0;
  if (a.method === 'appreciating') return Number(a.cost) * Math.pow(1 + (Number(a.ratePct) || 0) / 100, years);
  const life = Number(a.lifeYears) || 5, salvage = Number(a.salvage) || 0;
  return Number(a.cost) - (Number(a.cost) - salvage) * Math.min(1, years / life);
}

export function sanitizeLoan(raw, { id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, 80);
  if (!name) return { error: 'Name the loan, for example "Bank loan" or "Equipment lease".' };
  const balance = num(raw.balance), rate = num(raw.ratePct), pay = num(raw.monthlyPayment);
  if (balance === null || balance < 0) return { error: 'Enter what you still owe (0 or more).' };
  if (rate === null || rate < 0 || rate > 200) return { error: 'Enter the yearly interest rate as a percent.' };
  if (pay === null || pay <= 0) return { error: 'Enter the monthly payment (more than 0).' };
  const nextPaymentDate = day(raw.nextPaymentDate);
  if (!nextPaymentDate) return { error: 'Pick the date of the next payment.' };
  return { loan: { id: clean(raw.id || id, 60), name, lender: clean(raw.lender, 80), balance: r2(balance), ratePct: rate, monthlyPayment: r2(pay), nextPaymentDate, balanceAsOf: day(raw.balanceAsOf) || new Date().toISOString().slice(0, 10), closed: raw.closed === true, note: clean(raw.note, 200) } };
}

/** Month by month from the balance you entered: interest, principal, payoff. A payment that does not cover the interest never pays off. */
export function loanSchedule(loan) {
  if (!loan || loan.closed || !(Number(loan.balance) > 0)) return { payments: [], monthsLeft: 0, totalInterest: 0, payoffDate: null, neverPaysOff: false, interestNextMonth: 0 };
  let bal = Number(loan.balance); const r = (Number(loan.ratePct) || 0) / 12 / 100; const pay = Number(loan.monthlyPayment) || 0;
  const payments = []; let totalInterest = 0;
  if (pay <= bal * r + 0.005) return { payments: [], monthsLeft: null, totalInterest: null, payoffDate: null, neverPaysOff: true, interestNextMonth: r2(bal * r) };
  for (let i = 0; i < 600 && bal > 0.005; i++) {
    const interest = bal * r; const amount = Math.min(pay, bal + interest);
    payments.push({ date: addMonthsIso(loan.nextPaymentDate, i), amount: r2(amount), interest: r2(interest), principal: r2(amount - interest) });
    totalInterest += interest; bal = bal + interest - amount;
  }
  return { payments, monthsLeft: payments.length, totalInterest: r0(totalInterest), payoffDate: payments.length ? payments[payments.length - 1].date : null, neverPaysOff: false, interestNextMonth: payments[0] ? payments[0].interest : 0 };
}

/** Loan payments that fall inside [start, end) as { t, amount }, for the cash forecast. */
export function loanPaymentsBetween(loan, start, end) {
  return loanSchedule(loan).payments.map((p) => ({ t: Date.parse(`${p.date}T00:00:00Z`), amount: p.amount })).filter((p) => p.t < end).map((p) => ({ ...p, t: Math.max(p.t, start) }));
}

/** @param {{ assets?: object[], loans?: object[], cash?: number|null, owedToYou?: number, stockAtCost?: number, now?: number }} a */
export function computeBalance({ assets = [], loans = [], cash = null, owedToYou = 0, stockAtCost = 0, now = Date.now() } = {}) {
  const live = assets.filter((a) => a && !a.sold);
  const rows = live.map((a) => { const v = assetValue(a, now); return { id: a.id, name: a.name, cost: Number(a.cost) || 0, value: r0(v), change: r0(v - (Number(a.cost) || 0)), method: a.method }; });
  const fixed = rows.reduce((a, r) => a + r.value, 0);
  const owing = loans.filter((l) => l && !l.closed);
  const sched = owing.map((l) => ({ l, s: loanSchedule(l) }));
  const debt = r0(owing.reduce((a, l) => a + (Number(l.balance) || 0), 0));
  const cashN = Number.isFinite(Number(cash)) && cash !== null && cash !== '' ? Number(cash) : null;
  const assetsTotal = fixed + (cashN || 0) + (Number(owedToYou) || 0) + (Number(stockAtCost) || 0);
  const interestMonthly = r0(sched.reduce((a, x) => a + (x.s.interestNextMonth || 0), 0));
  const monthlyPayments = r0(owing.reduce((a, l) => a + (Number(l.monthlyPayment) || 0), 0));
  const dep = rows.filter((r) => r.change < 0).reduce((a, r) => a + r.change, 0);
  const app = rows.filter((r) => r.change > 0).reduce((a, r) => a + r.change, 0);
  const warnings = [];
  for (const x of sched) if (x.s.neverPaysOff) warnings.push(`${x.l.name}: the monthly payment does not even cover the interest, so the loan never shrinks. Pay more or renegotiate.`);
  return {
    assets: rows, loans: sched.map(({ l, s }) => ({ id: l.id, name: l.name, balance: r0(l.balance), monthlyPayment: l.monthlyPayment, ratePct: l.ratePct, monthsLeft: s.monthsLeft, totalInterest: s.totalInterest, payoffDate: s.payoffDate, neverPaysOff: s.neverPaysOff, interestNextMonth: s.interestNextMonth })),
    totals: { fixedAssets: r0(fixed), cash: cashN === null ? null : r0(cashN), receivables: r0(Number(owedToYou) || 0), stock: r0(Number(stockAtCost) || 0), assets: r0(assetsTotal), debt, netWorth: r0(assetsTotal - debt), interestMonthly, monthlyPayments, depreciation: r0(dep), appreciation: r0(app) },
    debtToAssetsPct: assetsTotal > 0 ? r0((debt / assetsTotal) * 100) : null,
    warnings,
  };
}
