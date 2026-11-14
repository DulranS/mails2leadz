// Customer links (Pass 276): a private key must match exactly; survey and deflection figures come from the records; deal room steps are read as done or not done.
import assert from 'node:assert/strict';
import { newKey, checkKey, ticketPaths, csatSummary, deflectionRate, parseSteps } from '../lib/customer-links.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok - ' + name); };
const DAY = 86400000, now = Date.parse('2026-11-14T12:00:00Z');

t('a private key opens its page only when it matches exactly', () => {
  const k = newKey();
  assert.equal(k.length, 32);
  assert.equal(checkKey(k, k), true);
  assert.equal(checkKey(k, k.slice(0, -1) + 'x'), false);
  assert.equal(checkKey(k, ''), false);
  assert.equal(checkKey('', ''), false);
});

t('a ticket link carries the key', () => {
  assert.equal(ticketPaths('u1', 't9', 'abc').status, '/support/u1/t9?k=abc');
  assert.equal(ticketPaths('u1', 't9', 'abc').rate, '/rate/u1/t9?k=abc');
});

t('the rating average and response rate come from resolved tickets in the last ninety days', () => {
  const tickets = [
    { status: 'resolved', resolvedAt: new Date(now - 2 * DAY).toISOString(), csatScore: 5 },
    { status: 'resolved', resolvedAt: new Date(now - 3 * DAY).toISOString(), csatScore: 3 },
    { status: 'resolved', resolvedAt: new Date(now - 4 * DAY).toISOString() },
    { status: 'resolved', resolvedAt: new Date(now - 200 * DAY).toISOString(), csatScore: 1 },
  ];
  assert.deepEqual(csatSummary(tickets, now), { avg: 4, responses: 2, asked: 3, responseRate: 67 });
  assert.deepEqual(csatSummary([], now), { avg: null, responses: 0, asked: 0, responseRate: null });
});

t('deflection is the share of the last thirty days answered automatically; no questions gives no figure', () => {
  const tickets = [
    { createdAt: new Date(now - DAY).toISOString(), stageKey: 'auto:1' },
    { createdAt: new Date(now - DAY).toISOString(), stageKey: 'auto:2' },
    { createdAt: new Date(now - DAY).toISOString(), stageKey: 'manual' },
    { createdAt: new Date(now - 60 * DAY).toISOString(), stageKey: 'auto:3' },
  ];
  assert.equal(deflectionRate(tickets, now), 67);
  assert.equal(deflectionRate([], now), null);
});

t('deal room steps are read as done or not done; blank lines are skipped', () => {
  assert.deepEqual(parseSteps('Quote sent | yes\nContract signed | no\n\n'), [
    { label: 'Quote sent', done: true },
    { label: 'Contract signed', done: false },
  ]);
});

console.log(`\n${n} passed`);
