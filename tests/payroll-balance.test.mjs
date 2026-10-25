import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmployee, sanitizeInput, sanitizeRates, computePayslip, computePayroll, epfEtfDue, lastWorkingDay, monthlyEmployerCost, onPayroll, payrollCsv, DEFAULT_RATES } from '../lib/payroll.js';
import { sanitizeAsset, assetValue, sanitizeLoan, loanSchedule, computeBalance, addMonthsIso } from '../lib/balance.js';
import { sanitizeContract, computeContracts } from '../lib/contracts.js';
import { computeProfit } from '../lib/profit.js';
import { computeCashForecast } from '../lib/cashflow.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 9);
const START = Date.UTC(2026, 9, 20);
const iso = (n) => new Date(START + n * DAY).toISOString().slice(0, 10);
const emp = { id: 'e1', name: 'Nimal', basic: 100000, allowance: 10000, epf: true };

test('rates default to EPF 8 and 12, ETF 3, and junk falls back', () => {
  assert.deepEqual(sanitizeRates({}), DEFAULT_RATES);
  assert.equal(sanitizeRates({ epfEmployee: 'x', epfEmployer: 150, etfEmployer: -1, noPayDivisor: 5 }).epfEmployer, 12);
  assert.equal(sanitizeRates({ epfEmployer: 15 }).epfEmployer, 15);
  assert.equal(sanitizeRates({ noPayDivisor: 26 }).noPayDivisor, 26);
});

test('employee and monthly inputs are validated', () => {
  assert.match(sanitizeEmployee({ name: '', basic: 1 }).error, /name/);
  assert.match(sanitizeEmployee({ name: 'A', basic: '' }).error, /basic salary/);
  assert.match(sanitizeEmployee({ name: 'A', basic: 5, startDate: '2026-05-01', endDate: '2026-04-01' }).error, /last day/);
  const e = sanitizeEmployee({ name: ' Nimal  P ', basic: '85000.456', allowance: '', epf: false }).employee;
  assert.deepEqual([e.name, e.basic, e.allowance, e.epf, e.active], ['Nimal P', 85000.46, 0, false, true]);
  assert.match(sanitizeInput({ ym: '2026-13', empId: 'e' }).error, /month/);
  const i = sanitizeInput({ ym: '2026-09', empId: 'e1', absentDays: '2.5', commission: '100', deductions: -5 }).input;
  assert.deepEqual([i.absentDays, i.commission, i.deductions], [2.5, 100, 0]);
  assert.equal(sanitizeInput({ ym: '2026-09', empId: 'e1', absentDays: 99 }).input.absentDays, 31);
});

test('payslip: no-pay for absent days, EPF and ETF on total earnings, APIT as a manual deduction', () => {
  const p = computePayslip({ employee: emp, input: { absentDays: 2, commission: 5000, deductions: 3000 }, rates: DEFAULT_RATES });
  assert.equal(p.noPay, 6666.67);
  assert.equal(p.basicEarned, 93333.33);
  assert.equal(p.gross, 108333.33);
  assert.equal(p.epfEmployee, 8666.67);
  assert.equal(p.epfEmployer, 13000);
  assert.equal(p.etf, 3250);
  assert.equal(p.net, 96666.66);
  assert.equal(p.employerCost, 124583.33);
});

test('payslip edge cases: not on EPF, absent more than the month, negative net is flagged, custom rates', () => {
  assert.equal(computePayslip({ employee: { ...emp, epf: false }, input: {} }).epfEmployee, 0);
  assert.equal(computePayslip({ employee: { ...emp, epf: false }, input: {} }).employerCost, 110000);
  assert.equal(computePayslip({ employee: emp, input: { absentDays: 31 } }).basicEarned, 0);
  const neg = computePayslip({ employee: { ...emp, basic: 1000, allowance: 0 }, input: { deductions: 5000 } });
  assert.ok(neg.net < 0);
  assert.equal(neg.flags.length, 1);
  assert.equal(computePayslip({ employee: emp, input: {}, rates: { epfEmployee: 10 } }).epfEmployee, 11000);
});

