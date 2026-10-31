import assert from 'node:assert/strict';
import { eligibleOwners, loadByOwner, pickOwner, planAutoAssign, OWNER_KEY } from '../lib/assignment.js';
import { quoteMargin, marginCheck, MARGIN_FLOOR_DEFAULT, sanitizeQuote, milestonesFor, nextMilestoneIndex, quoteSendPlan, dealForAcceptedQuote, parseSchedule, supersedeMilestones } from '../lib/quote-core.js';
import { planWonInvoices } from '../lib/billing-automation.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const members = [
  { uid: 'm1', role: 'manager', name: 'Ann', email: 'ann@x.com' },
  { uid: 'v1', role: 'viewer', name: 'Watcher' },
  { uid: 'm2', role: 'manager', email: 'bo@x.com' },
];
const owners = eligibleOwners(members);
const open = (id, extra = {}) => ({ id, email: `${id}@c.com`, stage: 'new', ...extra });

t('the owner and managers can own deals; viewers cannot', () => {
  assert.deepEqual(owners.map((o) => o.key), [OWNER_KEY, 'm1', 'm2']);
  assert.equal(owners.some((o) => o.key === 'v1'), false);
});

t('a deal goes to the owner with the fewest open deals; ties go to the owner first', () => {
  const deals = [open('a', { assignedTo: 'm1' }), open('b', { assignedTo: 'm1' })];
  assert.equal(pickOwner(owners, deals), OWNER_KEY);
  assert.equal(pickOwner(owners, [open('x', { assignedTo: OWNER_KEY })]), 'm1');
});

t('auto-assign spreads unowned open deals evenly, skips closed and already-owned deals', () => {
  const deals = [
    open('d1'), open('d2'), open('d3'), open('d4'),
    open('closed', { stage: 'closed_won' }),
    open('mine', { assignedTo: 'm2' }),
  ];
  const changes = planAutoAssign(owners, deals);
  const counts = {};
  for (const c of changes) counts[c.assignedTo] = (counts[c.assignedTo] || 0) + 1;
  assert.equal(changes.length, 4);
  assert.ok(!changes.some((c) => c.id === 'closed' || c.id === 'mine'));
  // m2 already owns one open deal, so the four new deals go to the owner and m1 (least loaded first).
  assert.deepEqual(counts, { [OWNER_KEY]: 2, m1: 2 });
});

t('the load per owner counts open deals only', () => {
  const load = loadByOwner(owners, [open('a', { assignedTo: 'm1' }), open('b', { assignedTo: 'm1', stage: 'closed_lost' })]);
  assert.equal(load.m1, 1);
});

t('quote margin: from the net price and the delivery cost; no cost means no check; no price means no check', () => {
  assert.equal(quoteMargin({ subtotal: 1000, deliveryCost: 600 }), 40);
  assert.equal(quoteMargin({ subtotal: 1000, deliveryCost: null }), null);
  assert.equal(quoteMargin({ subtotal: 0, deliveryCost: 10 }), null);
  assert.equal(quoteMargin({ subtotal: 1000, deliveryCost: -5 }), null);
});

t('a margin under the floor warns plainly; at or above it does not; an unknown margin says so', () => {
  assert.equal(MARGIN_FLOOR_DEFAULT, 30);
  const low = marginCheck({ marginPct: 12, floor: 30 });
  assert.equal(low.warn, true);
  assert.match(low.message, /12%/);
  assert.equal(marginCheck({ marginPct: 30, floor: 30 }).warn, false);
  assert.match(marginCheck({ marginPct: null }).message, /not checked/);
});

const good = (o = {}) => ({ title: 'Care plan', email: 'c@example.com', lines: [{ description: 'Build', qty: 1, unitPrice: 1000 }], ...o });

t('a payment schedule is typed as "Deposit:30, Completion:70" and must add up to exactly 100%', () => {
  assert.deepEqual(parseSchedule('Deposit:30, Completion:70').items, [{ label: 'Deposit', percent: 30 }, { label: 'Completion', percent: 70 }]);
  assert.match(parseSchedule('Deposit:30, Completion:60').error, /add up to 100%/);
  assert.match(parseSchedule('Deposit:0, Completion:100').error, /1 to 100|Check the percentage/);
  assert.match(parseSchedule('A:10,B:10,C:10,D:10,E:10,F:10,G:40').error, /at most 6/);
  assert.deepEqual(parseSchedule('').items, []);
  const q = sanitizeQuote(good({ schedule: 'Deposit:30, Completion:70' }));
  assert.equal(q.quote.schedule.length, 2);
  assert.match(sanitizeQuote(good({ schedule: 'Deposit:40' })).error, /100%/);
});

