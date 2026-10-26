import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeReviewLink, reviewState, REVIEW_MIN_DAYS, REVIEW_MIN_NPS } from '../lib/customers.js';
import { supplierDays, computeCashCycle, MIN_SUPPLIER_BILLS } from '../lib/cash-cycle.js';
import { sanitizeBill } from '../lib/cashflow.js';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 20);
const ok = (o = {}) => reviewState({ activated: true, daysSinceWon: 30, health: 'healthy', openIssues: 0, overdue: false, askedAt: null, reviewed: false, nps: 9, hasLink: true, now: NOW, ...o });

test('the review link must be a full https link; empty clears it', () => {
  assert.equal(sanitizeReviewLink('https://g.page/r/abc').link, 'https://g.page/r/abc');
  assert.equal(sanitizeReviewLink('').link, '');
  assert.match(sanitizeReviewLink('http://example.com').error, /https/);
  assert.match(sanitizeReviewLink('g.page/abc').error, /https/);
});

test('a happy, settled customer with a link is eligible', () => {
  assert.equal(ok().eligible, true);
  assert.equal(ok({ nps: null }).eligible, true); // no score yet is not a reason to hold back
});

test('every reason a review ask is held back is said plainly', () => {
  assert.match(ok({ hasLink: false }).why, /review link/);
  assert.match(ok({ reviewed: true }).why, /already left/);
  assert.match(ok({ askedAt: NOW - 10 * DAY }).why, /Asked 10 days ago/);
  assert.match(ok({ activated: false }).why, /Not activated/);
  assert.match(ok({ daysSinceWon: REVIEW_MIN_DAYS - 1 }).why, /Too soon/);
  assert.match(ok({ health: 'at_risk' }).why, /risk/);
  assert.match(ok({ openIssues: 1 }).why, /open issue/);
  assert.match(ok({ overdue: true }).why, /overdue/);
  assert.match(ok({ nps: REVIEW_MIN_NPS - 1 }).why, /score is low/);
  assert.equal(ok({ nps: REVIEW_MIN_NPS - 1 }).eligible, false);
});

test('supplier days: average from bill date to payment, paid bills in the last 90 days only', () => {
  const b = (issuedAt, paidAt) => ({ status: 'paid', issuedAt, paidAt });
  const r = supplierDays([
    b('2026-09-01', '2026-09-21'), // 20 days
    b('2026-09-10', '2026-10-10'), // 30
    b('2026-08-01', '2026-08-31'), // 30
    b('2026-09-01', '2026-09-11'), // 10
  ], NOW);
  assert.equal(r.count, 4);
  assert.equal(r.avg, 23); // 22.5, rounded
});

test('supplier days ignores unpaid bills, bills with no bill date, paid-before-billed, and old payments', () => {
  const good = (d) => ({ status: 'paid', issuedAt: '2026-09-01', paidAt: `2026-09-${d}` });
  const r = supplierDays([
    good('10'), good('12'), good('15'),
    { status: 'due', issuedAt: '2026-09-01', paidAt: null },
    { status: 'paid', issuedAt: null, paidAt: '2026-09-15' },
    { status: 'paid', issuedAt: '2026-09-20', paidAt: '2026-09-10' },
    { status: 'paid', issuedAt: '2026-01-01', paidAt: '2026-01-30' },
  ], NOW);
  assert.equal(r.count, 3);
});

test('supplier days are withheld below the minimum number of bills', () => {
  const two = Array.from({ length: MIN_SUPPLIER_BILLS - 1 }, () => ({ status: 'paid', issuedAt: '2026-09-01', paidAt: '2026-09-20' }));
  assert.equal(supplierDays(two, NOW).avg, null);
});

test('the cash cycle subtracts supplier credit when it is known', () => {
  const c = computeCashCycle({ avgDaysToPay: 21, avgDaysToSell: 40, avgDaysToPaySuppliers: 10 });
  assert.equal(c.days, 51);
  assert.equal(c.supplierCredit, true);
  assert.match(c.note, /minus days you take to pay suppliers/);
});

test('a bill saved as paid is stamped with its paid date and keeps its bill date', () => {
  const r = sanitizeBill({ name: 'Supplier', amount: 100, dueDate: '2026-10-30', issuedAt: '2026-10-01', status: 'paid' }, { now: NOW });
  assert.equal(r.bill.issuedAt, '2026-10-01');
  assert.equal(r.bill.paidAt, '2026-10-20');
  const open = sanitizeBill({ name: 'Rent', amount: 100, dueDate: '2026-10-30' }, { now: NOW });
  assert.equal(open.bill.paidAt, null);
  assert.equal(open.bill.issuedAt, null);
});