test('EPF and ETF are due by the last working day of the FOLLOWING month', () => {
  assert.equal(epfEtfDue('2026-09'), '2026-10-30'); // 31 Oct 2026 is a Saturday
  assert.equal(epfEtfDue('2026-12'), '2027-01-29'); // 31 Jan 2027 is a Sunday
  assert.equal(lastWorkingDay(2026, 8), '2026-09-30'); // a Wednesday
  assert.equal(epfEtfDue('nope'), null);
});

test('payroll for a month: who is on it, totals, remittance, CSV', () => {
  const people = [emp, { id: 'e2', name: 'Kamal', basic: 50000, allowance: 0, epf: true, startDate: '2026-10-15' }, { id: 'e3', name: 'Left', basic: 40000, allowance: 0, epf: true, endDate: '2026-09-10' }, { id: 'e4', name: 'Off', basic: 1, active: false }];
  assert.equal(onPayroll(people[1], '2026-09'), false);
  assert.equal(onPayroll(people[2], '2026-09'), true);
  assert.equal(onPayroll(people[2], '2026-10'), false);
  const p = computePayroll({ employees: people, inputs: [{ ym: '2026-09', empId: 'e1', absentDays: 0, commission: 0, additions: 0, deductions: 0 }], ym: '2026-09' });
  assert.deepEqual(p.rows.map((r) => r.name), ['Nimal', 'Left']);
  assert.equal(p.totals.gross, 150000);
  assert.equal(p.totals.epfRemit, 30000); // 8 + 12 percent
  assert.equal(p.totals.etf, 4500);
  assert.equal(p.totals.employerCost, 172500);
  assert.equal(p.due, '2026-10-30');
  const csv = payrollCsv(p).split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[0], /^Employee,Role,Basic/);
  assert.match(csv[3], /^"Total"/);
});

test('regular monthly cost of the team includes employer EPF and ETF', () => {
  assert.equal(monthlyEmployerCost([emp], DEFAULT_RATES, '2026-10'), 126500);
  assert.equal(monthlyEmployerCost([{ ...emp, epf: false }], DEFAULT_RATES, '2026-10'), 110000);
  assert.equal(monthlyEmployerCost([], DEFAULT_RATES, '2026-10'), 0);
});

test('assets: straight line, appreciating, manual, sold', () => {
  assert.match(sanitizeAsset({ name: '', cost: 1 }).error, /Name/);
  assert.match(sanitizeAsset({ name: 'x', cost: 1, method: 'straight_line', lifeYears: 0 }).error, /useful life/);
  assert.match(sanitizeAsset({ name: 'x', cost: 1, method: 'manual' }).error, /current value/);
  const acq = '2024-10-20';
  const at = Date.parse(acq) + 2 * 365.25 * DAY;
  const sl = sanitizeAsset({ name: 'Van', cost: 100000, method: 'straight_line', lifeYears: 5, salvage: 10000, acquiredAt: acq }).asset;
  assert.equal(Math.round(assetValue(sl, at)), 64000);
  assert.equal(Math.round(assetValue(sl, at + 10 * 365.25 * DAY)), 10000); // never below salvage
  const ap = sanitizeAsset({ name: 'Land', cost: 100000, method: 'appreciating', ratePct: 10, acquiredAt: acq }).asset;
  assert.equal(Math.round(assetValue(ap, at)), 121000);
  const man = sanitizeAsset({ name: 'Stock', cost: 5, method: 'manual', manualValue: 777 }).asset;
  assert.equal(assetValue(man, at), 777);
  assert.equal(assetValue({ ...sl, sold: true }, at), 0);
});

