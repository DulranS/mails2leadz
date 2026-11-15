// Pass 280 gap closure: marketing opt-outs no longer block service messages; a customer's reply reopens their ticket;
// Balancr leads are imported once; daily jobs are not run twice; ROAS is measured; internal notes stay internal.
import assert from 'node:assert/strict';
import { blockDecision, STOP_REASONS } from '../lib/contact-rules.js';
import { planCustomerMessage } from '../lib/ticket-plan.js';
import { balancrInboxId, balancrInboxRow } from '../lib/balancr-inbox.js';
import { shouldSkipJob } from '../lib/job-rules.js';
import { computeMarketing } from '../lib/marketing.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const NOW = Date.parse('2026-11-15T00:00:00Z');

t('a bounced address is blocked for every purpose', () => {
  assert.equal(blockDecision({ kind: 'all' }, 'marketing'), true);
  assert.equal(blockDecision({ kind: 'all' }, 'transactional'), true);
});

t('a marketing opt-out blocks marketing but NOT a transactional message (a quote the customer asked for)', () => {
  assert.equal(blockDecision({ kind: 'marketing' }, 'marketing'), true);
  assert.equal(blockDecision({ kind: 'marketing' }, 'transactional'), false);
});

t('a Lost deal blocks marketing and transactional, unless the Lost reason was a stop request', () => {
  assert.equal(blockDecision({ lostReason: 'price' }, 'marketing'), true);
  assert.equal(blockDecision({ lostReason: 'price' }, 'transactional'), true);
  assert.equal(blockDecision({ lostReason: 'unsubscribed' }, 'marketing'), true);
  assert.equal(blockDecision({ lostReason: 'unsubscribed' }, 'transactional'), false);
  assert.deepEqual(STOP_REASONS, ['unsubscribed', 'bounced']);
});

t('nothing on record: nothing is blocked', () => {
  assert.equal(blockDecision({}, 'marketing'), false);
  assert.equal(blockDecision({}, 'transactional'), false);
});

const ticket = (over) => ({ id: 't1', customerEmail: 'ann@x.com', status: 'open', openedAt: '2026-11-14T10:00:00Z', dueAt: '2026-11-14T12:00:00Z', ...over });

t('an open ticket takes the customer\'s reply without reopening (status unchanged)', () => {
  const plan = planCustomerMessage([ticket({ status: 'in_progress' })], { email: 'ANN@x.com', body: 'Any update?', channel: 'email', now: NOW });
  assert.equal(plan.matched, 1);
  assert.equal(plan.target.id, 't1');
  assert.equal(plan.target.reopened, false);
  assert.equal(plan.target.patch.status, undefined);
  assert.equal(plan.target.patch.lastCustomerMessage, 'Any update?');
});

t('a resolved ticket is reopened with a fresh target and a cleared resolution', () => {
  const plan = planCustomerMessage([ticket({ status: 'resolved', resolvedAt: '2026-11-14T11:00:00Z', reopenCount: 1 })], { email: 'ann@x.com', now: NOW });
  assert.equal(plan.target.reopened, true);
  assert.equal(plan.target.patch.status, 'open');
  assert.equal(plan.target.patch.reopenCount, 2);
  assert.equal(plan.target.patch.resolvedAt, null);
  assert.equal(plan.target.patch.openedAt, new Date(NOW).toISOString());
  assert.equal(plan.target.patch.dueAt, new Date(NOW + 2 * 3600000).toISOString());
});

t('automatically answered tickets are never reopened (the next question is answered again)', () => {
  const plan = planCustomerMessage([ticket({ status: 'resolved', auto: true })], { email: 'ann@x.com', now: NOW });
  assert.equal(plan.matched, 0);
  assert.equal(plan.target, null);
});

