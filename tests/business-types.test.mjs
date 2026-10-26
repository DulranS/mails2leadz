import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRisks } from '../lib/risk.js';
import { sanitizeAsset, sanitizeLoan, computeBalance } from '../lib/balance.js';
import { computeProfit } from '../lib/profit.js';
import { computeCashForecast } from '../lib/cashflow.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20, 9);
const START = Date.UTC(2026, 9, 20);
const iso = (n) => new Date(START + n * DAY).toISOString().slice(0, 10);
const won = (value, daysAgo, extra = {}) => ({ stage: 'closed_won', value, valueIsEstimate: false, email: `c${Math.random()}@x.com`, businessName: 'C', closedAt: new Date(NOW - daysAgo * DAY).toISOString(), ...extra });
const ids = (r) => r.findings.map((f) => f.id);

test('pricing to the bottom is caught: average sale down 15 percent or more, only with enough real sales', () => {
  const prior = [100, 120, 150].map((d) => won(1000, d));
  const high = computeRisks({ deals: [...[10, 20, 30].map((d) => won(700, d)), ...prior], now: NOW });
  assert.deepEqual([high.priceTrend.changePct, high.priceTrend.priorAvg, high.priceTrend.recentAvg], [-30, 1000, 700]);
  assert.equal(high.findings.find((f) => f.id === 'price_erosion').level, 'high');
  const watch = computeRisks({ deals: [...[10, 20, 30, 40].map((d) => won(800, d)), ...prior], now: NOW });
  const f = watch.findings.find((x) => x.id === 'price_erosion');
  assert.equal(f.level, 'watch');
  assert.match(f.detail, /winning more customers, but at lower prices/);
  assert.ok(!ids(computeRisks({ deals: [...[10, 20, 30].map((d) => won(950, d)), ...prior], now: NOW })).includes('price_erosion'));        // -5 percent is noise
  assert.equal(computeRisks({ deals: [...[10, 20].map((d) => won(100, d)), ...prior], now: NOW }).priceTrend, null);                       // two recent sales is not a trend
  assert.equal(computeRisks({ deals: [...[10, 20, 30].map((d) => won(100, d, { valueIsEstimate: true })), ...prior], now: NOW }).priceTrend, null); // estimated values never count
  assert.ok(!ids(computeRisks({ deals: [...[10, 20, 30].map((d) => won(1500, d)), ...prior], now: NOW })).includes('price_erosion'));       // a rising price is not a risk
});

test('debt risk: loan payments against what the business keeps each month', () => {
  const lv = (pay, gp) => computeRisks({ deals: [], debtService: { monthlyPayments: pay, grossProfitMonthly: gp }, now: NOW }).findings.find((f) => f.id === 'debt');
  assert.equal(lv(200, 1000), undefined);
  assert.equal(lv(300, 1000).level, 'watch');
  assert.equal(lv(600, 1000).level, 'high');
  assert.match(lv(600, 1000).title, /60%/);
  assert.equal(lv(500, 0).level, 'high');
  assert.match(lv(500, 0).title, /no gross profit/);
  assert.equal(lv(0, 1000), undefined);
  assert.equal(computeRisks({ deals: [], now: NOW }).findings.length, 0);
});

test('rent and lease income on assets, and money lent out as a loan book', () => {
  assert.match(sanitizeAsset({ name: 'Flat', cost: 5, method: 'manual', manualValue: 5, monthlyIncome: -5 }).error, /negative/);
  assert.equal(sanitizeAsset({ name: 'Flat', cost: 5, method: 'manual', manualValue: 5, monthlyIncome: '' }).asset.monthlyIncome, 0);
  assert.equal(sanitizeLoan({ name: 'L', balance: 1, ratePct: 1, monthlyPayment: 1, nextPaymentDate: '2026-11-01' }).loan.direction, 'borrowed');
  assert.equal(sanitizeLoan({ name: 'L', balance: 1, ratePct: 1, monthlyPayment: 1, nextPaymentDate: '2026-11-01', direction: 'lent' }).loan.direction, 'lent');
  const flat = sanitizeAsset({ name: 'Shop unit', cost: 90000, method: 'manual', manualValue: 100000, monthlyIncome: 500 }).asset;
  const lent = sanitizeLoan({ name: 'Loan to supplier', balance: 10000, ratePct: 12, monthlyPayment: 1000, nextPaymentDate: '2026-11-01', direction: 'lent' }).loan;
  const owed = sanitizeLoan({ name: 'Bank', balance: 5000, ratePct: 12, monthlyPayment: 500, nextPaymentDate: '2026-11-01' }).loan;
  const b = computeBalance({ assets: [flat], loans: [lent, owed], now: NOW });
  assert.equal(b.assets[0].yieldPct, 6);
  assert.deepEqual([b.totals.lent, b.totals.debt, b.totals.assets, b.totals.netWorth], [10000, 5000, 110000, 105000]);
  assert.deepEqual([b.totals.interestIncomeMonthly, b.totals.assetIncomeMonthly, b.totals.otherIncomeMonthly, b.totals.interestMonthly], [100, 500, 600, 50]);
  assert.deepEqual([b.totals.monthlyPayments, b.totals.monthlyReceipts], [500, 1000]);
  assert.deepEqual([b.loans.length, b.lentLoans.length], [1, 1]);
  assert.equal(b.warnings.length, 0);
});

test('income that is not a customer sale counts as revenue with no delivery cost', () => {
  const p = computeProfit({ deals: [], settings: { monthlyOverhead: 200 }, otherIncomeMonthly: 1000, now: NOW });
  assert.equal(p.ready, true);
  assert.deepEqual([p.revenue, p.otherIncome90, p.grossProfit, p.netProfit90], [3000, 3000, 3000, 2400]);
  assert.equal(computeProfit({ deals: [], settings: { monthlyOverhead: 200 }, now: NOW }).ready, false);   // nothing sold, nothing earned: still nothing to measure
  assert.equal(computeProfit({ deals: [], settings: {}, otherIncomeMonthly: 1000, now: NOW }).ready, false); // income but no cost figure at all stays hidden
});

test('the cash forecast brings in rent and repayments of money you lent, and still pays your own loans', () => {
  const lent = sanitizeLoan({ name: 'Loan out', balance: 3000, ratePct: 0, monthlyPayment: 1000, nextPaymentDate: iso(7), direction: 'lent' }).loan;
  const f = computeCashForecast({ cash: 1000, now: NOW, loans: [lent] });
  assert.equal(f.onTime.endCash, 4000);
  assert.equal(f.onTime.weeks[1].in, 1000);        // day 7: week 2
  assert.equal(f.late.weeks[3].in, 1000);          // the harsher case: two weeks later, day 21 is week 4
  assert.equal(f.late.endCash, 4000);
  const rent = computeCashForecast({ cash: 1000, now: NOW, incomeMonthly: 520 });
  assert.equal(rent.onTime.endCash, 2560);
  assert.ok(!rent.notes.some((n) => /No running costs or bills/.test(n)));
  const mixed = computeCashForecast({ cash: 0, now: NOW, loans: [lent, sanitizeLoan({ name: 'Bank', balance: 2000, ratePct: 0, monthlyPayment: 1000, nextPaymentDate: iso(7) }).loan] });
  assert.equal(mixed.onTime.endCash, 1000);        // +3000 received, -2000 paid
});
