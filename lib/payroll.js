// lib/payroll.js - employees, attendance and a monthly payroll with the Sri Lankan EPF and ETF contributions. Pure functions.
// Rates are SETTINGS, not hard-coded rules: defaults are EPF 8% (employee) + 12% (employer) and ETF 3% (employer only), all on total
// monthly earnings, remitted by the last working day of the following month. These change by law, so check them yourself.
// NOT calculated: APIT (income tax withheld). Enter it as a deduction by hand. What counts as "total earnings" for EPF can depend on
// the payment, so the base here is all earnings for the month; have an accountant confirm it for your case.
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const r2 = (n) => Math.round(n * 100) / 100;
const money = (v, max = 1e9) => { if (v === '' || v === null || v === undefined) return 0; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(max, r2(n)) : 0; };
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };

export const DEFAULT_RATES = { epfEmployee: 8, epfEmployer: 12, etfEmployer: 3, noPayDivisor: 30 };
export const LIMITS = { employees: 100 };
export const validYm = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
export const ymOf = (d = new Date()) => new Date(d).toISOString().slice(0, 7);

export function sanitizeRates(raw) {
  const p = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : d; };
  return {
    epfEmployee: p(raw?.epfEmployee, DEFAULT_RATES.epfEmployee, 0, 100),
    epfEmployer: p(raw?.epfEmployer, DEFAULT_RATES.epfEmployer, 0, 100),
    etfEmployer: p(raw?.etfEmployer, DEFAULT_RATES.etfEmployer, 0, 100),
    noPayDivisor: p(raw?.noPayDivisor, DEFAULT_RATES.noPayDivisor, 20, 31),
  };
}

export function sanitizeEmployee(raw, { id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, 80);
  if (!name) return { error: 'Enter the employee name.' };
  if (raw.basic === '' || raw.basic === null || raw.basic === undefined || !(Number(raw.basic) >= 0) || !Number.isFinite(Number(raw.basic))) return { error: 'Enter the monthly basic salary (0 or more).' };
  const startDate = day(raw.startDate), endDate = day(raw.endDate);
  if (startDate && endDate && Date.parse(endDate) < Date.parse(startDate)) return { error: 'The last day cannot be before the first day.' };
  return { employee: { id: clean(raw.id || id, 60), name, role: clean(raw.role, 60), basic: money(raw.basic), allowance: money(raw.allowance), epf: raw.epf !== false, startDate, endDate, active: raw.active !== false, note: clean(raw.note, 200) } };
}

export function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object' || !validYm(raw.ym) || !raw.empId) return { error: 'Choose a month and an employee.' };
  const d = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(31, Math.round(n * 2) / 2) : 0; }; // half days allowed
  return { input: { ym: raw.ym, empId: clean(raw.empId, 60), absentDays: d(raw.absentDays), leaveDays: d(raw.leaveDays), commission: money(raw.commission), additions: money(raw.additions), deductions: money(raw.deductions), note: clean(raw.note, 120) } };
}

const monthBounds = (ym) => { const [y, m] = ym.split('-').map(Number); return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 0, 23, 59, 59) }; };
export function onPayroll(emp, ym) {
  if (!emp || emp.active === false || !validYm(ym)) return false;
  const { start, end } = monthBounds(ym);
  if (emp.startDate && Date.parse(emp.startDate) > end) return false;
  if (emp.endDate && Date.parse(emp.endDate) < start) return false;
  return true;
}

/** One payslip. No-pay: basic divided by the divisor (default 30) for each unpaid absent day, never more than the basic. */
export function computePayslip({ employee, input = {}, rates = DEFAULT_RATES }) {
  const R = sanitizeRates(rates);
  const basic = Number(employee.basic) || 0;
  const absent = Math.max(0, Number(input.absentDays) || 0);
  const noPay = Math.min(basic, r2((basic / R.noPayDivisor) * absent));
  const basicEarned = r2(basic - noPay);
  const allowance = Number(employee.allowance) || 0;
  const commission = Number(input.commission) || 0;
  const additions = Number(input.additions) || 0;
  const gross = r2(basicEarned + allowance + commission + additions);
  const epfBase = employee.epf === false ? 0 : gross;
  const epfEmployee = r2(epfBase * R.epfEmployee / 100);
  const epfEmployer = r2(epfBase * R.epfEmployer / 100);
  const etf = r2(epfBase * R.etfEmployer / 100);
  const otherDeductions = Number(input.deductions) || 0;
  const net = r2(gross - epfEmployee - otherDeductions);
  return { empId: employee.id, name: employee.name, role: employee.role || '', basic, noPay, basicEarned, allowance, commission, additions, gross, epfBase, epfEmployee, epfEmployer, etf, otherDeductions, net, employerCost: r2(gross + epfEmployer + etf), absentDays: absent, leaveDays: Number(input.leaveDays) || 0, flags: net < 0 ? ['Net pay is negative: the deductions are larger than the pay.'] : [] };
}