t('WhatsApp/SMS messages match by phone digits, whatever the formatting, and by a phone stored as the e-mail field', () => {
  const rows = [ticket({ id: 'p1', customerEmail: '', customerPhone: '+94 77 123 4567', status: 'resolved' }), ticket({ id: 'p2', customerEmail: '0779998888', customerPhone: undefined })];
  assert.equal(planCustomerMessage(rows, { phone: '94771234567', now: NOW }).target.id, 'p1');
  assert.equal(planCustomerMessage(rows, { phone: '0779998888', now: NOW }).target.id, 'p2');
});

t('when a customer has several tickets, the open one takes the message; otherwise the newest', () => {
  const rows = [
    ticket({ id: 'old', status: 'resolved', openedAt: '2026-10-01T00:00:00Z' }),
    ticket({ id: 'new', status: 'resolved', openedAt: '2026-11-10T00:00:00Z' }),
    ticket({ id: 'live', status: 'open', openedAt: '2026-09-01T00:00:00Z' }),
  ];
  assert.equal(planCustomerMessage(rows, { email: 'ann@x.com', now: NOW }).target.id, 'live');
  assert.equal(planCustomerMessage(rows.filter((r) => r.id !== 'live'), { email: 'ann@x.com', now: NOW }).target.id, 'new');
});

t('a stranger, or no contact at all, matches nothing', () => {
  assert.equal(planCustomerMessage([ticket()], { email: 'bo@x.com', now: NOW }).matched, 0);
  assert.equal(planCustomerMessage([ticket()], {}).matched, 0);
});

t('a Balancr lead has one stable inbox id; a lead without an id is not recorded', () => {
  assert.equal(balancrInboxId('u1', 'L-42'), 'balancr_u1_L-42');
  assert.equal(balancrInboxId('u1', 'L-42'), balancrInboxId('u1', 'L-42'));
  assert.equal(balancrInboxId('u1', ''), '');
  assert.equal(balancrInboxId('u1', '../x/y'), 'balancr_u1_xy');
});

t('a Balancr lead lands in the inbox as an e-mail or a phone, never both', () => {
  const byEmail = balancrInboxRow('u1', { id: 'L1', name: 'Ann', contact: 'Ann@X.com' }, NOW);
  assert.equal(byEmail.email, 'ann@x.com');
  assert.equal(byEmail.phone, '');
  assert.equal(byEmail.source, 'Balancr');
  const byPhone = balancrInboxRow('u1', { id: 'L2', name: 'Bo', contact: '0771234567' }, NOW);
  assert.equal(byPhone.phone, '0771234567');
  assert.equal(byPhone.email, '');
});

t('a once-a-day job is skipped only after it finished; a failed or running one is retried; repeatable jobs are never skipped', () => {
  assert.equal(shouldSkipJob('done', true), true);
  assert.equal(shouldSkipJob('failed', true), false);
  assert.equal(shouldSkipJob('running', true), false);
  assert.equal(shouldSkipJob(null, true), false);
  assert.equal(shouldSkipJob('done', false), false);
});

t('ROAS: won value over spend, overall and by inbound / outbound; null when nothing was spent', () => {
  const spend = [
    { channel: 'paid_ads', amount: 100, month: '2026-11' },
    { channel: 'outreach_tools', amount: 50, month: '2026-11' },
  ];
  const deals = [
    { stage: 'closed_won', closedAt: '2026-11-05T00:00:00Z', value: 300, source: 'inbound' },
    { stage: 'closed_won', closedAt: '2026-11-06T00:00:00Z', value: 100, source: 'email' },
    { stage: 'closed_won', closedAt: '2026-06-01T00:00:00Z', value: 9999, source: 'inbound' }, // outside the window
  ];
  const m = computeMarketing({ spend, deals, now: NOW });
  assert.equal(m.wonValue90, 400);
  assert.equal(m.roas, 2.67); // 400 / 150
  assert.equal(m.inboundRoas, 3); // 300 / 100
  assert.equal(m.outboundRoas, 2); // 100 / 50
  const none = computeMarketing({ spend: [], deals, now: NOW });
  assert.equal(none.roas, null);
  assert.equal(none.inboundRoas, null);
});

console.log(`\n${n} passed`);