t('milestone amounts come from the net price and add up to it exactly, the last one taking any rounding', () => {
  const quote = { subtotal: 100.01, schedule: [{ label: 'A', percent: 33.33 }, { label: 'B', percent: 33.33 }, { label: 'C', percent: 33.34 }] };
  const ms = milestonesFor(quote);
  assert.equal(ms.length, 3);
  assert.equal(Math.round(ms.reduce((s, m) => s + m.amount, 0) * 100) / 100, 100.01);
  assert.equal(ms[0].invoiceId, null);
  assert.equal(nextMilestoneIndex(ms), 0);
  assert.equal(nextMilestoneIndex(ms.map((m, i) => (i === 0 ? { ...m, invoiceId: 'x' } : m))), 1);
  assert.equal(nextMilestoneIndex(ms.map((m) => ({ ...m, invoiceId: 'x' }))), -1);
});

t('a quote below the margin floor cannot be sent from the app until the owner confirms; follow-ups are not blocked by it', () => {
  const now = Date.UTC(2026, 9, 31);
  const low = { status: 'open', acceptUrl: 'https://a.example/x', marginPct: 12, marginFloor: 30 };
  const blocked = quoteSendPlan({ quote: low, kind: 'quote', now });
  assert.equal(blocked.code, 'MARGIN_BELOW_FLOOR');
  assert.deepEqual(quoteSendPlan({ quote: low, kind: 'quote', now, acknowledgeMargin: true }), { ok: true });
  assert.deepEqual(quoteSendPlan({ quote: { ...low, marginPct: 40 }, kind: 'quote', now }), { ok: true });
  assert.deepEqual(quoteSendPlan({ quote: { ...low, sentAt: '2026-10-20T00:00:00Z' }, kind: 'followup', now }), { ok: true });
});

t('an accepted quote with a schedule marks its deal as billed by milestones, so the nightly routine does not also bill it in full', () => {
  const now = Date.UTC(2026, 9, 31, 12);
  const plain = dealForAcceptedQuote({ uid: 'u1', quote: { customerEmail: 'c@example.com', subtotal: 1000 }, now });
  assert.equal(plain.billingSchedule, undefined);
  const scheduled = dealForAcceptedQuote({ uid: 'u1', quote: { customerEmail: 'c@example.com', subtotal: 1000, schedule: [{ label: 'Deposit', percent: 30 }, { label: 'Completion', percent: 70 }] }, now });
  assert.equal(scheduled.billingSchedule, true);
  const planned = planWonInvoices({ uid: 'u1', deals: [scheduled], invoices: [], now: now + 1000 });
  assert.equal(planned.length, 0);
  assert.equal(planWonInvoices({ uid: 'u1', deals: [plain], invoices: [], now: now + 1000 }).length, 1);
});

t('a revised quote replaces only the milestones not yet invoiced; invoiced ones stay as billed', () => {
  const ms = [
    { index: 0, label: 'Deposit', percent: 30, amount: 300, invoiceId: 'inv1' },
    { index: 1, label: 'Completion', percent: 70, amount: 700, invoiceId: null },
  ];
  const after = supersedeMilestones(ms);
  assert.equal(after[0].superseded, undefined);
  assert.equal(after[0].invoiceId, 'inv1');
  assert.equal(after[1].superseded, true);
  assert.equal(nextMilestoneIndex(after), -1);
});

t('a revision of an accepted deal updates its value, and a second acceptance of the original still changes nothing', () => {
  const now = Date.UTC(2026, 9, 31);
  const won = { stage: 'closed_won', value: 1000, closedAt: '2026-10-01T00:00:00.000Z' };
  assert.equal(dealForAcceptedQuote({ uid: 'u1', quote: { customerEmail: 'c@example.com', subtotal: 1500 }, existing: won, now }), null);
  const rev = dealForAcceptedQuote({ uid: 'u1', quote: { customerEmail: 'c@example.com', subtotal: 1500, revisionOf: 'q-old' }, existing: won, now });
  assert.equal(rev.value, 1500);
  assert.equal(rev.stage, 'closed_won');
});

console.log(`sales-ops: ${n} passed`);
