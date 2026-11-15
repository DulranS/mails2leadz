// Pass 297: failed automatic invoice emails are tried again, a few times, then shown on Today (spec 7.4). Reminders skip invoices never emailed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RETRY_MAX_ATTEMPTS, RETRY_GAP_MS, afterFailedSend, queuedForSend, isRetryDue, dueRetries, unsentInvoiceCount } from '../lib/retry-rules.js';
import { planReminders } from '../lib/billing-automation.js';
import { noteLabel } from '../lib/run-log-rules.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const NOW = Date.parse('2026-03-10T09:00:00Z');
const inv = (extra = {}) => ({ id: 'inv_1', email: 'buyer@example.com', businessName: 'Hilltop', ...extra });

t('a first failure schedules a retry a day later', () => {
  const r = afterFailedSend({}, 'send_failed', NOW);
  assert.equal(r.sendAttempts, 1);
  assert.equal(r.sendStatus, 'retrying');
  assert.equal(r.sendFailedWhy, 'send_failed');
  assert.equal(Date.parse(r.nextSendAt), NOW + RETRY_GAP_MS);
});

t('after the last allowed try the invoice stops and is marked given up', () => {
  const r = afterFailedSend({ sendAttempts: RETRY_MAX_ATTEMPTS - 1 }, 'send_failed', NOW);
  assert.equal(r.sendAttempts, RETRY_MAX_ATTEMPTS);
  assert.equal(r.sendStatus, 'gave_up');
  assert.equal(r.nextSendAt, null);
});

t('the failure reason is short, one line, and safe to show', () => {
  const r = afterFailedSend({}, 'bad\nreason with a long tail that goes on and on and on past forty characters', NOW);
  assert.ok(!r.sendFailedWhy.includes('\n'));
  assert.ok(r.sendFailedWhy.length <= 40);
});

t('an invoice the send window closed on is due at once', () => {
  const q = { ...inv(), ...queuedForSend(NOW) };
  assert.equal(isRetryDue(q, NOW), true);
});

t('a retry waits until its day comes', () => {
  const failed = { ...inv(), ...afterFailedSend({}, 'send_failed', NOW) };
  assert.equal(isRetryDue(failed, NOW + RETRY_GAP_MS - 1000), false);
  assert.equal(isRetryDue(failed, NOW + RETRY_GAP_MS), true);
});

t('manual invoices, sent, held, paid, void, given up or with no id are never retried', () => {
  assert.equal(isRetryDue(inv({ email: 'a@b.co' }), NOW), false, 'manual invoice with no queue state');
  assert.equal(isRetryDue({ ...inv(), ...queuedForSend(NOW), emailedAt: 'x' }, NOW), false, 'already emailed');
  assert.equal(isRetryDue({ ...inv(), ...queuedForSend(NOW), heldReason: 'over_cap' }, NOW), false, 'held');
  assert.equal(isRetryDue({ ...inv(), ...queuedForSend(NOW), status: 'paid' }, NOW), false, 'paid');
  assert.equal(isRetryDue({ ...inv(), ...queuedForSend(NOW), status: 'void' }, NOW), false, 'void');
  assert.equal(isRetryDue({ ...inv(), ...afterFailedSend({ sendAttempts: 2 }, 'x', NOW), sendStatus: 'gave_up', nextSendAt: null }, NOW + 9 * RETRY_GAP_MS), false, 'gave up');
  assert.equal(isRetryDue({ ...queuedForSend(NOW), email: 'a@b.co' }, NOW), false, 'no id');
});

t('the due list is oldest first and capped per run', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...inv({ id: `inv_${i}` }), ...queuedForSend(NOW), sendFailedAt: new Date(NOW - i * 1000).toISOString() }));
  const due = dueRetries(many, NOW);
  assert.equal(due.length, 20);
  assert.equal(due[0].id, 'inv_29');
});

t('Today counts invoices an automatic send has not delivered, not held, paid or emailed ones', () => {
  const rows = [
    { ...inv({ id: 'a' }), ...afterFailedSend({}, 'x', NOW) },
    { ...inv({ id: 'b' }), ...afterFailedSend({ sendAttempts: 2 }, 'x', NOW), sendStatus: 'gave_up', nextSendAt: null },
    { ...inv({ id: 'c' }), ...afterFailedSend({}, 'x', NOW), emailedAt: 'x' },
    { ...inv({ id: 'd' }), ...afterFailedSend({}, 'x', NOW), heldReason: 'blocked' },
    { ...inv({ id: 'e' }), ...afterFailedSend({}, 'x', NOW), status: 'paid' },
    { ...inv({ id: 'f' }) },
  ];
  assert.equal(unsentInvoiceCount(rows), 2);
});

t('a reminder never goes to an invoice the customer was never sent', () => {
  const base = { id: 'x', email: 'buyer@example.com', amount: 100, total: 100, currency: 'USD', issuedAt: '2026-01-01T00:00:00.000Z', dueAt: '2026-01-15T00:00:00.000Z', status: 'open', reminders: 0 };
  const never = planReminders({ invoices: [base], now: NOW });
  const sent = planReminders({ invoices: [{ ...base, emailedAt: '2026-01-02T00:00:00.000Z' }], now: NOW });
  assert.equal(never.length, 0);
  assert.equal(sent.length, 1);
});

t('the daily job queues, retries and gives up on automatic invoice emails', () => {
  const src = fs.readFileSync('lib/server/daily-ops.js', 'utf8');
  assert.ok(src.includes("from '../retry-rules.js'"));
  assert.ok(src.includes('queuedForSend(now)'), 'closed window queues the invoice');
  assert.ok(src.includes('dueRetries(invoices, now)'), 'earlier failures are tried again');
  assert.ok(src.includes('afterFailedSend(p.write, r.why, now)'), 'a new failed send is recorded');
  assert.ok(src.includes('afterFailedSend(inv, r.why, now)'), 'a failed retry is recorded');
  assert.ok(src.includes("heldReason: 'blocked'"), 'a customer blocked since is held, not emailed');
  assert.ok(src.includes("'invoice_send_gave_up'"));
});

t('the owner sees the count on Today and the run log explains the codes', () => {
  const today = fs.readFileSync('lib/today-actions.js', 'utf8');
  const server = fs.readFileSync('lib/server/today-actions.js', 'utf8');
  assert.ok(today.includes("key: 'invoicesNotSent'"));
  assert.ok(server.includes('invoicesNotSent: unsentInvoiceCount(sentInvoices)'));
  assert.ok(noteLabel('invoice_send_gave_up').includes('three times'));
  assert.ok(noteLabel('invoice_email_send_failed').includes('tried again'));
});

console.log(`gap-close-297: ${n} checks passed`);
