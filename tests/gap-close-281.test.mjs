// Pass 281: the run lock decides who may run a daily job; marketing stops for a customer 30+ days overdue; quiet
// won customers (90 days) and possible duplicate customers are listed for the owner. Nothing here sends a message.
import assert from 'node:assert/strict';
import { lockDecision, shouldSkipJob, STALE_RUN_MS } from '../lib/job-rules.js';
import { owesTooLong, blockDecision, OWED_STOP_DAYS } from '../lib/contact-rules.js';
import { quietCustomers, possibleDuplicateCustomers } from '../lib/customer-watch.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const NOW = Date.parse('2026-11-15T00:00:00Z');
const DAY = 86400000;
const ago = (days) => new Date(NOW - days * DAY).toISOString();

t('a once-a-day job with no record runs; a repeatable job always runs', () => {
  assert.equal(lockDecision(null, { once: true, now: NOW }), 'run');
  assert.equal(lockDecision({ status: 'done', startedAt: ago(0) }, { once: false, now: NOW }), 'run');
});

t('a finished once-a-day job is skipped', () => {
  assert.equal(lockDecision({ status: 'done', startedAt: ago(0) }, { once: true, now: NOW }), 'skip-done');
});

t('a run still going is not started a second time', () => {
  const startedMinsAgo = new Date(NOW - 2 * 60000).toISOString();
  assert.equal(lockDecision({ status: 'running', startedAt: startedMinsAgo }, { once: true, now: NOW }), 'skip-running');
});

t('a failed run, or a run that never finished (crashed), is taken over and retried', () => {
  assert.equal(lockDecision({ status: 'failed', startedAt: ago(0) }, { once: true, now: NOW }), 'take-over');
  const stale = new Date(NOW - STALE_RUN_MS - 60000).toISOString();
  assert.equal(lockDecision({ status: 'running', startedAt: stale }, { once: true, now: NOW }), 'take-over');
});

t('shouldSkipJob still skips only a finished once-a-day job', () => {
  assert.equal(shouldSkipJob('done', true), true);
  assert.equal(shouldSkipJob('running', true), false);
  assert.equal(shouldSkipJob('done', false), false);
});

t('a customer 30+ days overdue is flagged; under 30 days, paid, or another address is not', () => {
  const inv = (over) => ({ email: 'ann@x.com', status: 'sent', dueAt: ago(0), ...over });
  assert.equal(owesTooLong([inv({ dueAt: ago(OWED_STOP_DAYS + 5) })], 'ANN@x.com', NOW), true);
  assert.equal(owesTooLong([inv({ dueAt: ago(OWED_STOP_DAYS - 5) })], 'ann@x.com', NOW), false);
  assert.equal(owesTooLong([inv({ dueAt: ago(60), status: 'paid' })], 'ann@x.com', NOW), false);
  assert.equal(owesTooLong([inv({ dueAt: ago(60), email: 'bo@x.com' })], 'ann@x.com', NOW), false);
  assert.equal(owesTooLong([], 'ann@x.com', NOW), false);
});

t('the 30-day rule stops marketing only; a quote or reply still goes', () => {
  assert.equal(blockDecision({ owesTooLong: true }, 'marketing'), true);
  assert.equal(blockDecision({ owesTooLong: true }, 'transactional'), false);
  assert.equal(blockDecision({ owesTooLong: false }, 'marketing'), false);
});

t('a won customer with no activity for 90 days, and no open deal, is listed for win-back', () => {
  const deals = [{ email: 'ann@x.com', businessName: 'Ann Clinic', stage: 'closed_won', stageTimes: { closed_won: ago(120) } }];
  const list = quietCustomers({ deals, invoices: [], now: NOW, days: 90 });
  assert.equal(list.length, 1);
  assert.equal(list[0].email, 'ann@x.com');
  assert.equal(list[0].daysQuiet, 120);
});

t('an active customer, one with an open deal, one recently asked, and one with a recent paid invoice are not listed', () => {
  const won = (email, days, extra = {}) => ({ email, stage: 'closed_won', stageTimes: { closed_won: ago(days) }, ...extra });
  const deals = [
    won('recent@x.com', 10),
    won('open@x.com', 120),
    { email: 'open@x.com', stage: 'negotiation', stageTimes: {} },
    won('asked@x.com', 120, { winbackAt: ago(30) }),
    won('paid@x.com', 120),
  ];
  const invoices = [{ email: 'paid@x.com', status: 'paid', paidAt: ago(5) }];
  const emails = quietCustomers({ deals, invoices, now: NOW, days: 90 }).map((q) => q.email);
  assert.deepEqual(emails, []);
});

t('two e-mail addresses with the same phone (last 9 digits) are a possible duplicate', () => {
  const deals = [
    { email: 'ann@x.com', phone: '+94 77 123 4567', businessName: 'Ann Clinic' },
    { email: 'ann.clinic@gmail.com', phone: '0771234567', businessName: 'Other Name' },
    { email: 'solo@x.com', phone: '0770000001', businessName: 'Solo' },
  ];
  const groups = possibleDuplicateCustomers(deals);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'same phone');
  assert.deepEqual(groups[0].emails, ['ann.clinic@gmail.com', 'ann@x.com']);
});

t('the same business name under two addresses is a possible duplicate; one address twice is not', () => {
  const deals = [
    { email: 'a@x.com', businessName: 'Blue Tree Cafe' },
    { email: 'b@x.com', businessName: 'blue-tree cafe' },
    { email: 'c@x.com', businessName: 'Only Once' },
    { email: 'c@x.com', businessName: 'Only Once' },
  ];
  const groups = possibleDuplicateCustomers(deals);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].reason, 'same business name');
});

console.log(`\n${n} passed`);