test('loans: interest, payoff date, and a payment that never pays it off', () => {
  assert.match(sanitizeLoan({ name: 'L', balance: 5, ratePct: 5, monthlyPayment: 0, nextPaymentDate: '2026-11-01' }).error, /monthly payment/);
  assert.match(sanitizeLoan({ name: 'L', balance: 5, ratePct: 5, monthlyPayment: 1 }).error, /next payment/);
  const free = sanitizeLoan({ name: 'Friend', balance: 1200, ratePct: 0, monthlyPayment: 400, nextPaymentDate: '2026-11-01' }).loan;
  const s0 = loanSchedule(free);
  assert.deepEqual([s0.monthsLeft, s0.totalInterest, s0.payoffDate], [3, 0, '2027-01-01']);
  const bank = sanitizeLoan({ name: 'Bank', balance: 1000, ratePct: 12, monthlyPayment: 100, nextPaymentDate: '2026-11-15' }).loan;
  const s1 = loanSchedule(bank);
  assert.ok(s1.monthsLeft > 10 && s1.monthsLeft < 12);
  assert.ok(s1.totalInterest > 0);
  assert.equal(s1.payments[0].interest, 10);
  const sum = s1.payments.reduce((a, p) => a + p.principal, 0);
  assert.ok(Math.abs(sum - 1000) < 0.5);
  const never = loanSchedule({ ...bank, balance: 100000, monthlyPayment: 900 });
  assert.equal(never.neverPaysOff, true);
  assert.equal(never.monthsLeft, null);
  assert.equal(loanSchedule({ ...bank, closed: true }).monthsLeft, 0);
  assert.equal(addMonthsIso('2026-01-31', 1), '2026-02-28');
});

test('balance: assets minus debt, with cash, money owed and stock from the rest of the app', () => {
  const van = sanitizeAsset({ name: 'Van', cost: 100000, method: 'manual', manualValue: 64000 }).asset;
  const loan = sanitizeLoan({ name: 'Bank', balance: 30000, ratePct: 12, monthlyPayment: 5000, nextPaymentDate: '2026-11-01' }).loan;
  const b = computeBalance({ assets: [van], loans: [loan], cash: 10000, owedToYou: 5000, stockAtCost: 20000, now: NOW });
  assert.equal(b.totals.assets, 99000);
  assert.equal(b.totals.debt, 30000);
  assert.equal(b.totals.netWorth, 69000);
  assert.equal(b.totals.depreciation, -36000);
  assert.equal(b.totals.interestMonthly, 300);
  assert.equal(b.debtToAssetsPct, 30);
  const bad = computeBalance({ loans: [{ ...loan, balance: 100000, monthlyPayment: 900 }], now: NOW });
  assert.equal(bad.warnings.length, 1);
  assert.equal(computeBalance({ now: NOW }).totals.cash, null);
});

test('contracts: what needs a decision, most urgent first', () => {
  const mk = (o) => sanitizeContract({ title: 'T', party: 'P', ...o }).contract;
  assert.match(sanitizeContract({ title: '', party: 'P' }).error, /title/);
  assert.match(sanitizeContract({ title: 'T', party: '' }).error, /with/);
  assert.match(sanitizeContract({ title: 'T', party: 'P', link: 'ftp://x' }).error, /http/);
  assert.match(sanitizeContract({ title: 'T', party: 'P', startDate: '2026-05-01', endDate: '2026-01-01' }).error, /before the start/);
  const items = [
    { ...mk({ endDate: '2026-12-01', noticeDays: 7 }), id: 'soon' },
    { ...mk({ endDate: '2026-10-25', noticeDays: 30 }), id: 'notice' },
    { ...mk({ endDate: '2026-10-01' }), id: 'ended' },
    { ...mk({ endDate: '2026-10-01', autoRenews: true }), id: 'renewed' },
    { ...mk({ endDate: '2027-06-01' }), id: 'far' },
    { ...mk({}), id: 'open' },
    { ...mk({ endDate: '2026-10-01', status: 'ended' }), id: 'done' },
  ];
  const c = computeContracts({ items, now: NOW });
  assert.deepEqual(c.attention.map((a) => `${a.id}:${a.state}`), ['ended:ended', 'renewed:renewed', 'notice:notice_due', 'soon:ending_soon']);
  assert.equal(c.urgent.length, 3);
  assert.equal(c.active, 6);
});

test('profit includes the team and loan interest in running costs; the cash forecast pays loans on their dates', () => {
  const p = computeProfit({ deals: [], settings: { monthlyCost: 100, monthlyOverhead: 200 }, payrollMonthly: 1000, loanInterestMonthly: 50, now: NOW });
  assert.equal(p.operatingMonthly, 1350);
  assert.equal(p.payrollMonthly, 1000);
  assert.equal(p.loanInterestMonthly, 50);
  const loan = sanitizeLoan({ name: 'L', balance: 3000, ratePct: 0, monthlyPayment: 1000, nextPaymentDate: iso(7) }).loan;
  const f = computeCashForecast({ cash: 5000, now: NOW, loans: [loan], operatingMonthly: 0 });
  assert.equal(f.onTime.endCash, 2000);
  assert.equal(f.onTime.weeks[1].out, 1000);
  assert.ok(!f.notes.some((n) => /No running costs or bills/.test(n)));
});