/** Last Monday to Friday of a month (public holidays are not known to the app). */
export function lastWorkingDay(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** EPF and ETF for a month are due by the last working day of the FOLLOWING month. */
export function epfEtfDue(ym) {
  if (!validYm(ym)) return null;
  const [y, m] = ym.split('-').map(Number);
  return lastWorkingDay(m === 12 ? y + 1 : y, m === 12 ? 0 : m); // m is 1-based, so index m is the following month
}

export function computePayroll({ employees = [], inputs = [], rates = DEFAULT_RATES, ym }) {
  if (!validYm(ym)) return { ym, rows: [], totals: null, due: null };
  const byEmp = new Map(inputs.filter((i) => i && i.ym === ym).map((i) => [i.empId, i]));
  const rows = employees.filter((e) => onPayroll(e, ym)).map((e) => computePayslip({ employee: e, input: byEmp.get(e.id) || {}, rates }));
  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  return {
    ym, rows,
    totals: { gross: sum('gross'), epfEmployee: sum('epfEmployee'), epfEmployer: sum('epfEmployer'), epfRemit: r2(sum('epfEmployee') + sum('epfEmployer')), etf: sum('etf'), otherDeductions: sum('otherDeductions'), net: sum('net'), employerCost: sum('employerCost'), people: rows.length },
    due: epfEtfDue(ym),
  };
}

/** The regular monthly cost of the team (basic plus allowances plus the employer EPF and ETF), for profit and cash forecasts. Commission varies, so it is not in here. */
export function monthlyEmployerCost(employees = [], rates = DEFAULT_RATES, ym = ymOf()) {
  const R = sanitizeRates(rates);
  return r2(employees.filter((e) => onPayroll(e, ym)).reduce((a, e) => { const pay = (Number(e.basic) || 0) + (Number(e.allowance) || 0); return a + pay + (e.epf === false ? 0 : pay * (R.epfEmployer + R.etfEmployer) / 100); }, 0));
}

const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export function payrollCsv(p) {
  const head = ['Employee', 'Role', 'Basic', 'No pay', 'Allowance', 'Commission', 'Other additions', 'Gross', 'EPF employee', 'Other deductions', 'Net pay', 'EPF employer', 'ETF employer', 'Employer cost'];
  const lines = [head.join(',')];
  for (const r of p.rows) lines.push([q(r.name), q(r.role), r.basic, r.noPay, r.allowance, r.commission, r.additions, r.gross, r.epfEmployee, r.otherDeductions, r.net, r.epfEmployer, r.etf, r.employerCost].join(','));
  if (p.totals) lines.push([q('Total'), '', '', '', '', '', '', p.totals.gross, p.totals.epfEmployee, p.totals.otherDeductions, p.totals.net, p.totals.epfEmployer, p.totals.etf, p.totals.employerCost].join(','));
  return lines.join('\n');
}

const DAY = 86400000;
export const prevYm = (now = Date.now()) => { const d = new Date(now); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

/**
 * Is an EPF and ETF payment coming due (within 10 days) or late, and not yet marked paid? Looks at last month AND the month before, so a
 * late payment keeps showing until it is marked paid instead of vanishing when the next month starts. Null when there is nothing to remind.
 * The amount is from the payroll as entered; it is "about" until the month's commission and deductions are in.
 */
export function epfReminder({ employees = [], inputs = [], rates = DEFAULT_RATES, paidMonths = [], now = Date.now() } = {}) {
  const today = new Date(now).setUTCHours(0, 0, 0, 0);
  const prev = prevYm(now);
  const months = [prev, prevYm(Date.parse(`${prev}-15T00:00:00Z`))];
  const hits = [];
  for (const ym of months) {
    if (paidMonths.includes(ym)) continue;
    const p = computePayroll({ employees, inputs, rates, ym });
    if (!p.totals || p.totals.people === 0) continue;
    const daysLeft = Math.round((Date.parse(`${p.due}T00:00:00Z`) - today) / DAY);
    if (daysLeft > 10) continue;
    hits.push({ ym, due: p.due, daysLeft, overdue: daysLeft < 0, amount: r2(p.totals.epfRemit + p.totals.etf), epfRemit: p.totals.epfRemit, etf: p.totals.etf, people: p.totals.people });
  }
  return hits.sort((a, b) => a.daysLeft - b.daysLeft)[0] || null;
}
