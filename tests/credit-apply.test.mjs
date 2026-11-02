// Held credit on the next invoice: which credit is used, the arithmetic, and that the bill and the credit are each counted once.
import assert from 'node:assert/strict';
import { planCreditApplication, applyToBuild, remainingCredit, originalTotal, originalNet, originalTax } from '../lib/credit-apply.js';
import { buildStatement } from '../lib/statement.js';
import { ledgerCsv } from '../lib/accounting-export.js';

const held = [
  { id: 'c2', number: 'CN-2', amount: 50, appliedAmount: 0, status: 'credit_held', issuedAt: '2026-03-01T00:00:00Z' },
  { id: 'c1', number: 'CN-1', amount: 30, appliedAmount: 0, status: 'credit_held', issuedAt: '2026-01-01T00:00:00Z' },
  { id: 'c3', number: 'CN-3', amount: 99, appliedAmount: 0, status: 'open', issuedAt: '2025-12-01T00:00:00Z' },
  { id: 'c4', number: 'CN-4', amount: 40, appliedAmount: 40, status: 'credit_held', issuedAt: '2025-11-01T00:00:00Z' },
];

// Only held credit with something left is used, oldest first; an open (undecided) credit is never used.
const plan = planCreditApplication({ credits: held, total: 60 });
assert.equal(plan.applied, 60);
assert.deepEqual(plan.picks.map((p) => [p.number, p.applied]), [['CN-1', 30], ['CN-2', 30]], 'oldest first, partial on the second');
assert.equal(planCreditApplication({ credits: held, total: 500 }).applied, 80, 'never more than the credit available');
assert.equal(planCreditApplication({ credits: [], total: 100 }).applied, 0, 'no credit, nothing applied');
assert.equal(remainingCredit(held[3]), 0, 'credit already used is not reused');

// The arithmetic: 110 billed (100 net + 10 tax), 30 of credit: 80 total, net and tax split in proportion, and the originals kept.
const build = { amount: 100, taxAmount: 10, total: 110, status: 'open', email: 'a@x.com' };
const after = applyToBuild({ ...build }, { applied: 30, picks: [{ id: 'c1', number: 'CN-1', applied: 30 }] }, new Date('2026-06-02T00:00:00Z'));
assert.equal(after.total, 80);
assert.equal(after.amount + after.taxAmount, 80, 'net + tax = total');
assert.equal(originalTotal(after), 110, 'the original bill is kept');
assert.equal(originalNet(after), 100);
assert.equal(originalTax(after), 10);
assert.equal(after.creditApplied, 30);
assert.equal(after.status, 'open', 'still owing, so still open');

// Fully covered: the invoice is paid at zero, and nothing is left owing.
const covered = applyToBuild({ ...build }, { applied: 110, picks: [] }, new Date('2026-06-02T00:00:00Z'));
assert.equal(covered.total, 0);
assert.equal(covered.status, 'paid');

// The statement counts the bill once (original 110) and the credit once (30): 80 outstanding, matching the invoice.
const invoices = [{ id: 'i1', email: 'a@x.com', number: 'INV-1', issuedAt: '2026-06-02T00:00:00Z', dueAt: '2026-06-16T00:00:00Z', ...after }];
const credits = [{ customerEmail: 'a@x.com', number: 'CN-1', amount: 30, status: 'applied', issuedAt: '2026-01-01T00:00:00Z' }];
const s = buildStatement({ invoices, credits, customerEmail: 'a@x.com', now: Date.parse('2026-06-03T00:00:00Z') });
assert.equal(s.totals.billed, 110, 'billed is the original bill, not the reduced one');
assert.equal(s.totals.credited, 30);
assert.equal(s.totals.outstanding, 80, 'the statement agrees with what the invoice now asks for');

// The ledger: the invoice at its original 110, the credit as -30, and the column sums to 80 (not 50).
const rows = ledgerCsv(invoices, credits).split('\r\n').filter((l) => l).slice(1).map((l) => l.split(','));
const total = rows.reduce((a, r) => a + Number(r[8]), 0);
assert.equal(Math.round(total * 100) / 100, 80, 'ledger totals: 110 billed less 30 credit');

// Invoices with no credit applied behave exactly as before.
assert.equal(originalTotal({ total: 55, amount: 50 }), 55);
assert.equal(originalTotal({ amount: 50 }), 50);

console.log('credit-apply tests: all passed');