import { epfReminder, prevYm } from '../lib/payroll.js';
import { buildNextActions } from '../lib/next-actions.js';

test('EPF reminder: only for last month, only when due within 10 days or late, never once paid', () => {
  assert.equal(prevYm(Date.UTC(2026, 9, 20)), '2026-09');
  assert.equal(prevYm(Date.UTC(2026, 0, 5)), '2025-12');
  const people = [emp];
  // 20 Oct: September's payment is due 30 Oct, 10 days away
  const augPaid = ['2026-08']; // August was settled; the check also looks one month further back
  const r = epfReminder({ employees: people, paidMonths: augPaid, now: Date.UTC(2026, 9, 20) });
  assert.deepEqual([r.ym, r.due, r.daysLeft, r.overdue], ['2026-09', '2026-10-30', 10, false]);
  assert.equal(r.amount, 110000 * 0.23);
  assert.equal(epfReminder({ employees: people, paidMonths: augPaid, now: Date.UTC(2026, 9, 15) }), null);         // 15 days away: too early to nag
  assert.equal(epfReminder({ employees: people, paidMonths: ['2026-08', '2026-09'], now: Date.UTC(2026, 9, 28) }), null);
  assert.equal(epfReminder({ employees: [], now: Date.UTC(2026, 9, 28) }), null);
  // a new month starts: September was due 30 Oct and is not marked paid, so it keeps showing, as late
  const stillLate = epfReminder({ employees: people, now: Date.UTC(2026, 10, 3) });
  assert.deepEqual([stillLate.ym, stillLate.overdue], ['2026-09', true]);
  // once September is marked paid, October is not due for weeks, so nothing nags
  assert.equal(epfReminder({ employees: people, paidMonths: ['2026-09'], now: Date.UTC(2026, 10, 3) }), null);
  assert.equal(epfReminder({ employees: people, paidMonths: ['2026-09'], now: Date.UTC(2026, 10, 25) }).ym, '2026-10');
  const late = epfReminder({ employees: people, paidMonths: augPaid, now: Date.UTC(2026, 9, 31, 12) });
  assert.equal(late.overdue, true);
  // an older unpaid month is shown before a newer one: the most overdue comes first
  assert.equal(epfReminder({ employees: people, now: Date.UTC(2026, 9, 20) }).ym, '2026-08');
});

test('do this next: late statutory payments and agreements needing a decision are said, calm ones stay quiet', () => {
  const metrics = { settings: { currency: 'LKR', avgDealValue: 1000, probabilities: {} }, present: { openCount: 0, inboundWaiting: [], staleCount: 0, staleValue: 0 }, deals: [], past: { wonByMonth: [{ revenue: 0 }], winBack: { count: 0, value: 0 } }, future: { horizons: [{ expected: 0 }] } };
  const get = (extra, id) => buildNextActions({ metrics, ...extra }).find((a) => a.id === id);
  assert.equal(get({}, 'epf_due'), undefined);
  const late = get({ epf: { ym: '2026-09', due: '2026-10-30', overdue: true, amount: 25300, epfRemit: 22000, etf: 3300, people: 2 } }, 'epf_due');
  assert.equal(late.tone, 'warn');
  assert.match(late.title, /late/);
  assert.equal(late.href, '/payroll');
  assert.equal(get({ epf: { ym: '2026-09', due: '2026-10-30', overdue: false, amount: 1, epfRemit: 1, etf: 0, people: 1 } }, 'epf_due').tone, 'info');
  assert.equal(get({ contracts: { urgent: [] } }, 'contract_attention'), undefined);
  const c = get({ contracts: { urgent: [{ state: 'notice_due', title: 'Lease', party: 'Landlord', message: 'Decide now.' }, { state: 'ended', title: 'x', party: 'y', message: 'z' }] } }, 'contract_attention');
  assert.equal(c.tone, 'warn');
  assert.match(c.detail, /2 agreements need a decision/);
  assert.equal(c.href, '/contracts');
});
